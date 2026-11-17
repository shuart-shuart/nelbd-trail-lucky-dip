import React from 'react';
import {useNavigate} from 'react-router-dom';
import {useKiosk,type QuestScenario} from '../../context/KioskContext';

const choices:{id:QuestScenario;title:string;description:string}[]=[
 {id:'8_only',title:'8 stamps only',description:'Lucky Dip + Sticker'},
 {id:'17_fresh',title:'17 stamps · First Redemption',description:'Lucky Dip + Sticker + ez-link Card'},
 {id:'17_returning',title:'17 stamps · Returning Participant',description:'ez-link Card only (Lucky Dip already claimed)'}
];
export const RedemptionChoicePage:React.FC=()=>{
 const navigate=useNavigate();
 const {setScenario,session}=useKiosk();
 const [choice,setChoice]=React.useState<QuestScenario>('8_only');
 const [availableBySite,setAvailableBySite]=React.useState<Record<'PDD'|'PS',boolean>|null>(null);
 const [configured,setConfigured]=React.useState(false);
 React.useEffect(()=>{
  let active=true;
  fetch('/api/kiosk/quest-rewards/status',{cache:'no-store'}).then(r=>r.json())
   .then(d=>{if(active){setAvailableBySite({PDD:Boolean(d.bySite?.PDD),PS:Boolean(d.bySite?.PS)});setConfigured(Boolean(d.staffPinConfigured));}})
   .catch(()=>{if(active)setAvailableBySite({PDD:false,PS:false})});
  return()=>{active=false};
 },[]);
 const available=availableBySite?.[session.site]??null;
 const continueToDetails=()=>{setScenario(choice);navigate('/welcome');};
 return <div className="w-full bg-nel-pink text-nel-violet rounded-3xl p-5 sm:p-6 space-y-4 my-auto">
  <h1 className="font-nel text-2xl sm:text-3xl font-semibold text-center">Redeem Your Quest Rewards</h1>
  <p className="font-dm text-sm text-center">Ask our booth crew to verify the stamps and hole punches in your booklet.</p>
  <div role="radiogroup" aria-label="Redemption type" className="space-y-2">
   {choices.map(item=><button type="button" role="radio" aria-checked={choice===item.id} key={item.id}
    onClick={()=>setChoice(item.id)} className={'w-full rounded-xl p-4 border-2 text-left font-dm '+(choice===item.id?'border-nel-violet bg-white':'border-nel-violet/30 bg-nel-pink')}>
    <strong className="block text-lg">{item.title}</strong><span className="text-sm">{item.description}</span>
   </button>)}
  </div>
  {choice!=='8_only'&&available===false&&<p role="status" className="text-sm font-semibold">ez-link redemptions are unavailable until card stock and staff access are configured. Please ask booth staff.</p>}
  <button onClick={continueToDetails} disabled={choice!=='8_only'&&(available!==true||!configured)}
   className="w-full rounded-xl bg-nel-violet text-nel-pink p-4 font-bold text-xl disabled:opacity-50">CONTINUE</button>
  <p className="sr-only">Current hub {session.site}</p>
 </div>;
};