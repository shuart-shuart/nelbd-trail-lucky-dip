import React,{useEffect,useState} from 'react';
import {useParams} from 'react-router-dom';

type Claim={slotId:string;tier:string;amountCents:number;quantity:number;denominationCents:number;status:string};
export function QuestClaimPage(){
 const {token=''}=useParams();const [claim,setClaim]=useState<Claim|null>(null);
 const [name,setName]=useState('');const[email,setEmail]=useState('');
 const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');
 useEffect(()=>{
  let active=true;
  fetch('/api/quest/claim/'+encodeURIComponent(token),{cache:'no-store'})
   .then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||'Claim unavailable');return data as Claim;})
   .then(data=>{if(active)setClaim(data);}).catch(e=>{if(active)setMessage(e instanceof Error?e.message:'Claim unavailable');});
  return()=>{active=false;};
 },[token]);
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(!claim||busy)return;setBusy(true);setMessage('');
  try{
   const r=await fetch('/api/quest/claim/'+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email})});
   const data=await r.json();if(!r.ok)throw new Error(data.error||'Submission failed');
   setMessage('Thank you! Your NELBD Quest prize claim is received. Our team will verify it before emailing your secure voucher link.');
   setClaim({...claim,status:'closed'});
  }catch(e){setMessage(e instanceof Error?e.message:'Submission failed');}
  finally{setBusy(false);}
 };
 return <main className="min-h-screen bg-[#270342] px-4 py-8 flex items-center justify-center font-dm">
  <section className="w-full max-w-lg bg-[#FF8DC6] text-[#270342] rounded-[24px] p-6 sm:p-9 border-[3px] border-[#7716B5]">
   <p className="text-xs font-bold tracking-[.2em] uppercase">NEL, BY DESIGN · QUEST</p>
   <h1 className="mt-3 text-3xl sm:text-4xl font-nel font-semibold">Congratulations, Quest Winner!</h1>
   {claim&&<div className="bg-[#270342] text-[#FF8DC6] text-center rounded-2xl p-5 my-5">
    <p className="uppercase text-xs font-bold tracking-wide">{claim.tier} prize · {claim.slotId}</p>
    <p className="text-white text-4xl font-bold my-2">S${(claim.amountCents/100).toLocaleString('en-SG')}</p>
    <p className="text-sm">{claim.quantity} Grab voucher{claim.quantity>1?'s':''}</p>
   </div>}
   {claim?.status==='ready'&&<form onSubmit={submit} className="space-y-4 mt-5">
    <p className="text-sm">Enter your name and email to submit your NELBD Quest prize claim. Your voucher link will be emailed after staff verification.</p>
    <label className="block text-sm font-bold">Your full name<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} autoComplete="name" className="mt-1 block w-full bg-white rounded-xl px-4 py-3 text-[#270342]"/></label>
    <label className="block text-sm font-bold">Email address<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" className="mt-1 block w-full bg-white rounded-xl px-4 py-3 text-[#270342]"/></label>
    <button disabled={busy} className="w-full rounded-xl bg-[#270342] text-white py-3 font-bold disabled:opacity-50">{busy?'Submitting…':'Submit prize claim'}</button>
    <p className="text-xs">One submission per winner link. Contact the NELBD team if you need to correct your details.</p>
   </form>}
   {claim?.status==='closed'&&!message&&<p className="mt-5 font-semibold">This link has already been used or closed. Contact the NELBD team if you need assistance.</p>}
   {message&&<p role="status" className="mt-5 font-semibold">{message}</p>}
  </section>
 </main>;
}