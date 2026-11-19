import React,{useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useKiosk} from '../../context/KioskContext';
import {EzlinkCompletion} from '../../components/kiosk/EzlinkCompletion';
import {GoodieBagSuccess} from '../../components/kiosk/GoodieBagSuccess';
export const ReturningRewardPage:React.FC=()=>{
 const navigate=useNavigate(),{session,resetSession}=useKiosk();
 const [phone,setPhone]=useState(''),[eligible,setEligible]=useState(false),[busy,setBusy]=useState(false),
  [error,setError]=useState(''),[completed,setCompleted]=useState(false);
 const lookup=async()=>{
  if(!/^[89]\d{7}$/.test(phone)||busy)return;
  setBusy(true);setEligible(false);setError('');
  try{
   const res=await fetch('/api/kiosk/quest-rewards/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mobileNumber:'+65'+phone})});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||'Unable to verify phone');
   if(!data.eligible){
    const reason=data.reason;
    setError(reason==='ALREADY_REDEEMED'?'This phone number has already redeemed the 17-stamp reward.':
     reason==='NO_PREVIOUS_LUCKY_DIP'?'We could not find a previous Lucky Dip using this number. Ask staff for help.':
     'The earlier Lucky Dip has not been completed. Please ask staff.');
    return;
   }
   setEligible(true);
  }catch(e){setError(e instanceof Error?e.message:'Unable to verify phone');}finally{setBusy(false);}
 };
 if(completed)return <GoodieBagSuccess />;
 return <div className="w-full my-auto space-y-3">
  {!eligible&&<section className="bg-nel-pink text-nel-violet p-5 sm:p-6 rounded-3xl space-y-4">
   <h1 className="font-nel text-2xl sm:text-3xl font-semibold">17 Stamps · Returning</h1>
   <p className="text-sm sm:text-base">Enter the same mobile number used for your Lucky Dip.</p>
   <label htmlFor="returning-phone" className="block font-bold text-sm">Singapore mobile number</label>
   <div className="kiosk-phone-field flex items-center border-2 border-nel-violet rounded-xl bg-nel-pink overflow-hidden">
    <span className="pl-4 text-base font-bold select-none">+65</span>
    <input id="returning-phone" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={8}
     disabled={busy} placeholder="81234567" value={phone}
     onChange={e=>{setPhone(e.target.value.replace(/\D/g,'').slice(0,8));setError('');}}
     className="w-full min-w-0 p-3 bg-nel-pink border-0 text-nel-violet text-lg font-semibold"/>
   </div>
   <button onClick={()=>void lookup()} disabled={busy||!/^[89]\d{7}$/.test(phone)}
    className="w-full min-h-12 bg-nel-violet text-nel-pink p-3 rounded-xl font-bold disabled:opacity-50">
    {busy?'CHECKING…':'VERIFY NUMBER'}</button>
   {error&&<p role="alert" className="text-sm font-semibold">{error}</p>}
  </section>}
  {eligible&&<EzlinkCompletion scenario="17_returning" mobile={'+65'+phone} site={session.site} onDone={()=>setCompleted(true)}/>}
  {!eligible&&<button onClick={()=>{resetSession();navigate('/');}} className="w-full text-sm underline py-2">Back</button>}
  <p className="sr-only">Hub {session.site}</p>
 </div>;
};