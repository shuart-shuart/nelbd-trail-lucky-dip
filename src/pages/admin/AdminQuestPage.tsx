import React,{useEffect,useState} from 'react';
import {AdminLayout} from '../../components/admin/AdminLayout';

type Slot={slotId:string;tier:string;amountCents:number;quantity:number;pairNumber:number;name:string|null;email:string|null;state:string;linkIssued:boolean;deliveryStatus:string|null;sentAt:string|null};
async function req<T>(path:string,options?:RequestInit):Promise<T>{
 const r=await fetch('/api/admin/quest'+path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...options?.headers},cache:'no-store'});
 const data=await r.json();if(!r.ok)throw new Error(data.error||'Request unsuccessful');return data as T;
}
export function AdminQuestPage(){
 const [slots,setSlots]=useState<Slot[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [issued,setIssued]=useState<{slot:string;link:string}|null>(null);
 const refresh=async()=>{try{setSlots(await req<Slot[]>('/slots'));setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to load Quest records');}};
 useEffect(()=>{void refresh();},[]);
 const generate=async(slot:Slot)=>{
  if(!window.confirm((slot.linkIssued?'Replace the existing claim link? Old link will stop working.':'Generate a claim link?')+' Copy the result securely.'))return;
  setBusy(slot.slotId);setIssued(null);
  try{const result=await req<{link:string}>('/slots/'+slot.slotId+'/claim-link',{method:'POST',body:JSON.stringify({confirmRotate:true})});
   setIssued({slot:slot.slotId,link:window.location.origin+result.link});await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Unable to create link');}finally{setBusy('');}
 };
 const approve=async(slot:Slot)=>{
  if(!window.confirm('Approve '+slot.name+' ('+slot.email+') for S$'+(slot.amountCents/100)+'? This does NOT send an email.'))return;
  setBusy(slot.slotId);
  try{await req('/slots/'+slot.slotId+'/approve',{method:'POST',body:JSON.stringify({confirmed:true})});await refresh();}
  catch(e){setError(e instanceof Error?e.message:'Approval failed');}finally{setBusy('');}
 };
 return <AdminLayout title="NELBD Quest · Grand Prizes" subtitle="20 winner links, review and controlled delivery · separate from S$5 Lucky Dip">
  <div className="bg-white text-[#270342] rounded-2xl p-4 sm:p-6">
   <div className="flex justify-between items-center gap-3"><div><h2 className="font-bold text-lg">Winner distribution</h2><p className="text-sm">2 first · 2 second · 2 third · 14 consolation (7 pairs). S$8,400 total.</p></div><button className="border rounded-lg px-3 py-2" onClick={()=>void refresh()}>Refresh</button></div>
   <p className="mt-3 text-xs text-[#665673]">Step 1: winner form submission and staff approval only. No real vouchers are imported or sent by this page. Links are private; copying a link should be treated like sharing a password.</p>
   {error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}
   {issued&&<div className="mt-4 p-3 rounded-xl border border-amber-500 bg-amber-50">
    <p className="font-bold">Copy this {issued.slot} link now — it will not be displayed again.</p>
    <input className="w-full bg-white mt-2 p-2 rounded-lg text-sm" readOnly value={issued.link} onFocus={e=>e.target.select()}/>
    <button className="border rounded-lg px-3 py-2 mt-2" onClick={()=>void navigator.clipboard.writeText(issued.link)}>Copy claim link</button>
    <button className="ml-2 underline" onClick={()=>setIssued(null)}>Hide</button>
   </div>}
   <div className="overflow-x-auto mt-4"><table className="w-full text-left text-sm">
    <thead><tr className="border-b"><th className="p-2">Slot</th><th className="p-2">Prize</th><th className="p-2">Winner</th><th className="p-2">State</th><th className="p-2">Action</th></tr></thead>
    <tbody>{slots.map(s=><tr key={s.slotId} className="border-b align-top">
     <td className="p-2 font-bold">{s.slotId}</td><td className="p-2">S${(s.amountCents/100).toLocaleString('en-SG')}<span className="block text-xs text-[#766881]">{s.quantity} voucher{s.quantity>1?'s':''}</span></td>
     <td className="p-2">{s.name||'Awaiting winner'}<span className="block text-xs">{s.email||''}</span></td>
     <td className="p-2 capitalize">{s.state}<span className="block text-xs">{s.deliveryStatus||''}</span></td>
     <td className="p-2"><div className="flex flex-wrap gap-2">
      {s.state==='unclaimed'&&<button disabled={!!busy} onClick={()=>void generate(s)} className="rounded-lg border px-3 py-2 disabled:opacity-50">{s.linkIssued?'Rotate link':'Create claim link'}</button>}
      {s.state==='submitted'&&<button disabled={!!busy} onClick={()=>void approve(s)} className="rounded-lg bg-[#270342] text-white px-3 py-2 disabled:opacity-50">Approve claim</button>}
     </div></td>
    </tr>)}</tbody></table></div>
  </div>
 </AdminLayout>;
}