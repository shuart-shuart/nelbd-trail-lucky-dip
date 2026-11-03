import React,{useEffect,useState} from 'react';
import {getPrizeSiteLimits,savePrizeSiteLimit,type PrizeSiteLimit} from '../../api/postgresAdminClient';

/** Prize-specific controls embedded in the existing Inventory > Edit Prize dialog. */
export function InventoryPrizeLimits({prizeId}:{prizeId:string}){
 const [rows,setRows]=useState<PrizeSiteLimit[]>([]);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState('');
 const [loading,setLoading]=useState(true);
 const load=async()=>{
  try{const all=await getPrizeSiteLimits();setRows(all.filter(x=>x.prizeId===prizeId));setError('');}
  catch(e){setError(e instanceof Error?e.message:'Unable to load prize limits');}
  finally{setLoading(false);}
 };
 useEffect(()=>{void load();},[prizeId]);
 const update=(site:string,patch:Partial<PrizeSiteLimit>)=>
  setRows(old=>old.map(x=>x.site===site?{...x,...patch}:x));
 const save=async(row:PrizeSiteLimit)=>{
  setBusy(row.site);setError('');
  try{await savePrizeSiteLimit(prizeId,row.site,row.dailyCap,row.paused);await load();}
  catch(e){setError(e instanceof Error?e.message:'Unable to save throttle');}
  finally{setBusy('');}
 };
 return <section className="rounded-xl border border-[#DDD2E8] bg-[#F6F0FB] p-3" onClick={e=>e.stopPropagation()}>
  <h4 className="text-sm font-bold text-[#33224B]">Hub allocation & daily throttle</h4>
  <p className="text-xs text-[#675779] mb-3">Manage PDD and PS limits alongside prize stock. Blank cap = unlimited; zero = no awards. Resets at Singapore midnight. Save each hub separately.</p>
  {loading&&<p className="text-xs">Loading hub limits…</p>}
  {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
  <div className="space-y-3">
   {rows.map(row=><div key={row.site} className="rounded-lg border bg-white p-3">
    <div className="flex justify-between text-sm font-semibold"><span>{row.site}</span><span>{row.remainingQuantity} / {row.allocatedQuantity} left</span></div>
    <p className="text-xs text-[#675779] mb-2">Awarded today: {row.awardedToday}</p>
    <div className="flex flex-wrap gap-2 items-end">
     <label className="text-xs flex-1 min-w-24">Daily cap
      <input type="number" min={0} max={1000000} placeholder="Unlimited"
       value={row.dailyCap??''} onChange={e=>update(row.site,{dailyCap:e.target.value===''?null:Number(e.target.value)})}
       className="block w-full rounded-lg border px-3 py-2 mt-1 text-base"/>
     </label>
     <label className="flex gap-2 items-center text-xs pb-2">
      <input type="checkbox" checked={row.paused} onChange={e=>update(row.site,{paused:e.target.checked})}/>Paused
     </label>
     <button type="button" disabled={busy!==''} onClick={()=>void save(row)}
      className="rounded-lg bg-[#270342] text-white px-3 py-2 text-xs disabled:opacity-50">
      {busy===row.site?'Saving…':'Save limit'}
     </button>
    </div>
   </div>)}
  </div>
 </section>;
}
