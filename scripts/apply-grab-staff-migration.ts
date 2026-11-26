import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {getPool} from '../src/server/postgres.ts';
async function main(){
 if(process.env.APPLY_NELBD_GRAB_STAFF_MIGRATION!=='YES')throw Error('Staff migration not authorized');
 const pool=getPool();
 try{
  await pool.query(readFileSync(resolve(process.cwd(),'migrations/021_grab_staff_contact_portal.sql'),'utf8'));
  await pool.query(readFileSync(resolve(process.cwd(),'migrations/022_grab_staff_input_fallback.sql'),'utf8'));
  console.log('NELBD_GRAB_STAFF_CONTACT_SCHEMA_READY');
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Migration failed');process.exitCode=1;});
