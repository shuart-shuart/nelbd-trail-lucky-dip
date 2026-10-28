/**
 * Render-compatible one-time migration entrypoint. The default path simply starts
 * the existing server; migrations run only when explicitly authorized.
 * Once the migration deploy succeeds, remove APPLY_NELBD_MIGRATIONS from Render.
 */
import { spawn } from 'node:child_process';

function run(args: string[]): Promise<void> {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--import','tsx',...args],{stdio:'inherit',env:process.env});
    child.once('error',reject);
    child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(`Process failed: ${code??signal}`)));
  });
}
async function main() {
  if (process.env.APPLY_NELBD_MIGRATIONS === 'YES') {
    console.log('Explicitly authorized PostgreSQL migration starting.');
    await run(['scripts/apply-postgres-migrations.ts']);
    console.log('PostgreSQL migration completed. Starting server.');
  }
  if (process.env.CONFIRM_NELBD_ADMIN_BOOTSTRAP === 'YES') {
    console.log('One-time PostgreSQL administrator bootstrap requested.');
    await run(['scripts/bootstrap-postgres-admin.ts']);
    console.log('Administrator bootstrap completed.');
  }
  await run(['server.ts']);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
