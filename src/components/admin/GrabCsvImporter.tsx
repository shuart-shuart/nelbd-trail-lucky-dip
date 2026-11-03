import React,{useState} from 'react';
type VoucherRow={code:string;url:string;startsAt:string;expiresAt:string;country:'SG';status:'ISSUED';denominationCents:500};
function parseDate(s:string):string{
 const match=s.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{2}) (\d{2}):(\d{2}) ([+]\d{2})$/);
 if(!match)throw Error('Unexpected date format');
 const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 const month=months.indexOf(match[2]);if(month<0)throw Error('Invalid month');
 const iso='20'+match[3]+'-'+String(month+1).padStart(2,'0')+'-'+match[1].padStart(2,'0')+'T'+match[4]+':'+match[5]+':00'+match[6]+':00';
 if(!Number.isFinite(new Date(iso).getTime()))throw Error('Invalid date');
 return iso;
}
export function GrabCsvImporter({onImported}:{onImported:()=>void}){
 const [progress,setProgress]=useState('');
 const [busy,setBusy]=useState(false);
 const upload=async(files:FileList|null)=>{
  if(!files?.length||busy)return;
  setBusy(true);setProgress('Validating CSV files…');
  try{
   let imported=0,duplicates=0,processed=0;
   for(const file of Array.from(files)){
    if(!file.name.toLowerCase().endsWith('.csv')||file.size>3000000)throw Error('Select CSV files under 3 MB each');
    const lines=(await file.text()).replace(/^\uFEFF/,'').trim().split(/\r?\n/);
    const header=lines.shift()?.split(',').map(s=>s.trim().replace(/^"|"$/g,''))||[];
    const expected=['Gift Link','Gift Code','Country','Denomination Value','Starts At','Expires At','Status','Status Change Time'];
    if(header.join('|')!==expected.join('|'))throw Error('Unexpected CSV columns in '+file.name);
    const batch=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
    for(let offset=0;offset<lines.length;offset+=100){
     const rows:VoucherRow[]=lines.slice(offset,offset+100).filter(Boolean).map(line=>{
      const values=line.split(',').map(v=>v.trim().replace(/^"|"$/g,''));
      if(values.length!==8||values[2]!=='SG'||values[3]!=='SGD 5'||values[6]!=='ISSUED')
       throw Error('Invalid voucher record in '+file.name);
      return {url:values[0],code:values[1],country:'SG',denominationCents:500,
       startsAt:parseDate(values[4]),expiresAt:parseDate(values[5]),status:'ISSUED'};
     });
     const response=await fetch('/api/admin/grab-vouchers/import-batch',{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({batch,rows})
     });
     const result=await response.json();
     if(!response.ok)throw Error(result.error||'Import failed');
     imported+=result.imported;duplicates+=result.duplicates;processed+=rows.length;
     setProgress('Processed '+processed+' records · '+imported+' imported · '+duplicates+' duplicates');
    }
   }
   setProgress('Complete: '+imported+' imported, '+duplicates+' already present. Codes remain encrypted.');
   onImported();
  }catch(e){setProgress('Import stopped: '+(e instanceof Error?e.message:'Unknown error'));}
  finally{setBusy(false);}
 };
 return <section className="mb-4 rounded-xl border border-[#DDD2E8] p-4">
  <h3 className="font-bold text-sm">Secure Grab voucher CSV import</h3>
  <p className="text-xs my-2">Super-admin only. Import must be explicitly enabled on the server and a voucher encryption key configured. Records are encrypted and duplicate-safe. Imported vouchers are not eligible before their start date.</p>
  <input type="file" accept=".csv,text/csv" multiple disabled={busy}
   onChange={e=>void upload(e.target.files)} className="block w-full text-sm"/>
  {progress&&<p role="status" className="mt-2 text-xs">{progress}</p>}
 </section>;
}
