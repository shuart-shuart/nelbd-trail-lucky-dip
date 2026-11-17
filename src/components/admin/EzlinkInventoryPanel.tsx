import React,{useEffect,useState} from 'react';
type Site='PDD'|'PS';
type Balance={total:number;redeemed:number;remaining:number};
type Inventory={total:number;redeemed:number;remaining:number;unallocated:number;bySite:Record<Site,Balance>};
type Movement={id:number;kind:'ADJUST'|'TRANSFER';fromSite?:string;toSite?:string;delta:number;previousTotal?:number;newTotal?:number;actor:string;note:string;happenedAt:string};
async function call<T>(path:string,init?:RequestInit):Promise<T>{
 const r=await fetch('/api/admin/ezlink'+path,{...init,credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json',...init?.headers}});
 const data=await r.json().catch(()=>({error:'Unable to reach ez-link service'}));
 if(!r.ok)throw new Error(data.error||'Request failed');
 return data as T;
}
export function EzlinkInventoryPanel(){
 const [stock,setStock]=useState<Inventory|null>(null),[adjustments,setAdjustments]=useState<Movement[]>([]),
  [site,setSite]=useState<Site>('PDD'),[total,setTotal]=useState(''),[note,setNote]=useState(''),
  [from,setFrom]=useState<'PDD'|'PS'|'UNALLOCATED'>('UNALLOCATED'),[to,setTo]=useState<Site>('PDD'),
  [quantity,setQuantity]=useState(''),[transferNote,setTransferNote]=useState(''),
  [pin,setPin]=useState(''),[confirmPin,setConfirmPin]=useState(''),
  [pinConfigured,setPinConfigured]=useState(false),[busy,setBusy]=useState(false),
  [superAdmin,setSuperAdmin]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=async()=>{
  try{
   const [inventory,configured]=await Promise.all([call<Inventory>('/inventory'),call<{configured:boolean}>('/staff-pin/status')]);
   setStock(inventory);setTotal(String(inventory.bySite[site].total));setPinConfigured(configured.configured);
   const history=await call<Movement[]>('/inventory/adjustments').catch(()=>[]);
   setAdjustments(history);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load ez-link stock');}
 };
 useEffect(()=>{void refresh();fetch('/api/admin/me',{credentials:'same-origin'})
  .then(r=>r.json()).then(a=>setSuperAdmin(a.role==='super_admin')).catch(()=>{});},[]);
 const changeSite=(next:Site)=>{setSite(next);setTotal(String(stock?.bySite[next].total??0));setNote('');};
 const updateStock=async()=>{
  if(!stock||!/^\d+$/.test(total)||!note.trim()||Number(total)===stock.bySite[site].total)return;
  if(!window.confirm('Adjust physical ez-link stock at '+site+' to '+total+'? Note: '+note.trim()))return;
  setBusy(true);setError('');setNotice('');
  try{await call('/inventory/hub',{method:'PUT',body:JSON.stringify({
   site,total:Number(total),expectedTotal:stock.bySite[site].total,note:note.trim()})});
   setNotice('Hub stock adjustment recorded.');setNote('');await refresh();}
  catch(e){setError(e instanceof Error?e.message:'Unable to update stock');}
  finally{setBusy(false);}
 };
 const availableFrom=stock?(from==='UNALLOCATED'?stock.unallocated:stock.bySite[from].remaining):0;
 const transfer=async()=>{
  if(!stock||from===to||!/^\d+$/.test(quantity)||Number(quantity)<1||
   Number(quantity)>availableFrom||!transferNote.trim())return;
  if(!window.confirm('Transfer '+quantity+' cards from '+from+' to '+to+'? Note: '+transferNote.trim()))return;
  setBusy(true);setError('');setNotice('');
  try{await call('/inventory/transfer',{method:'POST',body:JSON.stringify({
    from,to,quantity:Number(quantity),expectedFrom:availableFrom,
    expectedTo:stock.bySite[to].total,note:transferNote.trim()})});
   setNotice('Hub transfer recorded.');setQuantity('');setTransferNote('');await refresh();}
  catch(e){setError(e instanceof Error?e.message:'Transfer failed');}
  finally{setBusy(false);}
 };
 const updatePin=async()=>{
  if(!/^\d{6,12}$/.test(pin)||pin!==confirmPin||new Set(pin).size<3)return;
  if(!window.confirm('Replace the staff-only ez-link redemption PIN? Notify booth staff securely.'))return;
  setBusy(true);setError('');setNotice('');
  try{await call('/staff-pin',{method:'PUT',body:JSON.stringify({pin})});
   setPin('');setConfirmPin('');setNotice('Staff PIN configured.');await refresh();}
  catch(e){setError(e instanceof Error?e.message:'Unable to configure staff PIN');}
  finally{setBusy(false);}
 };
 return <section className="rounded-2xl bg-white border border-[#DDD2E8] p-4 sm:p-6 text-[#270342] space-y-4 mb-5">
  <h2 className="text-xl font-bold">ez-link Card · Hub Inventory</h2>
  <p className="text-sm">Physical card stock is held separately at Innovation Hub (PDD) and Impact Hub (PS). Lucky Dip prizes and Quest vouchers are unchanged.</p>
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
   <div className="rounded-lg bg-[#F6F0FB] p-3"><p className="text-sm">All cards</p><strong className="text-xl">{stock?.total??'—'}</strong></div>
   <div className="rounded-lg bg-[#F6F0FB] p-3"><p className="text-sm">Redeemed</p><strong className="text-xl">{stock?.redeemed??'—'}</strong></div>
   <div className="rounded-lg bg-[#F6F0FB] p-3"><p className="text-sm">Remaining</p><strong className="text-xl">{stock?.remaining??'—'}</strong></div>
   <div className="rounded-lg bg-[#F6F0FB] p-3"><p className="text-sm">Unallocated</p><strong className="text-xl">{stock?.unallocated??'—'}</strong></div>
  </div>
  <div className="grid sm:grid-cols-2 gap-3">
   {(['PDD','PS'] as const).map(hub=><div key={hub} className="rounded-xl border-2 border-[#270342] p-3 space-y-1">
    <h3 className="font-bold">{hub==='PDD'?'Innovation Hub (PDD)':'Impact Hub (PS)'}</h3>
    <p>Physical allocation: <strong>{stock?.bySite[hub].total??'—'}</strong></p>
    <p>Redeemed: <strong>{stock?.bySite[hub].redeemed??'—'}</strong></p>
    <p>Available at hub: <strong>{stock?.bySite[hub].remaining??'—'}</strong></p>
   </div>)}
  </div>
  <p className="text-sm">Staff handover PIN: <strong>{pinConfigured?'Configured':'Not configured'}</strong></p>
  {superAdmin&&<>
   <div className="border-t pt-3 space-y-2">
    <h3 className="font-bold">Adjust physical stock at one hub</h3>
    <p className="text-xs">Use this for new deliveries and corrected physical counts. For moving existing cards, use Transfer below instead.</p>
    <label className="block text-sm font-semibold">Hub
     <select className="block w-full border rounded-lg p-3 mt-1" value={site} onChange={e=>changeSite(e.target.value as Site)}>
      <option value="PDD">PDD — Innovation Hub</option><option value="PS">PS — Impact Hub</option>
     </select></label>
    <label className="block text-sm font-semibold">New physical allocation
     <input type="number" min={stock?.bySite[site].redeemed??0} max={100000} value={total}
      onChange={e=>setTotal(e.target.value)} className="block w-44 border rounded-lg p-3 mt-1"/></label>
    <label className="block text-sm font-semibold">Reason (required)
     <textarea value={note} onChange={e=>setNote(e.target.value.slice(0,500))} maxLength={500} rows={2}
      className="block w-full border rounded-lg p-3 mt-1 font-normal" placeholder="New delivery or physical stock reconciliation"/></label>
    <button disabled={busy||!stock||!/^\d+$/.test(total)||Number(total)<stock.bySite[site].redeemed||Number(total)===stock.bySite[site].total||!note.trim()}
      onClick={()=>void updateStock()} className="bg-[#270342] text-white rounded-xl px-4 py-3 disabled:opacity-50">Save hub stock adjustment</button>
   </div>
   <div className="border-t pt-3 space-y-2">
    <h3 className="font-bold">Transfer existing cards</h3>
    <div className="grid sm:grid-cols-2 gap-2">
     <label className="text-sm font-semibold">From
      <select value={from} onChange={e=>setFrom(e.target.value as typeof from)} className="block w-full border rounded-lg p-3 mt-1">
       <option value="UNALLOCATED">Central unallocated</option><option value="PDD">PDD</option><option value="PS">PS</option>
      </select></label>
     <label className="text-sm font-semibold">To
      <select value={to} onChange={e=>setTo(e.target.value as Site)} className="block w-full border rounded-lg p-3 mt-1">
       <option value="PDD">PDD</option><option value="PS">PS</option>
      </select></label>
    </div>
    <p className="text-sm">Unissued cards available at source: <strong>{availableFrom}</strong></p>
    <label className="block text-sm font-semibold">Number of cards
     <input type="number" min={1} max={availableFrom} value={quantity} onChange={e=>setQuantity(e.target.value)}
      className="block w-44 border rounded-lg p-3 mt-1"/></label>
    <label className="block text-sm font-semibold">Transfer note (required)
     <textarea value={transferNote} onChange={e=>setTransferNote(e.target.value.slice(0,500))} maxLength={500}
      rows={2} className="block w-full border rounded-lg p-3 mt-1 font-normal"/></label>
    <button disabled={busy||!stock||from===to||!/^\d+$/.test(quantity)||Number(quantity)<1||Number(quantity)>availableFrom||!transferNote.trim()}
     onClick={()=>void transfer()} className="bg-[#270342] text-white rounded-xl px-4 py-3 disabled:opacity-50">Record card transfer</button>
   </div>
   <div className="border-t pt-3 space-y-2">
    <h3 className="font-bold">Recent stock movements</h3>
    <div className="overflow-x-auto"><table className="w-full text-sm text-left">
     <thead><tr className="border-b"><th className="p-2">Date</th><th className="p-2">Type / route</th><th className="p-2">Change</th><th className="p-2">Note</th><th className="p-2">Admin</th></tr></thead>
     <tbody>{adjustments.map(x=><tr key={x.id} className="border-b">
      <td className="p-2 whitespace-nowrap">{new Date(x.happenedAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})}</td>
      <td className="p-2">{x.kind}: {x.fromSite?x.fromSite+' → ':''}{x.toSite}</td>
      <td className="p-2">{x.delta>0?'+':''}{x.delta}</td>
      <td className="p-2 min-w-[160px] break-words">{x.note}</td>
      <td className="p-2 break-all">{x.actor}</td>
     </tr>)}</tbody>
    </table>{adjustments.length===0&&<p className="py-2 text-sm">No movements recorded.</p>}</div>
   </div>
   <div className="border-t pt-3 space-y-2">
    <h3 className="font-bold">Set staff-only ez-link PIN</h3>
    <p className="text-sm">Choose 6–12 unpredictable digits. Staff do not need admin accounts.</p>
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
