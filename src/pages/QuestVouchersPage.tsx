import React,{useEffect,useState} from 'react';
import {useParams} from 'react-router-dom';
type Voucher={amountCents:number;code:string;url:string;startsAt:string;expiresAt:string};
type Data={tier:string;amountCents:number;vouchers:Voucher[]};
export function QuestVouchersPage(){
 const {token=''}=useParams();const[data,setData]=useState<Data|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;fetch('/api/quest/vouchers/'+encodeURIComponent(token),{cache:'no-store',referrerPolicy:'no-referrer'})
  .then(async r=>{const v=await r.json();if(!r.ok)throw new Error(v.error||'Voucher link unavailable');return v as Data;})
  .then(v=>{if(active)setData(v);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Unavailable');});
  return()=>{active=false;};},[token]);
 const exportList=()=>{
  if(!data)return;
  const lines=['NELBD Quest Grab Vouchers','Value: S$'+(data.amountCents/100),'','Keep these codes private.',''];
  data.vouchers.forEach((v,i)=>lines.push('Voucher '+(i+1)+' - S$'+(v.amountCents/100),'Code: '+v.code,'Link: '+v.url,'Valid until: '+new Date(v.expiresAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}),''));
  const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='NELBD-Quest-Grab-Vouchers.txt';a.click();URL.revokeObjectURL(url);
 };
 return <main className="min-h-screen bg-[#270342] text-white p-4 sm:p-10 font-dm">
  <div className="max-w-2xl mx-auto">
   <p className="text-[#FF8DC6] tracking-widest uppercase font-bold text-sm">NEL, BY DESIGN · QUEST</p>
   <h1 className="text-3xl font-nel font-semibold mt-3">Your Grab Vouchers</h1>
   {error&&<p role="alert" className="mt-5 bg-[#FF8DC6] text-[#270342] p-4 rounded-xl">{error}</p>}
   {!data&&!error&&<p className="mt-5">Loading your private voucher collection…</p>}
   {data&&<><p className="my-4">Congratulations on winning S${(data.amountCents/100).toLocaleString('en-SG')} in Grab vouchers in the NELBD Quest!</p>
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
     <p>{data.vouchers.length} voucher{data.vouchers.length!==1?'s':''} · private collection</p>
     <button onClick={exportList} className="bg-[#FF8DC6] text-[#270342] px-4 py-2 rounded-lg font-bold">Download my vouchers</button>
    </div>
    <div className="grid gap-3">{data.vouchers.map((v,i)=><section key={i} className="bg-[#FF8DC6] text-[#270342] rounded-2xl p-4">
     <p className="uppercase text-xs font-bold">Grab voucher {i+1} · S${v.amountCents/100}</p>
     <p className="font-mono break-all mt-2 font-bold">{v.code}</p>
     <a href={v.url} target="_blank" rel="noopener noreferrer" className="block underline font-bold mt-3">Open Grab redemption link</a>
     <p className="text-xs mt-3">Valid from {new Date(v.startsAt).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore'})} to {new Date(v.expiresAt).toLocaleDateString('en-SG',{timeZone:'Asia/Singapore'})}</p>
    </section>)}</div>
    <p className="text-sm mt-5">Keep these codes and this page link private. Viewing or downloading codes cannot be undone by the NELBD team. Grab terms apply.</p>
   </>}
  </div>
 </main>;
}