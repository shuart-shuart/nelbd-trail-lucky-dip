/**
 * One-off admin bootstrap. Run from the Render private network after migrations.
 * Requires DATABASE_URL, NELBD_BOOTSTRAP_EMAIL and NELBD_BOOTSTRAP_PASSWORD.
 * Never prints or persists the plaintext password.
 */
import { getPool } from '../src/server/postgres.ts';
import { hashAdminPassword } from '../src/server/postgresAdminAuth.ts';

async function main() {
  if (process.env.CONFIRM_NELBD_ADMIN_BOOTSTRAP !== 'YES') {
    throw new Error('Set CONFIRM_NELBD_ADMIN_BOOTSTRAP=YES to authorize bootstrap.');
  }
  const email = (process.env.NELBD_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const password = process.env.NELBD_BOOTSTRAP_PASSWORD || '';
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) throw new Error('Valid admin email required.');
  if (password.length < 16 || password.length > 256) throw new Error('Password must be 16–256 characters.');
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM admin_accounts WHERE role=$1 FOR UPDATE',['super_admin']);
    if (existing.rowCount) throw new Error('A super-admin already exists; bootstrap is disabled.');
    await client.query(
      'INSERT INTO admin_accounts(email,password_hash,role,site_access) VALUES($1,$2,$3,$4)',
      [email,hashAdminPassword(password),'super_admin','ALL']
    );
    await client.query('COMMIT');
    console.log('Initial super-admin created successfully.');
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Bootstrap failed'); process.exitCode=1; });
