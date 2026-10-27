import crypto from 'node:crypto';
import { getPool, withTransaction } from './postgres.ts';
import { getSingaporeCalendarDate, isValidSingaporeMobile, normalizeSingaporeMobile, type DrawExecutionRequest, type DrawResultScreenPayload } from './drawEngine.ts';

const failure = (error: string): DrawResultScreenPayload => ({ success: false, error });

/**
 * PostgreSQL draw engine, not wired to public routes until full cutover.
 * A transaction-level advisory lock serializes draws across both hubs to
 * preserve stock and the global one-TOP-per-Singapore-day constraint.
 */
export async function executePostgresLuckyDipDraw(request: DrawExecutionRequest): Promise<DrawResultScreenPayload> {
  const nickname = (request.nickname || '').trim().slice(0, 64);
  if (!nickname) return failure('Please enter your nickname.');
  if (!isValidSingaporeMobile(request.mobileNumber)) return failure('Please enter a valid Singapore mobile number.');
  if (request.site !== 'PDD' && request.site !== 'PS') return failure('Invalid Lucky Dip site.');
  const site = request.site;
  const mobile = normalizeSingaporeMobile(request.mobileNumber);
  const ticket = request.ticketNumber || `NELBD-${site}-${crypto.randomInt(100000, 1000000)}`;
  if (!/^NELBD-(PDD|PS)-[0-9]{6}$/.test(ticket) || !ticket.startsWith(`NELBD-${site}-`)) return failure('Invalid ticket.');
  const kioskId = (request.kioskId || `KIOSK-${site}-01`).slice(0, 64);
  const singaporeDate = getSingaporeCalendarDate();

  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [7102026]);
    const previous = await client.query(
      `SELECT d.ticket_number,d.prize_id,d.prize_name,d.prize_tier,d.site,d.status,d.drawn_at,p.nickname,
              pr.description,pr.image_url
       FROM participants p JOIN draws d ON d.participant_id=p.id
       JOIN prizes pr ON pr.id=d.prize_id WHERE p.mobile_number=$1`, [mobile]);
    if (previous.rowCount) {
      const row = previous.rows[0];
      if (row.ticket_number !== ticket) return failure('This mobile number has already drawn a prize. One redemption per person.');
      if (row.site !== site) return failure('This draw was completed at a different hub.');
      return { success:true, recovered:true, ticketNumber:row.ticket_number, participantNickname:row.nickname,
        site, prize:{id:row.prize_id,name:row.prize_name,tier:row.prize_tier,description:row.description,imageUrl:row.image_url},
        status:row.status,drawnAt:new Date(row.drawn_at).toISOString() };
    }
    const settings = await client.query('SELECT kiosk_active FROM kiosk_settings WHERE id=1');
    if (settings.rows[0]?.kiosk_active !== true) return failure('Lucky Dip is temporarily unavailable.');
    const top = await client.query('SELECT 1 FROM daily_top_awards WHERE singapore_date=$1', [singaporeDate]);
    const inventory = await client.query(
      `SELECT p.id,p.name,p.description,p.tier,p.image_url,i.remaining_quantity
       FROM prizes p JOIN site_inventory i ON i.prize_id=p.id
       WHERE p.is_active=true AND i.site=$1 AND i.remaining_quantity>0
         AND (p.tier<>'TOP' OR $2::boolean=false)
       ORDER BY p.id FOR UPDATE OF i`, [site, Boolean(top.rowCount)]);
    const total = inventory.rows.reduce((sum, row) => sum + Number(row.remaining_quantity), 0);
    if (!total) return failure('No prize inventory is available at this hub. Please ask booth crew for assistance.');
    const pick = crypto.randomInt(total);
    let running = 0;
    const chosen = inventory.rows.find((row) => (running += Number(row.remaining_quantity)) > pick)!;
    const participant = await client.query(
      'INSERT INTO participants(nickname,mobile_number,site) VALUES($1,$2,$3) RETURNING id',
      [nickname,mobile,site]);
    const updated = await client.query(
      `UPDATE site_inventory SET remaining_quantity=remaining_quantity-1,claimed_quantity=claimed_quantity+1,updated_at=now()
       WHERE prize_id=$1 AND site=$2 AND remaining_quantity>0 RETURNING remaining_quantity`, [chosen.id,site]);
    if (updated.rowCount !== 1) throw new Error('INVENTORY_CONFLICT');
    const draw = await client.query(
      `INSERT INTO draws(ticket_number,participant_id,prize_id,prize_name,prize_tier,site,status,kiosk_id,claimed_at)
       VALUES($1,$2,$3,$4,$5,$6,'claimed',$7,now()) RETURNING id,drawn_at`,
      [ticket,participant.rows[0].id,chosen.id,chosen.name,chosen.tier,site,kioskId]);
    if (chosen.tier === 'TOP') {
      await client.query('INSERT INTO daily_top_awards(singapore_date,draw_id) VALUES($1,$2)', [singaporeDate,draw.rows[0].id]);
    }
    await client.query(
      `INSERT INTO inventory_adjustments(prize_id,site,previous_quantity,new_quantity,delta,reason,adjusted_by)
       VALUES($1,$2,$3,$4,-1,'draw',$5)`,
      [chosen.id,site,chosen.remaining_quantity,updated.rows[0].remaining_quantity,`kiosk_${site.toLowerCase()}`]);
    return {success:true,ticketNumber:ticket,participantNickname:nickname,site,
      prize:{id:chosen.id,name:chosen.name,tier:chosen.tier,description:chosen.description,imageUrl:chosen.image_url},
      status:'claimed',drawnAt:new Date(draw.rows[0].drawn_at).toISOString()};
  });
}

export async function checkPostgresMobileHasDrawn(phone: string): Promise<boolean> {
  if (!isValidSingaporeMobile(phone)) return false;
  const result = await getPool().query('SELECT 1 FROM participants WHERE mobile_number=$1 LIMIT 1',[normalizeSingaporeMobile(phone)]);
  return Boolean(result.rowCount);
}
