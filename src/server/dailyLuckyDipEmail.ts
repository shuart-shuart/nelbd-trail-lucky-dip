import {randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import type {Request,Response} from 'express';
import {getPool} from './postgres.ts';
import {buildDailyReport,reportEmail,REPORT_RECIPIENTS,singaporeDate} from './dailyLuckyDipReport.ts';

// Reuses the current Power Automate HTTP email-flow contract: deliveryId,
// ticketNumber, to, subject, html. Requires a dedicated report branch in that
// flow so voucher callbacks are not mistakenly used for operational summaries.
// The event ends on 6 Dec 2026. On 7 Dec, send ONE final sign-off,
// then never send another report from this integration.
export const FINAL_REPORT_DATE='2026-12-06';
export const SIGN_OFF_DATE='2026-12-07';
export const SIGN_OFF_MESSAGE='PANG GANG LO!';
export function dailyEmailKind(date:string):'report'|'signoff'|'off'{
 if(date<=FINAL_REPORT_DATE)return 'report';
 if(date===SIGN_OFF_DATE)return 'signoff';
 return 'off';
}
const flowUrl=()=>process.env.NELBD_POWER_AUTOMATE_TRIGGER_URL||'';
const enabled=()=>process.env.NELBD_DAILY_REPORT_ENABLED==='YES'
 && process.env.NELBD_DAILY_REPORT_POWER_AUTOMATE_ENABLED==='YES';
const callbackKey=()=>process.env.NELBD_POWER_AUTOMATE_CALLBACK_KEY||'';
const configured=()=>{
 try{
  const url=new URL(flowUrl());
  return url.protocol==='https:' && callbackKey().length>=32;
 }catch{return false;}
};
const esc=(s:string)=>s.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'} as Record<string,string>)[ch]);
function htmlReport(text:string){
 return '<div style="font:14px/1.6 Arial,sans-serif;color:#270342">'+
 '<h2 style="color:#7716B5">NELBD Daily Lucky Dip Summary</h2>'+
 '<pre style="white-space:pre-wrap;font:13px/1.65 monospace">'+esc(text)+'</pre></div>';
}
export async function sendDailyLuckyDipReport(date:string){
 if(!enabled())throw Error('DAILY_POWER_AUTOMATE_REPORT_DISABLED');
 if(!configured())throw Error('POWER_AUTOMATE_EMAIL_FLOW_UNAVAILABLE');
 if(date!==singaporeDate())throw Error('REPORT_DATE_MUST_BE_TODAY_IN_SGT');
 const kind=dailyEmailKind(date);
 if(kind==='off')return {skipped:true,reason:'Reporting ended after 7 December 2026'};
 const pool=getPool();
 const deliveryId=randomUUID();
 // Never automatically retry an uncertain SMTP/flow outcome: it may duplicate
 // emails. Deliberate reconciliation is required if the handoff was ambiguous.
 const reserved=await pool.query(`INSERT INTO nelbd_daily_report_delivery(date,state,started_at,delivery_attempt_id)
 VALUES($1,'sending',now(),$2)
 ON CONFLICT(date) DO NOTHING RETURNING date`,[date,deliveryId]);
 if(!reserved.rowCount)return {skipped:true,reason:'Already attempted daily delivery'};
 try{
  const isSignoff=kind==='signoff';
  const emailText=isSignoff?SIGN_OFF_MESSAGE:reportEmail(await buildDailyReport(date));
  const payload={deliveryId,ticketNumber:'NELBD-DAILY-'+date.replaceAll('-',''),
   to:REPORT_RECIPIENTS.join(';'),
   subject:isSignoff?SIGN_OFF_MESSAGE:'NELBD Daily Lucky Dip Summary — '+date+' (10:30 PM SGT)',
   html:isSignoff?'<p>'+SIGN_OFF_MESSAGE+'</p>':htmlReport(emailText)};
  let response:globalThis.Response;
  try{
   response=await fetch(flowUrl(),{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(20_000)});
  }catch{
   await pool.query(`UPDATE nelbd_daily_report_delivery SET last_error='TRANSPORT_UNCERTAIN'
    WHERE date=$1 AND state='sending'`,[date]);
   throw Error('POWER_AUTOMATE_HANDOFF_UNCERTAIN');
  }
  if(!response.ok){
   await pool.query(`UPDATE nelbd_daily_report_delivery SET last_error=$2
    WHERE date=$1 AND state='sending'`,[date,'HTTP_'+response.status]);
   throw Error('POWER_AUTOMATE_TRIGGER_REJECTED_'+response.status);
  }
  await pool.query(`UPDATE nelbd_daily_report_delivery
   SET last_error='TRIGGER_ACCEPTED_AWAITING_CALLBACK'
   WHERE date=$1 AND state='sending'`,[date]);
  console.info('NELBD daily email accepted by Power Automate; delivery callback pending',date,kind);
  return {accepted:true,date};
 }catch(e){
  // Report generation errors are retryable only by explicit operator action.
  const message=e instanceof Error?e.message:'UNKNOWN';
  await pool.query(`UPDATE nelbd_daily_report_delivery SET last_error=$2
   WHERE date=$1 AND state='sending' AND last_error IS NULL`,[date,message.slice(0,200)]);
  throw e;
 }
}
export async function completeDailyReportDelivery(req:Request,res:Response){
 res.setHeader('Cache-Control','no-store');
 if(!configured())return res.status(423).json({error:'Power Automate delivery callback is not configured'});
 const key=(req.get('authorization')||'').replace(/^Bearer /,'');
 const expected=callbackKey();
 if(key.length<32||expected.length<32)return res.status(401).json({error:'Unauthorized'});
 const a=createHash('sha256').update(key).digest(),b=createHash('sha256').update(expected).digest();
 if(!timingSafeEqual(a,b))return res.status(401).json({error:'Unauthorized'});
 const {deliveryId,status}=req.body||{};
 if(typeof deliveryId!=='string'||!/^[0-9a-f-]{36}$/i.test(deliveryId)||
   !['sent','failed'].includes(status))return res.status(400).json({error:'Invalid callback'});
 try{
  const {rows}=await getPool().query(`UPDATE nelbd_daily_report_delivery
    SET state=CASE WHEN $2='sent' THEN 'sent' ELSE 'failed' END,
      sent_at=CASE WHEN $2='sent' THEN now() ELSE NULL END,
      last_error=CASE WHEN $2='failed' THEN 'POWER_AUTOMATE_REPORTED_FAILED' ELSE NULL END
    WHERE delivery_attempt_id=$1 AND state='sending' RETURNING date`,[deliveryId,status]);
  if(rows.length)return res.json({accepted:true,status});
  const old=await getPool().query('SELECT state FROM nelbd_daily_report_delivery WHERE delivery_attempt_id=$1',[deliveryId]);
  if(old.rows[0]?.state===status)return res.json({accepted:true,status,alreadyRecorded:true});
  return res.status(409).json({error:'Unknown or conflicting daily report delivery'});
 }catch{return res.status(503).json({error:'Unable to record delivery callback'});}
}
export function startDailyLuckyDipEmailScheduler(){
 if(!enabled()){console.info('NELBD daily Power Automate summary disabled');return;}
 if(!configured()){console.warn('NELBD daily Power Automate summary not configured; sender disabled');return;}
 let inProgress=false;
 const tick=async()=>{
  if(inProgress)return;
  const current=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',
   hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  if(!/^22:(3[0-9]|4[0-4])$/.test(current))return;
  const date=singaporeDate();
  if(dailyEmailKind(date)==='off')return;
  inProgress=true;
  try{await sendDailyLuckyDipReport(date);}
  catch(e){console.error('NELBD daily summary handoff not confirmed',e instanceof Error?e.message:'unknown');}
  finally{inProgress=false;}
 };
 void tick();const timer=setInterval(()=>void tick(),60_000);timer.unref();
}
