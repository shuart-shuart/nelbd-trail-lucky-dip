import {Router} from 'express';
import {getPool,withTransaction} from './postgres.ts';
import {executePostgresLuckyDipDraw} from './postgresDrawEngine.ts';

export const ezlinkAdminRouter=Router();
const validPhone=(v:unknown):string|null=>{
 if(typeof v!=='string'||v.length>24)return null;
 const digits=v.replace(/[\s()-]/g,'');
 const mobile=digits.startsWith('+65')?digits:digits.startsWith('65')&&digits.length===10?'+'+digits:'+65'+digits;
 return /^\+65[89]\d{7}$/.test(mobile)?mobile:null;
};
const siteAllowed=(admin:any,site:string)=>admin.role==='super_admin'||admin.site_access==='ALL'||admin.site_access===site;
const enabled=()=>process.env.NELBD_EZLINK_ENABLED==='YES'&&process.env.DRAW_BACKEND==='postgres';
ezlinkAdminRouter.use((_req,res,next)=>{
 res.setHeader('Cache-Control','no-store');
 if(!enabled())return res.status(423).json({error:'17-stamp redemption is not enabled'});
 next();
});
ezlinkAdminRouter.get('/inventory',async(_req,res)=>{
 try{
  const {rows}=await getPool().query('SELECT total_quantity AS "total",redeemed_quantity AS "redeemed",(total_quantity-redeemed_quantity) AS "remaining" FROM ezlink_inventory WHERE id=1');
  if(!rows[0])return res.status(503).json({error:'ez-link migration has not been applied'});
  return res.json(rows[0]);
 }catch{return res.status(503).json({error:'ez-link inventory unavailable'});}
});
ezlinkAdminRouter.put('/inventory',async(req,res)=>{
 if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
 const total=req.body?.total;
 if(!Number.isSafeInteger(total)||total<0||total>100000)return res.status(400).json({error:'Enter a valid total stock'});
 try{
  const result=await withTransaction(async c=>{
   const {rows:[before]}=await c.query('SELECT total_quantity,redeemed_quantity FROM ezlink_inventory WHERE id=1 FOR UPDATE');
   if(!before)throw new Error('NOT_READY');
   if(total<before.redeemed_quantity)throw new Error('BELOW_REDEEMED');
   await c.query('UPDATE ezlink_inventory SET total_quantity=$1,updated_at=now() WHERE id=1',[total]);
   await c.query('INSERT INTO ezlink_inventory_audit(previous_total,new_total,actor) VALUES($1,$2,$3)',[before.total_quantity,total,res.locals.admin.email]);
   return {total,redeemed:before.redeemed_quantity,remaining:total-before.redeemed_quantity};
  });
  return res.json(result);
 }catch(e){return res.status(409).json({error:e instanceof Error&&e.message==='BELOW_REDEEMED'?'Total cannot be lower than cards already issued':'Inventory update unavailable'});}
});
ezlinkAdminRouter.post('/lookup',async(req,res)=>{
 const mobile=validPhone(req.body?.mobileNumber);
 if(!mobile)return res.status(400).json({error:'Enter a valid Singapore mobile number'});
 try{
  const {rows}=await getPool().query(
   `SELECT p.nickname,d.id AS "drawId",d.site,d.prize_name AS "prizeName",
      (e.id IS NOT NULL) AS "ezlinkRedeemed",e.redeemed_at AS "ezlinkRedeemedAt"
    FROM participants p JOIN draws d ON d.participant_id=p.id
    LEFT JOIN ezlink_redemptions e ON e.participant_id=p.id
    WHERE p.mobile_number=$1 LIMIT 1`,[mobile]);
  const found=rows[0];
  if(!found)return res.status(404).json({error:'No previous 8-stamp Lucky Dip record found'});
  if(!siteAllowed(res.locals.admin,found.site))return res.status(403).json({error:'This redemption belongs to another hub'});
  return res.json({found:true,...found,mobileNumber:mobile});
 }catch{return res.status(503).json({error:'Unable to check participant record'});}
});
ezlinkAdminRouter.post('/draw',async(req,res)=>{
 const scenario=req.body?.scenario;
 const name=typeof req.body?.name==='string'?req.body.name.trim():'';
 const mobile=validPhone(req.body?.mobileNumber),site=req.body?.site;
 if(!['8_only','17_fresh'].includes(scenario)||!mobile||name.length<1||name.length>64||
    !['PDD','PS'].includes(site)||!siteAllowed(res.locals.admin,site)||
    req.body?.stampsVerified!==true||req.body?.firstPunchUnused!==true||
    (scenario==='17_fresh'&&req.body?.secondPunchUnused!==true))
  return res.status(400).json({error:'Select a valid scenario, provide participant details, and verify stamps/punches'});
 const ticket=req.body?.ticketNumber;
 // Require a stable ticket for retry safety. The browser generates it once per session.
 if(typeof ticket!=='string'||!new RegExp('^NELBD-'+site+'-[0-9]{6}$').test(ticket))
  return res.status(400).json({error:'Invalid redemption ticket'});
 try{
  const result=await executePostgresLuckyDipDraw({nickname:name,mobileNumber:mobile,site,ticketNumber:ticket,kioskId:'STAFF-'+site+'-REDEMPTION'});
  if(!result.success)return res.status(409).json(result);
  return res.json({...result,scenario,ezlinkPending:scenario==='17_fresh',instructions:scenario==='17_fresh'?
    'Issue Lucky Dip prize and sticker and apply punch 1. Then confirm ez-link card issuance separately.':
    'Issue Lucky Dip prize and sticker, then apply punch 1.'});
 }catch{return res.status(503).json({error:'Lucky Dip unavailable; do not repeat issuance without checking history'});}
});
ezlinkAdminRouter.post('/redeem',async(req,res)=>{
 const scenario=req.body?.scenario, mobile=validPhone(req.body?.mobileNumber);
 if(!['17_fresh','17_returning'].includes(scenario)||!mobile||
    req.body?.stampsVerified!==true||req.body?.secondPunchUnused!==true||
    (scenario==='17_returning'&&req.body?.firstPunchPresent!==true)||
    (scenario==='17_fresh'&&req.body?.firstRewardCompleted!==true)||
    req.body?.cardHandedOver!==true||req.body?.secondPunchApplied!==true)
  return res.status(400).json({error:'Card handover and booklet verification must be confirmed'});
 try{
  const result=await withTransaction(async c=>{
   // Serialized across hubs and inventory edits; protects both duplicate and stock counters.
   await c.query('SELECT pg_advisory_xact_lock($1)',[7102027]);
   const {rows:[row]}=await c.query(
    `SELECT p.id AS participant_id,d.id AS draw_id,d.site,d.status,e.id AS redeemed_id
     FROM participants p JOIN draws d ON d.participant_id=p.id
     LEFT JOIN ezlink_redemptions e ON e.participant_id=p.id
     WHERE p.mobile_number=$1 FOR UPDATE OF p,d`,[mobile]);
   if(!row)throw new Error('NO_LUCKY_DIP');
   if(!siteAllowed(res.locals.admin,row.site))throw new Error('WRONG_SITE');
   if(row.redeemed_id)throw new Error('ALREADY_REDEEMED');
   if(row.status!=='claimed')throw new Error('DRAW_NOT_CLAIMED');
   const stock=await c.query('UPDATE ezlink_inventory SET redeemed_quantity=redeemed_quantity+1,updated_at=now() WHERE id=1 AND redeemed_quantity<total_quantity RETURNING total_quantity-redeemed_quantity AS remaining');
   if(!stock.rowCount)throw new Error('NO_EZLINK_STOCK');
   await c.query(
    'INSERT INTO ezlink_redemptions(participant_id,draw_id,site,scenario,issued_by,booklet_17_verified,second_punch_confirmed) VALUES($1,$2,$3,$4,$5,true,true)',
    [row.participant_id,row.draw_id,row.site,scenario,res.locals.admin.email]);
   return {recorded:true,remaining:stock.rows[0].remaining,site:row.site};
  });
  return res.json(result);
 }catch(e){const msg=e instanceof Error?e.message:'';
  if(['NO_LUCKY_DIP','WRONG_SITE','ALREADY_REDEEMED','DRAW_NOT_CLAIMED','NO_EZLINK_STOCK'].includes(msg))return res.status(409).json({error:msg});
  return res.status(503).json({error:'Could not record ez-link redemption. Check stock and history before retrying'});
 }
});
ezlinkAdminRouter.get('/history',async(_req,res)=>{
 try{
  const {rows}=await getPool().query(
   `SELECT e.id,e.site,e.scenario,e.issued_by AS "issuedBy",e.redeemed_at AS "redeemedAt",
     right(p.mobile_number,4) AS "phoneLast4",d.ticket_number AS "ticketNumber"
    FROM ezlink_redemptions e JOIN participants p ON p.id=e.participant_id
    JOIN draws d ON d.id=e.draw_id ORDER BY e.redeemed_at DESC LIMIT 100`);
  return res.json(rows);
 }catch{return res.status(503).json({error:'ez-link redemption history unavailable'});}
});
