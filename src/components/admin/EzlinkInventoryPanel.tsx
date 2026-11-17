import React,{useEffect,useState} from 'react';
type Inventory={total:number;redeemed:number;remaining:number};
async function call<T>(path:string,init?:RequestInit):Promise<T>{
 const r=await fetch('/api/admin/ezlink'+path,{...init,credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json',...init?.headers}});
 const data=await r.json().catch(()=>({error:'Unable to reach ez-link service'}));
 if(!r.ok)throw new Error(data.error||'Request failed');
 return data as T;
}
export function EzlinkInventoryPanel(){
 const [stock,setStock]=useState<Inventory|null>(null),[total,setTotal]=useState(''),
  [pin,setPin]=useState(''),[confirmPin,setConfirmPin]=useState(''),
  [pinConfigured,setPinConfigured]=useState(false),[busy,setBusy]=useState(false),
  [superAdmin,setSuperAdmin]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=async()=>{
  try{
   const [inventory,configured]=await Promise.all([call<Inventory>('/inventory'),call<{configured:boolean}>('/staff-pin/status')]);
   setStock(inventory);setTotal(String(inventory.total));setPinConfigured(configured.configured);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load ez-link stock');}
 };
 useEffect(()=>{void refresh();fetch('/api/admin/me',{credentials:'same-origin'})
  .then(r=>r.json()).then(a=>setSuperAdmin(a.role==='super_admin')).catch(()=>{});},[]);
 const updateStock=async()=>{
  if(!/^\d+$/.test(total)||!window.confirm('Set total physical ez-link cards received to '+total+'?'))return;
  setBusy(true);setError('');setNotice('');
  try{await call('/inventory',{method:'PUT',body:JSON.stringify({total:Number(total)})});
   setNotice('ez-link inventory updated.');await refresh();}
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
  <p className="text-sm">Staff handover PIN: <strong>{pinConfigured?'Configured':'Not configured'}</strong></p>
  {superAdmin&&<>
   <div className="border-t pt-3 flex flex-wrap gap-2 items-end">
    <label className="text-sm font-semibold">Total cards received
     <input type="number" min={0} max={100000} value={total} onChange={e=>setTotal(e.target.value)}
      className="block w-40 border rounded-xl p-3 mt-1"/></label>
    <button disabled={busy||!stock||!/^\d+$/.test(total)} onClick={()=>void updateStock()} className="bg-[#270342] text-white rounded-xl px-4 py-3 disabled:opacity-50">Save ez-link Stock</button>
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