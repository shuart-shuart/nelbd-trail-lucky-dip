/** Opt-in Quest-only migration. Never applies or resets existing Lucky Dip tables. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {getPool} from '../src/server/postgres.ts';

async function main(){
 if(process.env.APPLY_NELBD_QUEST_MIGRATIONS!=='YES')throw new Error('Quest migrations disabled');
 const pool=getPool();
 try{
  const db=await pool.query('SELECT current_database() AS name');
  console.log('Applying additive NELBD Quest migrations to:',db.rows[0].name);
  for(const file of ['009_quest_grand_prizes.sql','010_quest_test_delivery.sql']){
   const sql=readFileSync(resolve(process.cwd(),'migrations',file),'utf8');
   await pool.query(sql);
   console.log('Applied:',file);
  }
  const check=await pool.query('SELECT count(*)::int AS slots, coalesce(sum(prize_cents),0)::int AS value_cents FROM quest_prize_slots');
  if(check.rows[0].slots!==20||check.rows[0].value_cents!==840000)
    throw new Error('Unexpected Quest prize totals; please review the database');
  console.log('Quest slots ready:',check.rows[0].slots);
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Quest migration error');process.exitCode=1;});
