import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
type Scenario='17_fresh'|'17_returning';
export function EzlinkCompletion({scenario,mobile,site,onDone}:{scenario:Scenario;mobile:string;site:'PDD'|'PS';onDone?:()=>void}){
 const navigate=useNavigate();
 const [rewardName,setRewardName]=useState('17-stamp reward');
 useEffect(()=>{let active=true;fetch('/api/kiosk/quest-rewards/status',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(active&&typeof d.rewardName==='string')setRewardName(d.rewardName)}).catch(()=>{});return()=>{active=false}},[]);
 const [pin,setPin]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
 const complete=async()=>{
  if(busy||done||!/^\d{6,12}$/.test(pin))return;
  if(!window.confirm('Staff: Confirm the physical '+rewardName+' was handed over and hole punch 2 was applied? This records one reward against the selected hub.'))return;
  setBusy(true);setError('');
  try{
   const res=await fetch('/api/kiosk/quest-rewards/redeem',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({scenario,mobileNumber:mobile,site,staffPin:pin})});
   const data=await res.json();
   if(!res.ok||!data.recorded)throw new Error(data.error||'Unable to record redemption');
   setDone(true);setPin('');onDone?.();
  }catch(e){setError(e instanceof Error?e.message:'Please ask staff for assistance');}
  finally{setBusy(false);}
 };
 if(done)return <section className="rounded-2xl bg-nel-pink text-nel-violet p-5 space-y-3 text-center">
  <h2 className="text-xl font-bold">{rewardName} Redeemed!</h2>
  <p>Both milestones are now recorded. Thank you for exploring New Everyday Life, By Design.</p>
  <button onClick={()=>navigate('/')} className="w-full bg-nel-violet text-nel-pink rounded-xl p-3 font-bold">Finish</button>
 </section>;
 return <section className="rounded-2xl bg-nel-pink text-nel-violet p-4 sm:p-5 space-y-3">
  <h2 className="font-nel text-xl sm:text-2xl font-semibold">Staff: {rewardName} Handover</h2>
  <p className="text-sm">Staff must check the physical booklet. Participants should not complete this step themselves.</p>
  <label className="block text-sm font-bold">Staff-only PIN
   <input type="password" autoComplete="off" inputMode="numeric" maxLength={12} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,12))}
    className="mt-1 block w-full rounded-lg border-2 border-nel-violet bg-white p-3" placeholder="Enter staff PIN"/>
  </label>
  {error&&<p role="alert" className="text-sm font-bold">{error==='ALREADY_REDEEMED'?'This phone number has already redeemed the 17-stamp reward.':error==='OUT_OF_STOCK'?'No '+rewardName+' units remain. Ask an administrator.':error}</p>}
  <button disabled={busy||pin.length<6} onClick={()=>void complete()}
   className="w-full bg-nel-violet text-nel-pink p-3 rounded-xl font-bold disabled:opacity-50">
   {busy?'RECORDING…':'CONFIRM REWARD REDEMPTION'}
  </button>
  <p className="text-xs">If the network fails after handing over the reward, ask an administrator to check redemption history before attempting again.</p>
 </section>;
}