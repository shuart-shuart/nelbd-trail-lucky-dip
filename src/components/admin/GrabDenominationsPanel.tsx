import React,{useEffect,useState} from 'react';
import {getPostgresPrizesWithInventory,getGrabVoucherSummary} from '../../api/postgresAdminClient';

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
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const refresh=async()=>{
   const [prizes,stock]=await Promise.all([getPostgresPrizesWithInventory(),getGrabVoucherSummary()]);
   const next:State={};
   for(const d of denominations){
     const prize=prizes.find(p=>p.id===d.id);
     if(prize)next[d.id]={enabled:prize.isActive,probability:prize.probability||'normal',
       pddRemaining:prize.pddInventory.remainingQuantity,psRemaining:prize.psInventory.remainingQuantity};
   }
   setSettings(next);setConfigured(Object.keys(next).length===3);setCodes(stock.currently_eligible);
 };
 useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[]);
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
  <h2 className="text-xl font-bold">Grab voucher denominations</h2>
  <p className="text-sm mt-1">Independently toggle $5 / $10 / $50 prizes, set PDD and PS award quantities and choose relative odds. Each winner receives 1, 2 or 10 separate $5 Grab codes.</p>
  <p className="text-sm font-semibold mt-2">Currently valid, unassigned $5 codes: {codes??'—'} (shared across all prizes).</p>
  <p className="text-xs mt-1">Low = half, normal = standard, high = twice the base draw weight. Actual chances also depend on the remaining stock of all other prizes.</p>
  {error&&<p role="alert" className="text-red-700 font-bold text-sm mt-2">{error}</p>}
  {notice&&<p role="status" className="text-sm font-bold mt-2">{notice}</p>}
  {!configured?<button type="button" disabled={!!busy} onClick={()=>void setup()}
     className="rounded-xl bg-[#270342] text-white font-bold px-4 py-3 mt-3 disabled:opacity-50">
     {busy?'Setting up…':'Set up $5 / $10 / $50 prizes'}</button>:
  <div className="grid gap-4 lg:grid-cols-3 mt-4">
   {denominations.map(d=>{
    const s=settings[d.id];if(!s)return null;
    return <div key={d.id} className="border rounded-xl border-[#CDBDD9] p-4 space-y-3">
     <h3 className="text-lg font-bold">{'$'}{d.amount} Grab Voucher</h3>
     <p className="text-xs">{d.units} × $5 codes per winner</p>
     <label className="flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={s.enabled} onChange={e=>edit(d.id,{enabled:e.target.checked})}/> Enabled
     </label>
     <label className="block text-sm font-semibold">Relative odds
      <select className="block mt-1 w-full p-2 rounded-lg" value={s.probability}
       onChange={e=>edit(d.id,{probability:e.target.value as Cfg['probability']})}>
       <option value="low">Low (½×)</option><option value="normal">Normal (1×)</option><option value="high">High (2×)</option>
      </select>
     </label>
     {(['PDD','PS'] as const).map(site=><label className="block text-sm font-semibold" key={site}>
      {site} — awards remaining
      <input type="number" min={0} max={100000} step={1} className="block mt-1 w-full p-2 rounded-lg"
       value={site==='PDD'?s.pddRemaining:s.psRemaining}
       onChange={e=>edit(d.id,site==='PDD'?{pddRemaining:Number(e.target.value)}:{psRemaining:Number(e.target.value)})}/>
     </label>)}
     <button type="button" disabled={!!busy} onClick={()=>void save(d.id)}
      className="w-full bg-[#270342] text-white font-bold rounded-lg p-2 disabled:opacity-50">
      {busy===d.id?'Saving…':'Save settings'}
     </button>
    </div>;
   })}
  </div>}
 </section>;
}
