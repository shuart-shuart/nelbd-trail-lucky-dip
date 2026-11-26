import React,{useEffect,useState} from 'react';
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
 const [authenticated,setAuthenticated]=useState(false),[checking,setChecking]=useState(true);
 const [password,setPassword]=useState(''),[collectionSite,setCollectionSite]=useState<'PDD'|'PS'|'FARM'>('PDD');
 const [amount,setAmount]=useState<5|10>(5),[method,setMethod]=useState<Method>('email');
 const [email,setEmail]=useState(''),[phone,setPhone]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 useEffect(()=>{void request('/session').then(()=>setAuthenticated(true)).catch(()=>{}).finally(()=>setChecking(false));},[]);
 const signIn=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{await request('/login',{password});setPassword('');setAuthenticated(true);}
  catch(e){setError(e instanceof Error?e.message:'Login unavailable');}
  finally{setBusy(false);}
 };
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;
  if(!window.confirm('Record this S$'+amount+' '+collectionSite+' '+method+' contact for manual follow-up? No voucher is issued automatically.'))return;
  setBusy(true);setError('');setSuccess('');
  try{
   const result=await request<{recorded:boolean;alreadyRecorded?:boolean;notification:string}>('/fallback/submit',{
    collectionSite,amount,method,...(method==='email'?{email}:{phone})});
   setSuccess(result.alreadyRecorded?'Already saved recently. Please do not submit again.':
    result.notification==='accepted'?'Contact saved. Coordinator notification request accepted. No voucher issued.':
    'Contact saved. Email notification not confirmed — alert your supervisor and check the admin backup list.');
   setEmail('');setPhone('');
  }catch(e){setError(e instanceof Error?e.message:'Submission unavailable');}
  finally{setBusy(false);}
 };
 return <main className="min-h-screen bg-[#270342] p-4 sm:p-10 text-[#270342]">
  <section className="mx-auto max-w-xl rounded-2xl bg-[#F8F1FB] p-5 sm:p-8 space-y-5">
   <header><h1 className="text-2xl font-bold">Grab Voucher — App Offline Backup</h1>
    <p className="text-sm mt-1">For staff use only when the Lucky Dip app is not working. Record contact details for follow-up.</p></header>
   {checking?<p>Checking staff access…</p>:!authenticated?
    <form onSubmit={signIn} className="space-y-4">
     <label className="block font-semibold">Staff password
      <input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}
       className="block mt-1 w-full rounded-lg border p-3"/></label>
     <button disabled={busy} className="w-full rounded-xl bg-[#270342] p-3 font-bold text-white disabled:opacity-50">Sign in</button>
    </form>:
    <div className="space-y-5">
     <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">Staff access verified</p>
      <button className="text-sm underline" onClick={()=>void request('/logout',{}).finally(()=>setAuthenticated(false))}>Sign out</button></div>
     <form onSubmit={submit} className="space-y-4">
      <label className="block font-semibold">Collection location
       <select className="mt-1 block w-full rounded-lg border p-3" value={collectionSite}
        onChange={e=>{const site=e.target.value as 'PDD'|'PS'|'FARM';setCollectionSite(site);if(site==='FARM')setMethod('email');}}>
        <option value="PDD">PDD</option><option value="PS">PS</option><option value="FARM">FARM</option>
       </select></label>
      <label className="block font-semibold">Grab voucher amount
       <select className="mt-1 block w-full rounded-lg border p-3" value={amount}
        onChange={e=>setAmount(Number(e.target.value) as 5|10)}>
        <option value={5}>S$5</option><option value={10}>S$10</option>
       </select></label>
      {collectionSite==='FARM'?<p className="rounded-lg bg-white p-3 text-sm font-semibold">FARM: email address only</p>:
       <fieldset className="space-y-2"><legend className="font-semibold">Contact method</legend>
        <label className="flex items-center gap-2"><input type="radio" checked={method==='email'} onChange={()=>setMethod('email')}/> Email address</label>
        <label className="flex items-center gap-2"><input type="radio" checked={method==='phone'} onChange={()=>setMethod('phone')}/> Handphone number</label>
       </fieldset>}
      {method==='email'?<label className="block font-semibold">Email address
        <input type="email" required maxLength={254} autoComplete="email" value={email}
         onChange={e=>setEmail(e.target.value)} className="mt-1 block w-full rounded-lg border p-3"
         placeholder="parent@example.com"/></label>:
       <label className="block font-semibold">Parent / guardian handphone number
        <input type="tel" required autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)}
         className="mt-1 block w-full rounded-lg border p-3" placeholder="8123 4567"/></label>}
      <button disabled={busy} className="w-full rounded-xl bg-[#270342] p-3 font-bold text-white disabled:opacity-50">
       {busy?'Saving…':'Save contact for follow-up'}</button>
     </form>
    </div>}
   {success&&<p role="status" className="rounded-lg bg-white p-4 font-semibold text-green-800">{success}</p>}
   {error&&<p role="alert" className="rounded-lg bg-white p-4 font-semibold text-red-700">{error}</p>}
   <p className="text-xs text-[#645574]">Backup collection only. No winning ticket is required or verified. No voucher codes are assigned or emailed. The coordinator will review submissions before manual fulfilment.</p>
  </section>
 </main>;
};
