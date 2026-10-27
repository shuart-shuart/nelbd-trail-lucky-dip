import { Router } from 'express';
import { getPool, withTransaction } from './postgres.ts';
import { loginAdmin, logoutAdmin, requireAdmin, requireSameOrigin } from './postgresAdminAuth.ts';

export const postgresAdminRouter = Router();
postgresAdminRouter.use(requireSameOrigin);
postgresAdminRouter.post('/login', async (req,res) => {
  try { await loginAdmin(req,res); } catch(e) { console.error('Admin login error',e); res.status(503).json({error:'Admin sign-in unavailable'}); }
});
postgresAdminRouter.use(async (req,res,next) => {
  try { await requireAdmin(req,res,next); } catch(e) { console.error('Admin session error',e); res.status(503).json({error:'Admin session unavailable'}); }
});
postgresAdminRouter.post('/logout', async (req,res) => {
  try { await logoutAdmin(req,res); } catch { res.status(503).json({error:'Logout unavailable'}); }
});
postgresAdminRouter.get('/me',(req,res)=>res.json(res.locals.admin));
postgresAdminRouter.get('/inventory',async (_req,res)=>{
  try {
    const {rows}=await getPool().query(`SELECT p.id,p.name,p.description,p.tier,p.icon,p.image_url AS "imageUrl",
      p.is_active AS "isActive",i.site,i.allocated_quantity AS "allocatedQuantity",
      i.remaining_quantity AS "remainingQuantity",i.claimed_quantity AS "claimedQuantity"
      FROM prizes p JOIN site_inventory i ON i.prize_id=p.id ORDER BY p.name,i.site`);
    res.json(rows);
  } catch {res.status(503).json({error:'Inventory unavailable'});}
});
postgresAdminRouter.get('/draws',async (req,res)=>{
  try {
    const limit=Math.min(200,Math.max(1,Number(req.query.limit)||50));
    const {rows}=await getPool().query(`SELECT d.id,d.ticket_number AS "ticketNumber",
      p.nickname AS "participantNickname",d.prize_id AS "prizeId",d.prize_name AS "prizeName",
      d.prize_tier AS "prizeTier",d.site,d.status,d.kiosk_id AS "kioskId",
      d.drawn_at AS "drawnAt",d.claimed_at AS "claimedAt"
      FROM draws d JOIN participants p ON p.id=d.participant_id
      ORDER BY d.drawn_at DESC,d.id DESC LIMIT $1`,[limit]);
    res.json(rows);
  } catch {res.status(503).json({error:'Draw history unavailable'});}
});
postgresAdminRouter.get('/settings',async (_req,res)=>{
  try {const {rows}=await getPool().query('SELECT * FROM kiosk_settings WHERE id=1');res.json(rows[0]||null);}
  catch {res.status(503).json({error:'Settings unavailable'});}
});
postgresAdminRouter.post('/inventory/:id/:site/quantity',async (req,res)=>{
  const {id,site}=req.params;
  const remaining=req.body?.remainingQuantity;
  if (!['PDD','PS'].includes(site)||!Number.isSafeInteger(remaining)||remaining<0||remaining>1000000)
    return res.status(400).json({error:'Invalid inventory quantity'});
  const admin=res.locals.admin;
  if (admin.site_access!=='ALL'&&admin.site_access!==site) return res.status(403).json({error:'Site access denied'});
  try {
    const row=await withTransaction(async(client)=>{
      const old=await client.query('SELECT * FROM site_inventory WHERE prize_id=$1 AND site=$2 FOR UPDATE',[id,site]);
      if (!old.rowCount) return null;
      const previous=old.rows[0].remaining_quantity;
      const updated=await client.query(`UPDATE site_inventory SET remaining_quantity=$3,
        allocated_quantity=claimed_quantity+$3,updated_at=now()
        WHERE prize_id=$1 AND site=$2 RETURNING *`,[id,site,remaining]);
      await client.query(`INSERT INTO inventory_adjustments
        (prize_id,site,previous_quantity,new_quantity,delta,reason,adjusted_by)
        VALUES($1,$2,$3,$4,$5,'manual_adjustment',$6)`,
        [id,site,previous,remaining,remaining-previous,admin.email]);
      return updated.rows[0];
    });
    if (!row) return res.status(404).json({error:'Inventory item not found'});
    return res.json(row);
  } catch(e) {console.error('Inventory adjustment failed',e);return res.status(503).json({error:'Inventory update failed'});}
});

postgresAdminRouter.put('/settings',async (req,res)=>{
  const admin=res.locals.admin;
  if(admin.role!=='super_admin') return res.status(403).json({error:'Super admin required'});
  const b=req.body||{};
  if(typeof b.festivalName!=='string'||b.festivalName.trim().length<1||b.festivalName.length>120||
     typeof b.kioskActive!=='boolean'||!['PDD','PS'].includes(b.activeSite)||
     typeof b.welcomeMessage!=='string'||b.welcomeMessage.length>2000||
     typeof b.termsSummary!=='string'||b.termsSummary.length>4000||
     b.maxDrawsPerParticipant!==1)
    return res.status(400).json({error:'Invalid settings; maximum draws per participant must remain one'});
  try {
    const {rows}=await getPool().query(`UPDATE kiosk_settings
      SET festival_name=$1,kiosk_active=$2,active_site=$3,welcome_message=$4,
          terms_summary=$5,max_draws_per_participant=1,updated_at=now()
      WHERE id=1 RETURNING *`,
      [b.festivalName.trim(),b.kioskActive,b.activeSite,b.welcomeMessage,b.termsSummary]);
    return res.json(rows[0]);
  } catch {return res.status(503).json({error:'Settings update unavailable'});}
});

postgresAdminRouter.get('/dashboard-stats',async (_req,res)=>{
  try {
    const [drawCount,participantCount,today]=await Promise.all([
      getPool().query('SELECT count(*)::integer AS count FROM draws'),
      getPool().query('SELECT count(*)::integer AS count FROM participants'),
      getPool().query(`SELECT d.id,d.ticket_number AS "ticketNumber",
        p.nickname AS "participantNickname",d.prize_id AS "prizeId",
        d.prize_name AS "prizeName",d.prize_tier AS "prizeTier",d.site,d.status,
        d.kiosk_id AS "kioskId",d.drawn_at AS "drawnAt",d.claimed_at AS "claimedAt"
        FROM draws d JOIN participants p ON p.id=d.participant_id
        WHERE (d.drawn_at AT TIME ZONE 'Asia/Singapore')::date =
              (now() AT TIME ZONE 'Asia/Singapore')::date ORDER BY d.drawn_at DESC`)
    ]);
    return res.json({totalDraws:drawCount.rows[0].count,totalParticipants:participantCount.rows[0].count,todayDraws:today.rows});
  } catch {return res.status(503).json({error:'Dashboard statistics unavailable'});}
});
