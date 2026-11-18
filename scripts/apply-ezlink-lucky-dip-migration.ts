/** One-time opt-in migration of already-confirmed 440 physical ez-link Cards into normal Lucky Dip.
 * Does not update the Goodie Bag reward or its inventory.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {getPool} from '../src/server/postgres.ts';
async function main(){
 if(process.env.APPLY_NELBD_EZLINK_LUCKY_DIP_MIGRATION!=='YES')
  throw Error('ez-link Lucky Dip conversion not explicitly authorized');
 if(process.env.DRAW_BACKEND!=='postgres'||process.env.NELBD_GOODIE_BAG_ENABLED!=='YES')
  throw Error('Refusing conversion without PostgreSQL draw engine and active Goodie Bag reward');
 const pool=getPool();
 try{
  const sql=readFileSync(resolve(process.cwd(),'migrations/016_ezlink_card_lucky_dip.sql'),'utf8');
  await pool.query(sql);
  const {rows}=await pool.query(`SELECT p.name,p.is_active,p.tier,i.site,i.allocated_quantity,
   i.remaining_quantity,i.claimed_quantity
   FROM prizes p JOIN site_inventory i ON i.prize_id=p.id
   WHERE p.id='ezlink-card' ORDER BY i.site`);
  const {rows:[old]}=await pool.query('SELECT total_quantity,redeemed_quantity FROM ezlink_inventory WHERE id=1');
  if(rows.length!==2||rows.some(x=>!x.is_active||x.tier!=='STANDARD'||
      Number(x.allocated_quantity)!==220)||
     Number(old.total_quantity)!==1||Number(old.redeemed_quantity)!==1)
    throw Error('Post-conversion check failed: inspect database before further changes');
  console.log('EZLINK_LUCKY_DIP_READY',JSON.stringify({sites:rows,legacy:old}));
  console.log('The 1 historical ez-link test claim remains in the old ledger. Goodie Bag stock was not modified.');
 }finally{await pool.end()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Conversion failed');process.exitCode=1});
