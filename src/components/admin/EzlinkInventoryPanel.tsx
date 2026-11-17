import React,{useEffect,useState} from 'react';
type Inventory={total:number;redeemed:number;remaining:number;bySite:{PDD:number;PS:number}};
type StockAdjustment={id:number;previousTotal:number;newTotal:number;delta:number;actor:string;note:string;happenedAt:string};
async function call<T>(path:string,init?:RequestInit):Promise<T>{
 const r=await fetch('/api/admin/ezlink'+path,{...init,credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json',...init?.headers}});
 const data=await r.json().catch(()=>({error:'Unable to reach ez-link service'}));
 if(!r.ok)throw new Error(data.error||'Request failed');
 return data as T;
}
export function EzlinkInventoryPanel(){
 const [stock,setStock]=useState<Inventory|null>(null),[total,setTotal]=useState(''),[note,setNote]=useState(''),
  [adjustments,setAdjustments]=useState<StockAdjustment[]>([]),
  [pin,setPin]=useState(''),[confirmPin,setConfirmPin]=useState(''),
  [pinConfigured,setPinConfigured]=useState(false),[busy,setBusy]=useState(false),
  [superAdmin,setSuperAdmin]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=async()=>{
  try{
   const [inventory,configured]=await Promise.all([call<Inventory>('/inventory'),call<{configured:boolean}>('/staff-pin/status')]);
   setStock(inventory);setTotal(String(inventory.total));setPinConfigured(configured.configured);
   const history=await call<StockAdjustment[]>('/inventory/adjustments').catch(()=>[]);
   setAdjustments(history);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load ez-link stock');}
 };
 useEffect(()=>{void refresh();fetch('/api/admin/me',{credentials:'same-origin'})
  .then(r=>r.json()).then(a=>setSuperAdmin(a.role==='super_admin')).catch(()=>{});},[]);
 const updateStock=async()=>{
  if(!/^\d+$/.test(total)||!note.trim()||!stock||Number(total)===stock.total||
    !window.confirm('Change shared ez-link stock total from '+stock.total+' to '+total+'? Note: '+note.trim()))return;
  setBusy(true);setError('');setNotice('');
  try{await call('/inventory',{method:'PUT',body:JSON.stringify({total:Number(total),note:note.trim()})});
   setNotice('Shared ez-link stock updated and adjustment note saved.');setNote('');await refresh();}
  catch(e){setError(e instanceof Error?e.message:'Unable to update stock');}
  finally{setBusy(false);}
 };
 const updatePin=async()=>{
  if(!/^\d{6,12}$/.test(pin)||pin!==confirmPin||new Set(pin).size<3)return;
  if(!window.confirm('Replace the staff-only ez-link redemption PIN? Notify booth staff securely.'))return;
  setBusy(true);setError('');setNotice('');
  try{await call('/staff-pin',{method:'PUT',body:JSON.stringify({pin})});
   setPin('');setConfirmPin('');setNotice('Staff PIN configured. Staff can now confirm ez-link handovers on the kiosk.');await refresh();}
  catch(e){setError(e instanceof Error?e.message:'Unable to configure staff PIN');}
  finally{setBusy(false);}
 };
 return <section className="rounded-2xl bg-white border border-[#DDD2E8] p-4 sm:p-6 text-[#270342] space-y-3 mb-5">
  <h2 className="text-xl font-bold">ez-link Card · 17-Stamp Reward Inventory</h2>
  <p className="text-sm">Guaranteed milestone reward, separate from the random Lucky Dip prize pool. Stock is shared across both hubs.</p>
  <div className="grid grid-cols-3 gap-2">
   <div className="rounded-lg bg-[#F6F0FB] p-3"><p className="text-sm">Total</p><strong className="text-xl">{stock?.total??'—'}</strong></div>
   <div className="rounded-lg bg-[#F6F0FB] p-3"><p className="text-sm">Redeemed</p><strong className="text-xl">{stock?.redeemed??'—'}</strong></div>
   <div className="rounded-lg bg-[#F6F0FB] p-3"><p className="text-sm">Remaining</p><strong className="text-xl">{stock?.remaining??'—'}</strong></div>
  </div>
  <div className="rounded-xl border p-3 text-sm space-y-1">
   <p className="font-bold">Claims by hub · one shared stock pool</p>
   <div className="flex flex-wrap justify-between gap-2"><span>Innovation Hub (PDD)</span><strong>{stock?.bySite?.PDD??'—'} redeemed</strong></div>
   <div className="flex flex-wrap justify-between gap-2"><span>Impact Hub (PS)</span><strong>{stock?.bySite?.PS??'—'} redeemed</strong></div>
   <p className="text-xs">Cards issued at either hub reduce the same remaining stock above. No separate hub allocations.</p>
  </div>
  <p className="text-sm">Staff handover PIN: <strong>{pinConfigured?'Configured':'Not configured'}</strong></p>
  {superAdmin&&<>
   <div className="border-t pt-3 space-y-2">
    <h3 className="font-bold">Adjust shared ez-link stock</h3>
    <label className="block text-sm font-semibold">Revised total cards (both hubs combined)
     <input type="number" min={stock?.redeemed??0} max={100000} value={total} onChange={e=>setTotal(e.target.value)}
      className="block w-44 border rounded-xl p-3 mt-1"/></label>
    <p className="text-sm">Change: <strong>{stock&&/^\d+$/.test(total)?(Number(total)-stock.total>0?'+':'')+(Number(total)-stock.total):'—'}</strong> cards · Previously issued: {stock?.redeemed??'—'}</p>
    <label className="block text-sm font-semibold">Adjustment note (required)
     <textarea value={note} onChange={e=>setNote(e.target.value.slice(0,500))} maxLength={500} rows={2}
      placeholder="e.g. Received 50 additional cards from supplier; corrected physical count after reconciliation"
      className="block w-full border rounded-xl p-3 mt-1 font-normal"/></label>
    <button disabled={busy||!stock||!/^\d+$/.test(total)||Number(total)<stock.redeemed||Number(total)===stock.total||!note.trim()}
      onClick={()=>void updateStock()} className="bg-[#270342] text-white rounded-xl px-4 py-3 disabled:opacity-50">Save stock adjustment + note</button>
   </div>
   <div className="border-t pt-3 space-y-2">
    <h3 className="font-bold">Recent stock adjustments</h3>
    <div className="overflow-x-auto"><table className="w-full text-sm text-left">
     <thead><tr className="border-b"><th className="p-2">Date</th><th className="p-2">Change</th><th className="p-2">Total</th><th className="p-2">Note</th><th className="p-2">Edited by</th></tr></thead>
     <tbody>{adjustments.map(x=><tr key={x.id} className="border-b">
      <td className="p-2 whitespace-nowrap">{new Date(x.happenedAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})}</td>
      <td className="p-2 whitespace-nowrap">{x.delta>0?'+':''}{x.delta}</td>
      <td className="p-2 whitespace-nowrap">{x.previousTotal} → {x.newTotal}</td>
      <td className="p-2 min-w-[200px] break-words">{x.note}</td>
      <td className="p-2 break-all">{x.actor}</td>
     </tr>)}</tbody>
    </table>{adjustments.length===0&&<p className="text-sm py-2">No previous stock adjustments recorded.</p>}</div>
   </div>
   <div className="border-t pt-3 space-y-2">
    <h3 className="font-bold">Set staff-only ez-link PIN</h3>
    <p className="text-sm">Choose 6–12 unpredictable digits and communicate them to booth staff privately. Staff do not need admin accounts. Do not display this PIN on public-facing signage.</p>
    <div className="flex flex-wrap gap-2">
     <label className="text-sm">New PIN<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={12} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,12))} className="block border rounded-lg p-2 mt-1"/></label>
     <label className="text-sm">Confirm PIN<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={12} value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,12))} className="block border rounded-lg p-2 mt-1"/></label>
    </div>
    <button disabled={busy||pin!==confirmPin||pin.length<6||new Set(pin).size<3} onClick={()=>void updatePin()} className="border rounded-xl px-4 py-2 disabled:opacity-50">Set or Change Staff PIN</button>
   </div>
  </>}
  {notice&&<p role="status" className="text-sm bg-[#F6F0FB] p-3 rounded-lg">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}