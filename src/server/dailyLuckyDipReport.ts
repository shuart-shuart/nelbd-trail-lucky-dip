import {getPool} from './postgres.ts';

export type Hub='PDD'|'PS';
export const REPORT_RECIPIENTS=['nelbd2026@gmail.com','bernando@farm.sg','selwyn@farm.sg'] as const;
const SGT='Asia/Singapore';
const count=(n:unknown)=>Number(n)||0;
export const singaporeDate=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:SGT,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export type DailyReport={
 date:string;cutoff:string;timezone:string;
 draws:{PDD:number;PS:number;total:number};
 goodieBags:{PDD:number;PS:number;total:number};
 prizeBreakdown:{name:string;PDD:number;PS:number;total:number}[];
 stock:{name:string;PDD:number;PS:number;total:number}[];
 goodieStock:{PDD:number;PS:number;total:number};
 lowStock:{name:string;site:Hub;remaining:number}[];
 excluded:{test:number;error:number};
};
export async function buildDailyReport(date:string):Promise<DailyReport>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)
  throw Error('INVALID_DATE');
 // The report is an as-of 22:30 snapshot of the Singapore calendar day.
 // For any previous date, inventory values are current, not reconstructed past stock.
 const params=[date];
 const today=singaporeDate();
 if(date!==today)throw Error('ONLY_CURRENT_DAY_SUPPORTED');
 const range=`(d.drawn_at AT TIME ZONE 'Asia/Singapore')::date=$1::date
  AND (d.drawn_at AT TIME ZONE 'Asia/Singapore')::time<time '22:30'`;
 const pool=getPool();
 const [draws,excluded,goods,inventory,goodieInventory]=await Promise.all([
  pool.query(`SELECT d.site,d.prize_name,count(*)::int AS n FROM draws d
     LEFT JOIN draw_review_labels lbl ON lbl.draw_id=d.id
     WHERE ${range} AND lbl.classification IS DISTINCT FROM 'test'
       AND lbl.classification IS DISTINCT FROM 'error'
     GROUP BY d.site,d.prize_name ORDER BY d.prize_name,d.site`,params),
  pool.query(`SELECT lbl.classification,count(*)::int AS n FROM draws d
     JOIN draw_review_labels lbl ON lbl.draw_id=d.id
     WHERE ${range} AND lbl.classification IN ('test','error')
     GROUP BY lbl.classification`,params),
  pool.query(`SELECT site,count(*)::int AS n FROM goodie_bag_redemptions
     WHERE (redeemed_at AT TIME ZONE 'Asia/Singapore')::date=$1::date
       AND (redeemed_at AT TIME ZONE 'Asia/Singapore')::time<time '22:30'
     GROUP BY site`,params),
  pool.query(`SELECT p.name,i.site,i.remaining_quantity AS remaining
     FROM site_inventory i JOIN prizes p ON p.id=i.prize_id
     ORDER BY p.name,i.site`),
  pool.query('SELECT site,total_quantity-redeemed_quantity AS remaining FROM goodie_bag_inventory')
 ]);
 const prizeMap=new Map<string,{name:string;PDD:number;PS:number;total:number}>();
 const drawTotals={PDD:0,PS:0,total:0};
 for(const row of draws.rows){
  const site:Hub=row.site;if(site!=='PDD'&&site!=='PS')continue;
  const n=count(row.n),name=String(row.prize_name);
  const prize=prizeMap.get(name)||{name,PDD:0,PS:0,total:0};
  prize[site]+=n;prize.total+=n;prizeMap.set(name,prize);
  drawTotals[site]+=n;drawTotals.total+=n;
 }
 const bag={PDD:0,PS:0,total:0};
 for(const row of goods.rows){if(row.site==='PDD'||row.site==='PS'){const n=count(row.n);bag[row.site]+=n;bag.total+=n;}}
 const stockMap=new Map<string,{name:string;PDD:number;PS:number;total:number}>();
 const lowStock:{name:string;site:Hub;remaining:number}[]=[];
 for(const row of inventory.rows){
  const site:Hub=row.site;if(site!=='PDD'&&site!=='PS')continue;
  const name=String(row.name),n=count(row.remaining);
  const item=stockMap.get(name)||{name,PDD:0,PS:0,total:0};
  item[site]=n;item.total+=n;stockMap.set(name,item);
  if(n<=10)lowStock.push({name,site,remaining:n});
 }
 const bagStock={PDD:0,PS:0,total:0};
 for(const row of goodieInventory.rows){if(row.site==='PDD'||row.site==='PS'){const n=count(row.remaining);bagStock[row.site]=n;bagStock.total+=n;if(n<=10)lowStock.push({name:'NELBD Goodie Bag',site:row.site,remaining:n});}}
 const labels={test:0,error:0};
 for(const row of excluded.rows){if(row.classification==='test'||row.classification==='error')labels[row.classification]=count(row.n);}
 return {date,cutoff:'22:30',timezone:SGT,draws:drawTotals,goodieBags:bag,prizeBreakdown:[...prizeMap.values()].sort((a,b)=>a.name.localeCompare(b.name)),
  stock:[...stockMap.values()].sort((a,b)=>a.name.localeCompare(b.name)),goodieStock:bagStock,lowStock,excluded:labels};
}
export function reportEmail(r:DailyReport){
 const line=(name:string,pdd:number,ps:number)=>`${name.padEnd(27)} PDD ${String(pdd).padStart(4)} · PS ${String(ps).padStart(4)} · Total ${pdd+ps}`;
 return [
  `NELBD Daily Lucky Dip Report — ${r.date} (as of 10:30 PM SGT)`,
  '',
  'LUCKY DIP DRAWS',
  line('All Lucky Dip draws',r.draws.PDD,r.draws.PS),
  ...r.prizeBreakdown.map(p=>line(p.name,p.PDD,p.PS)),
  '',
  'GOODIE BAG HANDOVERS',
  line('NELBD Goodie Bags',r.goodieBags.PDD,r.goodieBags.PS),
  '',
  'REMAINING STOCK (SNAPSHOT AT SEND TIME)',
  ...r.stock.map(p=>line(p.name,p.PDD,p.PS)),
  line('Goodie Bags remaining',r.goodieStock.PDD,r.goodieStock.PS),
  '',
  'LOW STOCK (10 OR FEWER UNITS AT A HUB)',
  ...(r.lowStock.length?r.lowStock.map(x=>`• ${x.name} at ${x.site}: ${x.remaining} left`):['None']),
  '',
  `EXCLUDED FROM OPERATIONAL DRAWS: ${r.excluded.test} test; ${r.excluded.error} error.`,
  '',
  'Only draws and Goodie Bag handovers before 10:30 PM SGT are counted. Stock is a current snapshot.',
  'No participant names, phone numbers or unique identifiers included.',
 ].join('\n');
}
