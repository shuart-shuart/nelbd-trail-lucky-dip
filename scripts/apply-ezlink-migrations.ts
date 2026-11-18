/** Opt-in additive ez-link schema migration. Does not alter Lucky Dip or Quest inventory. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {getPool} from '../src/server/postgres.ts';
async function main(){
 if(process.env.APPLY_NELBD_EZLINK_MIGRATIONS!=='YES')throw new Error('ez-link migration disabled');
 const pool=getPool();
 try{
  for(const file of ['011_ezlink_redemption.sql','012_ezlink_staff_pin.sql','013_ezlink_inventory_notes.sql','014_ezlink_per_hub_inventory.sql','014_ezlink_hub_inventory.sql']){
   const sql=readFileSync(resolve(process.cwd(),'migrations',file),'utf8');
   await pool.query(sql);
  }
  const {rows}=await pool.query('SELECT total_quantity,redeemed_quantity FROM ezlink_inventory WHERE id=1');
  if(rows.length!==1)throw new Error('ez-link stock row missing');
  console.log('Applied additive ez-link schema. Current total:',rows[0].total_quantity,'redeemed:',rows[0].redeemed_quantity);
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Migration failed');process.exitCode=1;});
