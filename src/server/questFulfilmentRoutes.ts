import {Router} from 'express';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {getPool,withTransaction} from './postgres.ts';
import {encryptVoucher,fingerprint} from './grabVoucherCrypto.ts';
import {decryptGrabCredential} from './grabVoucherDecrypt.ts';

export const questFulfilmentAdminRouter=Router();
export const questViewRouter=Router();
export const questCallbackRouter=Router();
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const idPattern=/^(F[12]|S[12]|T[12]|C[1-7][AB])$/;
const tokenPattern=/^[a-zA-Z0-9_-]{40,100}$/;
function deliveryEnabled(){
 const key=process.env.NELBD_POWER_AUTOMATE_CALLBACK_KEY||'';
 const url=process.env.NELBD_QUEST_TRIGGER_URL||'';
 try{return process.env.NELBD_QUEST_SEND_ENABLED==='YES' && key.length>=32 && new URL(url).protocol==='https:';}
 catch{return false;}
}
function callbackValid(value:string){
 const expected=process.env.NELBD_POWER_AUTOMATE_CALLBACK_KEY||'';
 const supplied=value.startsWith('Bearer ')?value.slice(7):'';
 if(expected.length<32||supplied.length<32)return false;
 return timingSafeEqual(Buffer.from(hash(expected)),Buffer.from(hash(supplied)));
}
function htmlMail(name:string,amount:number,quantity:number,link:string,test=false):string{
 const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[c]);
 return '<div style="font-family:Arial,sans-serif;color:#270342;line-height:1.6;font-size:16px">'+
 '<h1 style="color:#7716B5">Congratulations, NELBD Quest Winner!</h1>'+
 '<p>Dear '+esc(name)+',</p>'+
 '<p>Congratulations on being a winner of the <strong>NELBD Quest</strong>!</p>'+
 '<p>You have won <strong>S$'+(amount/100).toLocaleString('en-SG')+' worth of Grab vouchers</strong> ('+quantity+' voucher'+(quantity===1?'':'s')+').</p>'+
 '<p>Thank you for exploring how design makes everyday life better with us.</p>'+
 '<p><a href="'+esc(link)+'" style="background:#270342;color:#fff;padding:12px 18px;border-radius:8px;display:inline-block;text-decoration:none">View your Grab vouchers</a></p>'+
 '<p>This private link expires and may be revoked. Please do not forward it. Voucher validity and redemption are subject to Grab terms.</p>'+
 (test?'<p><strong>TEST EMAIL — NO REAL VOUCHERS OR REDEEMABLE LINKS.</strong></p>':'')+
 '<p>Warm regards,<br><strong>NELBD Team</strong><br>New Everyday Life, By Design</p></div>';
}
async function handoff(deliveryId:string,to:string,subject:string,html:string):Promise<{accepted:boolean;result:string}>{
 const endpoint=process.env.NELBD_QUEST_TRIGGER_URL||'';
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deliveryId,ticketNumber:'NELBD-QUEST',to,subject,html}),signal:AbortSignal.timeout(20000)});
  return {accepted:response.ok,result:response.ok?'ACCEPTED':'HTTP_'+response.status};
 }catch{return {accepted:false,result:'TRANSPORT_ERROR'};}
}
questFulfilmentAdminRouter.use((req,res,next)=>{
 if(res.locals.admin?.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
 next();
});
questFulfilmentAdminRouter.get('/settings',(_req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.json({sendEnabled:deliveryEnabled(),importEnabled:process.env.NELBD_QUEST_IMPORT_ENABLED==='YES'});
});
questFulfilmentAdminRouter.get('/inventory',async(_req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {rows}=await getPool().query('SELECT denomination_cents AS "denominationCents", count(*)::int AS total, count(*) FILTER(WHERE slot_id IS NULL)::int AS unassigned,count(*) FILTER(WHERE slot_id IS NOT NULL)::int AS assigned FROM quest_vouchers GROUP BY denomination_cents ORDER BY denomination_cents');
  res.json(rows);
 }catch{res.status(503).json({error:'Quest inventory unavailable'});}
});
questFulfilmentAdminRouter.post('/import-batch',async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(process.env.NELBD_QUEST_IMPORT_ENABLED!=='YES')return res.status(423).json({error:'Grand-prize voucher imports are disabled'});
 const {batch,rows}=req.body||{};
 if(typeof batch!=='string'||!/^[-_a-zA-Z0-9.]{3,100}$/.test(batch)||!Array.isArray(rows)||rows.length<1||rows.length>50)
  return res.status(400).json({error:'Invalid voucher import'});
 const normalized:{code:string;url:string;codeHash:string;urlHash:string;amount:number;start:Date;end:Date}[]=[];
 const seen=new Set<string>();
 for(const row of rows){
  if(typeof row.code!=='string'||!/^[A-Z0-9_-]{5,80}$/.test(row.code)||typeof row.url!=='string'||row.url.length>1000||
    row.country!=='SG'||row.status!=='ISSUED'||![10000,25000].includes(row.denominationCents))
   return res.status(400).json({error:'Invalid denomination, status, country or voucher code'});
  let url:URL;try{url=new URL(row.url);}catch{return res.status(400).json({error:'Invalid redemption link'});}
  if(url.protocol!=='https:'||url.hostname!=='api.grab.com'||!url.pathname.startsWith('/gifts/'))
   return res.status(400).json({error:'Unexpected Grab redemption link'});
  const start=new Date(row.startsAt),end=new Date(row.expiresAt);
  if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||end<=new Date())
   return res.status(400).json({error:'Invalid voucher validity'});
  const codeHash=fingerprint(row.code),urlHash=fingerprint(row.url);
  if(seen.has(codeHash)||seen.has(urlHash))return res.status(400).json({error:'Duplicate voucher within upload'});
  seen.add(codeHash);seen.add(urlHash);
  normalized.push({code:encryptVoucher(row.code),url:encryptVoucher(row.url),codeHash,urlHash,amount:row.denominationCents,start,end});
 }
 try{
  const imported=await withTransaction(async c=>{
   let count=0;
   for(const r of normalized){
    const inserted=await c.query('INSERT INTO quest_vouchers(denomination_cents,code_ciphertext,url_ciphertext,code_fingerprint,url_fingerprint,source_batch,starts_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id',[r.amount,r.code,r.url,r.codeHash,r.urlHash,batch,r.start,r.end]);
    count+=inserted.rowCount||0;
   }
   return count;
  });
  res.json({imported,duplicates:normalized.length-imported});
 }catch{res.status(503).json({error:'Voucher batch import failed'});}
});
questFulfilmentAdminRouter.post('/test-email',async(req,res)=>{
 if(!deliveryEnabled())return res.status(423).json({error:'Quest email flow is disabled or not configured'});
 const to=typeof req.body?.to==='string'?req.body.to.trim().toLowerCase():'';
 const tier=typeof req.body?.tier==='string'?req.body.tier:'first';
 if(to.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||!['first','second','third','consolation'].includes(tier)||req.body?.confirmed!==true)
  return res.status(400).json({error:'Valid test recipient and confirmation required'});
 const prize:{[key:string]:[number,number]}={first:[200000,8],second:[100000,4],third:[50000,2],consolation:[10000,1]};
 const deliveryId=randomUUID();
 try{
  await getPool().query('INSERT INTO quest_test_emails(delivery_attempt_id,recipient,status,requested_by) VALUES($1,$2,$3,$4)',[deliveryId,to,'processing',res.locals.admin.email]);
  const hand=await handoff(deliveryId,to,'[TEST — NO REAL VOUCHERS] Congratulations! NELBD Quest',htmlMail('Test Winner',...prize[tier],'https://example.invalid/nelbd-quest-test',true));
  await getPool().query("UPDATE quest_test_emails SET handoff_status=$2,status=CASE WHEN $3::boolean THEN 'processing' ELSE 'needs_review' END WHERE delivery_attempt_id=$1",[deliveryId,hand.result,hand.accepted]);
  res.json({submitted:hand.accepted,status:hand.result,detail:'Test uses dummy information only; verify Outlook and the Power Automate callback. No vouchers reserved.'});
 }catch{res.status(503).json({error:'Test email could not be initiated'});}
});
questFulfilmentAdminRouter.post('/slots/:id/send',async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!deliveryEnabled())return res.status(423).json({error:'Quest delivery flow disabled or not configured'});
 if(!idPattern.test(req.params.id)||req.body?.confirmed!==true)return res.status(400).json({error:'Explicit approval and slot required'});
 let job:{deliveryId:string;to:string;html:string}|null=null;
 try{
  job=await withTransaction(async c=>{
   const found=await c.query('SELECT * FROM quest_prize_slots WHERE slot_id=$1 FOR UPDATE',[req.params.id]);
   const slot=found.rows[0];
   if(!slot||slot.state!=='approved'||!slot.winner_email||!slot.winner_name)throw new Error('NOT_APPROVED');
   const existing=await c.query('SELECT id FROM quest_vouchers WHERE slot_id=$1 FOR UPDATE',[slot.slot_id]);
   if(existing.rowCount&&existing.rowCount!==slot.voucher_quantity)throw new Error('INCOMPLETE_ALLOCATION');
   if(!existing.rowCount){
    const available=await c.query('SELECT id FROM quest_vouchers WHERE denomination_cents=$1 AND slot_id IS NULL AND expires_at>now() ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED',[slot.voucher_denomination_cents,slot.voucher_quantity]);
    if(available.rowCount!==slot.voucher_quantity)throw new Error('INSUFFICIENT_VOUCHERS');
    await c.query('UPDATE quest_vouchers SET slot_id=$1,assigned_at=now() WHERE id=ANY($2::uuid[])',[slot.slot_id,available.rows.map(x=>x.id)]);
   }
   const access=randomBytes(32).toString('base64url'),deliveryId=randomUUID();
   await c.query("UPDATE quest_prize_slots SET state='processing',viewer_token_hash=$2,viewer_expires_at=LEAST(now()+interval '30 days',(SELECT min(expires_at) FROM quest_vouchers WHERE slot_id=$1)),viewer_revoked_at=NULL,delivery_attempt_id=$3,delivery_started_at=now(),delivery_status='DISPATCHING',updated_at=now() WHERE slot_id=$1",[slot.slot_id,hash(access),deliveryId]);
   await c.query("INSERT INTO quest_events(slot_id,event,actor) VALUES($1,'delivery_initiated',$2)",[slot.slot_id,res.locals.admin.email]);
   const base=process.env.NELBD_PUBLIC_ORIGIN||'https://nelbd-trail-lucky-dip-staging.onrender.com';
   if(new URL(base).protocol!=='https:')throw new Error('INVALID_PUBLIC_ORIGIN');
   return {deliveryId,to:slot.winner_email,html:htmlMail(slot.winner_name,slot.prize_cents,slot.voucher_quantity,base+'/quest/vouchers/'+access)};
  });
 }catch(e){return res.status(409).json({error:e instanceof Error&&['NOT_APPROVED','INSUFFICIENT_VOUCHERS','INCOMPLETE_ALLOCATION'].includes(e.message)?e.message:'Unable to reserve vouchers'});}
 if(!job)return res.status(503).json({error:'No delivery prepared'});
 const result=await handoff(job.deliveryId,job.to,'Congratulations! Your NELBD Quest Grab Vouchers',job.html);
 try{
  await getPool().query("UPDATE quest_prize_slots SET delivery_status=$2,state=CASE WHEN $3::boolean THEN state ELSE 'needs_review' END,updated_at=now() WHERE delivery_attempt_id=$1 AND state='processing'",[job.deliveryId,result.result,result.accepted]);
 }catch{}
 return res.json({submitted:result.accepted,handoff:result.result,warning:'No automatic retry. Verify Outlook and callback before any further action.'});
});
questFulfilmentAdminRouter.post('/slots/:id/cancel',async(req,res)=>{
 if(!idPattern.test(req.params.id)||req.body?.confirmed!==true)return res.status(400).json({error:'Explicit cancellation required'});
 try{
  const {rows}=await getPool().query("UPDATE quest_prize_slots SET state='cancelled',updated_at=now() WHERE slot_id=$1 AND state='approved' RETURNING slot_id",[req.params.id]);
  if(!rows.length)return res.status(409).json({error:'Only a not-yet-sent approved claim can be cancelled'});
  await getPool().query("INSERT INTO quest_events(slot_id,event,actor) VALUES($1,'send_cancelled',$2)",[req.params.id,res.locals.admin.email]);
  return res.json({cancelled:true});
 }catch{return res.status(503).json({error:'Cancellation unavailable'});}
});
questFulfilmentAdminRouter.post('/slots/:id/revoke',async(req,res)=>{
 if(!idPattern.test(req.params.id)||req.body?.confirmed!==true)return res.status(400).json({error:'Explicit revocation required'});
 try{
  const {rows}=await getPool().query("UPDATE quest_prize_slots SET viewer_revoked_at=now(),updated_at=now() WHERE slot_id=$1 AND viewer_token_hash IS NOT NULL AND viewer_revoked_at IS NULL RETURNING slot_id",[req.params.id]);
  if(!rows.length)return res.status(409).json({error:'No active voucher link'});
  await getPool().query("INSERT INTO quest_events(slot_id,event,actor) VALUES($1,'viewer_access_revoked',$2)",[req.params.id,res.locals.admin.email]);
  return res.json({revoked:true,warning:'This cannot revoke codes already viewed or redeemed'});
 }catch{return res.status(503).json({error:'Revocation unavailable'});}
});
questViewRouter.get('/vouchers/:token',async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(!tokenPattern.test(req.params.token))return res.status(404).json({error:'Secure link unavailable'});
 try{
  const {rows}=await getPool().query("SELECT slot_id,tier,prize_cents,voucher_quantity,state FROM quest_prize_slots WHERE viewer_token_hash=$1 AND viewer_revoked_at IS NULL AND viewer_expires_at>now() AND state IN ('processing','sent')",[hash(req.params.token)]);
  const slot=rows[0];if(!slot)return res.status(404).json({error:'This private voucher link is unavailable or has expired'});
  const vouchers=await getPool().query('SELECT denomination_cents,code_ciphertext,url_ciphertext,starts_at,expires_at FROM quest_vouchers WHERE slot_id=$1 ORDER BY id',[slot.slot_id]);
  if(vouchers.rowCount!==slot.voucher_quantity)return res.status(503).json({error:'Voucher allocation incomplete'});
  await getPool().query("INSERT INTO quest_events(slot_id,event,actor) VALUES($1,'vouchers_viewed','winner_link')",[slot.slot_id]);
  return res.json({tier:slot.tier,amountCents:slot.prize_cents,vouchers:vouchers.rows.map(v=>({amountCents:v.denomination_cents,code:decryptGrabCredential(v.code_ciphertext),url:decryptGrabCredential(v.url_ciphertext),startsAt:v.starts_at,expiresAt:v.expires_at}))});
 }catch{return res.status(503).json({error:'Unable to load your vouchers'});}
});
questCallbackRouter.post('/automation/complete',async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!callbackValid(req.get('authorization')||''))return res.status(401).json({error:'Unauthorized'});
 const {deliveryId,status}=req.body||{};
 if(typeof deliveryId!=='string'||!/^[0-9a-f-]{36}$/i.test(deliveryId)||!['sent','failed'].includes(status))
  return res.status(400).json({error:'Invalid acknowledgement'});
 try{
  const changed=await getPool().query("UPDATE quest_prize_slots SET state=CASE WHEN $2='sent' THEN 'sent' ELSE 'needs_review' END,delivery_status=$2,sent_at=CASE WHEN $2='sent' THEN now() ELSE sent_at END,updated_at=now() WHERE delivery_attempt_id=$1 AND state='processing' RETURNING slot_id",[deliveryId,status]);
  if(changed.rowCount){
   await getPool().query("INSERT INTO quest_events(slot_id,event,actor) VALUES($1,$2,'power_automate')",[changed.rows[0].slot_id,'email_'+status]);
   return res.json({accepted:true});
  }
  const test=await getPool().query("UPDATE quest_test_emails SET status=$2,completed_at=now() WHERE delivery_attempt_id=$1 AND status='processing' RETURNING id",[deliveryId,status]);
  if(test.rowCount)return res.json({accepted:true,test:true});
  const previous=await getPool().query("SELECT state,delivery_status FROM quest_prize_slots WHERE delivery_attempt_id=$1",[deliveryId]);
  if(previous.rows[0]?.delivery_status===status)return res.json({accepted:true,alreadyRecorded:true});
  const oldTest=await getPool().query('SELECT status FROM quest_test_emails WHERE delivery_attempt_id=$1',[deliveryId]);
  if(oldTest.rows[0]?.status===status)return res.json({accepted:true,alreadyRecorded:true,test:true});
  return res.status(409).json({error:'Unknown or conflicting delivery'});
 }catch{return res.status(503).json({error:'Unable to acknowledge delivery'});}
});
