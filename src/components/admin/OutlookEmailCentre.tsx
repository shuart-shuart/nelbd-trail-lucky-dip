import React,{useEffect,useState} from 'react';
import {GrabCsvImporter} from './GrabCsvImporter';
import {getGrabVoucherSummary,getGrabDeliveryDiagnostics,type GrabVoucherSummary,type GrabDeliveryDiagnostics} from '../../api/postgresAdminClient';
type QueueRow={drawId:string;ticketNumber:string;site:string;recipientEmail:string|null;status:string;createdAt:string};
type Draft={to:string;subject:string;body:string;status:string;ticketNumber:string};
type OfflineRetryCandidate={drawId:string;ticketNumber:string;attemptedAt:string};
async function api<T>(path:string,init?:RequestInit):Promise<T>{
 const response=await fetch('/api/admin/outlook-centre'+path,{
  ...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...init?.headers},cache:'no-store'
 });
 const data=await response.json().catch(()=>({error:'Request failed'}));
 if(!response.ok)throw new Error(data.error||'Request failed');
 return data as T;
}
async function offlineRetryApi<T>(path:string,init?:RequestInit):Promise<T>{
 const response=await fetch('/api/admin/grab-vouchers/'+path,{
  ...init,credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json',...init?.headers},
 });
 const data=await response.json().catch(()=>({error:'Request failed'}));
 if(!response.ok)throw new Error(data.error||'Request failed');
 return data as T;
}
export function OutlookEmailCentre(){
 const [rows,setRows]=useState<QueueRow[]>([]);
 const [stock,setStock]=useState<GrabVoucherSummary|null>(null);
 const [diagnostics,setDiagnostics]=useState<GrabDeliveryDiagnostics|null>(null);
 const [diagnosticsError,setDiagnosticsError]=useState('');
 const [draft,setDraft]=useState<Draft|null>(null);
 const [selected,setSelected]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [retryCandidates,setRetryCandidates]=useState<OfflineRetryCandidate[]>([]);
 const [retryBusy,setRetryBusy]=useState(false);
 const [retryNotice,setRetryNotice]=useState('');
 const refresh=async()=>{
  const [queueResult,summaryResult,diagnosticsResult,retriesResult]=await Promise.allSettled([
    api<QueueRow[]>(''),getGrabVoucherSummary(),getGrabDeliveryDiagnostics(),
    offlineRetryApi<OfflineRetryCandidate[]>('offline-retry-candidates')
  ]);
  if(retriesResult.status==='fulfilled')setRetryCandidates(retriesResult.value);
  if(queueResult.status==='fulfilled')setRows(queueResult.value);
  if(summaryResult.status==='fulfilled')setStock(summaryResult.value);
  setError(queueResult.status==='rejected'||summaryResult.status==='rejected'
    ? 'Unable to refresh some voucher data. Check your admin session.' : '');
  if(diagnosticsResult.status==='fulfilled') {
    setDiagnostics(diagnosticsResult.value);
    setDiagnosticsError('');
  } else {
    setDiagnostics(null);
    setDiagnosticsError('Delivery diagnostics unavailable.');
  }
 };
 useEffect(()=>{void refresh();},[]);
 const requestOfflineRetry=async(row:OfflineRetryCandidate)=>{
  if(retryBusy)return;
  if(!window.confirm('Verify that your Power Automate flow was OFF at the time of this attempt, and that no Outlook email was sent for ticket '+row.ticketNumber+'. Retry its existing assigned voucher ONCE?'))return;
  setRetryBusy(true);
  setRetryNotice('');
  try{
    await offlineRetryApi('offline-retry/'+encodeURIComponent(row.drawId),{
      method:'POST',
      body:JSON.stringify({confirmedOffline:true,confirmedNoSend:true})
    });
    setRetryNotice('One-time delivery retry queued for '+row.ticketNumber+'. Check Power Automate run history and refresh delivery status. Do not repeat this draw.');
    await refresh();
  }catch(e){
    setRetryNotice(e instanceof Error?e.message:'Could not request retry');
  }finally{setRetryBusy(false);}
 };
 const openDraft=async(id:string)=>{
  setBusy(true);setDraft(null);setSelected(id);
  try{setDraft(await api<Draft>('/'+encodeURIComponent(id)+'/draft'));setError('');}
  catch(e){setError(e instanceof Error?e.message:'Unable to prepare draft');}
  finally{setBusy(false);}
 };
 const copy=async()=>{
  if(!draft)return;
  try{await navigator.clipboard.writeText('To: '+draft.to+'\nSubject: '+draft.subject+'\n\n'+draft.body);setError('Draft copied. Paste into Outlook and verify recipient before sending.');}
  catch{setError('Clipboard unavailable. Copy the draft manually.');}
 };
 const markSent=async()=>{
  if(!draft||!selected||!window.confirm('Have you personally sent this email in Outlook? This does not verify delivery.'))return;
  setBusy(true);
  try{await api('/'+encodeURIComponent(selected)+'/mark-sent',{method:'POST',body:JSON.stringify({confirmed:true})});
    setDraft(null);setSelected('');await refresh();}
  catch(e){setError(e instanceof Error?e.message:'Could not update status');}
  finally{setBusy(false);}
 };
 return <section className="mb-6 rounded-2xl border border-[#DDD2E8] bg-white p-4 sm:p-6 text-[#33224B]">
  <div className="flex justify-between items-center gap-3 mb-2">
   <h2 className="text-xl font-bold">Grab voucher inventory and delivery</h2>
   <button type="button" onClick={()=>void refresh()} className="rounded-lg border px-3 py-2 text-sm">Refresh</button>
  </div>
  <p className="text-sm mb-4">Voucher stock and winner email statuses. The current Outlook draft fallback is manual; automatic Power Automate dispatch is not enabled by this screen. Do not manually send any processing or sent item.</p>
  {error&&<p role="status" className="text-sm mb-3 text-[#7F003D]">{error}</p>}
  <p className="text-sm mb-3 rounded-lg bg-[#F6F0FB] p-3">Grab voucher codes: {stock?.total??'—'} imported · {stock?.unassigned??'—'} unassigned · {stock?.currently_eligible??'—'} redeemable today · {stock?.early_test_remaining??0} early-test allocations available (not redeemable until 14 Nov) · {stock?.assigned??'—'} assigned. Real voucher import remains disabled pending security approval.</p>
  <div className="mb-4 rounded-xl border border-[#DDD2E8] p-3 sm:p-4">
    <h3 className="font-bold mb-2">Automatic email delivery diagnostics</h3>
    {diagnostics ? <>
      <div className="flex flex-wrap gap-2 mb-3 text-xs">
        {([
          ['PostgreSQL draw',diagnostics.configuration.drawBackendPostgres],
          ['Grab fulfilment',diagnostics.configuration.fulfilmentEnabled],
          ['Power Automate',diagnostics.configuration.automationEnabled],
          ['HTTPS trigger URL',diagnostics.configuration.triggerConfigured],
          ['Callback key',diagnostics.configuration.callbackKeyConfigured],
          ['Early voucher test',diagnostics.configuration.earlyTestEnabled]
        ] as [string,boolean][]).map(([label,ok])=><span key={label}
          className={`px-2 py-1 rounded-md border ${ok?'bg-emerald-50 text-emerald-900 border-emerald-300':'bg-amber-50 text-amber-900 border-amber-300'}`}>
          {label}: {ok?'YES':'NO'}
        </span>)}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm mb-3">
        {([
          ['Awaiting email',diagnostics.queue.awaitingEmail],
          ['Queued',diagnostics.queue.queued],
          ['Ready to dispatch',diagnostics.queue.readyToDispatch],
          ['Processing',diagnostics.queue.processing],
          ['Sent',diagnostics.queue.sent],
          ['Failed',diagnostics.queue.failed]
        ] as [string,number][]).map(([label,count])=><div key={label} className="rounded-lg bg-[#F6F0FB] p-2">
          <span className="block text-xs">{label}</span><strong>{count}</strong>
        </div>)}
      </div>
      <p className="text-xs leading-relaxed">
        {(!diagnostics.configuration.drawBackendPostgres||!diagnostics.configuration.fulfilmentEnabled||
          !diagnostics.configuration.automationEnabled||!diagnostics.configuration.triggerConfigured||
          !diagnostics.configuration.callbackKeyConfigured)
          ? 'A required server setting is missing. Automatic dispatch cannot run until all five delivery settings show YES.'
          : diagnostics.queue.readyToDispatch>0
          ? 'Eligible emails remain queued. The worker may not be running or could be failing before dispatch.'
          : diagnostics.queue.processing>0
          ? 'At least one job was claimed for delivery. Check Power Automate run history and the Outlook action before attempting any retry.'
          : diagnostics.queue.sent>0
          ? 'At least one delivery has been acknowledged as sent. This does not prove inbox receipt.'
          : 'No currently eligible queued delivery is waiting. Check the winner email queue and voucher validity.'}
      </p>
      {diagnostics.queue.mostRecentDispatchAt&&<p className="text-xs mt-1">Most recent dispatch attempt: {new Date(diagnostics.queue.mostRecentDispatchAt).toLocaleString()}</p>}
      <p className="text-xs mt-2 text-[#645574]">Read-only. No codes, email addresses, callback secrets or trigger URLs are displayed here. Refresh to update.</p>
    </> : <p className="text-sm">{diagnosticsError||'Loading delivery diagnostics…'}</p>}
  </div>
  {retryCandidates.length>0&&<div className="mb-4 rounded-xl border border-amber-400 bg-amber-50 p-3 sm:p-4 text-[#33224B]">
    <h3 className="font-bold mb-2">Recover Power Automate offline test attempts</h3>
    <p className="text-sm mb-3">Render recorded two HTTP 400 responses when the flow was switched off. These one-time recovery controls apply only to those original attempt times. Verify there is no successful Outlook send in Power Automate run history before retrying. The SAME voucher will be used; no new voucher is assigned.</p>
    {retryCandidates.map(row=><div key={row.drawId} className="flex items-center justify-between flex-wrap gap-2 mb-2">
      <div className="text-sm"><strong>{row.ticketNumber}</strong><span className="block text-xs">Original attempt: {new Date(row.attemptedAt).toLocaleString()}</span></div>
      <button type="button" disabled={retryBusy} onClick={()=>void requestOfflineRetry(row)}
        className="rounded-lg bg-[#270342] text-white px-3 py-2 text-sm font-semibold disabled:opacity-50">
        Retry this email once
      </button>
    </div>)}
    <p className="text-xs">This action is irreversible: the worker may immediately send the email once queued. Confirm that the flow is now ON.</p>
  </div>}
  {retryNotice&&<p role="status" className="mb-3 text-sm rounded-lg bg-[#F6F0FB] p-3">{retryNotice}</p>}
  <GrabCsvImporter onImported={()=>void refresh()}/>
  <div className="overflow-x-auto">
   <table className="w-full text-sm text-left"><thead><tr><th className="p-2">Ticket</th><th className="p-2">Hub</th><th className="p-2">Recipient</th><th className="p-2">Status</th><th className="p-2">Action</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.drawId} className="border-t">
    <td className="p-2">{row.ticketNumber}</td><td className="p-2">{row.site}</td>
    <td className="p-2">{row.recipientEmail||'Awaiting winner'}</td><td className="p-2">{row.status}</td>
    <td className="p-2"><button disabled={!row.recipientEmail||busy||row.status==='processing'||row.status==='sent'} onClick={()=>void openDraft(row.drawId)}
      className="rounded-lg border px-3 py-1 disabled:opacity-40">Review draft</button></td>
   </tr>)}</tbody></table>
   {!rows.length&&<p className="text-sm py-3">No Grab voucher email drafts yet.</p>}
  </div>
  {draft&&<div className="mt-4 rounded-xl border border-[#DDD2E8] p-4">
   <h3 className="font-bold mb-2">Draft · {draft.ticketNumber}</h3>
   <p className="text-sm"><strong>To:</strong> {draft.to}</p>
   <p className="text-sm mb-3"><strong>Subject:</strong> {draft.subject}</p>
   <pre className="whitespace-pre-wrap break-words rounded-lg bg-[#F6F0FB] p-3 text-sm font-sans">{draft.body}</pre>
   <div className="mt-3 flex flex-wrap gap-2">
    <button onClick={()=>void copy()} className="rounded-lg bg-[#270342] text-white px-4 py-2 text-sm">Copy email for Outlook</button>
    <a href="https://outlook.office.com/mail/" target="_blank" rel="noopener noreferrer"
       className="rounded-lg border px-4 py-2 text-sm">Open Outlook</a>
    <button disabled={busy||draft.status==='sent'||draft.status==='processing'} onClick={()=>void markSent()}
       className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">Mark manually sent</button>
   </div>
   <p className="text-xs mt-2">Voucher details are sensitive. Do not share drafts or paste them into public systems. Sent status is a staff declaration, not a delivery receipt.</p>
  </div>}
 </section>;
}
