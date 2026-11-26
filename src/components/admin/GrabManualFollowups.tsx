import React,{useEffect,useState} from 'react';
type Followup={drawId:string;ticketNumber:string;drawHub:string;collectionLocation:string;phone:string;
 award:number;notificationState:string;submittedAt:string;contactedAt:string|null;status:string};
async function call<T>(path:string,init?:RequestInit):Promise<T>{
 const r=await fetch('/api/admin/grab-vouchers/staff'+path,{...init,credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json',...init?.headers}});
 const body=await r.json().catch(()=>({error:'Request failed'}));
 if(!r.ok)throw Error(body.error||'Request failed');
 return body as T;
}
export function GrabManualFollowups(){
 const [rows,setRows]=useState<Followup[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState('');
 const refresh=async()=>{try{setRows(await call('/manual-followups'));setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to load manual follow-ups');}};
 useEffect(()=>{void refresh();},[]);
 const complete=async(row:Followup)=>{
  if(busy||!window.confirm('Confirm you have personally completed the manual follow-up for '+row.ticketNumber+'? This does not send vouchers automatically.'))return;
  setBusy(row.drawId);setNotice('');
  try{await call('/manual-followups/'+encodeURIComponent(row.drawId)+'/contacted',{method:'POST',body:JSON.stringify({confirmed:true})});
   await refresh();setNotice('Manual follow-up recorded for '+row.ticketNumber);
  }catch(e){setError(e instanceof Error?e.message:'Update unavailable');}
  finally{setBusy('');}
 };
 return <section className="rounded-2xl border border-[#DDD2E8] bg-white p-4 sm:p-6 text-[#270342] mt-5">
  <div className="flex items-center justify-between gap-3">
   <h2 className="text-xl font-bold">Handphone submissions — manual follow-up</h2>
   <button onClick={()=>void refresh()} className="rounded-lg border px-3 py-2 text-sm">Refresh</button>
  </div>
  <p className="text-sm mt-2">Submissions collected at PDD, PS or FARM. Only you can complete manual follow-ups; no voucher codes are revealed here. Notification accepted means the notification flow accepted the request, not that the message reached your inbox.</p>
  {error&&<p role="alert" className="text-red-700 font-semibold my-2">{error}</p>}
  {notice&&<p role="status" className="text-green-700 font-semibold my-2">{notice}</p>}
  <div className="overflow-x-auto mt-3"><table className="w-full text-sm text-left">
   <thead><tr><th className="p-2">Ticket</th><th className="p-2">Award</th><th className="p-2">Draw / Collection</th><th className="p-2">Handphone</th><th className="p-2">Notification</th><th className="p-2">Action</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.drawId} className="border-t">
    <td className="p-2">{row.ticketNumber}</td><td className="p-2">S${row.award}</td>
    <td className="p-2">{row.drawHub} / {row.collectionLocation}</td>
    <td className="p-2 whitespace-nowrap">{row.phone}</td>
    <td className="p-2">{row.notificationState.replaceAll('_',' ')}</td>
    <td className="p-2">{row.contactedAt?<span>Contacted</span>:
     <button type="button" disabled={!!busy} onClick={()=>void complete(row)} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50">Mark contacted</button>}</td>
   </tr>)}</tbody>
  </table>{!rows.length&&<p className="p-3 text-sm">No handphone submissions recorded.</p>}</div>
 </section>;
}
