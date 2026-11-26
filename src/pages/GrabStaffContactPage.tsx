import React,{useEffect,useState} from 'react';
type Lookup={amount:number;available:boolean;status:string};
type Method='email'|'phone';
async function request<T>(path:string,body?:unknown):Promise<T>{
 const response=await fetch('/api/staff/grab'+path,{
  method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json().catch(()=>({error:'Request failed'}));
 if(!response.ok)throw new Error(data.error||'Request failed');
 return data as T;
}
export const GrabStaffContactPage:React.FC=()=>{
 const [authenticated,setAuthenticated]=useState(false);
 const [checking,setChecking]=useState(true);
 const [password,setPassword]=useState('');
 const [ticket,setTicket]=useState('');
 const [collectionSite,setCollectionSite]=useState<'PDD'|'PS'|'FARM'>('PDD');
 const [method,setMethod]=useState<Method>('email');
 const [email,setEmail]=useState('');
 const [phone,setPhone]=useState('');
 const [lookup,setLookup]=useState<Lookup|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 useEffect(()=>{void request('/session').then(()=>setAuthenticated(true)).catch(()=>{}).finally(()=>setChecking(false));},[]);
 const signIn=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{await request('/login',{password});setPassword('');setAuthenticated(true);}
  catch(e){setError(e instanceof Error?e.message:'Login unavailable');}
  finally{setBusy(false);}
 };
 const verify=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('');setSuccess('');setLookup(null);
  try{setLookup(await request<Lookup>('/lookup',{ticketNumber:ticket.trim().toUpperCase()}));}
  catch(e){setError(e instanceof Error?e.message:'Ticket lookup unavailable');}
  finally{setBusy(false);}
 };
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy||!lookup?.available)return;
  if(!window.confirm('Confirm '+method+' contact for '+ticket.toUpperCase()+'? This cannot be changed by staff afterwards.'))return;
  setBusy(true);setError('');
  try{
   const result=await request<{recorded:boolean;delivery:string;notification?:string}>('/submit',{
    ticketNumber:ticket.trim().toUpperCase(),collectionSite,method,
    ...(method==='email'?{email}:{phone})});
   setSuccess(method==='email'?'Email recorded and queued for voucher delivery.':
    result.notification==='accepted'?'Handphone recorded for manual follow-up. Notification request accepted.':
    'Handphone saved for manual follow-up, but email notification is not confirmed. Please alert your supervisor.');
   setTicket('');setLookup(null);setEmail('');setPhone('');
  }catch(e){setError(e instanceof Error?e.message:'Submission unavailable');}
  finally{setBusy(false);}
 };
 return <main className="min-h-screen bg-[#270342] p-4 sm:p-10 text-[#270342]">
  <section className="mx-auto max-w-xl rounded-2xl bg-[#F8F1FB] p-5 sm:p-8 space-y-5">
   <header><h1 className="text-2xl font-bold">NELBD Grab Voucher Redemption</h1>
    <p className="text-sm mt-1">Ground staff contact collection · S$5 and S$10 only</p></header>
   {checking?<p>Checking staff access…</p>:!authenticated?
    <form onSubmit={signIn} className="space-y-4">
     <p className="text-sm">Enter the separate staff password to continue.</p>
     <label className="block font-semibold">Staff password
      <input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}
       className="block mt-1 w-full rounded-lg border p-3" /></label>
     <button disabled={busy} className="w-full rounded-xl bg-[#270342] p-3 font-bold text-white disabled:opacity-50">Sign in</button>
    </form>:
    <div className="space-y-5">
     <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">Staff access verified</p>
      <button className="text-sm underline" onClick={()=>void request('/logout',{}).finally(()=>{setAuthenticated(false);setLookup(null);})}>Sign out</button></div>
     <form onSubmit={verify} className="space-y-3">
      <label className="block font-semibold">Winning ticket number
       <input type="text" value={ticket} onChange={e=>{setTicket(e.target.value.toUpperCase());setLookup(null);setSuccess('');}}
        placeholder="NELBD-PDD-123456" required maxLength={16} className="mt-1 block w-full rounded-lg border p-3 font-mono uppercase"/></label>
      <button disabled={busy||!/^NELBD-(PDD|PS)-[0-9]{6}$/.test(ticket)} className="w-full rounded-xl bg-[#270342] p-3 font-bold text-white disabled:opacity-50">
       {busy?'Checking…':'Verify winning ticket'}</button>
     </form>
     {lookup&&<div className="rounded-xl border border-[#CDBDD9] bg-white p-4 space-y-2">
       <p className="text-sm">Winning prize: <strong className="text-lg">S${lookup.amount} Grab Voucher</strong></p>
       <p className="text-sm">{lookup.status}</p>
      </div>}
     {lookup?.available&&<form onSubmit={submit} className="space-y-4 border-t pt-4 border-[#CDBDD9]">
      <label className="block font-semibold">Staff collection location
       <select className="mt-1 block w-full rounded-lg border p-3" value={collectionSite}
        onChange={e=>{const site=e.target.value as 'PDD'|'PS'|'FARM';setCollectionSite(site);if(site==='FARM')setMethod('email');}}>
        <option value="PDD">PDD</option><option value="PS">PS</option><option value="FARM">FARM</option>
       </select>
      </label>
      {collectionSite==='FARM'&&<p className="rounded-lg bg-white p-3 text-sm font-semibold">FARM submissions require an email address. Handphone follow-up is available at PDD and PS only.</p>}
      {collectionSite!=='FARM'&&<fieldset className="space-y-2"><legend className="font-semibold">Contact method — choose one</legend>
       <label className="flex items-center gap-2"><input type="radio" checked={method==='email'} onChange={()=>setMethod('email')}/> Email — automatic delivery</label>
       <label className="flex items-center gap-2"><input type="radio" checked={method==='phone'} onChange={()=>setMethod('phone')}/> Handphone — manual follow-up</label>
      </fieldset>}
      {method==='email'?<label className="block font-semibold">Email address
       <input type="email" required maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}
        className="mt-1 block w-full rounded-lg border p-3" placeholder="parent@example.com"/></label>:
       <label className="block font-semibold">Parent / guardian handphone number
        <input type="tel" required value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel"
         className="mt-1 block w-full rounded-lg border p-3" placeholder="8123 4567"/>
        <span className="block mt-1 text-xs font-normal">Manual follow-up details go to the NELBD coordinator. No voucher will be emailed automatically.</span>
       </label>}
      <button disabled={busy} className="w-full rounded-xl bg-[#270342] p-3 font-bold text-white disabled:opacity-50">Confirm redemption details</button>
     </form>}
    </div>}
   {success&&<p role="status" className="rounded-lg bg-white p-4 font-semibold text-green-800">{success}</p>}
   {error&&<p role="alert" className="rounded-lg bg-white p-4 font-semibold text-red-700">{error}</p>}
   <p className="text-xs text-[#645574]">Staff never see voucher codes. Each winning ticket accepts contact details only once. For corrections, contact the administrator.</p>
  </section>
 </main>;
};
