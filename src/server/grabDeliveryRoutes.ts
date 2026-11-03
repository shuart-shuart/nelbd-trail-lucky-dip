import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { withTransaction, getPool } from './postgres.ts';
import { decryptGrabCredential } from './grabVoucherDecrypt.ts';
import { GRAB_EMAIL_SUBJECT, renderGrabEmail } from './grabEmailTemplate.ts';

export const grabDeliveryRouter = Router();

function enabled(): boolean {
  return process.env.NELBD_POWER_AUTOMATE_ENABLED === 'YES' &&
    process.env.NELBD_GRAB_FULFILMENT_ENABLED === 'YES' &&
    process.env.DRAW_BACKEND === 'postgres' &&
    (process.env.NELBD_POWER_AUTOMATE_CALLBACK_KEY || '').length >= 32;
}

function validCallbackKey(value: string): boolean {
  const expected = process.env.NELBD_POWER_AUTOMATE_CALLBACK_KEY || '';
  if (expected.length < 32 || value.length < 32) return false;
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(value).digest();
  return timingSafeEqual(a,b);
}

grabDeliveryRouter.post('/automation/complete', async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  if (!enabled()) return res.status(423).json({error:'Fulfilment disabled'});
  const key = (req.get('authorization') || '').replace(/^Bearer /,'');
  if (!validCallbackKey(key)) return res.status(401).json({error:'Unauthorized'});
  const {deliveryId,status} = req.body || {};
  if (typeof deliveryId !== 'string' || !/^[a-f0-9-]{36}$/i.test(deliveryId) ||
      (status !== 'sent' && status !== 'failed')) return res.status(400).json({error:'Invalid acknowledgement'});
  try {
    const result = await getPool().query(
      "UPDATE grab_voucher_claim_sessions SET status=$2,updated_at=now() WHERE delivery_attempt_id=$1 AND status='processing' RETURNING draw_id",
      [deliveryId,status]
    );
    if (result.rowCount) return res.json({accepted:true,status});
    const previous = await getPool().query(
      'SELECT status FROM grab_voucher_claim_sessions WHERE delivery_attempt_id=$1',[deliveryId]
    );
    if (previous.rows[0]?.status === status) return res.json({accepted:true,status,alreadyRecorded:true});
    return res.status(409).json({error:'Unknown or conflicting delivery state'});
  } catch {
    return res.status(503).json({error:'Unable to record acknowledgement'});
  }
});

let polling = false;
export async function dispatchNextGrabVoucher(): Promise<void> {
  const endpoint = process.env.NELBD_POWER_AUTOMATE_TRIGGER_URL || '';
  if (!enabled() || !endpoint || polling) return;
  polling = true;
  try {
    const target = new URL(endpoint);
    if (target.protocol !== 'https:') return;
    const delivery = await withTransaction(async client => {
      const r = await client.query(
        `SELECT c.draw_id,c.recipient_email,v.code_ciphertext,v.url_ciphertext,d.ticket_number FROM grab_voucher_claim_sessions c JOIN grab_voucher_codes v ON v.id=c.voucher_id AND v.assigned_draw_id=c.draw_id JOIN draws d ON d.id=c.draw_id WHERE c.status='queued' AND c.recipient_email IS NOT NULL AND v.expires_at>now() AND (v.starts_at<=now() OR (
          $1::boolean=true AND now()<TIMESTAMPTZ '2026-11-14 00:00:00+08'
          AND v.starts_at=TIMESTAMPTZ '2026-11-14 00:00:00+08'
          AND v.assigned_at IS NOT NULL AND v.assigned_at<v.starts_at))
        ORDER BY c.created_at LIMIT 1 FOR UPDATE OF c SKIP LOCKED`,
        [process.env.NELBD_GRAB_EARLY_TEST_20 === 'YES']
      );
      if (!r.rows.length) return null;
      const item = r.rows[0];
      const html = renderGrabEmail(decryptGrabCredential(item.code_ciphertext),decryptGrabCredential(item.url_ciphertext));
      const deliveryId = randomUUID();
      await client.query(
        "UPDATE grab_voucher_claim_sessions SET status='processing',delivery_attempt_id=$2,delivery_started_at=now(),updated_at=now() WHERE draw_id=$1 AND status='queued'",
        [item.draw_id,deliveryId]
      );
      return {deliveryId,ticketNumber:item.ticket_number,to:item.recipient_email,
        subject:GRAB_EMAIL_SUBJECT,html};
    });
    if (!delivery) return;
    // Dispatch deliberately at most once. A timeout or uncertain response remains
    // processing for manual reconciliation, never an automatic repeat email.
    const response = await fetch(endpoint,{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(delivery),signal:AbortSignal.timeout(20000)});
    if (!response.ok) console.error('Grab delivery handoff returned non-success HTTP status',response.status);
  } catch {
    console.error('Grab delivery handoff needs staff reconciliation');
  } finally {
    polling = false;
  }
}

export function startGrabDeliveryWorker(): void {
  if (!enabled()) return;
  const interval = setInterval(() => {void dispatchNextGrabVoucher();},10000);
  interval.unref();
}
