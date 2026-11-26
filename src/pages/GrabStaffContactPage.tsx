import React,{useEffect,useState} from 'react';
type Method='email'|'phone';
type Site='PDD'|'PS'|'FARM';
type SubmitResult={recorded:boolean;ticketNumber:string;stockSite:string;delivery:string;notification?:string};
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
 const [password,setPassword]=useState('');
 const [farmPassword,setFarmPassword]=useState('');
 const [farmVerified,setFarmVerified]=useState(false);
 const [collectionSite,setCollectionSite]=useState<Site>('PDD');
 const [amount,setAmount]=useState<5|10>(5);
 const [method,setMethod]=useState<Method>('email');
 const [email,setEmail]=useState(''),[phone,setPhone]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [success,setSuccess]=useState<SubmitResult|null>(null);
 useEffect(()=>{void request('/session').then(()=>setAuthenticated(true)).catch(()=>{}).finally(()=>setChecking(false));},[]);
 useEffect(()=>{if(authenticated&&collectionSite==='FARM'){
  void request<{verified:boolean}>('/farm/status').then(r=>setFarmVerified(r.verified)).catch(()=>setFarmVerified(false));
 }},[authenticated,collectionSite]);
 const verifyFarm=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{await request('/farm/verify',{password:farmPassword});setFarmPassword('');setFarmVerified(true);}
  catch(e){setFarmVerified(false);setError(e instanceof Error?e.message:'Unable to verify FARM password');}
  finally{setBusy(false);}
 };
 const signIn=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{await request('/login',{password});setPassword('');setAuthenticated(true);}
  catch(e){setError(e instanceof Error?e.message:'Login unavailable');}
  finally{setBusy(false);}
 };
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy||success||(collectionSite==='FARM'&&!farmVerified))return;
  if(!window.confirm('Issue S$'+amount+' Grab voucher from remaining inventory for '+collectionSite+' via '+(method==='email'?'email':'handphone follow-up')+'? Please verify this participant has not already received a Lucky Dip prize.'))return;
  setBusy(true);setError('');
  try{
   const result=await request<SubmitResult>('/submit',{collectionSite,method,amount,confirmed:true,
    ...(method==='email'?{email}:{phone})});
   setSuccess(result);setEmail('');setPhone('');
  }catch(e){setError(e instanceof Error?e.message:'Submission unavailable');}
  finally{setBusy(false);}
 };
 const notice=success?.delivery==='email_queued'?'Email queued for the existing Grab voucher Power Automate flow.':
  success?.notification==='accepted'?'Handphone saved. Manual follow-up notification accepted by Power Automate.':
  'Handphone saved, but the follow-up email is not confirmed. Alert the supervisor.';
 return <main className="min-h-screen bg-[#270342] p-4 sm:p-10 text-[#270342]">
  <section className="mx-auto max-w-xl rounded-2xl bg-[#F8F1FB] p-5 sm:p-8 space-y-5">
   <header><h1 className="text-2xl font-bold">NELBD Grab Voucher — Staff Input</h1>
    <p className="text-sm mt-1">Fallback if the Lucky Dip app fails · S$5 and S$10 only</p></header>
   {checking?<p>Checking staff access…</p>:!authenticated?
    <form onSubmit={signIn} className="space-y-4">
     <p className="text-sm">Enter the separate staff password to continue.</p>
     <label className="block font-semibold">Staff password
      <input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}
       className="block mt-1 w-full rounded-lg border p-3"/></label>
     <button disabled={busy} className="w-full rounded-xl bg-[#270342] p-3 font-bold text-white disabled:opacity-50">Sign in</button>
    </form>:
    <div className="space-y-5">
     <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">Staff access verified</p>
      <button className="text-sm underline" onClick={()=>void request('/logout',{}).finally(()=>{setAuthenticated(false);setSuccess(null);setFarmVerified(false);setFarmPassword('');})}>Sign out</button></div>
     {success?<div role="status" className="space-y-3 rounded-xl border border-emerald-400 bg-white p-5">
      <p className="text-xl font-bold text-emerald-800">Staff-input recorded</p>
      <p>Reference ticket: <strong className="font-mono">{success.ticketNumber}</strong></p>
      <p className="text-sm">S$5 codes reserved and voucher stock deducted from {success.stockSite} inventory.</p>
      <p className="text-sm font-semibold">{notice}</p>
      <button type="button" onClick={()=>{setSuccess(null);setError('');setAmount(5);setMethod('email');}}
       className="w-full rounded-xl bg-[#270342] p-3 font-bold text-white">New staff input</button>
     </div>:
     <form onSubmit={submit} className="space-y-4">
      <p className="rounded-lg bg-white p-3 text-sm">No winning ticket needed. Check the participant's eligibility before issuing a replacement. This action immediately reserves voucher codes and deducts one Grab award from existing stock.</p>
      <label className="block font-semibold">Staff collection location
       <select className="mt-1 block w-full rounded-lg border p-3" value={collectionSite}
        onChange={e=>{const site=e.target.value as Site;setCollectionSite(site);setError('');if(site==='FARM')setMethod('email');}}>
        <option value="PDD">PDD</option><option value="PS">PS</option><option value="FARM">FARM</option>
       </select>
      </label>
      {collectionSite==='FARM'&&!farmVerified&&<div className="space-y-3 rounded-xl border border-[#270342] bg-[#EEE0F7] p-4">
       <p className="font-bold">FARM verification required</p>
       <p className="text-sm">Enter the separate FARM password to activate voucher redemption at this location.</p>
       <label className="block font-semibold">FARM verification password
        <input type="password" required autoComplete="off" value={farmPassword} onChange={e=>setFarmPassword(e.target.value)}
         className="mt-1 block w-full rounded-lg border border-[#270342] bg-white p-3"/>
       </label>
       <button type="button" onClick={()=>void verifyFarm({preventDefault:()=>{}} as React.FormEvent)} disabled={busy} className="w-full rounded-xl bg-[#270342] p-3 font-bold text-white disabled:opacity-50">Verify FARM access</button>
      </div>}
      {collectionSite==='FARM'&&farmVerified&&<p role="status" className="rounded-lg bg-[#EEE0F7] p-3 text-sm font-semibold">FARM access verified for this staff session (15 minutes).</p>}
      {(collectionSite!=='FARM'||farmVerified)&&<>
      <fieldset className="space-y-2"><legend className="font-semibold">Grab voucher amount</legend>
       <div className="grid grid-cols-2 gap-2">
        <label className="rounded-lg border border-[#270342] bg-[#EEE0F7] p-3"><input type="radio" checked={amount===5} onChange={()=>setAmount(5)}/> <strong>S$5</strong></label>
        <label className="rounded-lg border border-[#270342] bg-[#EEE0F7] p-3"><input type="radio" checked={amount===10} onChange={()=>setAmount(10)}/> <strong>S$10</strong></label>
       </div>
      </fieldset>
      {collectionSite==='FARM'?<p className="rounded-lg bg-white p-3 text-sm font-semibold">FARM: email only. Voucher stock will be taken from an eligible PDD or PS pool and logged as FARM staff-input.</p>:
       <fieldset className="space-y-2"><legend className="font-semibold">Contact method</legend>
        <label className="flex items-center gap-2"><input type="radio" checked={method==='email'} onChange={()=>setMethod('email')}/> Email — automatic voucher delivery</label>
        <label className="flex items-center gap-2"><input type="radio" checked={method==='phone'} onChange={()=>setMethod('phone')}/> Handphone — manual follow-up</label>
       </fieldset>}
      {method==='email'?<label className="block font-semibold">Email address
       <input type="email" required maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}
        className="mt-1 block w-full rounded-lg border p-3" placeholder="parent@example.com"/></label>:
       <label className="block font-semibold">Parent / guardian handphone number
        <input type="tel" required value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel"
         className="mt-1 block w-full rounded-lg border p-3" placeholder="8123 4567"/>
        <span className="block mt-1 text-xs font-normal">Manual follow-up goes to nelbd2026@gmail.com. The voucher is reserved, not automatically emailed.</span>
       </label>}
      <button disabled={busy} className="w-full rounded-xl bg-[#270342] p-3 font-bold text-white disabled:opacity-50">
       {busy?'Recording…':'Confirm staff-input voucher'}</button>
      </>}
     </form>}
    </div>}
   {error&&<p role="alert" className="rounded-lg bg-white p-4 font-semibold text-red-700">{error}</p>}
   <p className="text-xs text-[#645574]">Never enter a test submission using a real participant. Staff cannot view voucher codes. All allocations are marked staff-input in the admin history.</p>
  </section>
 </main>;
};
