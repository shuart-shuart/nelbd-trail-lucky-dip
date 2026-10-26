import type { IncomingMessage, ServerResponse } from 'http';
import { executeLuckyDipDraw, getSingaporeCalendarDate } from './drawEngine.ts';

interface DrawRequestBody {
  ticketNumber?: string;
  nickname?: string;
  mobileNumber?: string;
  site?: 'PDD' | 'PS';
  kioskId?: string;
}

export function handleLuckyDipApi(req: IncomingMessage, res: ServerResponse): boolean {
  const url = req.url || '';

  if (!url.startsWith('/api/lucky-dip')) {
    return false;
  }

  res.setHeader('Content-Type', 'application/json');

  // Handle GET /api/lucky-dip/status
  if (req.method === 'GET' && (url === '/api/lucky-dip/status' || url === '/api/lucky-dip/status/')) {
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        status: 'operational',
        service: 'NELBD Trail Lucky Dip Secure Server Engine',
        supportedSites: ['PDD', 'PS'],
        tiers: ['STANDARD', 'TOP'],
        algorithmReady: true,
        singaporeDate: getSingaporeCalendarDate(),
        timestamp: new Date().toISOString(),
      })
    );
    return true;
  }

  // Handle POST /api/lucky-dip/validate-participant
  if (req.method === 'POST' && url.includes('/validate-participant')) {
    let bodyStr = '';
    req.on('data', (chunk) => {
      bodyStr += chunk;
    });
    req.on('end', () => {
      try {
        const body = JSON.parse(bodyStr || '{}');
        const nickname = (body.nickname || '').trim();
        const mobile = (body.mobileNumber || '').replace(/[\s\-\(\)]/g, '');
        const site = body.site === 'PS' ? 'PS' : 'PDD';

        if (!nickname) {
          res.statusCode = 400;
          res.end(JSON.stringify({ valid: false, error: 'Nickname is required.' }));
          return;
        }

        const isSgMobile = /^(\+65)?[89]\d{7}$/.test(mobile);
        if (!isSgMobile) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              valid: false,
              error: 'Please enter a valid Singapore mobile number (8 digits starting with 8 or 9).',
            })
          );
          return;
        }

        const normalizedMobile = mobile.startsWith('+65') ? mobile : `+65${mobile}`;

        res.statusCode = 200;
        res.end(
          JSON.stringify({
            valid: true,
            nickname,
            normalizedMobile,
            site,
            message: `Participant validated for Station ${site}.`,
          })
        );
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ valid: false, error: 'Invalid JSON request payload.' }));
      }
    });
    return true;
  }

  // Handle POST /api/lucky-dip/draw
  // Secure server-side draw function utilizing Firestore transactions
  if (req.method === 'POST' && (url === '/api/lucky-dip/draw' || url === '/api/lucky-dip/draw/')) {
    let bodyStr = '';
    req.on('data', (chunk) => {
      bodyStr += chunk;
    });
    req.on('end', async () => {
      try {
        const body: DrawRequestBody = JSON.parse(bodyStr || '{}');
        const site = body.site === 'PS' ? 'PS' : 'PDD';
        const nickname = (body.nickname || '').trim();
        const mobileNumber = (body.mobileNumber || '').trim();
        const kioskId = body.kioskId || `KIOSK-${site}-01`;
        const ticketNumber = body.ticketNumber;

        // Execute atomic, concurrency-safe server-side draw
        const drawResult = await executeLuckyDipDraw({
          nickname,
          mobileNumber,
          site,
          kioskId,
          ticketNumber,
        });

        if (!drawResult.success) {
          res.statusCode = 400;
          res.end(JSON.stringify(drawResult));
          return;
        }

        res.statusCode = 200;
        res.end(JSON.stringify(drawResult));
      } catch (err: any) {
        console.error('Server error handling draw:', err);
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            success: false,
            error: 'Server draw execution error. Please try again.',
          })
        );
      }
    });
    return true;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Endpoint not found in Lucky Dip API' }));
  return true;
}
