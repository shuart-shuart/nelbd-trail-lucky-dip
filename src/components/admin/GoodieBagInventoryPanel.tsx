import React,{useEffect,useState} from 'react';
type Site='PDD'|'PS';
type Balance={total:number;redeemed:number;remaining:number};
type Inventory=Record<Site,Balance>;
type Audit={id:number;site:Site;previousTotal:number;newTotal:number;actor:string;note:string;happenedAt:string};
type Handover={id:string;site:Site;scenario:'17_fresh'|'17_returning';redeemedAt:string};
async function call<T>(path:string,init?:RequestInit):Promise<T>{
 const response=await fetch('/api/admin/goodie-bag'+path,{...init,credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json',...init?.headers}});
 const body=await response.json().catch(()=>({error:'Request failed'}));
 if(!response.ok)throw Error(body.error||'Request failed');
 return body as T;
}
export function GoodieBagInventoryPanel(){
 const [stock,setStock]=useState<Inventory|null>(null),[history,setHistory]=useState<Audit[]>([]);
 const [handovers,setHandovers]=useState<Handover[]>([]),[lastUpdated,setLastUpdated]=useState<Date|null>(null);
 const [site,setSite]=useState<Site>('PDD'),[total,setTotal]=useState(''),[note,setNote]=useState('');
 const [from,setFrom]=useState<Site>('PDD'),[to,setTo]=useState<Site>('PS'),[quantity,setQuantity]=useState(''),[transferNote,setTransferNote]=useState('');
 const [superAdmin,setSuperAdmin]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=async()=>{
  const [balances,audit,recent]=await Promise.all([
    call<Inventory>('/inventory'),
    call<Audit[]>('/adjustments').catch(()=>[]),
    call<Handover[]>('/history').catch(()=>[])
  ]);
  setStock(balances);setHistory(audit);setHandovers(recent);setLastUpdated(new Date());
  // Do not overwrite a stock adjustment the admin is typing during polling.
  setTotal(previous=>previous===''?String(balances[site].total):previous);
 };
 useEffect(()=>{
  let mounted=true;
  const poll=()=>void refresh().catch(e=>{if(mounted)setError(e instanceof Error?e.message:'Unable to refresh stock');});
  poll();
  const timer=window.setInterval(poll,15000);
  const onFocus=()=>poll();
  window.addEventListener('focus',onFocus);
  void fetch('/api/admin/me',{credentials:'same-origin'}).then(r=>r.json()).then(d=>{if(mounted)setSuperAdmin(d.role==='super_admin');}).catch(()=>{});
  return()=>{mounted=false;window.clearInterval(timer);window.removeEventListener('focus',onFocus);};
 },[]);
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
 return <section className="rounded-2xl bg-white border border-[#DDD2E8] p-4 sm:p-6 text-[#270342] space-y-4 mb-5">
  <h2 className="text-xl font-bold">NELBD Goodie Bag · Guaranteed 17-Stamp Reward</h2>
  <p className="text-sm">Each confirmed 17-stamp Goodie Bag handover deducts one from the selected hub, for both first-time and returning participants. Selecting a redemption path alone does not deduct stock.</p>
  <p className="text-xs text-[#756782]" role="status">Balances refresh every 15 seconds and when this page regains focus{lastUpdated?' · Last refreshed '+lastUpdated.toLocaleTimeString('en-SG',{timeZone:'Asia/Singapore'}):''}.</p>
  <div className="grid gap-3 sm:grid-cols-2">
   {(['PDD','PS'] as const).map(h=><div key={h} className="rounded-xl border border-[#DDD2E8] bg-[#F6F0FB] p-3">
    <h3 className="font-bold">{h==='PDD'?'Innovation Hub (PDD)':'Impact Hub (PS)'}</h3>
    <p className="text-2xl font-bold tabular-nums">{stock?.[h].remaining??'—'} <span className="text-sm font-normal">available</span></p>
    <p className="text-sm">Redeemed: <strong>{stock?.[h].redeemed??'—'}</strong> · Total: <strong>{stock?.[h].total??'—'}</strong></p>
   </div>)}
  </div>
  <details className="border-t pt-3">
    <summary className="cursor-pointer font-bold py-2">Recent confirmed Goodie Bag handovers ({handovers.length} shown)</summary>
    <p className="text-xs text-[#756782] mb-2">These are recorded handovers, not merely selections on the kiosk. Most recent 100 are shown.</p>
    <div className="max-h-60 overflow-auto"><table className="w-full text-sm text-left"><thead><tr><th className="p-2">Date &amp; time</th><th className="p-2">Hub</th><th className="p-2">Redemption path</th></tr></thead>
      <tbody>{handovers.map(h=><tr key={h.id} className="border-t"><td className="p-2">{new Date(h.redeemedAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})}</td><td className="p-2">{h.site}</td><td className="p-2">{h.scenario==='17_fresh'?'First redemption':'Returning participant'}</td></tr>)}</tbody>
    </table>{!handovers.length&&<p className="text-sm text-[#756782] p-2">No confirmed handovers are recorded yet.</p>}</div>
  </details>
  {superAdmin&&<>
   <details className="border-t pt-3 space-y-2">
    <summary className="cursor-pointer font-bold py-2">Adjust Goodie Bag stock</summary>
    <p className="text-xs text-[#756782] mb-2">Update verified physical quantities at one hub. Every change requires a reason and is audited.</p>
   <div className="border-t pt-3 space-y-2">
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
   </details>
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
