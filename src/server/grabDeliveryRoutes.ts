import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { withTransaction, getPool } from './postgres.ts';
import { decryptGrabCredential } from './grabVoucherDecrypt.ts';
import { GRAB_EMAIL_SUBJECT, renderGrabBundleEmail } from './grabEmailTemplate.ts';
import {completeDailyReportDelivery} from './dailyLuckyDipEmail.ts';

export const grabDeliveryRouter = Router();
// Separate callback from voucher fulfilment: a daily summary is never a Grab voucher.
grabDeliveryRouter.post('/daily-report/complete',completeDailyReportDelivery);

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

/** Record only a fixed, non-sensitive diagnostic label for an attempted handoff.
 * Never overwrite a callback that already marked the voucher sent or failed.
 */
async function recordGrabHandoff(deliveryId:string,code:string):Promise<void> {
  try {
    await getPool().query(
      "UPDATE grab_voucher_claim_sessions SET delivery_error_code=CASE WHEN delivery_error_code='OFFLINE_FLOW_RETRY_ONCE' THEN 'OFFLINE_FLOW_RETRY_ONCE:' || $2 ELSE $2 END,updated_at=now() WHERE delivery_attempt_id=$1 AND status='processing'",
      [deliveryId,code]
    );
  } catch {
    console.error('Grab delivery diagnostic state update failed');
  }
}

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
        `SELECT c.draw_id,c.recipient_email,d.ticket_number,d.prize_id
         FROM grab_voucher_claim_sessions c
         JOIN draws d ON d.id=c.draw_id
         WHERE c.status='queued' AND c.recipient_email IS NOT NULL
         ORDER BY c.created_at LIMIT 1 FOR UPDATE OF c SKIP LOCKED`,
        [process.env.NELBD_GRAB_EARLY_TEST_20 === 'YES']
      );
      if (!r.rows.length) return null;
      const item = r.rows[0];
      const expected=item.prize_id==='grab-voucher-50'?10:item.prize_id==='grab-voucher-10'?2:1;
      const codes=await client.query(`SELECT code_ciphertext,url_ciphertext,starts_at,expires_at
        FROM grab_voucher_codes WHERE assigned_draw_id=$1 AND denomination_cents=500
        ORDER BY id`,[item.draw_id]);
      if(codes.rows.length!==expected)throw Error('GRAB_BUNDLE_INCOMPLETE');
      if(codes.rows.some(v=>new Date(v.expires_at).getTime()<=Date.now() ||
        (new Date(v.starts_at).getTime()>Date.now() && !(
          process.env.NELBD_GRAB_EARLY_TEST_20==='YES' &&
          Date.now()<Date.parse('2026-11-13T16:00:00Z') &&
          new Date(v.starts_at).getTime()===Date.parse('2026-11-13T16:00:00Z')))))
        throw Error('GRAB_BUNDLE_NOT_ACTIVE');
      const html=renderGrabBundleEmail(codes.rows.map(v=>({
        code:decryptGrabCredential(v.code_ciphertext),
        url:decryptGrabCredential(v.url_ciphertext)
      })));
      const deliveryId = randomUUID();
      await client.query(
        "UPDATE grab_voucher_claim_sessions SET status='processing',delivery_attempt_id=$2,delivery_started_at=now(),updated_at=now() WHERE draw_id=$1 AND status='queued'",
        [item.draw_id,deliveryId]
      );
      return {deliveryId,ticketNumber:item.ticket_number,to:item.recipient_email,
        subject:expected===1?GRAB_EMAIL_SUBJECT:'Congratulations! Your NELBD S};
    });
    if (!delivery) return;
    // Dispatch deliberately at most once. A timeout or uncertain response remains
    // processing for manual reconciliation, never an automatic repeat email.
    let response: Response;
    try {
      response = await fetch(endpoint,{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(delivery),signal:AbortSignal.timeout(20000)});
    } catch {
      await recordGrabHandoff(delivery.deliveryId,'TRANSPORT_ERROR');
      console.error('Grab delivery handoff transport failure; manual reconciliation required');
      return;
    }
    if (response.ok) {
      // Power Automate 2xx only confirms the HTTP trigger accepted the handoff.
      // Actual sending requires the separate /automation/complete callback.
      await recordGrabHandoff(delivery.deliveryId,'TRIGGER_ACCEPTED_AWAITING_CALLBACK');
      console.info('Grab delivery handoff accepted; awaiting Power Automate callback',response.status);
    } else {
      await recordGrabHandoff(delivery.deliveryId,'HTTP_'+response.status);
      // Do not log the raw Microsoft response, trigger URL, voucher code or recipient.
      console.error('Grab delivery handoff rejected by Power Automate HTTP',response.status);
    }
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
+(expected*5)+' Grab Vouchers',html};
    });
    if (!delivery) return;
    // Dispatch deliberately at most once. A timeout or uncertain response remains
    // processing for manual reconciliation, never an automatic repeat email.
    let response: Response;
    try {
      response = await fetch(endpoint,{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(delivery),signal:AbortSignal.timeout(20000)});
    } catch {
      await recordGrabHandoff(delivery.deliveryId,'TRANSPORT_ERROR');
      console.error('Grab delivery handoff transport failure; manual reconciliation required');
      return;
    }
    if (response.ok) {
      // Power Automate 2xx only confirms the HTTP trigger accepted the handoff.
      // Actual sending requires the separate /automation/complete callback.
      await recordGrabHandoff(delivery.deliveryId,'TRIGGER_ACCEPTED_AWAITING_CALLBACK');
      console.info('Grab delivery handoff accepted; awaiting Power Automate callback',response.status);
    } else {
      await recordGrabHandoff(delivery.deliveryId,'HTTP_'+response.status);
      // Do not log the raw Microsoft response, trigger URL, voucher code or recipient.
      console.error('Grab delivery handoff rejected by Power Automate HTTP',response.status);
    }
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
