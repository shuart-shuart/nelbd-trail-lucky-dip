import React,{useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useKiosk} from '../../context/KioskContext';
import {EzlinkCompletion} from '../../components/kiosk/EzlinkCompletion';
export const ReturningRewardPage:React.FC=()=>{
 const navigate=useNavigate(),{session,resetSession}=useKiosk();
 const [phone,setPhone]=useState(''),[eligible,setEligible]=useState(false),[busy,setBusy]=useState(false),
  [error,setError]=useState('');
 const lookup=async()=>{
  if(!/^[89]\d{7}$/.test(phone)||busy)return;
  setBusy(true);setEligible(false);setError('');
  try{
   const res=await fetch('/api/kiosk/quest-rewards/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mobileNumber:'+65'+phone})});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||'Unable to verify phone');
   if(!data.eligible){
    const reason=data.reason;
    setError(reason==='ALREADY_REDEEMED'?'This phone number has already redeemed an ez-link card.':
     reason==='NO_PREVIOUS_LUCKY_DIP'?'We could not find a previous Lucky Dip using this number. Ask staff for help.':
     'The earlier Lucky Dip has not been completed. Please ask staff.');
    return;
   }
   setEligible(true);
  }catch(e){setError(e instanceof Error?e.message:'Unable to verify phone');}finally{setBusy(false);}
 };
 return <div className="w-full my-auto space-y-3">
  <div className="bg-nel-pink text-nel-violet p-5 rounded-3xl space-y-3">
   <h1 className="font-nel text-2xl font-semibold">17 Stamps · Returning</h1>
   <p className="text-sm">Already completed the Lucky Dip? Enter the same mobile number used previously. No name or email is needed.</p>
   <><label className="block font-bold text-sm">Singapore mobile number
    <div className="flex items-center border-2 border-nel-violet rounded-xl bg-white mt-1"><span className="pl-3">+65</span>
     <input type="tel" inputMode="numeric" maxLength={8} disabled={eligible||busy} placeholder="81234567" value={phone}
      onChange={e=>{setPhone(e.target.value.replace(/\D/g,'').slice(0,8));setEligible(false);setError('');}}
      className="w-full p-3 bg-transparent text-lg"/></div></label>
    {!eligible&&<button onClick={()=>void lookup()} disabled={busy||!/^[89]\d{7}$/.test(phone)}
      className="w-full bg-nel-violet text-nel-pink p-3 rounded-xl font-bold disabled:opacity-50">
      {busy?'CHECKING…':'FIND MY EARLIER REDEMPTION'}</button>}
    {error&&<p role="alert" className="text-sm font-semibold">{error}</p>}</>
  </div>
  {eligible&&<EzlinkCompletion scenario="17_returning" mobile={'+65'+phone} site={session.site}/>}
  {!eligible&&<button onClick={()=>{resetSession();navigate('/');}} className="w-full text-sm underline py-2">Back</button>}
  <p className="sr-only">Hub {session.site}</p>
 </div>;
};