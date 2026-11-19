import React,{useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {CheckCircle2} from 'lucide-react';
import {useKiosk} from '../../context/KioskContext';
import nelbdLogo from '../../assets/img/nelbd-logo.png';

const RETURN_SECONDS=45;

/** Shown only after the server confirms the physical Goodie Bag handover. */
export function GoodieBagSuccess(){
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
    <h1 className="font-nel text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">Goodie Bag collected!</h1>
   </div>
   <button type="button" onClick={finish}
    className="w-full min-h-[60px] rounded-xl bg-nel-violet text-nel-pink px-5 py-4 text-lg font-bold focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-nel-violet">
    FINISH
   </button>
   <p className="font-dm text-xs text-nel-violet/70" aria-live="off">Returning to the start screen in {remaining}s</p>
  </section>
 </div>;
}
