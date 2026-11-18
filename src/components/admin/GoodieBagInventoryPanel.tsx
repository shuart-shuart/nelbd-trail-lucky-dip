import React,{useEffect,useState} from 'react';
type Site='PDD'|'PS';
type Balance={total:number;redeemed:number;remaining:number};
type Inventory=Record<Site,Balance>;
type Audit={id:number;site:Site;previousTotal:number;newTotal:number;actor:string;note:string;happenedAt:string};
async function call<T>(path:string,init?:RequestInit):Promise<T>{
 const response=await fetch('/api/admin/goodie-bag'+path,{...init,credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json',...init?.headers}});
 const body=await response.json().catch(()=>({error:'Request failed'}));
 if(!response.ok)throw Error(body.error||'Request failed');
 return body as T;
}
export function GoodieBagInventoryPanel(){
 const [stock,setStock]=useState<Inventory|null>(null),[history,setHistory]=useState<Audit[]>([]);
 const [pinConfigured,setPinConfigured]=useState(false);
 const [site,setSite]=useState<Site>('PDD'),[total,setTotal]=useState(''),[note,setNote]=useState('');
 const [from,setFrom]=useState<Site>('PDD'),[to,setTo]=useState<Site>('PS'),[quantity,setQuantity]=useState(''),[transferNote,setTransferNote]=useState('');
 const [pin,setPin]=useState(''),[pinConfirm,setPinConfirm]=useState('');
 const [superAdmin,setSuperAdmin]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=async()=>{
  const [balances,audit,pinStatus]=await Promise.all([call<Inventory>('/inventory'),call<Audit[]>('/adjustments').catch(()=>[]),fetch('/api/admin/ezlink/staff-pin/status',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()).catch(()=>({configured:false}))]);
  setStock(balances);setHistory(audit);setTotal(String(balances[site].total));setPinConfigured(Boolean(pinStatus.configured));
 };
 useEffect(()=>{void refresh().catch(e=>setError(String(e)));fetch('/api/admin/me',{credentials:'same-origin'}).then(r=>r.json()).then(d=>setSuperAdmin(d.role==='super_admin')).catch(()=>{});},[]);
 const save=async()=>{
  if(!stock||!note.trim()||!/^\d+$/.test(total)||Number(total)===stock[site].total||busy)return;
  if(!window.confirm('Set '+site+' Goodie Bag physical stock to '+total+'? Note: '+note))return;
  setBusy(true);setError('');setNotice('');
  try{await call('/inventory',{method:'PUT',body:JSON.stringify({site,total:Number(total),expectedTotal:stock[site].total,note:note.trim()})});
   setNote('');await refresh();setNotice('Goodie Bag stock adjustment recorded.');}
  catch(e){setError(e instanceof Error?e.message:'Adjustment failed')}finally{setBusy(false)}
 };
 const transfer=async()=>{
  if(!stock||!/^\d+$/.test(quantity)||Number(quantity)<1||from===to||Number(quantity)>stock[from].remaining||!transferNote.trim()||busy)return;
  if(!window.confirm('Transfer '+quantity+' Goodie Bags from '+from+' to '+to+'?'))return;
  setBusy(true);setError('');setNotice('');
  try{await call('/transfer',{method:'POST',body:JSON.stringify({from,to,quantity:Number(quantity),expectedFrom:stock[from].total,expectedTo:stock[to].total,note:transferNote.trim()})});
   setQuantity('');setTransferNote('');await refresh();setNotice('Goodie Bag transfer recorded.');}
  catch(e){setError(e instanceof Error?e.message:'Transfer failed')}finally{setBusy(false)}
 };
 const savePin=async()=>{
  if(!/^\d{6,12}$/.test(pin)||pin!==pinConfirm||new Set(pin).size<3||busy)return;
  if(!window.confirm('Change the staff handover PIN?'))return;
  setBusy(true);setError('');setNotice('');
  try{
   const r=await fetch('/api/admin/ezlink/staff-pin',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'PIN update failed');
   setPin('');setPinConfirm('');setNotice('Staff PIN updated.');
  }catch(e){setError(e instanceof Error?e.message:'PIN update failed')}finally{setBusy(false)}
 };
 return <section className="rounded-2xl bg-white border border-[#DDD2E8] p-4 sm:p-6 text-[#270342] space-y-4 mb-5">
  <h2 className="text-xl font-bold">NELBD Goodie Bag · Guaranteed 17-Stamp Reward</h2>
  <p className="text-sm">Manage the guaranteed 17-stamp Goodie Bag stock at each hub. Previous reward records are preserved separately.</p>
  <div className="grid gap-3 sm:grid-cols-2">
   {(['PDD','PS'] as const).map(h=><div key={h} className="rounded-xl border border-[#DDD2E8] bg-[#F6F0FB] p-3">
    <h3 className="font-bold">{h==='PDD'?'Innovation Hub (PDD)':'Impact Hub (PS)'}</h3>
    <p className="text-2xl font-bold tabular-nums">{stock?.[h].remaining??'—'} <span className="text-sm font-normal">available</span></p>
    <p className="text-sm">Redeemed: <strong>{stock?.[h].redeemed??'—'}</strong> · Total: <strong>{stock?.[h].total??'—'}</strong></p>
   </div>)}
  </div>
  {superAdmin&&<>
   <div className="border-t pt-3 space-y-2">
    <h3 className="font-bold">Adjust Goodie Bag stock</h3>
    <label className="block text-sm">Hub
     <select className="block w-full border rounded-lg p-2" value={site} onChange={e=>{const s=e.target.value as Site;setSite(s);setTotal(String(stock?.[s].total??0));setNote('')}}>
      <option value="PDD">PDD Innovation Hub</option><option value="PS">PS Impact Hub</option>
     </select></label>
    <label className="block text-sm">New total
     <input type="number" min={stock?.[site].redeemed??0} max={100000} className="block w-full border rounded-lg p-2" value={total} onChange={e=>setTotal(e.target.value)}/></label>
    <label className="block text-sm">Reason (required)
     <textarea className="block w-full border rounded-lg p-2" maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
    <button className="rounded-xl bg-[#270342] text-white px-4 py-3 disabled:opacity-40" disabled={busy||!stock||!note.trim()||!/^\d+$/.test(total)||Number(total)<stock[site].redeemed||Number(total)===stock[site].total} onClick={()=>void save()}>Save stock adjustment</button>
   </div>
   <div className="border-t pt-3 space-y-2">
    <h3 className="font-bold">Staff handover PIN</h3>
    <p className="text-xs">Status: {pinConfigured?'Configured':'Not configured'}. Enter a new PIN only when changing it.</p>
    <div className="grid sm:grid-cols-2 gap-2">
     <input aria-label="New staff PIN" type="password" inputMode="numeric" placeholder="New 6–12-digit PIN" value={pin} maxLength={12} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} className="border rounded-lg p-3"/>
     <input aria-label="Confirm staff PIN" type="password" inputMode="numeric" placeholder="Confirm PIN" value={pinConfirm} maxLength={12} onChange={e=>setPinConfirm(e.target.value.replace(/\D/g,''))} className="border rounded-lg p-3"/>
    </div>
    <button className="border rounded-xl px-4 py-2 disabled:opacity-40" disabled={busy||pin!==pinConfirm||pin.length<6||new Set(pin).size<3} onClick={()=>void savePin()}>Change staff PIN</button>
   </div>
   <details className="border-t pt-3 space-y-3 group">
    <summary className="cursor-pointer font-bold py-2">Advanced · Transfers & audit history</summary>
    <p className="text-xs text-[#756782]">Only use transfers when moving existing physical Goodie Bags between hubs. Every stock change is audited.</p>
   <div className="border-t pt-3 space-y-2">
    <h3 className="font-bold">Transfer stock between hubs</h3>
    <div className="grid sm:grid-cols-2 gap-2">
     <label className="text-sm">From<select value={from} onChange={e=>{const s=e.target.value as Site;setFrom(s);setTo(s==='PDD'?'PS':'PDD')}} className="block w-full border rounded-lg p-2"><option value="PDD">PDD</option><option value="PS">PS</option></select></label>
     <label className="text-sm">To<select value={to} disabled className="block w-full border rounded-lg p-2"><option value="PDD">PDD</option><option value="PS">PS</option></select></label>
    </div>
    <label className="block text-sm">Quantity<input type="number" min={1} max={stock?.[from].remaining??0} value={quantity} onChange={e=>setQuantity(e.target.value)} className="block w-full border rounded-lg p-2"/></label>
    <label className="block text-sm">Transfer note<textarea maxLength={450} value={transferNote} onChange={e=>setTransferNote(e.target.value)} className="block w-full border rounded-lg p-2"/></label>
    <button className="rounded-xl bg-[#270342] text-white px-4 py-3 disabled:opacity-40" disabled={busy||!stock||!transferNote.trim()||!/^\d+$/.test(quantity)||Number(quantity)<1||Number(quantity)>stock[from].remaining} onClick={()=>void transfer()}>Record transfer</button>
   </div>
   <div className="border-t pt-3 space-y-2">
    <h3 className="font-bold">Stock adjustment history</h3>
    <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th>Date</th><th>Hub</th><th>Total</th><th>Reason</th><th>Admin</th></tr></thead>
     <tbody>{history.map(x=><tr key={x.id} className="border-t"><td className="p-2 whitespace-nowrap">{new Date(x.happenedAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})}</td><td className="p-2">{x.site}</td><td className="p-2">{x.previousTotal} → {x.newTotal}</td><td className="p-2">{x.note}</td><td className="p-2">{x.actor}</td></tr>)}</tbody>
    </table></div>
   </div>
   </details>
  </>}
  {error&&<p role="alert" className="text-red-700 text-sm">{error}</p>}
  {notice&&<p role="status" className="text-sm bg-[#F6F0FB] p-3 rounded-lg">{notice}</p>}
 </section>;
}
