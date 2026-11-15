import {Router} from 'express';
import {createHash,randomBytes} from 'node:crypto';
import {getPool,withTransaction} from './postgres.ts';

/**
 * Manual Outlook mode: only an authenticated super-admin can reserve a prize
 * and obtain the one-time private viewer link. This NEVER submits an email.
 */
export const questManualOutlookRouter=Router();
const slotPattern=/^(F[12]|S[12]|T[12]|C[1-7][AB])$/;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const baseOrigin=()=>{
 const url=new URL(process.env.NELBD_PUBLIC_ORIGIN||'https://nelbd-trail-lucky-dip-staging.onrender.com');
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)
  throw new Error('Invalid Quest public URL');
 return url.origin;
};
const placement=(tier:string)=>tier==='first'?'1st Place':tier==='second'?'2nd Place':tier==='third'?'3rd Place':'Consolation Prize';
function draft(slot:{winner_name:string;prize_cents:number;voucher_quantity:number;tier:string},url:string){
 const value='S$'+(slot.prize_cents/100).toLocaleString('en-SG');
 const title=placement(slot.tier);
 return {
  subject:'Congratulations! '+title+' of New Everyday Life, By Design Quest',
  body:'Hi '+slot.winner_name+',\n\nCongratulations!\n\n'+
   "You've won Grab vouchers worth "+value+' at the NELBD Quest!\n\n'+
   'Your prize includes '+slot.voucher_quantity+' Grab voucher'+(slot.voucher_quantity===1?'':'s')+'.\n\n'+
   'View your Grab vouchers securely:\n'+url+'\n\n'+
   'Open the link to see your unique Grab gift code'+(slot.voucher_quantity===1?'':'s')+
   ' and redemption link'+(slot.voucher_quantity===1?'':'s')+
   '. You may either open each Grab voucher link or manually enter the code in the Grab app, following Grab\'s instructions.\n\n'+
   'Important: Please check voucher validity and redemption terms. Keep your private link and codes confidential.\n\n'+
   'Thank you for exploring New Everyday Life, By Design!\n\nNELBD Team'
 };
}
questManualOutlookRouter.use((_req,res,next)=>{
 if(res.locals.admin?.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
 next();
});
questManualOutlookRouter.post('/slots/:id/prepare-outlook',async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');
 if(!slotPattern.test(req.params.id)||req.body?.confirmed!==true)
  return res.status(400).json({error:'Explicit confirmation and valid slot required'});
 try{
  // Validate before locking; failures do not touch the database.
  const origin=baseOrigin();
  const result=await withTransaction(async client=>{
   const {rows:[slot]}=await client.query('SELECT * FROM quest_prize_slots WHERE slot_id=$1 FOR UPDATE',[req.params.id]);
   if(!slot||slot.state!=='approved'||!slot.winner_name||!slot.winner_email)
    throw new Error('WINNER_NOT_APPROVED');
   if(slot.delivery_attempt_id||slot.sent_at||
      (slot.delivery_status && slot.delivery_status!=='MANUAL_READY'))
    throw new Error('ALREADY_IN_DELIVERY');
   const already=await client.query('SELECT id,expires_at FROM quest_vouchers WHERE slot_id=$1 ORDER BY id FOR UPDATE',[slot.slot_id]);
   if(already.rowCount!==0&&already.rowCount!==slot.voucher_quantity)throw new Error('INCOMPLETE_ALLOCATION');
   if(already.rows.some((v:{expires_at:Date})=>new Date(v.expires_at).getTime()<=Date.now()))
    throw new Error('EXPIRED_VOUCHER');
   if(already.rowCount===0){
    const available=await client.query(
     'SELECT id FROM quest_vouchers WHERE slot_id IS NULL AND denomination_cents=$1 AND starts_at<=now() AND expires_at>now() ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED',
     [slot.voucher_denomination_cents,slot.voucher_quantity]);
    if(available.rowCount!==slot.voucher_quantity)throw new Error('INSUFFICIENT_VOUCHERS');
    await client.query('UPDATE quest_vouchers SET slot_id=$1,assigned_at=now() WHERE id=ANY($2::uuid[])',[slot.slot_id,available.rows.map((v:{id:string})=>v.id)]);
   }
   const {rows:[expiry]}=await client.query('SELECT min(expires_at) AS expires_at FROM quest_vouchers WHERE slot_id=$1',[slot.slot_id]);
   const access=randomBytes(32).toString('base64url');
   await client.query(
    "UPDATE quest_prize_slots SET viewer_token_hash=$2,viewer_expires_at=LEAST(now()+interval '30 days',$3::timestamptz),viewer_revoked_at=NULL,delivery_status='MANUAL_READY',updated_at=now() WHERE slot_id=$1",
    [slot.slot_id,hash(access),expiry.expires_at]);
   await client.query("INSERT INTO quest_events(slot_id,event,actor) VALUES($1,'outlook_link_prepared',$2)",
    [slot.slot_id,res.locals.admin.email]);
   const link=origin+'/quest/vouchers/'+access;
   return {slotId:slot.slot_id,to:slot.winner_email,link,...draft(slot,link),
    expiresAt:expiry.expires_at,
    notice:'This is the ONLY display of the private link. Copy the email now; preparing again rotates the link and invalidates the previous one. No email has been sent.'};
  });
  return res.json(result);
 }catch(error){
  const code=error instanceof Error?error.message:'UNAVAILABLE';
  if(['WINNER_NOT_APPROVED','ALREADY_IN_DELIVERY','INCOMPLETE_ALLOCATION','INSUFFICIENT_VOUCHERS','EXPIRED_VOUCHER'].includes(code))
   return res.status(409).json({error:code});
  return res.status(503).json({error:'Unable to prepare Outlook voucher link. Check server configuration and inventory'});
 }
});
questManualOutlookRouter.post('/slots/:id/mark-outlook-sent',async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!slotPattern.test(req.params.id)||req.body?.confirmed!==true)
  return res.status(400).json({error:'Explicit confirmation required'});
 try{
  const {rows}=await getPool().query(
   "UPDATE quest_prize_slots SET state='sent',delivery_status='MANUAL_CONFIRMED_SENT',sent_at=now(),updated_at=now() WHERE slot_id=$1 AND state='approved' AND delivery_status='MANUAL_READY' AND viewer_token_hash IS NOT NULL AND viewer_revoked_at IS NULL AND delivery_attempt_id IS NULL RETURNING slot_id",
   [req.params.id]);
  if(!rows.length)return res.status(409).json({error:'Slot not ready for manual sent confirmation'});
  await getPool().query("INSERT INTO quest_events(slot_id,event,actor) VALUES($1,'outlook_manually_marked_sent',$2)",
   [req.params.id,res.locals.admin.email]);
  return res.json({markedSent:true,deliveryVerification:'staff_confirmation_only'});
 }catch{return res.status(503).json({error:'Unable to record manual send'});}
});
