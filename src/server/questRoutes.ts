import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import {getPool} from './postgres.ts';

export const questClaimRouter=Router();
export const questAdminRouter=Router();
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const tokenPattern=/^[a-zA-Z0-9_-]{40,100}$/;
function slotPublic(row:any) {
 return {slotId:row.slot_id,tier:row.tier,amountCents:row.prize_cents,
   quantity:row.voucher_quantity,denominationCents:row.voucher_denomination_cents,
   status:row.state==='unclaimed'?'ready':'closed'};
}
questClaimRouter.get('/claim/:token',async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!tokenPattern.test(req.params.token))return res.status(404).json({error:'Claim link not found'});
 try {
  const {rows}=await getPool().query('SELECT * FROM quest_prize_slots WHERE claim_token_hash=$1',[hash(req.params.token)]);
  if(!rows.length)return res.status(404).json({error:'Claim link not found'});
  return res.json(slotPublic(rows[0]));
 }catch{return res.status(503).json({error:'Claim service unavailable'});}
});
questClaimRouter.post('/claim/:token',async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!tokenPattern.test(req.params.token))return res.status(404).json({error:'Claim link not found'});
 const name=typeof req.body?.name==='string'?req.body.name.trim():'';
 const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
 if(name.length<2||name.length>100||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  return res.status(400).json({error:'Enter a valid name and email address'});
 try {
  const {rows}=await getPool().query(
   "UPDATE quest_prize_slots SET winner_name=$2,winner_email=$3,state='submitted',submitted_at=now(),updated_at=now() WHERE claim_token_hash=$1 AND state='unclaimed' RETURNING slot_id",
   [hash(req.params.token),name,email]);
  if(!rows.length)return res.status(409).json({error:'This claim link has already been submitted or is no longer available'});
  await getPool().query("INSERT INTO quest_events(slot_id,event,actor) VALUES($1,'claim_submitted','winner')",[rows[0].slot_id]);
  return res.json({accepted:true,message:'Your NELBD Quest prize claim has been received for verification.'});
 }catch{return res.status(503).json({error:'Unable to save your claim. Please contact the NELBD team'});}
});
questAdminRouter.use((req,res,next)=>{
 if(res.locals.admin?.role!=='super_admin')return res.status(403).json({error:'Super admin access required'});
 next();
});
questAdminRouter.get('/slots',async(_req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {rows}=await getPool().query(
   'SELECT slot_id AS "slotId",tier,prize_cents AS "amountCents",voucher_quantity AS "quantity",pair_number AS "pairNumber",winner_name AS "name",winner_email AS "email",state,(claim_token_hash IS NOT NULL) AS "linkIssued",submitted_at AS "submittedAt",delivery_status AS "deliveryStatus",sent_at AS "sentAt" FROM quest_prize_slots ORDER BY CASE tier WHEN \'first\' THEN 1 WHEN \'second\' THEN 2 WHEN \'third\' THEN 3 ELSE 4 END,slot_id');
  return res.json(rows);
 }catch{return res.status(503).json({error:'Quest tables unavailable — apply migration 009 explicitly before testing'});}
});
questAdminRouter.post('/slots/:id/claim-link',async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!/^(F[12]|S[12]|T[12]|C[1-7][AB])$/.test(req.params.id))return res.status(404).json({error:'Unknown prize slot'});
 if(req.body?.confirmRotate!==true)return res.status(400).json({error:'Explicit link generation approval required'});
 const token=randomBytes(32).toString('base64url');
 try {
  const {rows}=await getPool().query(
   "UPDATE quest_prize_slots SET claim_token_hash=$2,updated_at=now() WHERE slot_id=$1 AND state='unclaimed' RETURNING slot_id",
   [req.params.id,hash(token)]);
  if(!rows.length)return res.status(409).json({error:'Claim already submitted; link cannot be regenerated'});
  await getPool().query("INSERT INTO quest_events(slot_id,event,actor) VALUES($1,'claim_link_generated',$2)",[req.params.id,res.locals.admin.email]);
  return res.json({link:'/quest/claim/'+token,warning:'Copy this link now. It will not be shown again, and any prior link is invalidated.'});
 }catch{return res.status(503).json({error:'Unable to generate claim link'});}
});
questAdminRouter.post('/slots/:id/approve',async(req,res)=>{
 if(!/^(F[12]|S[12]|T[12]|C[1-7][AB])$/.test(req.params.id)||req.body?.confirmed!==true)return res.status(400).json({error:'Explicit approval required'});
 try {
  const {rows}=await getPool().query(
   "UPDATE quest_prize_slots SET state='approved',approved_by=$2,approved_at=now(),updated_at=now() WHERE slot_id=$1 AND state='submitted' RETURNING slot_id",
   [req.params.id,res.locals.admin.email]);
  if(!rows.length)return res.status(409).json({error:'Claim not awaiting approval'});
  await getPool().query("INSERT INTO quest_events(slot_id,event,actor) VALUES($1,'claim_approved',$2)",[req.params.id,res.locals.admin.email]);
  return res.json({approved:true,emailNotSent:true});
 }catch{return res.status(503).json({error:'Approval unavailable'});}
});
questAdminRouter.get('/slots/:id/events',async(req,res)=>{
 if(!/^(F[12]|S[12]|T[12]|C[1-7][AB])$/.test(req.params.id))return res.status(404).json({error:'Unknown slot'});
 try{const {rows}=await getPool().query('SELECT event,actor,detail,happened_at AS "at" FROM quest_events WHERE slot_id=$1 ORDER BY happened_at DESC LIMIT 50',[req.params.id]);return res.json(rows);}
 catch{return res.status(503).json({error:'Audit history unavailable'});}
});
