import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPool } from '../src/server/postgres.ts';

/**
 * Run only as a one-off Render shell command after confirming the target database.
 * Requires APPLY_NELBD_MIGRATIONS=YES and DATABASE_URL; never executes on app startup.
 */
async function main() {
  if (process.env.APPLY_NELBD_MIGRATIONS !== 'YES') {
    throw new Error('Migration disabled. Set APPLY_NELBD_MIGRATIONS=YES for a one-off run.');
  }
  const pool = getPool();
  try {
    const identity = await pool.query('SELECT current_database() AS name, current_user AS username');
    console.log('Applying NELBD migrations to database:', identity.rows[0].name);
    for (const file of ['001_inventory_catalog.sql','002_core_tables.sql','003_daily_top_awards.sql']) {
      const sql = readFileSync(resolve(process.cwd(), 'migrations', file), 'utf8');
      await pool.query(sql);
      console.log('Applied:', file);
    }
    const result = await pool.query(`SELECT (SELECT count(*) FROM prizes) AS prizes,
      (SELECT count(*) FROM site_inventory) AS site_inventory_rows,
      (SELECT coalesce(sum(remaining_quantity),0) FROM site_inventory) AS remaining_units`);
    console.log('Migration counts:', JSON.stringify(result.rows[0]));
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
});
