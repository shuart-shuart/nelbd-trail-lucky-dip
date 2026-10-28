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
    // Explicit initial stock authorization: 250 units of each of seven prizes at EACH site.
    // This operation is idempotent: it only initializes rows that have never been stocked or claimed.
    if (process.env.NELBD_INITIAL_STOCK_250_EACH_SITE === 'YES') {
      const expectedIds = ['merch-choice','nelbd-fan','nelbd-pencil','nelbd-enamel-pin','nelbd-towel','nelbd-mosquito-patch','grab-voucher'];
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(7102026)');
        const inventory = await client.query(
          'SELECT prize_id, site, allocated_quantity, remaining_quantity, claimed_quantity FROM site_inventory FOR UPDATE'
        );
        const valid = inventory.rows.length === 14 &&
          inventory.rows.every(row => expectedIds.includes(row.prize_id) &&
            ['PDD','PS'].includes(row.site) &&
            Number(row.allocated_quantity) === Number(row.remaining_quantity) + Number(row.claimed_quantity));
        if (!valid) throw new Error('Unexpected inventory catalogue; refusing automatic initial stock.');
        const alreadyStocked = inventory.rows.some(row => Number(row.allocated_quantity) !== 0 || Number(row.claimed_quantity) !== 0);
        if (alreadyStocked) {
          console.log('Initial stock already present; no quantities changed.');
        } else {
          await client.query('UPDATE site_inventory SET allocated_quantity=250, remaining_quantity=250, updated_at=now()');
          console.log('Initialized 250 units per prize per site: 14 rows, 3500 units total.');
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
});
