import {Router} from 'express';
import {randomBytes,randomInt,createHash,createHmac,scryptSync,timingSafeEqual} from 'node:crypto';
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
/** Staff fallback: create a new award, reserve 1/2 S$5 codes, and log stock atomically.
 * No existing ticket or manual voucher codes are accepted from the browser.
 * FARM is a collection location; its backing stock is allocated from PDD/PS.
 */
grabStaffRouter.post('/submit',async(req,res)=>{
 if(staffLimited(req,'submit',8))return res.status(429).json({error:'Too many submissions. Ask a supervisor'});
 if(process.env.NELBD_GRAB_FULFILMENT_ENABLED!=='YES')
  return res.status(423).json({error:'Grab voucher fulfilment is not enabled'});
 const {collectionSite,method,amount,confirmed}=req.body||{};
 if(!['PDD','PS','FARM'].includes(collectionSite)||!['email','phone'].includes(method)||
    (amount!==5&&amount!==10)||confirmed!==true)
  return res.status(400).json({error:'Choose a valid location, amount, contact method and confirm handover'});
 if(collectionSite==='FARM'&&method!=='email')
  return res.status(400).json({error:'FARM accepts email submissions only'});
 const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():null;
 const phone=normalizedPhone(req.body?.phone);
 if(method==='email'&&(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
  return res.status(400).json({error:'Enter a valid email address'});
 if(method==='phone'&&!phone)return res.status(400).json({error:'Enter a valid Singapore handphone number'});
 // Keyed fingerprint prevents plaintext contact lookup from the database alone.
 const key=process.env.NELBD_VOUCHER_ENCRYPTION_KEY||'';
 if(key.length<32)return res.status(503).json({error:'Voucher security is not configured'});
 const contact=method==='email'?email!:phone!;
 const fingerprint=createHmac('sha256',key).update(method+':'+contact).digest('hex');
 try{
  const recorded=await withTransaction(async client=>{
   // The same advisory lock as the ordinary kiosk draw prevents simultaneous
   // stock/cap changes from racing this manual fallback.
   await client.query('SELECT pg_advisory_xact_lock($1)',[7102026]);
   const old=await client.query('SELECT draw_id FROM grab_staff_contact_submissions WHERE contact_fingerprint=$1 LIMIT 1',[fingerprint]);
   if(old.rowCount)throw Error('DUPLICATE_CONTACT');
   if(method==='email'){
    const used=await client.query('SELECT 1 FROM grab_voucher_claim_sessions WHERE lower(recipient_email)=$1 LIMIT 1',[email]);
    if(used.rowCount)throw Error('DUPLICATE_CONTACT');
   }else{
    const existing=await client.query('SELECT 1 FROM participants WHERE mobile_number=$1 LIMIT 1',[phone]);
    if(existing.rowCount)throw Error('DUPLICATE_CONTACT');
   }
   const prizeId=amount===10?'grab-voucher-10':'grab-voucher-5';
   const eligible=await client.query(`SELECT p.id,p.name,p.tier,i.site,i.remaining_quantity
     FROM prizes p JOIN site_inventory i ON i.prize_id=p.id
     LEFT JOIN prize_site_limits lim ON lim.prize_id=i.prize_id AND lim.site=i.site
     WHERE p.id=$1 AND p.is_active=true AND i.remaining_quantity>0
       AND ($2::text='FARM' OR i.site=$2)
       AND NOT COALESCE(lim.paused,false)
       AND (lim.daily_cap IS NULL OR
          (SELECT count(*) FROM draws d WHERE d.prize_id=p.id AND d.site=i.site
            AND (d.drawn_at AT TIME ZONE 'Asia/Singapore')::date=
                (now() AT TIME ZONE 'Asia/Singapore')::date) < lim.daily_cap)
     ORDER BY i.remaining_quantity DESC,i.site
     LIMIT 1 FOR UPDATE OF i`,[prizeId,collectionSite]);
   if(!eligible.rowCount)throw Error('OUT_OF_STOCK');
   const item=eligible.rows[0];
   const codes=await client.query(`SELECT id FROM grab_voucher_codes
     WHERE assigned_draw_id IS NULL AND denomination_cents=500
       AND starts_at<=now() AND expires_at>now()
     ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,[amount/5]);
   if(codes.rows.length!==amount/5)throw Error('OUT_OF_CODES');
   let ticket='';
   for(let i=0;i<20;i++){
    const candidate='NELBD-'+item.site+'-'+randomInt(100000,1000000);
    const check=await client.query('SELECT 1 FROM draws WHERE ticket_number=$1',[candidate]);
    if(!check.rowCount){ticket=candidate;break;}
   }
   if(!ticket)throw Error('TICKET_EXHAUSTED');
   const draw=await client.query(`INSERT INTO draws
      (ticket_number,participant_id,prize_id,prize_name,prize_tier,site,status,kiosk_id,claimed_at)
      VALUES($1,NULL,$2,$3,$4,$5,'claimed','STAFF_INPUT',now())
      RETURNING id`,[ticket,item.id,item.name,item.tier,item.site]);
   const drawId=draw.rows[0].id;
   const inv=await client.query(`UPDATE site_inventory SET remaining_quantity=remaining_quantity-1,
     claimed_quantity=claimed_quantity+1,updated_at=now()
     WHERE prize_id=$1 AND site=$2 AND remaining_quantity>0
     RETURNING remaining_quantity`,[item.id,item.site]);
   if(!inv.rowCount)throw Error('OUT_OF_STOCK');
   await client.query('UPDATE grab_voucher_codes SET assigned_draw_id=$1,assigned_at=now() WHERE id=ANY($2::uuid[])',
     [drawId,codes.rows.map(v=>v.id)]);
   const tokenHash=createHash('sha256').update(randomBytes(32)).digest('hex');
   await client.query(`INSERT INTO grab_voucher_claim_sessions
     (draw_id,voucher_id,token_hash,recipient_email,status)
     VALUES($1,$2,$3,$4,$5)`,[drawId,codes.rows[0].id,tokenHash,
      method==='email'?email:null,method==='email'?'queued':'manual_followup']);
   await client.query(`INSERT INTO grab_staff_contact_submissions
     (draw_id,collection_site,contact_kind,contact_email,contact_phone,notification_state,
      staff_input,contact_fingerprint)
     VALUES($1,$2,$3,$4,$5,$6,true,$7)`,
     [drawId,collectionSite,method,method==='email'?email:null,method==='phone'?phone:null,
      method==='phone'?'pending':'not_applicable',fingerprint]);
   await client.query(`INSERT INTO inventory_adjustments
     (prize_id,site,previous_quantity,new_quantity,delta,reason,adjusted_by)
     VALUES($1,$2,$3,$4,-1,'draw','staff-input')`,
     [item.id,item.site,item.remaining_quantity,inv.rows[0].remaining_quantity]);
   return {drawId,amount,ticket,stockSite:item.site};
  });
  if(method==='email')return res.json({recorded:true,ticketNumber:recorded.ticket,
   stockSite:recorded.stockSite,delivery:'email_queued'});
  // Notification failure cannot undo stock or the recorded contact.
  let notification='uncertain';
  try{notification=await notifyManual({ticket:recorded.ticket,amount,
    collection:collectionSite,phone:phone!,drawId:recorded.drawId});}
  catch{console.error('Staff manual follow-up notification could not be confirmed');}
  return res.json({recorded:true,ticketNumber:recorded.ticket,stockSite:recorded.stockSite,
   delivery:'manual_followup',notification});
 }catch(e){
  const code=e instanceof Error?e.message:'';
  if(code==='DUPLICATE_CONTACT'||code==='23505')
   return res.status(409).json({error:'This contact may already have a Lucky Dip or staff voucher. Ask an administrator before issuing another'});
  if(code==='OUT_OF_STOCK'||code==='OUT_OF_CODES')
   return res.status(409).json({error:'Not enough eligible Grab voucher inventory remains at this location'});
  console.error('Staff input Grab voucher allocation failed',code==='TICKET_EXHAUSTED'?'TICKET_EXHAUSTED':'UNKNOWN');
  return res.status(503).json({error:'Unable to record voucher. Ask a supervisor to check the redemption list before retrying'});
 }
});
