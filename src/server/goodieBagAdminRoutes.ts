import {Router} from 'express';
import {getPool,withTransaction} from './postgres.ts';

export const goodieBagAdminRouter=Router();
goodieBagAdminRouter.use((_req,res,next)=>{
 res.setHeader('Cache-Control','no-store, private');
 if(process.env.NELBD_GOODIE_BAG_ENABLED!=='YES')return res.status(423).json({error:'Goodie Bag reward is not enabled'});
 next();
});
goodieBagAdminRouter.get('/inventory',async(_req,res)=>{
 try{
  const {rows}=await getPool().query('SELECT site,total_quantity AS total,redeemed_quantity AS redeemed,(total_quantity-redeemed_quantity) AS remaining FROM goodie_bag_inventory ORDER BY site');
  if(rows.length!==2)return res.status(503).json({error:'Goodie Bag inventory migration 015 required'});
  return res.json(Object.fromEntries(rows.map(r=>[r.site,{total:Number(r.total),redeemed:Number(r.redeemed),remaining:Number(r.remaining)}])));
 }catch{return res.status(503).json({error:'Goodie Bag inventory unavailable'});}
});
goodieBagAdminRouter.get('/adjustments',async(_req,res)=>{
 if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
 try{
  const {rows}=await getPool().query('SELECT id,site,previous_total AS "previousTotal",new_total AS "newTotal",actor,note,happened_at AS "happenedAt" FROM goodie_bag_stock_audit ORDER BY happened_at DESC,id DESC LIMIT 100');
  return res.json(rows);
 }catch{return res.status(503).json({error:'Stock history unavailable'});}
});
goodieBagAdminRouter.put('/inventory',async(req,res)=>{
 if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
 const {site,total,expectedTotal}=req.body||{};
 const note=typeof req.body?.note==='string'?req.body.note.trim():'';
 if(!['PDD','PS'].includes(site)||!Number.isSafeInteger(total)||total<0||total>100000||
    !Number.isSafeInteger(expectedTotal)||expectedTotal<0||!note||note.length>500)
  return res.status(400).json({error:'Invalid stock adjustment; include hub, current total and reason'});
 try{
  const result=await withTransaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock($1)',[7102027]);
   const {rows:[before]}=await c.query('SELECT total_quantity,redeemed_quantity FROM goodie_bag_inventory WHERE site=$1 FOR UPDATE',[site]);
   if(!before)throw Error('NOT_READY');
   if(before.total_quantity!==expectedTotal)throw Error('STOCK_CHANGED');
   if(total<before.redeemed_quantity)throw Error('BELOW_REDEEMED');
   if(total===before.total_quantity)throw Error('NO_CHANGE');
   await c.query('UPDATE goodie_bag_inventory SET total_quantity=$2,updated_at=now() WHERE site=$1',[site,total]);
   await c.query('INSERT INTO goodie_bag_stock_audit(site,previous_total,new_total,actor,note) VALUES($1,$2,$3,$4,$5)',
    [site,before.total_quantity,total,res.locals.admin.email,note]);
   return {site,total,redeemed:before.redeemed_quantity,remaining:total-before.redeemed_quantity};
  });
  return res.json(result);
 }catch(e){
  const why=e instanceof Error?e.message:'';
  return res.status(why==='NOT_READY'?503:409).json({error:
   why==='STOCK_CHANGED'?'Hub inventory changed. Refresh and try again':
   why==='BELOW_REDEEMED'?'Cannot reduce inventory below handed-over Goodie Bags':
   why==='NO_CHANGE'?'No change requested':'Unable to update Goodie Bag stock'});
 }
});
goodieBagAdminRouter.post('/transfer',async(req,res)=>{
 if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
 const {from,to,quantity,expectedFrom,expectedTo}=req.body||{};
 const note=typeof req.body?.note==='string'?req.body.note.trim():'';
 if(!['PDD','PS'].includes(from)||!['PDD','PS'].includes(to)||from===to||
    !Number.isSafeInteger(quantity)||quantity<=0||quantity>100000||
    !Number.isSafeInteger(expectedFrom)||expectedFrom<0||!Number.isSafeInteger(expectedTo)||expectedTo<0||
    !note||note.length>500)return res.status(400).json({error:'Invalid transfer'});
 try{
  const result=await withTransaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock($1)',[7102027]);
   const {rows}=await c.query('SELECT site,total_quantity,redeemed_quantity FROM goodie_bag_inventory ORDER BY site FOR UPDATE');
   if(rows.length!==2)throw Error('NOT_READY');
   const source=rows.find(x=>x.site===from),dest=rows.find(x=>x.site===to);
   if(!source||!dest)throw Error('NOT_READY');
   if(source.total_quantity!==expectedFrom||dest.total_quantity!==expectedTo)throw Error('STOCK_CHANGED');
   if(source.total_quantity-source.redeemed_quantity<quantity)throw Error('NO_STOCK');
   await c.query('UPDATE goodie_bag_inventory SET total_quantity=total_quantity-$2,updated_at=now() WHERE site=$1',[from,quantity]);
   await c.query('UPDATE goodie_bag_inventory SET total_quantity=total_quantity+$2,updated_at=now() WHERE site=$1',[to,quantity]);
   await c.query('INSERT INTO goodie_bag_stock_audit(site,previous_total,new_total,actor,note) VALUES($1,$2,$3,$4,$5)',
    [from,source.total_quantity,source.total_quantity-quantity,res.locals.admin.email,'Transfer to '+to+': '+note]);
   await c.query('INSERT INTO goodie_bag_stock_audit(site,previous_total,new_total,actor,note) VALUES($1,$2,$3,$4,$5)',
    [to,dest.total_quantity,dest.total_quantity+quantity,res.locals.admin.email,'Transfer from '+from+': '+note]);
   return {transferred:true,from,to,quantity};
  });
  return res.json(result);
 }catch(e){const why=e instanceof Error?e.message:'';
  return res.status(why==='NOT_READY'?503:409).json({error:why==='STOCK_CHANGED'?'Stock changed; refresh and retry':why==='NO_STOCK'?'Not enough Goodie Bags at source':'Transfer failed'});
 }
});
goodieBagAdminRouter.get('/history',async(_req,res)=>{
 try{
  const {rows}=await getPool().query(`SELECT g.id,g.site,g.scenario,g.redeemed_at AS "redeemedAt",g.issued_by AS "issuedBy",
   right(p.mobile_number,4) AS "phoneLast4" FROM goodie_bag_redemptions g
   JOIN participants p ON p.id=g.participant_id ORDER BY g.redeemed_at DESC LIMIT 100`);
  return res.json(rows);
 }catch{return res.status(503).json({error:'Goodie Bag history unavailable'});}
});
