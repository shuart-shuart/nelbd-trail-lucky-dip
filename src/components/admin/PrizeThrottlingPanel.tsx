import React, {useEffect,useState} from 'react';
import {getPrizeSiteLimits,savePrizeSiteLimit,getGrabVoucherSummary,type GrabVoucherSummary,type PrizeSiteLimit} from '../../api/postgresAdminClient';

export function PrizeThrottlingPanel() {
  const [rows,setRows]=useState<PrizeSiteLimit[]>([]);
  const [grab,setGrab]=useState<GrabVoucherSummary|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');
  const [loaded,setLoaded]=useState(false);
  const refresh=async()=>{
    try {const [limits,stock]=await Promise.all([getPrizeSiteLimits(),getGrabVoucherSummary()]);setRows(limits);setGrab(stock);setError('');}
    catch(e){setError(e instanceof Error?e.message:'Unable to load throttles');}
    finally{setLoaded(true);}
  };
  useEffect(()=>{void refresh();},[]);
  const update=(prizeId:string,site:string,patch:Partial<PrizeSiteLimit>)=>{
    setRows(prev=>prev.map(row=>row.prizeId===prizeId&&row.site===site?{...row,...patch}:row));
  };
  const save=async(row:PrizeSiteLimit)=>{
    const id=row.prizeId+':'+row.site;setBusy(id);setError('');
    try{await savePrizeSiteLimit(row.prizeId,row.site,row.dailyCap,row.paused);await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Could not save');}
    finally{setBusy('');}
  };
  return <section className="mb-6 rounded-2xl border border-[#DDD2E8] bg-white p-4 sm:p-6 text-[#33224B]">
    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
      <h2 className="text-xl font-bold">Prize throttling · PDD & PS</h2>
      <button type="button" onClick={()=>void refresh()} className="rounded-lg border px-3 py-2 text-sm font-semibold">Refresh</button>
    </div>
    <p className="text-sm mb-4">Set daily award limits per prize and hub. Blank means unlimited; 0 prevents awards. Pause stops awards at that hub. Caps reset at midnight Singapore time. Changes are saved only when you select Save.</p>
    {error&&<p role="alert" className="mb-3 text-red-700 text-sm">{error}</p>}
    {!loaded&&<p className="text-sm">Loading prize limits…</p>}
    {loaded&&rows.length===0&&<p className="text-sm">No limits available. Check that the database migration has completed.</p>}
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(row=><div key={row.prizeId+row.site} className="rounded-xl border border-[#DDD2E8] p-3">
        <div className="font-semibold text-sm mb-2">{row.prizeId} · {row.site}</div>
        <div className="text-xs mb-3">Stock: {row.remainingQuantity} remaining / {row.allocatedQuantity} allocated · Awarded today: {row.awardedToday}</div>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-sm flex-1 min-w-28">Daily cap
            <input type="number" min={0} max={1000000} placeholder="Unlimited"
              value={row.dailyCap??''} onChange={e=>update(row.prizeId,row.site,{dailyCap:e.target.value===''?null:Number(e.target.value)})}
              className="block w-full mt-1 rounded-lg border px-3 py-2 text-base" />
          </label>
          <label className="flex items-center gap-2 text-sm pb-2">
            <input type="checkbox" checked={row.paused} onChange={e=>update(row.prizeId,row.site,{paused:e.target.checked})}/> Paused
          </label>
          <button type="button" disabled={busy!==''} onClick={()=>void save(row)}
            className="rounded-lg bg-[#270342] text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {busy===row.prizeId+':'+row.site?'Saving…':'Save'}
          </button>
        </div>
      </div>)}
    </div>
    <div className="mt-4 rounded-xl bg-[#F6F0FB] p-4 text-sm"><strong>Grab S$5 voucher code inventory</strong><p className="mt-1">Securely imported: {grab?.total??'—'} · Available unassigned: {grab?.unassigned??'—'} · Eligible today: {grab?.currently_eligible??'—'} · Assigned: {grab?.assigned??'—'}</p><p className="mt-1 text-xs">The 11,720 supplied CSV records have not been imported. Import and email fulfilment require separate security configuration.</p></div>
    <p className="mt-4 text-xs text-[#675779]">Grab code imports and Gmail sending remain disabled. Daily caps only affect the draw when throttling is enabled on the server.</p>
  </section>;
}
