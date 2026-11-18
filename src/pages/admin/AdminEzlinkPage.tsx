import React,{useEffect,useState} from 'react';
import {AdminLayout} from '../../components/admin/AdminLayout';
import {Link} from 'react-router-dom';

type Scenario='8_only'|'17_fresh'|'17_returning';
type Stock={total:number;redeemed:number;remaining:number;bySite:{PDD:{total:number;redeemed:number;remaining:number};PS:{total:number;redeemed:number;remaining:number}}};
type Found={found:true;nickname:string;site:'PDD'|'PS';prizeName:string;ezlinkRedeemed:boolean;mobileNumber:string};
type Draw={success:boolean;recovered?:boolean;prize?:{name:string};error?:string;ticketNumber?:string;voucherClaimToken?:string};
async function api<T>(path:string,init?:RequestInit):Promise<T>{
 const response=await fetch('/api/admin/ezlink'+path,{...init,credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json',...init?.headers}});
 const data=await response.json().catch(()=>({error:'Request failed'}));
 if(!response.ok)throw new Error(data.error||'Request failed');
 return data as T;
}
const newTicket=(site:string)=>'NELBD-'+site+'-'+String(Math.floor(100000+Math.random()*900000));
export function AdminEzlinkPage(){
 const [goodieMode,setGoodieMode]=useState(false);
 useEffect(()=>{fetch('/api/kiosk/quest-rewards/status',{cache:'no-store'}).then(r=>r.json()).then(d=>setGoodieMode(d.rewardName==='NELBD Goodie Bag')).catch(()=>{});},[]);
 const [scenario,setScenario]=useState<Scenario>('8_only'),[name,setName]=useState(''),[phone,setPhone]=useState(''),
  [site,setSite]=useState<'PDD'|'PS'>('PDD'),[checks,setChecks]=useState({stamps:false,punch1:false,punch2:false,first:false,card:false,punched:false}),
  [stock,setStock]=useState<Stock|null>(null),[superAdmin,setSuperAdmin]=useState(false),
  [found,setFound]=useState<Found|null>(null),[draw,setDraw]=useState<Draw|null>(null),
  [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),
  [history,setHistory]=useState<Array<{id:string;site:string;scenario:string;phoneLast4:string;redeemedAt:string;issuedBy:string}>>([]),
  [ticket,setTicket]=useState(()=>newTicket('PDD')),[grabEmail,setGrabEmail]=useState(''),[grabConfirmed,setGrabConfirmed]=useState(false);
 const refresh=async()=>{
  try{const [inventory,records]=await Promise.all([api<Stock>('/inventory'),api<typeof history>('/history')]);
   setStock(inventory);setHistory(records);}
  catch(e){setError(e instanceof Error?e.message:'Unable to load ez-link inventory');}
 };
 useEffect(()=>{void refresh();fetch('/api/admin/me',{credentials:'same-origin'})
  .then(r=>r.json()).then(d=>setSuperAdmin(d.role==='super_admin')).catch(()=>{});},[]);
 const reset=(next:Scenario)=>{
  setScenario(next);setName('');setPhone('');setFound(null);setDraw(null);setError('');setNotice('');
  setChecks({stamps:false,punch1:false,punch2:false,first:false,card:false,punched:false});
  setTicket(newTicket(site));setGrabEmail('');setGrabConfirmed(false);
 };
 const phoneValue='+65'+phone.replace(/\D/g,'').slice(0,8);
 const validPhone=/^[89]\d{7}$/.test(phone);
 const setCheck=(key:keyof typeof checks,value:boolean)=>setChecks(old=>({...old,[key]:value}));
 const lookup=async()=>{
  setError('');setFound(null);setBusy(true);
  try{const data=await api<Found>('/lookup',{method:'POST',body:JSON.stringify({mobileNumber:phoneValue})});setFound(data);}
  catch(e){setError(e instanceof Error?e.message:'Lookup failed');}finally{setBusy(false);}
 };
 const performDraw=async()=>{
  if(!validPhone||!name.trim()||!checks.stamps||!checks.punch1||(scenario==='17_fresh'&&!checks.punch2))return;
  if(!window.confirm('Confirm '+name+' has '+(scenario==='8_only'?'8':'17')+' stamps and an unpunched booklet. Run one REAL Lucky Dip for '+phoneValue+'?'))return;
  setError('');setBusy(true);
  try{const data=await api<Draw>('/draw',{method:'POST',body:JSON.stringify({
   scenario,name,mobileNumber:phoneValue,site,ticketNumber:ticket,stampsVerified:true,firstPunchUnused:true,
   secondPunchUnused:scenario==='17_fresh'?true:undefined})});
   setDraw(data);setNotice('Lucky Dip recorded. Prize: '+(data.prize?.name||'See prize history')+'. Issue sticker and apply first hole punch.');
  }catch(e){setError(e instanceof Error?e.message:'Draw unavailable');}
  finally{setBusy(false);}
 };

 const submitGrabEmail=async()=>{
  if(!draw?.voucherClaimToken||!grabEmail.trim()||grabConfirmed)return;
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/grab/submit-email',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({claimToken:draw.voucherClaimToken,email:grabEmail.trim()})});
   const result=await response.json();
   if(!response.ok||!result.accepted)throw new Error(result.error||'Unable to register Grab email');
   setGrabConfirmed(true);setNotice('Grab voucher recipient email recorded successfully.');
  }catch(e){setError(e instanceof Error?e.message:'Grab voucher email unavailable');}
  finally{setBusy(false);}
 };
 const redeem=async()=>{
  if(!validPhone||!checks.stamps||!checks.punch2||!checks.card||!checks.punched||
    (scenario==='17_returning'&&(!checks.first||!found||found.ezlinkRedeemed))||
    (scenario==='17_fresh'&&!draw?.success))return;
  if(!window.confirm('CONFIRM: one physical ez-link card has been handed over, and hole punch 2 applied. This cannot be undone automatically.'))return;
  setBusy(true);setError('');
  try{await api('/redeem',{method:'POST',body:JSON.stringify({
   scenario,mobileNumber:phoneValue,site,stampsVerified:true,secondPunchUnused:true,
   firstPunchPresent:scenario==='17_returning'?true:undefined,
   firstRewardCompleted:scenario==='17_fresh'?true:undefined,cardHandedOver:true,secondPunchApplied:true})});
   setNotice('ez-link card redemption successfully recorded. No additional Lucky Dip has been issued.');
   setChecks(old=>({...old,card:false,punched:false}));setFound(null);
   await refresh();setScenario('8_only');setPhone('');setName('');setDraw(null);setTicket(newTicket(site));
  }catch(e){setError(e instanceof Error?e.message:'Unable to record card issuance. Check history before trying again');}
  finally{setBusy(false);}
 };
 const verifyCard=(scenario==='17_returning'?Boolean(found&&!found.ezlinkRedeemed):Boolean(draw?.success))&&checks.stamps&&checks.punch2&&checks.card&&checks.punched&&(scenario==='17_fresh'||checks.first);
 if(goodieMode)return <AdminLayout title="NELBD Quest · Reward Redemption" subtitle="17-stamp Goodie Bag reward management">
  <section className="rounded-2xl bg-white border p-6 space-y-3 text-[#270342]">
   <h2 className="text-xl font-bold">17-stamp reward changed to NELBD Goodie Bag</h2>
   <p>The previous ez-link Card handover interface is retired. Staff can complete Goodie Bag handovers in the public kiosk using the existing staff-only PIN. Existing ez-link redemption history is preserved.</p>
   <Link to="/admin/inventory" className="inline-block rounded-xl bg-[#270342] text-white px-4 py-3">Manage Goodie Bag stock and staff PIN</Link>
  </section>
 </AdminLayout>;
 return <AdminLayout title="NELBD Quest · Reward Redemption" subtitle="8 stamps: Lucky Dip + Sticker · 17 stamps: ez-link card · one redemption per phone number">
  <section className="bg-white rounded-2xl p-4 sm:p-6 text-[#270342] space-y-4">
   <h2 className="font-bold text-lg">Choose redemption scenario</h2>
   <div className="grid gap-2 sm:grid-cols-3">
    {([['8_only','1. 8 stamps only','Lucky Dip + Sticker'],['17_fresh','2. 17 stamps · fresh booklet','Both rewards'],['17_returning','3. 17 stamps · returning','ez-link card only']] as const).map(([key,title,desc])=>
     <button key={key} onClick={()=>reset(key)} className={'rounded-xl text-left border-2 p-3 '+(scenario===key?'border-[#270342] bg-[#F6F0FB]':'border-[#E8DDED]')}>
      <strong className="block">{title}</strong><span className="text-sm">{desc}</span>
     </button>)}
   </div>
   <p className="text-sm">Staff must inspect physical booklet before redemption. Hole punch 1 marks the 8-stamp reward; hole punch 2 marks the 17-stamp reward.</p>
   <div className="rounded-xl bg-[#F6F0FB] p-3 text-sm">
    ez-link stock at {site}: <strong>{stock?.bySite[site]?.remaining??'—'} available</strong> · {stock?.bySite[site]?.redeemed??'—'} redeemed · {stock?.bySite[site]?.total??'—'} allocated
   </div>
   {superAdmin&&<p className="text-sm">Adjust PDD/PS stock and record transfers under Prize Inventory.</p>}
   {error&&<p role="alert" className="text-red-700 font-medium">{error}</p>}
   {notice&&<p role="status" className="bg-[#E9E0F4] rounded-lg p-3 text-sm">{notice}</p>}
   <div className="border-t pt-4 space-y-3">
    <h3 className="font-bold text-lg">{scenario==='17_returning'?'Look up the earlier Lucky Dip':'Register participant · same fields for 8 and 17 fresh'}</h3>
    {scenario!=='17_returning'&&<label className="block text-sm font-semibold">Participant name<input disabled={!!draw||busy} maxLength={64} className="block w-full border rounded-lg p-3 mt-1" value={name} onChange={e=>setName(e.target.value)}/></label>}
    <label className="block text-sm font-semibold">Singapore mobile number
     <div className="flex gap-2 items-center mt-1"><span>+65</span><input disabled={!!draw||busy} inputMode="numeric" maxLength={8} className="w-full border rounded-lg p-3" value={phone} onChange={e=>{setPhone(e.target.value.replace(/\D/g,'').slice(0,8));setFound(null);}} placeholder="81234567"/></div>
    </label>
    {scenario==='17_returning'&&<label className="block text-sm font-semibold">Handover hub
     <select className="block w-full border rounded-lg p-3 mt-1" value={site} onChange={e=>setSite(e.target.value as 'PDD'|'PS')}>
      <option value="PDD">PDD — Innovation Hub</option><option value="PS">PS — Impact Hub</option>
     </select></label>}
    {scenario!=='17_returning'&&<label className="block text-sm font-semibold">Hub
     <select disabled={!!draw||busy} className="block w-full border rounded-lg p-3 mt-1" value={site} onChange={e=>{const next=e.target.value as 'PDD'|'PS';setSite(next);setTicket(newTicket(next));}}>
      <option value="PDD">PDD — Innovation Hub</option><option value="PS">PS — Impact Hub</option>
     </select></label>}
    {scenario==='17_returning'&&<button disabled={busy||!validPhone} className="bg-[#270342] text-white rounded-lg px-4 py-3 disabled:opacity-50" onClick={()=>void lookup()}>Search previous Lucky Dip</button>}
    {found&&<div className="border rounded-lg p-3 text-sm">
     <p>Previous participant: <strong>{found.nickname}</strong></p><p>Site: {found.site} · Lucky Dip prize: {found.prizeName}</p>
     <p>ez-link: <strong>{found.ezlinkRedeemed?'Already redeemed — do not issue again':'Not yet redeemed'}</strong></p>
    </div>}
   </div>
   {((scenario!=='17_returning'&&!draw)||scenario==='17_returning'||scenario==='17_fresh')&&<div className="border rounded-xl p-3 space-y-3">
    <h3 className="font-bold">Staff booklet verification</h3>
    <label className="flex gap-2"><input type="checkbox" checked={checks.stamps} onChange={e=>setCheck('stamps',e.target.checked)}/>{scenario==='8_only'?'8':'17'} valid stamps verified</label>
    {scenario!=='17_returning'&&<label className="flex gap-2"><input type="checkbox" checked={checks.punch1} onChange={e=>setCheck('punch1',e.target.checked)}/>First hole punch was unused before Lucky Dip</label>}
    {scenario==='17_returning'&&<label className="flex gap-2"><input type="checkbox" checked={checks.first} onChange={e=>setCheck('first',e.target.checked)}/>First hole punch is present</label>}
    {scenario!=='8_only'&&<label className="flex gap-2"><input type="checkbox" checked={checks.punch2} onChange={e=>setCheck('punch2',e.target.checked)}/>Second hole punch was unused</label>}
   </div>}
   {scenario!=='17_returning'&&!draw&&<button disabled={busy||!validPhone||!name.trim()||!checks.stamps||!checks.punch1||(scenario==='17_fresh'&&!checks.punch2)}
    onClick={()=>void performDraw()} className="w-full bg-[#270342] text-white rounded-xl p-3 font-bold disabled:opacity-40">Run Lucky Dip · issue sticker and apply punch 1</button>}
   {draw?.success&&<div className="border-2 border-[#270342] rounded-xl p-4 space-y-1">
    <p className="font-bold text-lg">Lucky Dip: {draw.prize?.name||'Prize recorded'}</p>
    <p className="text-sm">Hand over prize and sticker, then apply first hole punch. Ticket {draw.ticketNumber}.</p>
    {scenario==='17_fresh'&&<p className="text-sm font-medium">Now complete the second reward below.</p>}
   </div>}

   {draw?.voucherClaimToken&&<div className="border rounded-xl p-4 space-y-2">
    <h3 className="font-bold">Grab voucher prize · recipient email required</h3>
    {grabConfirmed?<p role="status" className="text-sm">Recipient email recorded.</p>:<>
     <p className="text-sm">This Lucky Dip awarded a Grab voucher. Ask the participant for their email to receive it.</p>
     <input type="email" maxLength={254} placeholder="Participant email" className="w-full rounded-lg border p-3" value={grabEmail} onChange={e=>setGrabEmail(e.target.value)}/>
     <button disabled={busy||!grabEmail.includes('@')} onClick={()=>void submitGrabEmail()} className="rounded-lg bg-[#270342] text-white px-4 py-2 disabled:opacity-40">Record Grab voucher email</button>
    </>}
   </div>}
   {scenario!=='8_only'&&<div className="border rounded-xl p-4 space-y-3">
    <h3 className="font-bold">ez-link Card · 17-stamp reward</h3>
    <p className="text-sm">{scenario==='17_returning'?'Phone lookup must show an earlier Lucky Dip and no ez-link redemption.':'Complete Lucky Dip and punch 1 first.'}</p>
    <label className="flex gap-2"><input type="checkbox" checked={checks.card} onChange={e=>setCheck('card',e.target.checked)}/>I have handed over one ez-link card</label>
    <label className="flex gap-2"><input type="checkbox" checked={checks.punched} onChange={e=>setCheck('punched',e.target.checked)}/>I have applied the second hole punch</label>
    <button disabled={busy||!validPhone||!verifyCard||!stock?.bySite[site]?.remaining} onClick={()=>void redeem()} className="bg-[#270342] text-white w-full rounded-xl p-3 font-bold disabled:opacity-40">Record ez-link Card Redemption</button>
   </div>}
  </section>
  <section className="mt-5 bg-white rounded-2xl p-4 sm:p-6">
   <h2 className="font-bold text-lg">Recent ez-link redemptions</h2>
   <div className="overflow-x-auto"><table className="w-full text-sm mt-3"><thead><tr className="border-b text-left"><th className="p-2">Date</th><th className="p-2">Hub</th><th className="p-2">Scenario</th><th className="p-2">Phone</th><th className="p-2">Staff</th></tr></thead>
    <tbody>{history.map(x=><tr key={x.id} className="border-b"><td className="p-2">{new Date(x.redeemedAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})}</td><td className="p-2">{x.site}</td><td className="p-2">{x.scenario.replace('_',' ')}</td><td className="p-2">•••• {x.phoneLast4}</td><td className="p-2">{x.issuedBy}</td></tr>)}</tbody></table></div>
  </section>
 </AdminLayout>;
}
