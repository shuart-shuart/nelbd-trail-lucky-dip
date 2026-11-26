import {Router} from 'express';
import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {getPool,withTransaction} from './postgres.ts';

export const grabStaffRouter=Router();
const COOKIE='nelbd_grab_staff';
const VALID_PRIZES:Record<string,number>={'grab-voucher-5':5,'grab-voucher-10':10};
const loginAttempts=new Map<string,{count:number,until:number}>();
let overallAttempts:{count:number,until:number}={count:0,until:0};
const esc=(s:string)=>s.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[ch]);
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const ready=()=>process.env.NELBD_GRAB_STAFF_PORTAL_ENABLED==='YES'
 && (process.env.NELBD_GRAB_STAFF_PASSWORD||'').length>=12
 && process.env.DRAW_BACKEND==='postgres';
function originAllowed(req:any){
 const origin=req.get('origin');
 return origin===((process.env.NODE_ENV==='production'?'https':req.protocol)+'://'+req.get('host'));
}
function limited(ip:string){
 const now=Date.now();
 const row=loginAttempts.get(ip);
 const next=row&&row.until>now?row:{count:0,until:now+15*60_000};
 next.count++;loginAttempts.set(ip,next);
 if(loginAttempts.size>5000)for(const [k,v] of loginAttempts)if(v.until<=now)loginAttempts.delete(k);
 if(overallAttempts.until<=now)overallAttempts={count:0,until:now+15*60_000};
 overallAttempts.count++;
 return next.count>5||overallAttempts.count>100;
}
async function authorized(req:any){
 const token=(req.headers.cookie||'').split(';').map((part:string)=>part.trim())
  .find((part:string)=>part.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!token||!/^[a-f0-9]{64}$/.test(token))return false;
 const rows=await getPool().query(
  'SELECT 1 FROM grab_staff_sessions WHERE token_hash=$1 AND expires_at>now()', [hash(token)]);
 return Boolean(rows.rowCount);
}
grabStaffRouter.use((req,res,next)=>{
 res.setHeader('Cache-Control','no-store, private');
 if(!ready())return res.status(423).json({error:'Staff portal is not yet enabled'});
 if(!['GET','HEAD'].includes(req.method)&&!originAllowed(req))
  return res.status(403).json({error:'Invalid origin'});
 next();
});
grabStaffRouter.post('/login',async(req,res)=>{
 const ip=req.ip||req.socket.remoteAddress||'unknown';
 if(limited(ip))return res.status(429).json({error:'Too many attempts. Ask a supervisor'});
 const supplied=typeof req.body?.password==='string'?req.body.password:'';
 if(supplied.length>256)return res.status(401).json({error:'Invalid password'});
 const expected=process.env.NELBD_GRAB_STAFF_PASSWORD||'';
 const salt='nelbd-grab-staff-login-v1';
 const a=scryptSync(supplied,salt,32),b=scryptSync(expected,salt,32);
 if(!timingSafeEqual(a,b))return res.status(401).json({error:'Invalid password'});
 try{
  const token=randomBytes(32).toString('hex');
  await getPool().query('INSERT INTO grab_staff_sessions(token_hash,expires_at) VALUES($1,now()+interval \'4 hours\')',[hash(token)]);
  res.cookie(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/staff/grab',maxAge:4*3600_000});
  return res.json({authenticated:true});
 }catch{return res.status(503).json({error:'Login unavailable'});}
});
grabStaffRouter.use(async(req,res,next)=>{
 try{if(!await authorized(req))return res.status(401).json({error:'Staff login required'});next();}
 catch{return res.status(503).json({error:'Staff verification unavailable'});}
});
grabStaffRouter.get('/session',(_req,res)=>res.json({authenticated:true}));
grabStaffRouter.post('/logout',async(req,res)=>{
 const cookie=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(cookie)await getPool().query('DELETE FROM grab_staff_sessions WHERE token_hash=$1',[hash(cookie)]).catch(()=>{});
 res.clearCookie(COOKIE,{path:'/api/staff/grab'});return res.json({ok:true});
});
const ticketValid=(value:unknown):value is string=>
 typeof value==='string'&&/^NELBD-(PDD|PS)-[0-9]{6}$/.test(value);
// Bound authenticated ticket enumeration and contact collection separately from login.
const staffRequests=new Map<string,{count:number;until:number}>();
function staffLimited(req:any,operation:string,limit:number){
 const cookie=(req.headers.cookie||'').split(';').map((part:string)=>part.trim())
   .find((part:string)=>part.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'anonymous';
 const key=operation+':'+hash(cookie);
 const now=Date.now(),existing=staffRequests.get(key);
 const next=existing&&existing.until>now?existing:{count:0,until:now+60_000};
 next.count++;staffRequests.set(key,next);
 if(staffRequests.size>5000)for(const [k,v] of staffRequests)if(v.until<=now)staffRequests.delete(k);
 return next.count>limit;
}
grabStaffRouter.post('/lookup',async(req,res)=>{
 if(staffLimited(req,'lookup',30))return res.status(429).json({error:'Too many ticket lookups. Ask a supervisor'});
 if(!ticketValid(req.body?.ticketNumber))return res.status(400).json({error:'Enter a valid winning ticket'});
 try{
  const result=await getPool().query(`SELECT d.prize_id,c.status
    FROM draws d JOIN grab_voucher_claim_sessions c ON c.draw_id=d.id
    WHERE d.ticket_number=$1`,[req.body.ticketNumber]);
  const row=result.rows[0];
  if(!row||!VALID_PRIZES[row.prize_id])return res.status(404).json({error:'No eligible S$5 or S$10 Grab prize found'});
  return res.json({amount:VALID_PRIZES[row.prize_id],available:row.status==='awaiting_email',
    status:row.status==='awaiting_email'?'Awaiting contact':'Already submitted or requires supervisor review'});
 }catch{return res.status(503).json({error:'Unable to verify winning ticket'});}
});
function normalizedPhone(value:unknown){
 if(typeof value!=='string'||value.length>32)return null;
 const digits=value.replace(/[\s()-]/g,'');
 const phone=digits.startsWith('+65')?digits:digits.startsWith('65')&&digits.length===10?'+'+digits:'+65'+digits;
 return /^\+65[89][0-9]{7}$/.test(phone)?phone:null;
}
async function notifyManual(info:{ticket:string;amount:number;collection:string;phone:string;drawId:string}){
 const url=process.env.NELBD_GRAB_STAFF_NOTIFY_TRIGGER_URL||'';
 let target:URL;
 try{target=new URL(url);if(target.protocol!=='https:')throw Error('not https');}
 catch{
  await getPool().query("UPDATE grab_staff_contact_submissions SET notification_state='not_configured' WHERE draw_id=$1 AND notification_state='pending'",[info.drawId]);
  return 'not_configured';
 }
 await getPool().query("UPDATE grab_staff_contact_submissions SET notification_state='sending' WHERE draw_id=$1 AND notification_state='pending'",[info.drawId]);
 const html='<div style="font-family:Arial,sans-serif"><h2>NELBD Grab Voucher — manual contact requested</h2>'+
  '<p><strong>Ticket:</strong> '+esc(info.ticket)+'</p><p><strong>Award:</strong> S$'+info.amount+'</p>'+
  '<p><strong>Collected at:</strong> '+esc(info.collection)+'</p><p><strong>Handphone:</strong> '+esc(info.phone)+'</p>'+
  '<p>No voucher codes are included. Please verify the winning ticket and arrange follow-up.</p></div>';
 let state='uncertain';
 try{
  const response=await fetch(target,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({ticketNumber:info.ticket,to:'nelbd2026@gmail.com',
    subject:'NELBD Grab manual follow-up — '+info.ticket,html}),signal:AbortSignal.timeout(15_000)});
  state=response.ok?'accepted':'uncertain';
 }catch{state='uncertain';}
 await getPool().query('UPDATE grab_staff_contact_submissions SET notification_state=$2 WHERE draw_id=$1 AND notification_state=\'sending\'',[info.drawId,state]).catch(()=>{});
 return state;
}
grabStaffRouter.post('/submit',async(req,res)=>{
 if(staffLimited(req,'submit',15))return res.status(429).json({error:'Too many submissions. Ask a supervisor'});
 const {ticketNumber,collectionSite,method}=req.body||{};
 if(!ticketValid(ticketNumber)||!['PDD','PS','FARM'].includes(collectionSite)||!['email','phone'].includes(method))
  return res.status(400).json({error:'Invalid ticket, location or contact method'});
 const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():null;
 const phone=normalizedPhone(req.body?.phone);
 if(method==='email'&&(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
  return res.status(400).json({error:'Enter a valid email address'});
 if(method==='phone'&&!phone)return res.status(400).json({error:'Enter a valid Singapore handphone number'});
 try{
  const recorded=await withTransaction(async client=>{
   const result=await client.query(`SELECT d.id,d.prize_id,c.status
     FROM draws d JOIN grab_voucher_claim_sessions c ON c.draw_id=d.id
     WHERE d.ticket_number=$1 FOR UPDATE OF c`,[ticketNumber]);
   const row=result.rows[0];
   if(!row||!VALID_PRIZES[row.prize_id])throw Error('INVALID_PRIZE');
   if(row.status!=='awaiting_email')throw Error('ALREADY_SUBMITTED');
   const updated=await client.query(`UPDATE grab_voucher_claim_sessions SET
     status=$2,recipient_email=$3,updated_at=now()
     WHERE draw_id=$1 AND status='awaiting_email' RETURNING draw_id`,
     [row.id,method==='email'?'queued':'manual_followup',method==='email'?email:null]);
   if(!updated.rowCount)throw Error('ALREADY_SUBMITTED');
   await client.query(`INSERT INTO grab_staff_contact_submissions
     (draw_id,collection_site,contact_kind,contact_email,contact_phone,notification_state)
     VALUES($1,$2,$3,$4,$5,$6)`,
     [row.id,collectionSite,method,method==='email'?email:null,method==='phone'?phone:null,
      method==='phone'?'pending':'not_applicable']);
   return {drawId:row.id,amount:VALID_PRIZES[row.prize_id]};
  });
  if(method==='email')return res.json({recorded:true,delivery:'email_queued'});
  // A notification failure cannot roll back an already committed contact record.
  // Always report the saved manual follow-up truthfully; the admin queue is the fallback.
  let notification='uncertain';
  try{notification=await notifyManual({ticket:ticketNumber,amount:recorded.amount,collection:collectionSite,phone:phone!,drawId:recorded.drawId});}
  catch{console.error('Staff manual follow-up notification could not be confirmed');}
  return res.json({recorded:true,delivery:'manual_followup',notification});
 }catch(e){
  const code=e instanceof Error?e.message:'';
  if(code==='ALREADY_SUBMITTED')return res.status(409).json({error:'Contact was already submitted for this ticket. Ask a supervisor'});
  if(code==='INVALID_PRIZE')return res.status(404).json({error:'This ticket does not have an eligible S$5/S$10 Grab prize'});
  return res.status(503).json({error:'Unable to record this contact. Ask a supervisor to check before retrying'});
 }
});
