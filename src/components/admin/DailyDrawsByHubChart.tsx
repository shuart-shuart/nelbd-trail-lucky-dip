import React,{useEffect,useMemo,useState} from 'react';
import {getPostgresDailyDraws,type DailyDrawCount} from '../../api/postgresAdminClient';

type Period='7'|'14'|'30'|'all';
const periods:Period[]=['7','14','30','all'];
const label=(d:string)=>d.slice(8,10)+'/'+d.slice(5,7);
export function DailyDrawsByHubChart(){
 const [period,setPeriod]=useState<Period>('30');
 const [rows,setRows]=useState<DailyDrawCount[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  const load=async()=>{
   try{
    const data=await getPostgresDailyDraws(period);
    if(active){setRows(data);setError('');}
   }catch(e){
    if(active)setError(e instanceof Error?e.message:'Unable to load daily draw counts');
   }finally{if(active)setLoading(false);}
  };
  setLoading(true);
  void load();
  const timer=setInterval(()=>void load(),60000);
  return()=>{active=false;clearInterval(timer);};
 },[period]);
 const max=useMemo(()=>Math.max(1,...rows.map(r=>Math.max(r.pdd,r.ps))),[rows]);
 const pdd=rows.reduce((sum,r)=>sum+r.pdd,0),ps=rows.reduce((sum,r)=>sum+r.ps,0);
 return <section className="bg-white border border-[#E8DEF1] rounded-2xl sm:rounded-3xl p-4 sm:p-5 mb-6 shadow-sm text-[#270342]" aria-label="Daily Lucky Dip draws by hub">
  <div className="flex flex-col sm:flex-row sm:justify-between gap-3 sm:items-start">
   <div>
    <h2 className="font-nel text-lg sm:text-xl font-semibold">Daily Draws by Hub</h2>
    <p className="text-xs text-[#756782] mt-1">Lucky Dip draws by Singapore calendar day (SGT). Marked test/error records excluded.</p>
   </div>
   <div role="group" aria-label="Chart date range" className="flex gap-1 rounded-xl bg-[#F1EAF9] p-1 self-start">
    {periods.map(p=><button key={p} type="button" aria-pressed={period===p} onClick={()=>setPeriod(p)}
     className={'rounded-lg px-3 py-2 min-h-[36px] text-xs font-semibold '+(period===p?'bg-[#270342] text-white':'text-[#270342] hover:bg-white')}>
     {p==='all'?'All':p+'d'}
    </button>)}
   </div>
  </div>
  <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4" aria-label="Draw totals for selected period">
   <div className="rounded-xl border border-[#E8DEF1] bg-[#F8F4FC] p-2.5 sm:p-3">
    <p className="text-[11px] sm:text-xs text-[#756782] flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#7716B5]"/>PDD</p>
    <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums">{pdd.toLocaleString('en-SG')}</p>
   </div>
   <div className="rounded-xl border border-[#E8DEF1] bg-[#F8F4FC] p-2.5 sm:p-3">
    <p className="text-[11px] sm:text-xs text-[#756782] flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#FF8DC6] border border-[#270342]/30"/>PS</p>
    <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums">{ps.toLocaleString('en-SG')}</p>
   </div>
   <div className="rounded-xl border border-[#E8DEF1] bg-[#F8F4FC] p-2.5 sm:p-3">
    <p className="text-[11px] sm:text-xs text-[#756782]">Both hubs</p>
    <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums">{(pdd+ps).toLocaleString('en-SG')}</p>
   </div>
  </div>
  {error?<p className="mt-4 text-sm text-red-700" role="alert">{error}</p>:loading&&rows.length===0?
   <p className="mt-5 text-sm" role="status">Loading daily draws…</p>:
   <div className="mt-4">
    <div className="overflow-x-auto" tabIndex={0} aria-label="Scrollable chart showing daily draws at both hubs">
     <div style={{minWidth:Math.max(500,rows.length*58)}} className="relative">
      <div className="h-[212px] relative border-b border-[#D9CBE5]">
       {[0,0.25,0.5,0.75,1].map(frac=><div key={frac}
        className="absolute w-full border-t border-[#EAE2F1]" style={{bottom:(frac*100)+'%'}}>
         <span className="absolute left-0 -top-3 text-[10px] text-[#76678A] bg-white pr-1">{Math.round(max*frac)}</span>
        </div>)}
       <div className="absolute inset-0 flex items-end pl-8 gap-1">
        {rows.map(row=><div key={row.date} className="flex-1 min-w-[46px] h-full flex items-end justify-center gap-1" title={row.date+': PDD '+row.pdd+'; PS '+row.ps}>
         {(['pdd','ps'] as const).map(hub=><div key={hub} className="relative w-[44%] max-w-7 h-[82%] flex items-end justify-center">
          <div className={'w-full relative rounded-t-sm '+(hub==='pdd'?'bg-[#7716B5]':'bg-[#FF8DC6] border border-[#270342]/20')}
           style={{height:row[hub]===0?'0px':Math.max(2,row[hub]/max*100)+'%'}}>
           {row[hub]>0&&<span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-bold font-mono tabular-nums text-[#270342] whitespace-nowrap">{row[hub]}</span>}
          </div>
          {row[hub]===0&&<span className="absolute bottom-0 text-[10px] font-semibold text-[#76678A]">0</span>}
         </div>)}
        </div>)}
       </div>
      </div>
      <div className="flex pl-8 gap-1 pt-2">
       {rows.map((row,i)=><div key={row.date} className="flex-1 min-w-[46px] text-[10px] text-[#756782] text-center whitespace-nowrap">
        {rows.length<=14||i%Math.ceil(rows.length/12)===0||i===rows.length-1?label(row.date):'\u00a0'}
       </div>)}
      </div>
     </div>
    </div>
    {rows.every(r=>r.pdd===0&&r.ps===0)&&<p className="text-sm text-[#756782] mt-3">No qualifying draws in this period.</p>}
    <p className="text-[11px] text-[#756782] mt-2">Numbers above each bar are the exact daily counts (PDD purple, PS pink). Scroll horizontally for more days. Updated approximately every minute.</p>
    <table className="sr-only">
     <caption>Accessible daily draw counts by hub, Singapore time</caption>
     <thead><tr><th>Date</th><th>PDD</th><th>PS</th><th>Total</th></tr></thead>
     <tbody>{rows.map(r=><tr key={r.date}><td>{r.date}</td><td>{r.pdd}</td><td>{r.ps}</td><td>{r.pdd+r.ps}</td></tr>)}</tbody>
    </table>
   </div>}
 </section>;
}
