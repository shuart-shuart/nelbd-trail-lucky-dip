import React,{useEffect,useState} from 'react';
type Slot={slotId:string;tier:string;amountCents:number;quantity:number;name:string|null;email:string|null;state:string;deliveryStatus:string|null;sentAt:string|null};
type Draft={slotId:string;to:string;link:string;subject:string;body:string;notice:string;expiresAt:string};
async function api<T>(path:string,init?:RequestInit):Promise<T>{
 const r=await fetch('/api/admin/quest'+path,{...init,credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json',...init?.headers}});
 const data=await r.json().catch(()=>({error:'Request unsuccessful'}));
 if(!r.ok)throw new Error(data.error||'Request unsuccessful');
 return data as T;
}
export function QuestOutlookControls({slots,onRefresh}:{slots:Slot[];onRefresh:()=>Promise<void>}){
 const [selected,setSelected]=useState('F1'),[name,setName]=useState(''),[email,setEmail]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[draft,setDraft]=useState<Draft|null>(null);
 const slot=slots.find(s=>s.slotId===selected);
 useEffect(()=>{setName(slot?.name||'');setEmail(slot?.email||'');setDraft(null);setNotice('');},[selected,slot?.name,slot?.email]);
 const save=async()=>{
  if(!slot||!window.confirm('Save confirmed winner '+name+' ('+email+') to '+slot.slotId+'? This will require approval.'))return;
  setBusy(true);setNotice('');
  try{await api('/slots/'+slot.slotId+'/winner',{method:'PUT',body:JSON.stringify({name,email})});
   setNotice('Winner details saved. Review and approve this winner in the main table above.');await onRefresh();}
  catch(e){setNotice(e instanceof Error?e.message:'Unable to save winner');}
  finally{setBusy(false);}
 };
 const prepare=async()=>{
  if(!slot||!window.confirm('Allocate '+slot.quantity+' REAL Grab voucher(s) to '+slot.name+' ('+slot.email+')? A private viewing link will be shown ONCE. No email will be sent.'))return;
  setBusy(true);setNotice('');setDraft(null);
  try{const result=await api<Draft>('/slots/'+slot.slotId+'/prepare-outlook',{method:'POST',body:JSON.stringify({confirmed:true})});
   setDraft(result);setNotice('Voucher link prepared and reserved. Copy the message to Outlook before closing this page.');await onRefresh();}
  catch(e){setNotice(e instanceof Error?e.message:'Unable to prepare');}
  finally{setBusy(false);}
 };
 const copyDraft=async()=>{
  if(!draft)return;
  try{await navigator.clipboard.writeText('To: '+draft.to+'\nSubject: '+draft.subject+'\n\n'+draft.body);
   setNotice('Copied to clipboard. Paste into Outlook and confirm the recipient before sending.');}
  catch{setNotice('Clipboard unavailable; select and copy the message manually.');}
 };
 const markSent=async()=>{
  if(!slot||!window.confirm('Have you PERSONALLY sent the email in Outlook to '+slot.email+'? This only records your confirmation.'))return;
  setBusy(true);setNotice('');
  try{await api('/slots/'+slot.slotId+'/mark-outlook-sent',{method:'POST',body:JSON.stringify({confirmed:true})});
   setDraft(null);setNotice('Recorded as manually sent. This does not verify inbox delivery.');await onRefresh();}
  catch(e){setNotice(e instanceof Error?e.message:'Unable to mark sent');}
  finally{setBusy(false);}
 };
 const revoke=async()=>{
  if(!slot||!window.confirm('Revoke the private voucher access link for '+slot.slotId+'? Already revealed Grab codes cannot be invalidated.'))return;
  setBusy(true);setNotice('');
  try{await api('/slots/'+slot.slotId+'/revoke',{method:'POST',body:JSON.stringify({confirmed:true})});
   setDraft(null);setNotice('Viewer access revoked. Previously viewed codes may remain usable.');await onRefresh();}
  catch(e){setNotice(e instanceof Error?e.message:'Unable to revoke access');}
  finally{setBusy(false);}
 };
 return <section className="mt-5 rounded-2xl bg-white border border-[#DDD2E8] p-4 sm:p-6 text-[#270342] space-y-4">
  <div><h2 className="text-xl font-bold">Prepare for Outlook · Manual delivery</h2>
   <p className="text-sm mt-1">Enter your verified winners, approve in the main table, and prepare each individual secure link. Preparing reserves real vouchers, but does not send any email.</p></div>
  <label className="block text-sm font-semibold">Choose prize slot
   <select className="w-full mt-1 border border-[#DDD2E8] rounded-xl p-3 bg-white" value={selected} onChange={e=>setSelected(e.target.value)}>
    {slots.map(s=><option key={s.slotId} value={s.slotId}>{s.slotId} · {s.tier} · S${(s.amountCents/100).toLocaleString('en-SG')} · {s.name||'Unassigned'} · {s.state}</option>)}
   </select></label>
  {slot&&<div className="rounded-xl border border-[#DDD2E8] p-3 space-y-3">
   <div className="text-sm">Prize: <strong>S${(slot.amountCents/100).toLocaleString('en-SG')}</strong> · {slot.quantity} Grab vouchers · Status: <strong>{slot.deliveryStatus||slot.state}</strong></div>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <label className="text-sm font-semibold">Confirmed winner name<input className="block w-full mt-1 border rounded-lg p-3" type="text" maxLength={100} value={name} onChange={e=>setName(e.target.value)} disabled={busy||!['unclaimed','submitted','approved'].includes(slot.state)||!!slot.deliveryStatus}/></label>
    <label className="text-sm font-semibold">Confirmed winner email<input className="block w-full mt-1 border rounded-lg p-3" type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy||!['unclaimed','submitted','approved'].includes(slot.state)||!!slot.deliveryStatus}/></label>
   </div>
   <div className="flex flex-wrap gap-2">
    {['unclaimed','submitted','approved'].includes(slot.state)&&!slot.deliveryStatus&&<button type="button" disabled={busy||!name||!email} onClick={()=>void save()} className="rounded-lg border px-4 py-2 disabled:opacity-40">Save winner details</button>}
    {slot.state==='submitted'&&<span className="text-sm text-[#744B85] p-2">Approve this winner using the table above before preparing.</span>}
    {slot.state==='approved'&&(!slot.deliveryStatus||slot.deliveryStatus==='MANUAL_READY')&&<button type="button" disabled={busy} onClick={()=>void prepare()} className="rounded-lg bg-[#270342] text-white px-4 py-2 font-bold disabled:opacity-40">
     {slot.deliveryStatus==='MANUAL_READY'?'Rotate private link & prepare again':'Prepare for Outlook (allocate vouchers)'}
    </button>}
    {slot.deliveryStatus==='MANUAL_READY'&&<button type="button" disabled={busy} onClick={()=>void markSent()} className="rounded-lg border px-4 py-2 disabled:opacity-40">Mark manually sent</button>}
    {['MANUAL_READY','MANUAL_CONFIRMED_SENT'].includes(slot.deliveryStatus||'')&&<button type="button" disabled={busy} onClick={()=>void revoke()} className="rounded-lg border border-rose-500 text-rose-700 px-4 py-2 disabled:opacity-40">Revoke voucher access</button>}
   </div>
  </div>}
  {draft&&draft.slotId===selected&&<div className="rounded-xl border-2 border-[#7B4A98] p-4 space-y-3">
   <p className="font-bold">Outlook-ready message · private link visible only now</p>
   <p className="text-xs text-rose-800">Save this draft before switching slots or refreshing. Link regeneration invalidates the old link. Do not share with unintended recipients.</p>
   <label className="block text-xs font-semibold">To<input className="block w-full mt-1 border rounded-lg p-2 text-sm" readOnly value={draft.to}/></label>
   <label className="block text-xs font-semibold">Subject<input className="block w-full mt-1 border rounded-lg p-2 text-sm" readOnly value={draft.subject}/></label>
   <label className="block text-xs font-semibold">Email body<textarea className="block w-full mt-1 border rounded-lg p-3 text-sm" rows={15} readOnly value={draft.body}/></label>
   <button type="button" onClick={()=>void copyDraft()} className="bg-[#270342] text-white rounded-lg px-4 py-3 font-bold">Copy full Outlook draft</button>
   <p className="text-xs">No email has been sent. Check recipient address in Outlook and send manually.</p>
  </div>}
  {notice&&<p role="status" className="rounded-lg bg-[#F6F0FB] p-3 text-sm">{notice}</p>}
 </section>;
}