import React,{useEffect,useState} from 'react';
import {getPostgresPrizesWithInventory,getGrabVoucherSummary,getCurrentDrawProbabilities,type DrawProbabilitySnapshot} from '../../api/postgresAdminClient';

const denominations=[{id:'grab-voucher-5',amount:5,units:1},{id:'grab-voucher-10',amount:10,units:2},{id:'grab-voucher-50',amount:50,units:10}];
type Cfg={enabled:boolean;probability:'low'|'normal'|'high';pddRemaining:number;psRemaining:number};
type State=Record<string,Cfg>;
async function send(path:string,body:unknown){
 const r=await fetch('/api/admin'+path,{method:path.endsWith('/setup')?'POST':'PUT',
 credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({error:'Request failed'}));
 if(!r.ok)throw Error(data.error||'Request failed');
 return data;
}
export function GrabDenominationsPanel(){
 const [settings,setSettings]=useState<State>({});
 const [configured,setConfigured]=useState(false);
 const [codes,setCodes]=useState<number|null>(null);
 const [odds,setOdds]=useState<DrawProbabilitySnapshot|null>(null);
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const refresh=async()=>{
   const [prizes,stock,probabilities]=await Promise.all([getPostgresPrizesWithInventory(),getGrabVoucherSummary(),getCurrentDrawProbabilities()]);
   const next:State={};
   for(const d of denominations){
     const prize=prizes.find(p=>p.id===d.id);
     if(prize)next[d.id]={enabled:prize.isActive,probability:prize.probability||'normal',
       pddRemaining:prize.pddInventory.remainingQuantity,psRemaining:prize.psInventory.remainingQuantity};
   }
   const opening:Record<string,{pdd:number;ps:number}>={};
   for(const d of denominations){
     const prize=prizes.find(p=>p.id===d.id);
     if(prize)opening[d.id]={pdd:prize.pddInventory.allocatedQuantity,ps:prize.psInventory.allocatedQuantity};
   }
   setStarting(opening);setSettings(next);setConfigured(Object.keys(next).length===3);setCodes(stock.currently_eligible);setOdds(probabilities);
 };
 useEffect(()=>{
  void refresh().catch(e=>setError(String(e)));
  const timer=setInterval(()=>void getCurrentDrawProbabilities().then(setOdds).catch(()=>setOdds(null)),15000);
  return ()=>clearInterval(timer);
 },[]);
 const percentage=(id:string,site:'PDD'|'PS')=>{
   if(!odds?.available)return '—';
   const value=odds.sites.find(row=>row.site===site)?.prizes.find(row=>row.prizeId===id)?.probability??0;
   return Number.isFinite(value)?value.toPrecision(3)+'%':'—';
 };
 const totalPercentage=(id:string)=>{
   if(!odds?.available)return '—';
   const eligible=odds.sites.filter(s=>s.totalWeight>0);
   const totalWeight=eligible.reduce((n,s)=>n+s.totalWeight,0);
   if(!totalWeight)return '—';
   const probability=eligible.reduce((n,s)=>n+(s.prizes.find(p=>p.prizeId===id)?.probability??0)*s.totalWeight,0)/totalWeight;
   return probability===0?'0.00%':probability.toPrecision(3)+'%';
 };
 const [starting,setStarting]=useState<Record<string,{pdd:number;ps:number}>>({});
 const edit=(id:string,changes:Partial<Cfg>)=>setSettings(s=>({...s,[id]:{...s[id],...changes}}));
 const setup=async()=>{
  if(!window.confirm('Create $5, $10 and $50 Grab voucher prizes and retire the old single Grab Voucher from future draws? Existing claims remain valid.'))return;
  setBusy('setup');setError('');setNotice('');
  try{await send('/grab-denominations/setup',{confirmed:true});await refresh();setNotice('Denominations created disabled with zero stock. Configure them below.');}
  catch(e){setError(e instanceof Error?e.message:'Setup failed');}finally{setBusy('');}
 };
 const save=async(id:string)=>{
  const cfg=settings[id];if(!cfg)return;
  if(![cfg.pddRemaining,cfg.psRemaining].every(n=>Number.isSafeInteger(n)&&n>=0)){setError('Enter non-negative whole numbers');return;}
  setBusy(id);setError('');setNotice('');
  try{await send('/grab-denominations/'+id,cfg);await refresh();setNotice('Saved '+id+' settings.');}
  catch(e){setError(e instanceof Error?e.message:'Save failed');}finally{setBusy('');}
 };
 return <section className="mb-6 bg-white border border-[#DDD2E8] rounded-2xl p-4 sm:p-6 text-[#270342]">
  <div className="flex items-center justify-between gap-3 flex-wrap">
    <div>
      <h2 className="text-xl font-bold">Grab voucher denominations</h2>
      <p className="text-sm mt-1">S$5, S$10 and S$50 awards · Stock: Remaining / Starting · Next-draw probabilities at both hubs and combined.</p>
    </div>
    <button type="button" onClick={()=>void refresh().catch(e=>setError(String(e)))}
      className="rounded-lg border border-[#CDBDD9] px-3 py-2 text-sm font-semibold">Refresh</button>
  </div>
  <p className="text-sm font-semibold mt-3">Currently eligible, unassigned S$5 codes: {codes??'—'} (shared across all denominations).</p>
  <p className="text-xs text-[#645574] mt-1">Total probability pools each hub's saved draw weight; it is not the sum of the PDD and PS percentages. Probabilities refresh every 15 seconds and are shown to 3 significant figures.</p>
  {error&&<p role="alert" className="text-red-700 font-semibold text-sm mt-3">{error}</p>}
  {notice&&<p role="status" className="text-sm font-semibold mt-3">{notice}</p>}
  {!configured ? <button type="button" disabled={!!busy} onClick={()=>void setup()} className="rounded-xl bg-[#270342] text-white font-bold px-4 py-3 mt-4 disabled:opacity-50">Set up S$5 / S$10 / S$50 prizes</button> :
  <div className="overflow-x-auto rounded-xl border border-[#DDD2E8] mt-4">
    <table className="w-full text-left text-sm min-w-[690px]">
      <thead className="bg-[#F6F0FB] text-[#645574] text-xs uppercase">
        <tr>
          <th className="px-4 py-3">Award</th>
          <th className="px-3 py-3 text-center" title="Remaining / Starting">PDD</th>
          <th className="px-3 py-3 text-center" title="Remaining / Starting">PS</th>
          <th className="px-3 py-3 text-center" title="Remaining / Starting">Total</th>
          <th className="px-3 py-3 text-center">Win probability</th>
          <th className="px-3 py-3 text-center">Status &amp; settings</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#DDD2E8]">
        {denominations.map(d=>{
          const s=settings[d.id];
          if(!s)return null;
          const opening=starting[d.id];
          const pddStart=opening?.pdd;
          const psStart=opening?.ps;
          return <tr key={d.id} className="align-top">
            <td className="px-4 py-4 whitespace-nowrap">
              <strong className="text-base">S${d.amount}</strong>
              <div className="text-xs text-[#645574]">{d.units} × S$5 codes</div>
            </td>
            <td className="px-3 py-4 text-center tabular-nums whitespace-nowrap"><strong>{s.pddRemaining.toLocaleString()}</strong><span className="text-[#8A7C96]"> / </span>{pddStart==null?'—':pddStart.toLocaleString()}</td>
            <td className="px-3 py-4 text-center tabular-nums whitespace-nowrap"><strong>{s.psRemaining.toLocaleString()}</strong><span className="text-[#8A7C96]"> / </span>{psStart==null?'—':psStart.toLocaleString()}</td>
            <td className="px-3 py-4 text-center tabular-nums bg-[#F6F0FB] whitespace-nowrap"><strong>{(s.pddRemaining+s.psRemaining).toLocaleString()}</strong><span className="text-[#8A7C96]"> / </span>{pddStart==null||psStart==null?'—':(pddStart+psStart).toLocaleString()}</td>
            <td className="px-3 py-4 text-xs tabular-nums whitespace-nowrap">
              <div>PDD <strong>{percentage(d.id,'PDD')}</strong></div>
              <div>PS <strong>{percentage(d.id,'PS')}</strong></div>
              <div>Total <strong>{totalPercentage(d.id)}</strong></div>
            </td>
            <td className="px-3 py-4 text-center">
              <div className="text-xs font-semibold mb-2">{s.enabled?'Active':'Inactive'}</div>
              <details className="text-left border rounded-lg border-[#DDD2E8] p-2 min-w-[170px]">
                <summary className="text-xs cursor-pointer font-bold">Edit settings</summary>
                <div className="space-y-3 pt-3">
                  <label className="flex items-center gap-2 text-xs font-semibold">
                    <input type="checkbox" checked={s.enabled} onChange={e=>edit(d.id,{enabled:e.target.checked})}/> Enabled
                  </label>
                  <label className="block text-xs font-semibold">Relative odds
                    <select className="block mt-1 w-full border rounded-md p-2 text-sm" value={s.probability}
                      onChange={e=>edit(d.id,{probability:e.target.value as Cfg['probability']})}>
                      <option value="low">Low (½×)</option>
                      <option value="normal">Normal (1×)</option>
                      <option value="high">High (2×)</option>
                    </select>
                  </label>
                  {(['PDD','PS'] as const).map(site=><label className="block text-xs font-semibold" key={site}>
                    {site} awards remaining
                    <input type="number" min={0} max={100000} step={1} className="block mt-1 w-full border rounded-md p-2 text-sm"
                      value={site==='PDD'?s.pddRemaining:s.psRemaining}
                      onChange={e=>edit(d.id,site==='PDD'?{pddRemaining:Number(e.target.value)}:{psRemaining:Number(e.target.value)})}/>
                  </label>)}
                  <button type="button" disabled={!!busy} onClick={()=>void save(d.id)} className="rounded-lg bg-[#270342] text-white px-3 py-2 text-xs w-full disabled:opacity-50">{busy===d.id?'Saving…':'Save settings'}</button>
                </div>
              </details>
            </td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>}
  <p className="text-xs mt-3 text-[#645574]">All stock amounts are award quantities, not underlying S$5 code counts. Each award reserves 1, 2 or 10 codes. Saved settings determine the next-draw probability; unsaved edits do not.</p>
 </section>;
}
