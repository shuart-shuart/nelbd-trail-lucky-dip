import {randomUUID} from 'node:crypto';
import {getPool} from './postgres.ts';
import {singaporeDate} from './dailyLuckyDipReport.ts';
import {buildDailyCsvAttachments} from './dailyCsvBackup.ts';

const BACKUP_TO='nelbd2026@gmail.com';
const flowUrl=()=>process.env.NELBD_POWER_AUTOMATE_TRIGGER_URL||'';
const configured=()=>{
 try{return new URL(flowUrl()).protocol==='https:' &&
  (process.env.NELBD_POWER_AUTOMATE_CALLBACK_KEY||'').length>=32;}
 catch{return false;}
};
async function postCsvBackup(deliveryId:string,date:string,test:boolean){
 const attachments=await buildDailyCsvAttachments(date);
 const payload={deliveryId,
  ticketNumber:test?'NELBD-DAILY-CSV-TEST-'+deliveryId:'NELBD-DAILY-CSV-'+date.replaceAll('-',''),
  to:BACKUP_TO,
  subject:(test?'[TEST ONLY] ':'')+'NELBD Operational CSV Backup — '+date,
  html:'<p><strong>'+(test?'TEST — delivery check. ':'')+
   'NELBD Operational CSV Backup</strong></p><p>Attached are six operational CSV exports as of '+date+
   ' (Singapore time). These contain restricted participant contact information. '+
   'Keep this email and its attachments private.</p>'+
   '<p>This CSV export is not a PostgreSQL disaster-recovery backup.</p>',
  attachments};
 let response:globalThis.Response;
 try{response=await fetch(flowUrl(),{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(30_000)});}
 catch{throw Error('POWER_AUTOMATE_HANDOFF_UNCERTAIN');}
 if(!response.ok)throw Error('POWER_AUTOMATE_TRIGGER_HTTP_'+response.status);
 return {accepted:true,recipient:BACKUP_TO,files:attachments.length};
}
export async function sendDailyCsvBackupTest(actor:string){
 if(!configured())throw Error('CSV_BACKUP_FLOW_UNAVAILABLE');
 const id=randomUUID(),pool=getPool(),date=singaporeDate();
 const row=await pool.query(`INSERT INTO nelbd_daily_report_tests(delivery_attempt_id,requested_by,state)
 SELECT $1,$2,'sending' WHERE NOT EXISTS(
 SELECT 1 FROM nelbd_daily_report_tests WHERE created_at>now()-interval '60 seconds')
 RETURNING delivery_attempt_id`,[id,actor+' (CSV backup test)']);
 if(!row.rowCount)throw Error('TEST_RATE_LIMITED');
 try{
  const result=await postCsvBackup(id,date,true);
  await pool.query(`UPDATE nelbd_daily_report_tests SET state='accepted'
   WHERE delivery_attempt_id=$1 AND state='sending'`,[id]);
  return result;
 }catch(e){
  await pool.query(`UPDATE nelbd_daily_report_tests SET state='uncertain',last_error=$2
   WHERE delivery_attempt_id=$1 AND state='sending'`,
   [id,(e instanceof Error?e.message:'unknown').slice(0,160)]);
  throw e;
 }
}
export async function sendDailyCsvBackup(date:string){
 if(process.env.NELBD_CSV_BACKUP_ENABLED!=='YES')throw Error('CSV_BACKUP_DISABLED');
 if(!configured())throw Error('CSV_BACKUP_FLOW_UNAVAILABLE');
 if(date!==singaporeDate())throw Error('CSV_BACKUP_DATE_NOT_TODAY');
 if(date>'2026-12-07')return {skipped:true,reason:'Event reporting ended'};
 const id=randomUUID(),pool=getPool();
 const reserved=await pool.query(`INSERT INTO nelbd_csv_backup_delivery
 (date,delivery_attempt_id,state,started_at) VALUES($1,$2,'sending',now())
 ON CONFLICT(date) DO NOTHING RETURNING date`,[date,id]);
 if(!reserved.rowCount)return {skipped:true,reason:'Already attempted today'};
 try{
  const result=await postCsvBackup(id,date,false);
  await pool.query(`UPDATE nelbd_csv_backup_delivery SET state='accepted'
   WHERE date=$1 AND state='sending'`,[date]);
  return result;
 }catch(e){
  await pool.query(`UPDATE nelbd_csv_backup_delivery SET state='uncertain',last_error=$2
   WHERE date=$1 AND state='sending'`,[date,(e instanceof Error?e.message:'unknown').slice(0,160)]);
  throw e;
 }
}
export function startDailyCsvBackupScheduler(){
 if(process.env.NELBD_CSV_BACKUP_ENABLED!=='YES'){
  console.info('NELBD daily CSV backup disabled (awaiting Outlook attachment test)');return;
 }
 if(!configured()){console.warn('NELBD daily CSV backup flow unavailable');return;}
 let busy=false;
 const tick=async()=>{
  if(busy)return;
  const current=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',
   hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  if(!/^22:(3[5-9]|4[0-4])$/.test(current))return;
  busy=true;
  try{await sendDailyCsvBackup(singaporeDate());}
  catch(e){console.error('NELBD CSV backup handoff failed',e instanceof Error?e.message:'unknown');}
  finally{busy=false;}
 };
 void tick();const timer=setInterval(()=>void tick(),60_000);timer.unref();
}
