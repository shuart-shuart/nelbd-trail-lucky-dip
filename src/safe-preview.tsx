import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import abbeySvg from './assets/img/ABBEY.svg';
import nelLogo from './assets/img/nel-logo.png';
import './index.css';

/** Independent static visual preview. No App, Firebase, auth, or draw imports. */
function SafeWelcomePreview(){
 const [site,setSite]=useState<'PDD'|'PS'>('PDD');
 const [started,setStarted]=useState(false);
 return <main className="min-h-dvh bg-nel-violet flex flex-col items-center justify-center px-4 py-6 text-nel-violet">
  <div className="w-full max-w-xl mb-3 text-center font-dm text-xs tracking-widest text-nel-pink uppercase">Visual preview only · No participant data or prize draws</div>
  <div className="relative w-full max-w-xl mx-auto flex flex-col gap-4 sm:gap-5 py-4 sm:py-6 isolate">
   <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[15%] bg-nel-pink -z-10 pointer-events-none" aria-hidden="true"/>
   <section className="w-full rounded-[26px] sm:rounded-[32px] bg-nel-pink text-nel-violet px-5 py-5 sm:px-7 sm:py-7 overflow-hidden">
    <div className="grid grid-cols-2 gap-3 sm:gap-5 items-start">
     <h1 className="min-w-0 m-0"><img src={nelLogo} alt="New Everyday Life, By Design" className="block w-full h-auto object-contain object-left"/></h1>
     <div className="min-w-0 border-l border-nel-violet/60 pl-3 sm:pl-5 text-right">
      <p className="font-nel font-semibold text-[clamp(.8rem,3vw,1.4rem)] leading-tight text-nel-violet whitespace-nowrap">14 NOV → 6 DEC 2026</p>
      <p className="font-dm font-bold text-[10px] sm:text-xs leading-snug mt-2">Various Locations Along The North East Line</p>
     </div>
    </div>
    <div className="w-full border-t-2 border-dashed border-nel-violet/70 mt-5 mb-3" aria-hidden="true"/>
    <img src={abbeySvg} alt="Abbey illustration of people on the design trail" className="block w-full h-auto max-h-[45dvh] object-contain object-center"/>
   </section>
   <button type="button" onClick={()=>setStarted(true)} className="w-full rounded-[24px] sm:rounded-[28px] bg-nel-pink text-nel-violet min-h-[94px] sm:min-h-[116px] px-5 sm:px-8 flex items-center justify-center gap-4 sm:gap-6 font-nel font-semibold text-[clamp(1.45rem,5.3vw,2.6rem)] tracking-tight hover:bg-[#ffc0de] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white cursor-pointer">
    <span className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-nel-violet text-nel-pink shrink-0 flex items-center justify-center" aria-hidden="true"><svg viewBox="0 0 24 24" className="w-7 h-7 sm:w-9 sm:h-9" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16M13 5l7 7-7 7"/></svg></span><span>PRESS TO START</span>
   </button>
   <div className="w-full rounded-[22px] sm:rounded-[26px] bg-nel-pink p-2 sm:p-2.5"><div role="group" aria-label="Preview venue selector" className="grid grid-cols-2 overflow-hidden rounded-[16px] sm:rounded-[18px]">
    {([['PDD','Innovation Hub'],['PS','Impact Hub']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={site===value} onClick={()=>setSite(value)} className={`min-w-0 min-h-[48px] sm:min-h-[54px] px-1.5 sm:px-3 flex items-center justify-center gap-1.5 sm:gap-2 font-nel font-semibold text-[clamp(.77rem,2.7vw,1.05rem)] cursor-pointer ${site===value?'bg-nel-violet text-nel-pink':'bg-transparent text-nel-violet'}`}><span aria-hidden="true">⌖</span>{label}</button>)}
   </div></div>
  </div>
  {started&&<div role="status" className="mt-3 text-center text-nel-pink font-dm text-sm">Preview only — participant entry and prize draws are disabled. <button type="button" className="underline" onClick={()=>setStarted(false)}>Back</button></div>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><SafeWelcomePreview/></React.StrictMode>);
