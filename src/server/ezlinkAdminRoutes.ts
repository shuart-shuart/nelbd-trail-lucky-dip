import crypto from 'node:crypto';
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

/** Shared ledger remains the canonical all-hub total; allocations represent physical custody. */
ezlinkAdminRouter.get('/inventory',async(_req,res)=>{
 try{
  const {rows:[global]}=await getPool().query('SELECT total_quantity AS total,redeemed_quantity AS redeemed FROM ezlink_inventory WHERE id=1');
  const {rows}=await getPool().query('SELECT site,allocated_quantity AS total,redeemed_quantity AS redeemed FROM ezlink_hub_inventory ORDER BY site');
  if(!global||rows.length!==2)return res.status(503).json({error:'Hub inventory migration 014 required'});
  const bySite:{PDD:{total:number;redeemed:number;remaining:number};PS:{total:number;redeemed:number;remaining:number}}={
   PDD:{total:0,redeemed:0,remaining:0},PS:{total:0,redeemed:0,remaining:0}};
  for(const row of rows)if(row.site==='PDD'||row.site==='PS'){
   const total=Number(row.total),redeemed=Number(row.redeemed);
   bySite[row.site]={total,redeemed,remaining:total-redeemed};
  }
  return res.json({total:Number(global.total),redeemed:Number(global.redeemed),
   remaining:Number(global.total)-Number(global.redeemed),
   unallocated:Number(global.total)-bySite.PDD.total-bySite.PS.total,bySite});
 }catch{return res.status(503).json({error:'Hub inventory unavailable; check migration 014'});}
});
ezlinkAdminRouter.get('/inventory/adjustments',async(_req,res)=>{
 if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
 try{
  const {rows}=await getPool().query(`SELECT id,kind,from_site AS "fromSite",to_site AS "toSite",delta,
    previous_total AS "previousTotal",new_total AS "newTotal",actor,note,happened_at AS "happenedAt"
    FROM ezlink_hub_stock_audit ORDER BY happened_at DESC,id DESC LIMIT 100`);
  return res.json(rows);
 }catch{return res.status(503).json({error:'Hub stock audit unavailable; check migration 014'});}
});
/** Disable old pooled edit API: it would bypass physical custody accounting. */
ezlinkAdminRouter.put('/inventory',(_req,res)=>res.status(410).json({error:'Use hub-specific stock adjustment instead'}));
ezlinkAdminRouter.put('/inventory/hub',async(req,res)=>{
 if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
 const {site,total,expectedTotal}=req.body||{};
 const note=typeof req.body?.note==='string'?req.body.note.trim():'';
 if(!['PDD','PS'].includes(site)||!Number.isSafeInteger(total)||total<0||total>100000||
   !Number.isSafeInteger(expectedTotal)||expectedTotal<0||!note||note.length>500)
  return res.status(400).json({error:'Enter hub, valid total, current revision and adjustment note'});
 try{
  const result=await withTransaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock($1)',[7102027]);
   const {rows:[global]}=await c.query('SELECT total_quantity,redeemed_quantity FROM ezlink_inventory WHERE id=1 FOR UPDATE');
   const {rows:[hub]}=await c.query('SELECT allocated_quantity,redeemed_quantity FROM ezlink_hub_inventory WHERE site=$1 FOR UPDATE',[site]);
   if(!global||!hub)throw new Error('NOT_READY');
   if(hub.allocated_quantity!==expectedTotal)throw new Error('STOCK_CHANGED');
   if(total<hub.redeemed_quantity)throw new Error('BELOW_REDEEMED');
   const delta=total-hub.allocated_quantity;
   if(!delta)throw new Error('NO_CHANGE');
   // A local adjustment represents received/removed physical cards, not a transfer.
   const globalTotal=global.total_quantity+delta;
   if(globalTotal<global.redeemed_quantity||globalTotal<0||globalTotal>100000)throw new Error('INVALID_TOTAL');
   await c.query('UPDATE ezlink_hub_inventory SET allocated_quantity=$2,updated_at=now() WHERE site=$1',[site,total]);
   await c.query('UPDATE ezlink_inventory SET total_quantity=$1,updated_at=now() WHERE id=1',[globalTotal]);
   await c.query(`INSERT INTO ezlink_hub_stock_audit(kind,to_site,delta,previous_total,new_total,actor,note)
      VALUES('ADJUST',$1,$2,$3,$4,$5,$6)`,[site,delta,hub.allocated_quantity,total,res.locals.admin.email,note]);
   return {site,total,remaining:total-hub.redeemed_quantity};
  });
  return res.json(result);
 }catch(e){const reason=e instanceof Error?e.message:'';
  return res.status(reason==='NOT_READY'?503:409).json({error:
   reason==='STOCK_CHANGED'?'Stock changed at this hub. Refresh before editing':
   reason==='BELOW_REDEEMED'?'Cannot lower stock below already issued cards':
   reason==='NO_CHANGE'?'No stock change entered':
   reason==='INVALID_TOTAL'?'Overall stock limit exceeded':'Hub inventory unavailable'});
 }
});
ezlinkAdminRouter.post('/inventory/transfer',async(req,res)=>{
 if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
 const {from,to,quantity,expectedFrom,expectedTo}=req.body||{};
 const note=typeof req.body?.note==='string'?req.body.note.trim():'';
 if(!['PDD','PS','UNALLOCATED'].includes(from)||!['PDD','PS'].includes(to)||from===to||
   !Number.isSafeInteger(quantity)||quantity<=0||quantity>100000||
   !Number.isSafeInteger(expectedFrom)||expectedFrom<0||
   !Number.isSafeInteger(expectedTo)||expectedTo<0||!note||note.length>500)
   return res.status(400).json({error:'Invalid source, destination, amount, revision or transfer note'});
 try{
  const result=await withTransaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock($1)',[7102027]);
   const {rows:[global]}=await c.query('SELECT total_quantity FROM ezlink_inventory WHERE id=1 FOR UPDATE');
   const {rows}=await c.query('SELECT site,allocated_quantity,redeemed_quantity FROM ezlink_hub_inventory ORDER BY site FOR UPDATE');
   if(!global||rows.length!==2)throw new Error('NOT_READY');
   const hubs=Object.fromEntries(rows.map(r=>[r.site,r]));
   const free=global.total_quantity-rows.reduce((sum,r)=>sum+r.allocated_quantity,0);
   const source=from==='UNALLOCATED'?free:hubs[from].allocated_quantity-hubs[from].redeemed_quantity;
   if(source!==expectedFrom||hubs[to].allocated_quantity!==expectedTo)throw new Error('STOCK_CHANGED');
   if(source<quantity)throw new Error('INSUFFICIENT');
   if(from!=='UNALLOCATED')await c.query('UPDATE ezlink_hub_inventory SET allocated_quantity=allocated_quantity-$2,updated_at=now() WHERE site=$1',[from,quantity]);
   await c.query('UPDATE ezlink_hub_inventory SET allocated_quantity=allocated_quantity+$2,updated_at=now() WHERE site=$1',[to,quantity]);
   await c.query(`INSERT INTO ezlink_hub_stock_audit(kind,from_site,to_site,delta,actor,note)
      VALUES('TRANSFER',$1,$2,$3,$4,$5)`,[from,to,quantity,res.locals.admin.email,note]);
   return {transferred:true,from,to,quantity};
  });
  return res.json(result);
 }catch(e){const reason=e instanceof Error?e.message:'';
  return res.status(reason==='NOT_READY'?503:409).json({error:
   reason==='STOCK_CHANGED'?'Stock changed; refresh before transferring':
   reason==='INSUFFICIENT'?'Insufficient unissued cards at source hub':'Unable to transfer stock'});
 }
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
   const hub=await c.query('UPDATE ezlink_hub_inventory SET redeemed_quantity=redeemed_quantity+1,updated_at=now() WHERE site=$1 AND redeemed_quantity<allocated_quantity RETURNING allocated_quantity-redeemed_quantity AS remaining',[row.site]);
   if(!hub.rowCount)throw new Error('NO_EZLINK_STOCK');
   await c.query('UPDATE ezlink_inventory SET redeemed_quantity=redeemed_quantity+1,updated_at=now() WHERE id=1');
   const stock=hub;
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

/** Super-admin configures an unpredictable six-or-more digit staff handover PIN.
 * No default PIN. It is never returned to any client.
 */
ezlinkAdminRouter.put('/staff-pin',async(req,res)=>{
 if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
 const pin=req.body?.pin;
 if(typeof pin!=='string'||!/^\d{6,12}$/.test(pin)||new Set(pin).size<3)
  return res.status(400).json({error:'Use 6–12 digits with at least three different digits'});
 try{
  const salt=crypto.randomBytes(24).toString('hex');
  const hash=crypto.scryptSync(pin,salt,64).toString('hex');
  await getPool().query(`INSERT INTO ezlink_staff_config(id,pin_salt,pin_hash,updated_by)
   VALUES(1,$1,$2,$3) ON CONFLICT(id) DO UPDATE SET pin_salt=$1,pin_hash=$2,updated_by=$3,updated_at=now()`,
   [salt,hash,res.locals.admin.email]);
  return res.json({configured:true});
 }catch{return res.status(503).json({error:'Unable to set staff PIN; check migration 012'});}
});
ezlinkAdminRouter.get('/staff-pin/status',async(_req,res)=>{
 try{const {rowCount}=await getPool().query('SELECT 1 FROM ezlink_staff_config WHERE id=1');
  return res.json({configured:Boolean(rowCount)});
 }catch{return res.status(503).json({error:'Staff PIN configuration unavailable'});}
});
