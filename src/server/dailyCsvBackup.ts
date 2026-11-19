import {getPool} from './postgres.ts';

/** Private operational CSV snapshot for the NELBD mailbox only.
 * This is an export of operational tables, NOT a PostgreSQL disaster-recovery dump.
 * Queries share a repeatable-read read-only transaction for a consistent snapshot.
 */
type Cell=string|number|boolean|Date|null|undefined;
type Attachment={Name:string;ContentBytes:string};
const stringCell=(v:Cell):string=>{
 if(v===null||v===undefined)return '';
 if(v instanceof Date)return v.toISOString();
 return String(v);
};
const escapeCsv=(value:Cell):string=>{
 const raw=stringCell(value);
 // Excel/Sheets formula-injection protection for untrusted nickname/note fields.
 const safe=/^[=+\-@\t\r]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
};
function file(name:string,headers:string[],rows:Record<string,Cell>[]):Attachment{
 const csv='\ufeff'+headers.map(escapeCsv).join(',')+'\r\n'+
  rows.map(row=>headers.map(key=>escapeCsv(row[key])).join(',')).join('\r\n')+'\r\n';
 return {Name:name,ContentBytes:Buffer.from(csv,'utf8').toString('base64')};
}
export async function buildDailyCsvAttachments(date:string):Promise<Attachment[]>{
 const client=await getPool().connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const [people,draws,stock,goodieStock,goodieRedemptions,adjustments]=await Promise.all([
   client.query(`SELECT id,nickname,mobile_number,site,created_at FROM participants ORDER BY created_at,id`),
   client.query(`SELECT d.id,d.ticket_number,d.participant_id,d.prize_id,d.prize_name,d.prize_tier,
      d.site,d.status,d.kiosk_id,d.drawn_at,d.claimed_at,
      r.classification AS review_classification,r.note AS review_note
      FROM draws d LEFT JOIN draw_review_labels r ON r.draw_id=d.id ORDER BY d.drawn_at,d.id`),
   client.query(`SELECT i.prize_id,p.name AS prize_name,i.site,i.allocated_quantity,
      i.remaining_quantity,i.claimed_quantity,i.updated_at
      FROM site_inventory i JOIN prizes p ON p.id=i.prize_id ORDER BY p.name,i.site`),
   client.query(`SELECT site,total_quantity,redeemed_quantity,updated_at
      FROM goodie_bag_inventory ORDER BY site`),
   client.query(`SELECT id,participant_id,draw_id,site,scenario,issued_by,redeemed_at
      FROM goodie_bag_redemptions ORDER BY redeemed_at,id`),
   client.query(`SELECT id,prize_id,site,previous_quantity,new_quantity,delta,reason,adjusted_by,created_at
      FROM inventory_adjustments ORDER BY created_at,id`)
  ]);
  await client.query('COMMIT');
  const files=[
   file('nelbd_participants_'+date+'.csv',['id','nickname','mobile_number','site','created_at'],people.rows),
   file('nelbd_draws_'+date+'.csv',['id','ticket_number','participant_id','prize_id','prize_name','prize_tier','site','status','kiosk_id','drawn_at','claimed_at','review_classification','review_note'],draws.rows),
   file('nelbd_prize_stock_'+date+'.csv',['prize_id','prize_name','site','allocated_quantity','remaining_quantity','claimed_quantity','updated_at'],stock.rows),
   file('nelbd_goodie_stock_'+date+'.csv',['site','total_quantity','redeemed_quantity','updated_at'],goodieStock.rows),
   file('nelbd_goodie_handovers_'+date+'.csv',['id','participant_id','draw_id','site','scenario','issued_by','redeemed_at'],goodieRedemptions.rows),
   file('nelbd_stock_audit_'+date+'.csv',['id','prize_id','site','previous_quantity','new_quantity','delta','reason','adjusted_by','created_at'],adjustments.rows)
  ];
  const encodedBytes=files.reduce((n,f)=>n+f.ContentBytes.length,0);
  if(encodedBytes>7_000_000)throw Error('CSV_BACKUP_EXCEEDS_EMAIL_LIMIT');
  return files;
 }catch(e){
  await client.query('ROLLBACK').catch(()=>{});
  throw e;
 }finally{client.release();}
}
