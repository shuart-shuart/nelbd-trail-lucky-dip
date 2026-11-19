import React,{useEffect,useState} from 'react';
import {Mail,RefreshCw,Send} from 'lucide-react';

type TestState={state:string;createdAt:string;lastError:string|null}|null;
async function api(path:string,init?:RequestInit){
 const response=await fetch('/api/admin/daily-report/'+path,{credentials:'same-origin',cache:'no-store',
  ...init,headers:{'Content-Type':'application/json',...init?.headers}});
 const payload=await response.json().catch(()=>({error:'Unable to read response'}));
 if(!response.ok)throw Error(payload.error||'Request failed');
 return payload;
}
export function DailyReportEmailTestPanel(){
 const [authorized,setAuthorized]=useState(false);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState<TestState>(null);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const refresh=async()=>{
  try{const result=await api('test-status');setAuthorized(true);setStatus(result.latest);}
  catch(e){if(e instanceof Error&&e.message.includes('Super admin'))setAuthorized(false);
   else setError(e instanceof Error?e.message:'Unable to check test status');}
 };
 useEffect(()=>{void refresh()},[]);
 const send=async()=>{
  if(!window.confirm('Send ONE TEST email with dummy figures to nelbd2026@gmail.com? No real prizes or personal data will be used.'))return;
  setBusy(true);setError('');setMessage('');
  try{
   const result=await api('send-test',{method:'POST',body:JSON.stringify({confirmed:true})});
   setMessage(result.submitted?'Test submitted to Power Automate. Check the inbox and Run history.':'Test was not submitted.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Could not submit test');await refresh();}
  finally{setBusy(false);}
 };
 if(!authorized)return null;
 return <section className="rounded-2xl border border-[#E9E0F3] bg-white p-4 sm:p-6 shadow-sm mb-6" aria-label="Daily Lucky Dip Email Summary Test">
  <div className="flex items-center gap-2 mb-2">
   <Mail className="w-5 h-5 text-[#8B4AB2]"/>
   <h2 className="font-nel text-lg sm:text-xl font-semibold text-[#33224B]">Daily Email Summary</h2>
  </div>
  <p className="text-sm text-[#796C88] mb-3">10:30 PM SGT daily summary via existing Power Automate email flow. Test safely with fake counts before enabling automatic delivery.</p>
  <p className="text-xs text-[#796C88] mb-3">Test recipient: <strong>nelbd2026@gmail.com only</strong> · Existing voucher emails and actual stock are not affected.</p>
  <div className="flex flex-wrap gap-2">
   <button type="button" onClick={()=>void send()} disabled={busy} className="inline-flex items-center gap-2 min-h-11 rounded-xl bg-[#8B4AB2] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
    <Send className="w-4 h-4"/>{busy?'Submitting test…':'Send Test Email'}
   </button>
   <button type="button" onClick={()=>{setError('');void refresh()}} disabled={busy} className="inline-flex items-center gap-2 min-h-11 rounded-xl border border-[#DED1E9] px-4 py-2 text-sm font-bold text-[#33224B]">
    <RefreshCw className="w-4 h-4"/>Check Delivery Status
   </button>
  </div>
  {status&&<p className="text-xs text-[#796C88] mt-3" role="status">Last test: <strong>{status.state}</strong> · {new Date(status.createdAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})} SGT
   {status.state==='accepted'?' (flow accepted request; email delivery not yet confirmed)':''}
   {status.lastError?' · '+status.lastError:''}</p>}
  {message&&<p role="status" className="text-sm text-[#275D47] font-semibold mt-3">{message}</p>}
  {error&&<p role="alert" className="text-sm text-red-700 font-semibold mt-3">{error}</p>}
 </section>;
}
