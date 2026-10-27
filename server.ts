import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeLuckyDipDraw } from './src/server/drawEngine.ts';
import { requireStaff } from './src/server/firebaseAdmin.ts';
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
    algorithmReady: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    singaporeDate: getSingaporeCalendarDate(),
    timestamp: new Date().toISOString(),
  });
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

// 3. Concurrency-safe atomic server-side draw endpoint
app.post('/api/lucky-dip/draw', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return res.status(503).json({success:false,error:'Prize draws are not configured. Please ask booth crew for assistance.'});
  try {
    const token = /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1] || '';
    await requireStaff(token);
  } catch {
    return res.status(403).json({ success: false, error: 'Staff authorization required. Ask booth crew to sign in.' });
  }
  const body = req.body || {};
  if (typeof body.nickname !== 'string' || typeof body.mobileNumber !== 'string' ||
      !['PDD', 'PS'].includes(body.site) || body.nickname.length > 64 ||
      typeof body.ticketNumber !== 'string' || !/^NELBD-(PDD|PS)-[0-9]{6}$/.test(body.ticketNumber)) {
    return res.status(400).json({ success: false, error: 'Invalid participant or ticket details.' });
  }
  try {
    const result = await executeLuckyDipDraw({
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
