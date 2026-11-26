import {Router} from 'express';
import {randomBytes,randomUUID,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {getPool,withTransaction} from './postgres.ts';

export const grabStaffRouter=Router();
const COOKIE='nelbd_grab_staff';
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
// Emergency backup form deliberately never reads or changes Lucky Dip tickets or voucher claims.
const staffRequests=new Map<string,{count:number;until:number}>();
function staffLimited(req:any,limit:number){
 const cookie=(req.headers.cookie||'').split(';').map((part:string)=>part.trim())
  .find((part:string)=>part.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'anonymous';
 const key=hash(cookie),now=Date.now(),old=staffRequests.get(key);
 const next=old&&old.until>now?old:{count:0,until:now+60_000};
 next.count++;staffRequests.set(key,next);
 if(staffRequests.size>5000)for(const [k,v] of staffRequests)if(v.until<=now)staffRequests.delete(k);
 return next.count>12;
}
function normalizedPhone(value:unknown){
 if(typeof value!=='string'||value.length>32)return null;
 const digits=value.replace(/[\\s()-]/g,'');
 const phone=digits.startsWith('+65')?digits:digits.startsWith('65')&&digits.length===10?'+'+digits:'+65'+digits;
 return /^\\+65[89][0-9]{7}$/.test(phone)?phone:null;
}
// Old endpoints are disabled to prevent stale clients claiming real codes through fallback.
grabStaffRouter.post('/lookup',(_req,res)=>res.status(410).json({error:'Ticket verification is no longer part of the emergency contact form. Refresh this page.'}));
grabStaffRouter.post('/submit',(_req,res)=>res.status(410).json({error:'Refresh this page to use the emergency contact form.'}));

async function notify(info:{id:string;site:string;amount:number;kind:string;contact:string}){
 const rawUrl=process.env.NELBD_GRAB_STAFF_NOTIFY_TRIGGER_URL||'';
 let url:URL;
 try{url=new URL(rawUrl);if(url.protocol!=='https:')throw Error('HTTPS required');}
 catch{
  await getPool().query("UPDATE grab_staff_fallback_submissions SET notification_state='not_configured' WHERE id=$1 AND notification_state='pending'",[info.id]);
  return 'not_configured';
 }
 await getPool().query("UPDATE grab_staff_fallback_submissions SET notification_state='sending' WHERE id=$1 AND notification_state='pending'",[info.id]);
 // Keep the existing tested flow's schema: ticketNumber, to, subject, html.
 // Here ticketNumber is a BACKUP reference, not an actual winning ticket.
 const ref='BACKUP-'+info.id;
 const html='<div style="font-family:Arial,sans-serif"><h2>NELBD Grab — APP OFFLINE BACKUP</h2>'+
  '<p><strong>Reference:</strong> '+esc(ref)+'</p>'+
  '<p><strong>Location:</strong> '+esc(info.site)+'</p>'+
  '<p><strong>Amount recorded by staff:</strong> S$'+info.amount+'</p>'+
  '<p><strong>Contact type:</strong> '+esc(info.kind)+'</p>'+
  '<p><strong>Contact:</strong> '+esc(info.contact)+'</p>'+
  '<p>This was manually recorded while the Lucky Dip app was unavailable. No ticket, voucher allocation or email fulfilment was verified. Review before sending vouchers.</p></div>';
 let result='uncertain';
 try{
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({ticketNumber:ref,to:'nelbd2026@gmail.com',
    subject:'[APP OFFLINE] NELBD Grab backup — '+info.site+' — S$'+info.amount,html}),
   signal:AbortSignal.timeout(15000)});
  result=response.ok?'accepted':'uncertain';
 }catch{result='uncertain';}
 await getPool().query("UPDATE grab_staff_fallback_submissions SET notification_state=$2 WHERE id=$1 AND notification_state='sending'",[info.id,result]).catch(()=>{});
 return result;
}
grabStaffRouter.post('/fallback/submit',async(req,res)=>{
 if(staffLimited(req,12))return res.status(429).json({error:'Too many submissions. Ask a supervisor'});
 const {collectionSite,method,amount}=req.body||{};
 if(!['PDD','PS','FARM'].includes(collectionSite)||!['email','phone'].includes(method)||![5,10].includes(amount))
  return res.status(400).json({error:'Select a valid location, voucher amount and contact method'});
 if(collectionSite==='FARM'&&method!=='email')
  return res.status(400).json({error:'FARM is email-only'});
 const email=typeof req.body.email==='string'?req.body.email.trim().toLowerCase():'';
 const phone=normalizedPhone(req.body.phone);
 if(method==='email'&&(!email||email.length>254||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)))
  return res.status(400).json({error:'Enter a valid email address'});
 if(method==='phone'&&!phone)return res.status(400).json({error:'Enter a valid Singapore handphone number'});
 const contact=method==='email'?email:phone!;
 try{
  const saved=await withTransaction(async client=>{
   // Prevent double taps creating repeated messages for the same recorded contact.
   await client.query('SELECT pg_advisory_xact_lock($1)',[7102031]);
   const old=await client.query(`SELECT id,notification_state FROM grab_staff_fallback_submissions
     WHERE collection_site=$1 AND award_cents=$2 AND contact_kind=$3 AND contact_value=$4
       AND created_at>now()-interval '10 minutes'
     ORDER BY created_at DESC LIMIT 1`,[collectionSite,amount*100,method,contact]);
   if(old.rowCount)return {id:old.rows[0].id,existing:true,notification:old.rows[0].notification_state};
   const id=randomUUID();
   await client.query(`INSERT INTO grab_staff_fallback_submissions
     (id,collection_site,award_cents,contact_kind,contact_value)
     VALUES($1,$2,$3,$4,$5)`,[id,collectionSite,amount*100,method,contact]);
   return {id,existing:false,notification:'pending'};
  });
  if(saved.existing)return res.json({recorded:true,alreadyRecorded:true,notification:saved.notification});
  let notification='uncertain';
  try{notification=await notify({id:saved.id,site:collectionSite,amount,kind:method,contact});}
  catch{console.error('Grab offline contact notification uncertain');}
  return res.json({recorded:true,notification});
 }catch{
  return res.status(503).json({error:'Contact could not be confirmed. Ask an administrator to check the backup list before repeating'});
 }
});
