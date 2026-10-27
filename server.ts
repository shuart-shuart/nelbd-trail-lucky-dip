import express from 'express';
import { checkPostgres } from './src/server/postgres.ts';
import { postgresAdminRouter } from './src/server/postgresAdminRoutes.ts';
import { executePostgresLuckyDipDraw, checkPostgresMobileHasDrawn } from './src/server/postgresDrawEngine.ts';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeLuckyDipDraw } from './src/server/drawEngine.ts';
import { requireStaff, db } from './src/server/firebaseAdmin.ts';
function getSingaporeCalendarDate(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Enable JSON body parsing for API endpoints
app.use(express.json());

// PostgreSQL admin API is isolated behind a migration flag until the dashboard is migrated.
if (process.env.ENABLE_POSTGRES_ADMIN_API === 'true') {
  app.use('/api/admin', postgresAdminRouter);
}

// ---------------------------------------------------------------------------
// LUCKY DIP BACKEND API ROUTES
// ---------------------------------------------------------------------------

// 1. Health and status endpoint
app.get('/api/lucky-dip/status', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    status: 'operational',
    service: 'NELBD Trail Lucky Dip Secure Server Engine',
    supportedSites: ['PDD', 'PS'],
    tiers: ['STANDARD', 'TOP'],
    algorithmReady: process.env.DRAW_BACKEND === 'postgres' ? Boolean(process.env.DATABASE_URL) : Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (process.env.GCP_WORKLOAD_IDENTITY_PROVIDER && process.env.GCP_SERVICE_ACCOUNT_EMAIL)),
    singaporeDate: getSingaporeCalendarDate(),
    timestamp: new Date().toISOString(),
  });
});

// Read-only migration diagnostic. Does not switch the active Firebase draw route.
app.get('/api/migration/postgres-health', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.DATABASE_URL) return res.status(503).json({ ready: false, reason: 'DATABASE_URL_NOT_SET' });
  try {
    const ready = await checkPostgres();
    return res.status(ready ? 200 : 503).json({ ready, database: 'postgresql' });
  } catch (err) {
    console.error('PostgreSQL health check failed:', err instanceof Error ? err.message : 'unknown');
    return res.status(503).json({ ready: false, reason: 'DATABASE_CONNECTION_FAILED' });
  }
});

// 2. Participant validation endpoint
app.post('/api/lucky-dip/validate-participant', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const body = req.body || {};
  const nickname = (body.nickname || '').trim();
  const mobile = (body.mobileNumber || '').replace(/[\s\-\(\)]/g, '');
  const site = body.site === 'PS' ? 'PS' : 'PDD';

  if (!nickname) {
    return res.status(400).json({ valid: false, error: 'Nickname is required.' });
  }

  const isSgMobile = /^(\+65)?[89]\d{7}$/.test(mobile);
  if (!isSgMobile) {
    return res.status(400).json({
      valid: false,
      error: 'Please enter a valid Singapore mobile number (8 digits starting with 8 or 9).',
    });
  }

  const normalizedMobile = mobile.startsWith('+65') ? mobile : `+65${mobile}`;

  return res.json({
    valid: true,
    nickname,
    normalizedMobile,
    site,
    message: `Participant validated for Station ${site}.`,
  });
});

// Duplicate check only returns a boolean; never exposes participant PII.
app.post('/api/lucky-dip/check-mobile', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.DRAW_BACKEND !== 'postgres') return res.status(404).json({ error: 'Unavailable' });
  const mobile = req.body?.mobileNumber;
  if (typeof mobile !== 'string' || mobile.length > 24) return res.status(400).json({error:'Invalid mobile'});
  try { return res.json({ alreadyDrawn: await checkPostgresMobileHasDrawn(mobile) }); }
  catch { return res.status(503).json({error:'Duplicate check unavailable'}); }
});

// Staff-only, read-only diagnostic. Never modifies inventory or participant records.
app.get('/api/lucky-dip/staff-check', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const token = /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1] || '';
  if (!token) return res.status(401).json({ ok: false, stage: 'sign-in', error: 'Sign in with the authorized staff Google account.' });
  let staffId: string;
  try {
    staffId = await requireStaff(token);
  } catch (err: any) {
    console.error('Staff verification failed:', err?.code || err?.message || 'unknown');
    return res.status(403).json({ ok: false, stage: 'staff-authorization', error: 'Staff account not authorized or token verification unavailable.' });
  }
  try {
    await db.doc('settings/luckyDip').get();
    return res.json({ ok: true, stage: 'ready', staffVerified: Boolean(staffId), firestoreReachable: true });
  } catch (err: any) {
    console.error('Firestore credential probe failed:', err?.code || err?.message || 'unknown');
    return res.status(503).json({ ok: false, stage: 'firestore-credentials', error: 'Google Cloud credentials or Firestore access unavailable.' });
  }
});

const drawAttempts = new Map<string, number[]>();

// 3. Concurrency-safe atomic server-side draw endpoint
app.post('/api/lucky-dip/draw', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.DRAW_BACKEND !== 'postgres' && !(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (process.env.GCP_WORKLOAD_IDENTITY_PROVIDER && process.env.GCP_SERVICE_ACCOUNT_EMAIL))) return res.status(503).json({success:false,error:'Prize draws are not configured. Please ask booth crew for assistance.'});
  // Staff checks the physical booklet before sharing the kiosk. No additional
  // Google sign-in is required for participants; duplicate and inventory rules
  // remain enforced atomically by executeLuckyDipDraw.
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = drawAttempts.get(ip) || [];
  const withinWindow = recent.filter((time) => now - time < 60_000);
  if (withinWindow.length >= 30) {
    return res.status(429).json({ success: false, error: 'Too many attempts. Please wait a moment and try again.' });
  }
  withinWindow.push(now);
  drawAttempts.set(ip, withinWindow);
  if (drawAttempts.size > 2000) {
    for (const [key, attempts] of drawAttempts) {
      if (!attempts.some((time) => now - time < 60_000)) drawAttempts.delete(key);
    }
  }
  const body = req.body || {};
  if (typeof body.nickname !== 'string' || typeof body.mobileNumber !== 'string' ||
      !['PDD', 'PS'].includes(body.site) || body.nickname.length > 64 ||
      typeof body.ticketNumber !== 'string' || !/^NELBD-(PDD|PS)-[0-9]{6}$/.test(body.ticketNumber)) {
    return res.status(400).json({ success: false, error: 'Invalid participant or ticket details.' });
  }
  try {
    const result = await (process.env.DRAW_BACKEND === 'postgres' ? executePostgresLuckyDipDraw : executeLuckyDipDraw)({
      nickname: body.nickname, mobileNumber: body.mobileNumber,
      site: body.site, ticketNumber: body.ticketNumber,
      kioskId: typeof body.kioskId === 'string' ? body.kioskId.slice(0, 64) : undefined,
    });
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Draw failed', error);
    return res.status(503).json({ success: false, error: 'Draw unavailable. Please ask booth crew for assistance.' });
  }
});

// ---------------------------------------------------------------------------
// VITE MIDDLEWARE (DEV) / STATIC FILE SERVING (PROD)
// ---------------------------------------------------------------------------
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lucky Dip server running on port ${PORT} [${isProduction ? 'production' : 'development'}]`);
  });
}

startServer();
