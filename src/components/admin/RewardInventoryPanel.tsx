import React,{useEffect,useState} from 'react';
import {EzlinkInventoryPanel} from './EzlinkInventoryPanel';
import {GoodieBagInventoryPanel} from './GoodieBagInventoryPanel';
export function RewardInventoryPanel(){
 const [mode,setMode]=useState<'bag'|'card'|'error'|null>(null);
 useEffect(()=>{
  let active=true;
  fetch('/api/kiosk/quest-rewards/status',{cache:'no-store'}).then(r=>r.json()).then(d=>{
   if(active)setMode(d.rewardName==='NELBD Goodie Bag'?'bag':d.rewardName==='ez-link Card'?'card':'error');
  }).catch(()=>{if(active)setMode('error')});
  return()=>{active=false};
 },[]);
 if(mode===null)return <p className="text-sm p-3">Loading guaranteed reward inventory…</p>;
 if(mode==='error')return <p role="alert" className="text-sm p-3 text-red-700">Unable to confirm the active 17-stamp reward. Inventory is temporarily unavailable; no stock has been changed.</p>;
 return mode==='bag'?<GoodieBagInventoryPanel/>:<EzlinkInventoryPanel/>;
}
