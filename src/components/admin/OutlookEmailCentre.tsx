import React,{useEffect,useState} from 'react';
type QueueRow={drawId:string;ticketNumber:string;site:string;recipientEmail:string|null;status:string;createdAt:string};
type Draft={to:string;subject:string;body:string;status:string;ticketNumber:string};
async function api<T>(path:string,init?:RequestInit):Promise<T>{
 const response=await fetch('/api/admin/outlook-centre'+path,{
  ...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...init?.headers},cache:'no-store'
 });
 const data=await response.json().catch(()=>({error:'Request failed'}));
 if(!response.ok)throw new Error(data.error||'Request failed');
 return data as T;
}
export function OutlookEmailCentre(){
 const [rows,setRows]=useState<QueueRow[]>([]);
 const [draft,setDraft]=useState<Draft|null>(null);
 const [selected,setSelected]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const refresh=async()=>{try{setRows(await api<QueueRow[]>(''));setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to load queue');}};
 useEffect(()=>{void refresh();},[]);
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
   <h2 className="text-xl font-bold">Outlook Email Centre · Grab vouchers</h2>
   <button type="button" onClick={()=>void refresh()} className="rounded-lg border px-3 py-2 text-sm">Refresh</button>
  </div>
  <p className="text-sm mb-4">Manual sending only. Review the recipient, copy the prepared message, send from your authorised Outlook account, then mark as sent. No emails are sent by this dashboard.</p>
  {error&&<p role="status" className="text-sm mb-3 text-[#7F003D]">{error}</p>}
  <div className="overflow-x-auto">
   <table className="w-full text-sm text-left"><thead><tr><th className="p-2">Ticket</th><th className="p-2">Hub</th><th className="p-2">Recipient</th><th className="p-2">Status</th><th className="p-2">Action</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.drawId} className="border-t">
    <td className="p-2">{row.ticketNumber}</td><td className="p-2">{row.site}</td>
    <td className="p-2">{row.recipientEmail||'Awaiting winner'}</td><td className="p-2">{row.status}</td>
    <td className="p-2"><button disabled={!row.recipientEmail||busy} onClick={()=>void openDraft(row.drawId)}
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
    <button disabled={busy||draft.status==='sent'} onClick={()=>void markSent()}
       className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">Mark manually sent</button>
   </div>
   <p className="text-xs mt-2">Voucher details are sensitive. Do not share drafts or paste them into public systems. Sent status is a staff declaration, not a delivery receipt.</p>
  </div>}
 </section>;
}
