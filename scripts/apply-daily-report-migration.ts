import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {getPool} from '../src/server/postgres.ts';
async function main(){
 if(process.env.APPLY_NELBD_DAILY_REPORT_MIGRATION!=='YES')throw Error('Daily report migration is not authorized');
 const pool=getPool();
 try{
  const sql=readFileSync(resolve(process.cwd(),'migrations/017_daily_lucky_dip_email.sql'),'utf8');
  await pool.query(sql);
  const powerAutomateSql=readFileSync(resolve(process.cwd(),'migrations/018_daily_report_power_automate.sql'),'utf8');
  await pool.query(powerAutomateSql);
  console.log('NELBD_DAILY_REPORT_POWER_AUTOMATE_SCHEMA_READY');
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Migration failed');process.exitCode=1});
