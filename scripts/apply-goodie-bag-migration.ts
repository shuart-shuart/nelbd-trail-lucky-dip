/** Explicit one-time NELBD Goodie Bag-only migration. Never touches card inventory. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {getPool} from '../src/server/postgres.ts';
async function main(){
 if(process.env.APPLY_NELBD_GOODIE_BAG_MIGRATION!=='YES')throw Error('Goodie Bag migration not authorized');
 const pool=getPool();
 try{
  const sql=readFileSync(resolve(process.cwd(),'migrations/015_goodie_bag_only.sql'),'utf8');
  await pool.query(sql);
  const {rows}=await pool.query("SELECT site,total_quantity,redeemed_quantity FROM goodie_bag_inventory ORDER BY site");
  if(rows.length!==2||rows.some(x=>x.total_quantity!==50||x.redeemed_quantity!==0))
   throw Error('Unexpected Goodie Bag opening balances');
  console.log('Goodie Bag migration complete: PDD=50, PS=50. Existing ez-link data unchanged.');
 }finally{await pool.end()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
