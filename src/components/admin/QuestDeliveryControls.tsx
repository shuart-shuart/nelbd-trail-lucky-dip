import React,{useEffect,useState} from 'react';
type Slot={slotId:string;tier:string;amountCents:number;quantity:number;name:string|null;email:string|null;state:string;deliveryStatus:string|null};
type Settings={sendEnabled:boolean;importEnabled:boolean};
type Stock={denominationCents:number;total:number;unassigned:number;assigned:number};
async function questApi<T>(path:string,init?:RequestInit):Promise<T>{
 const r=await fetch('/api/admin/quest'+path,{...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...init?.headers},cache:'no-store'});
 const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed');return d as T;
}
function csvRows(text:string):Record<string,string>[]{
 const records:string[][]=[];let fields:string[]=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){fields.push(value);value='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;fields.push(value);value='';if(fields.some(Boolean))records.push(fields);fields=[];}
  else value+=c;
 }
 if(quoted)throw new Error('Unclosed CSV quotation');
 fields.push(value);if(fields.some(Boolean))records.push(fields);
 const header=records.shift()?.map(s=>s.trim().replace(/^\uFEFF/,''))||[];
 return records.map(row=>Object.fromEntries(header.map((h,i)=>[h,row[i]||''])));
}
function sgDate(raw:string):string{
 const m=/^(\d{1,2}) ([A-Za-z]{3}) (\d{2}) (\d{2}):(\d{2}) \+08$/.exec(raw.trim());
 if(!m)throw new Error('Invalid Singapore date: '+raw);
 const idx=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(m[2]);
 if(idx<0)throw new Error('Invalid month');
 return new Date(Date.UTC(2000+Number(m[3]),idx,Number(m[1]),Number(m[4])-8,Number(m[5]))).toISOString();
}
export function QuestDeliveryControls({slots,onRefresh}:{slots:Slot[];onRefresh:()=>Promise<void>}){
 const [config,setConfig]=useState<Settings|null>(null),[stock,setStock]=useState<Stock[]>([]);
 const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[testTo,setTestTo]=useState(''),[tier,setTier]=useState('first');
 const refresh=async()=>{try{const [a,b]=await Promise.all([questApi<Settings>('/settings'),questApi<Stock[]>('/inventory')]);setConfig(a);setStock(b);}catch(e){setNotice(e instanceof Error?e.message:'Unable to fetch Quest inventory');}};
 useEffect(()=>{void refresh();},[]);
 const upload=async(file:File)=>{
  if(!window.confirm('Import encrypted GRAND PRIZE vouchers from '+file.name+'? This never sends an email.'))return;
  setBusy(true);setNotice('');
  try{
   const rows=csvRows(await file.text());if(!rows.length||rows.length>50)throw new Error('Expected 1–50 vouchers per batch');
   const normalized=rows.map(row=>({
    code:row['Gift Code'],url:row['Gift Link'],country:row.Country,status:row.Status,
    denominationCents:row['Denomination Value']==='SGD 250'?25000:row['Denomination Value']==='SGD 100'?10000:0,
    startsAt:sgDate(row['Starts At']),expiresAt:sgDate(row['Expires At'])
   }));
   const result=await questApi<{imported:number;duplicates:number}>('/import-batch',{method:'POST',body:JSON.stringify({batch:file.name.replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,100),rows:normalized})});
   setNotice('Imported '+result.imported+' voucher(s); '+result.duplicates+' already present.');await refresh();
  }catch(e){setNotice(e instanceof Error?e.message:'Import failed');}finally{setBusy(false);}
 };
 const action=async(slot:Slot,which:'send'|'cancel'|'revoke')=>{
  const prompt=which==='send'?'Release real encrypted Grab vouchers to '+slot.email+'? This may deliver the email immediately and cannot be recalled.':which==='revoke'?'Revoke access to the link? This cannot invalidate codes already viewed.':'Cancel this approved claim before sending?';
  if(!window.confirm(prompt))return;
  setBusy(true);setNotice('');
  try{
   const r=await questApi<{handoff?:string;warning?:string}>('/slots/'+slot.slotId+'/'+which,{method:'POST',body:JSON.stringify({confirmed:true})});
   setNotice(slot.slotId+': '+(r.handoff||'Action recorded')+'. '+(r.warning||''));await onRefresh();await refresh();
  }catch(e){setNotice(e instanceof Error?e.message:'Unable to perform action');}finally{setBusy(false);}
 };
 const sendTest=async()=>{
  if(!window.confirm('Send a dummy email to '+testTo+'? No real codes are included.'))return;
  setBusy(true);setNotice('');
  try{const r=await questApi<{status:string;detail:string}>('/test-email',{method:'POST',body:JSON.stringify({to:testTo,tier,confirmed:true})});setNotice('Test handoff: '+r.status+'. '+r.detail);}
  catch(e){setNotice(e instanceof Error?e.message:'Test email failed');}finally{setBusy(false);}
 };
 return <section className="mt-5 p-4 sm:p-5 border rounded-2xl bg-white space-y-4 text-[#270342]">
  <h2 className="font-bold text-lg">Step 2 · Voucher delivery controls</h2>
  <p className="text-xs">Real emails require explicit admin approval and a separate Quest Power Automate flow. No automatic retries. Do not use real vouchers for tests.</p>
  <p className="text-sm">Quest sending: <strong>{config?.sendEnabled?'Configured':'Disabled / not configured'}</strong> · Encrypted imports: <strong>{config?.importEnabled?'Enabled':'Disabled'}</strong></p>
  <div className="flex gap-3 flex-wrap">{[10000,25000].map(amount=>{const row=stock.find(x=>x.denominationCents===amount);return <div key={amount} className="rounded-xl bg-[#F6F0FB] p-3 text-sm">S${amount/100}: <strong>{row?.unassigned??0} available</strong> / {row?.total??0} imported</div>;})}</div>
  <div className="border rounded-xl p-3 space-y-2">
   <h3 className="font-bold">Secure CSV import</h3>
   <p className="text-xs">Upload the original S$250 or S$100 Grab CSV. Browser parses locally, server encrypts before storage. Never upload to the public kiosk or GitHub.</p>
   <input type="file" accept=".csv,text/csv" disabled={busy||!config?.importEnabled} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/>
  </div>
  <div className="border rounded-xl p-3 space-y-2">
   <h3 className="font-bold">Dummy/test email</h3>
   <p className="text-xs">Simulates the NELBD Quest congratulatory message and uses an invalid example link, never a real voucher.</p>
   <div className="flex flex-wrap gap-2">
    <input className="rounded-lg p-2 flex-1 min-w-[180px]" type="email" placeholder="Staff test email" value={testTo} onChange={e=>setTestTo(e.target.value)}/>
    <select className="rounded-lg p-2" value={tier} onChange={e=>setTier(e.target.value)}>{['first','second','third','consolation'].map(t=><option key={t}>{t}</option>)}</select>
    <button disabled={busy||!config?.sendEnabled||!testTo} onClick={()=>void sendTest()} className="bg-[#270342] text-white px-4 py-2 rounded-lg disabled:opacity-40">Send dummy email</button>
   </div>
  </div>
  <h3 className="font-bold">Approved winners · explicit release only</h3>
  <div className="space-y-2">{slots.filter(s=>['approved','processing','sent','needs_review','cancelled'].includes(s.state)).map(s=><div key={s.slotId} className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
   <div className="text-sm"><strong>{s.slotId}</strong> · S${s.amountCents/100} · {s.name}<span className="block text-xs">{s.email} · {s.state} · {s.deliveryStatus||'No delivery yet'}</span></div>
   <div className="flex gap-2">
    {s.state==='approved'&&<><button disabled={busy||!config?.sendEnabled} className="bg-[#270342] text-white px-3 py-2 rounded-lg disabled:opacity-40" onClick={()=>void action(s,'send')}>Approve & send now</button><button disabled={busy} className="border px-3 py-2 rounded-lg" onClick={()=>void action(s,'cancel')}>Cancel pending</button></>}
    {['processing','sent','needs_review'].includes(s.state)&&<button disabled={busy} className="border px-3 py-2 rounded-lg" onClick={()=>void action(s,'revoke')}>Revoke access</button>}
   </div>
  </div>)}</div>
  {notice&&<p role="status" className="rounded-lg bg-[#F6F0FB] p-3 text-sm">{notice}</p>}
 </section>;
}