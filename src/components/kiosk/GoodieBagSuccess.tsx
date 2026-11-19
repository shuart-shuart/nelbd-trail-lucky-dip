import React,{useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {CheckCircle2,Gift} from 'lucide-react';
import {useKiosk} from '../../context/KioskContext';
import nelbdLogo from '../../assets/img/nelbd-logo.png';

const RETURN_SECONDS=45;

/** Shown only after the server confirms the physical Goodie Bag handover. */
export function GoodieBagSuccess({scenario}:{scenario:'17_fresh'|'17_returning'}){
 const navigate=useNavigate();
 const {resetSession}=useKiosk();
 const [remaining,setRemaining]=useState(RETURN_SECONDS);
 const finishRef=useRef(false);
 const finish=()=>{
  if(finishRef.current)return;
  finishRef.current=true;
  resetSession();
  navigate('/',{replace:true});
 };
 useEffect(()=>{
  const t=window.setInterval(()=>setRemaining(n=>Math.max(0,n-1)),1000);
  return()=>window.clearInterval(t);
 },[]);
 useEffect(()=>{if(remaining===0)finish()},[remaining]);
 return <div className="w-full flex-1 flex flex-col justify-center my-auto" role="status" aria-live="polite">
  <section className="w-full rounded-3xl bg-nel-pink text-nel-violet border-[3px] border-nel-violet px-5 py-7 sm:p-9 text-center space-y-5">
   <img src={nelbdLogo} alt="New Everyday Life, By Design" className="mx-auto w-auto max-w-[220px] max-h-24 object-contain"/>
   <div className="mx-auto w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-nel-violet text-nel-pink flex items-center justify-center">
    <CheckCircle2 className="w-12 h-12 sm:w-14 sm:h-14" aria-hidden="true"/>
   </div>
   <div className="space-y-2">
    <p className="font-dm text-sm font-bold uppercase tracking-widest">Collection complete</p>
    <h1 className="font-nel text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">Your Goodie Bag is collected!</h1>
    <p className="font-dm text-base sm:text-lg leading-relaxed">Thank you for exploring New Everyday Life, By Design.</p>
   </div>
   <div className="rounded-2xl bg-white/70 px-4 py-4 flex items-center justify-center gap-3">
    <Gift className="w-6 h-6 shrink-0" aria-hidden="true"/>
    <span className="font-dm text-sm sm:text-base font-semibold">17-stamp NELBD Goodie Bag handover recorded</span>
   </div>
   {scenario==='17_fresh'&&<p className="font-dm text-sm">Your Lucky Dip has also been completed. Enjoy your rewards!</p>}
   <button type="button" onClick={finish}
    className="w-full min-h-[60px] rounded-xl bg-nel-violet text-nel-pink px-5 py-4 text-lg font-bold focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-nel-violet">
    FINISH &amp; START NEXT PARTICIPANT
   </button>
   <p className="font-dm text-xs text-nel-violet/70" aria-live="off">Returning to the start screen in {remaining}s</p>
  </section>
 </div>;
}
