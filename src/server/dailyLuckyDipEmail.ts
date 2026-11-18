import {getPool} from './postgres.ts';
import {buildDailyReport,reportEmail,REPORT_RECIPIENTS,singaporeDate} from './dailyLuckyDipReport.ts';

const recipients=[...REPORT_RECIPIENTS];
const configured=()=>Boolean(process.env.NELBD_DAILY_REPORT_GMAIL_CLIENT_ID&&
 process.env.NELBD_DAILY_REPORT_GMAIL_CLIENT_SECRET&&process.env.NELBD_DAILY_REPORT_GMAIL_REFRESH_TOKEN);
async function gmailSend(subject:string,body:string){
 if(!configured())throw Error('MISSING_GMAIL_SERVER_CREDENTIALS');
 const request=new URLSearchParams({
  client_id:process.env.NELBD_DAILY_REPORT_GMAIL_CLIENT_ID!,
  client_secret:process.env.NELBD_DAILY_REPORT_GMAIL_CLIENT_SECRET!,
  refresh_token:process.env.NELBD_DAILY_REPORT_GMAIL_REFRESH_TOKEN!,
  grant_type:'refresh_token'
 });
 const auth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:request});
 if(!auth.ok)throw Error('GMAIL_OAUTH_REFRESH_FAILED:'+auth.status);
 const token=await auth.json() as {access_token?:string};
 if(!token.access_token)throw Error('GMAIL_OAUTH_TOKEN_MISSING');
 // Prevent message header injection. Gmail authenticates the From address.
 const raw=['From: NELBD Team <nelbd2026@gmail.com>',
  'To: '+recipients.join(', '),
  'Subject: '+subject.replace(/[\r\n]/g,''),
  'MIME-Version: 1.0','Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: 8bit','',''+body].join('\r\n');
 const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
  method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},
  body:JSON.stringify({raw:Buffer.from(raw).toString('base64url')})
 });
 if(!response.ok)throw Error('GMAIL_SEND_FAILED:'+response.status);
 const sent=await response.json() as {id?:string};
 if(!sent.id)throw Error('GMAIL_SEND_RESPONSE_MISSING_ID');
 return sent.id;
}
export async function sendDailyLuckyDipReport(date:string){
 if(process.env.NELBD_DAILY_REPORT_ENABLED!=='YES')throw Error('DAILY_REPORT_DISABLED');
 if(!configured())throw Error('GMAIL_CREDENTIALS_NOT_CONFIGURED');
 const pool=getPool();
 // One row per day prevents repeated sends by restarts/concurrent instances.
 const reservation=await pool.query(`INSERT INTO nelbd_daily_report_delivery(date,state,started_at)
 VALUES($1,'sending',now())
 ON CONFLICT(date) DO UPDATE SET state='sending',started_at=now()
 WHERE nelbd_daily_report_delivery.state='failed'
 OR (nelbd_daily_report_delivery.state='sending' AND
   nelbd_daily_report_delivery.started_at<now()-interval '20 minutes')
 RETURNING date`,[date]);
 if(!reservation.rowCount)return {skipped:true,reason:'Already sent or sending'};
 try{
  const report=await buildDailyReport(date);
  const messageId=await gmailSend('NELBD Daily Lucky Dip Summary — '+date+' (10:30 PM SGT)',reportEmail(report));
  await pool.query(`UPDATE nelbd_daily_report_delivery
   SET state='sent',sent_at=now(),gmail_message_id=$2,last_error=NULL WHERE date=$1`,[date,messageId]);
  console.log('NELBD_DAILY_REPORT_SENT',date);
  return {sent:true,date};
 }catch(e){
  const error=e instanceof Error?e.message:'Unknown send error';
  await pool.query(`UPDATE nelbd_daily_report_delivery SET state='failed',last_error=$2 WHERE date=$1`,[date,error.slice(0,300)]);
  console.error('NELBD_DAILY_REPORT_FAILED',date,error);
  throw e;
 }
}
export function startDailyLuckyDipEmailScheduler(){
 if(process.env.NELBD_DAILY_REPORT_ENABLED!=='YES'){console.log('NELBD daily email disabled');return;}
 if(!configured()){console.warn('NELBD daily email not enabled: server-side Gmail authorization missing');return;}
 let inProgress=false;
 const tick=async()=>{
  if(inProgress)return;
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  // Tolerate host restarts/delayed ticks for 15 minutes, but never report before cutoff.
  if(!/^22:(3[0-9]|4[0-4])$/.test(parts))return;
  inProgress=true;
  try{await sendDailyLuckyDipReport(singaporeDate());}
  catch(e){console.error('NELBD daily report tick unsuccessful',e instanceof Error?e.message:'unknown');}
  finally{inProgress=false;}
 };
 void tick();const timer=setInterval(()=>void tick(),60_000);timer.unref();
}
