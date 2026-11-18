import React,{useEffect,useState} from 'react';
import {EzlinkInventoryPanel} from './EzlinkInventoryPanel';
import {GoodieBagInventoryPanel} from './GoodieBagInventoryPanel';
export function RewardInventoryPanel(){
 const [mode,setMode]=useState<'bag'|'card'|null>(null);
 useEffect(()=>{
  let active=true;
  fetch('/api/kiosk/quest-rewards/status',{cache:'no-store'}).then(r=>r.json()).then(d=>{
   if(active)setMode(d.rewardName==='NELBD Goodie Bag'?'bag':'card');
  }).catch(()=>{if(active)setMode('card')});
  return()=>{active=false};
 },[]);
 if(mode===null)return <p className="text-sm p-3">Loading guaranteed reward inventory…</p>;
 return mode==='bag'?<GoodieBagInventoryPanel/>:<EzlinkInventoryPanel/>;
}
