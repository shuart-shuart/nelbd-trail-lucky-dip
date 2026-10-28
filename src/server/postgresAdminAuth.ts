import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getPool } from './postgres.ts';

const SESSION_HOURS = 12;
const COOKIE_NAME = 'nelbd_admin_session';
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x,y);
};
export function hashAdminPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  return `scrypt:${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`;
}
export function verifyAdminPassword(password: string, encoded: string): boolean {
  const parts = encoded.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  return safeEqual(hashAdminPassword(password,parts[1]), encoded);
}
function readCookie(req: Request): string | undefined {
  const pair = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE_NAME+'='));
  return pair?.slice(COOKIE_NAME.length+1);
}
export async function loginAdmin(req: Request, res: Response) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || password.length > 256 || !password) return res.status(400).json({error:'Invalid credentials'});
  const result = await getPool().query('SELECT id,email,role,site_access,password_hash FROM admin_accounts WHERE email=$1',[email]);
  const admin = result.rows[0];
  // Constant work even if the account is missing.
  const valid = verifyAdminPassword(password, admin?.password_hash || hashAdminPassword('not-a-real-password','00000000000000000000000000000000'));
  if (!admin || !valid) return res.status(401).json({error:'Invalid credentials'});
  const token = crypto.randomBytes(32).toString('base64url');
  await getPool().query(`INSERT INTO admin_sessions(admin_id,token_hash,expires_at)
    VALUES($1,$2,now()+interval '12 hours')`,[admin.id,hash(token)]);
  res.cookie(COOKIE_NAME,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/admin',maxAge:SESSION_HOURS*3600000});
  return res.json({id:admin.id,email:admin.email,role:admin.role,siteAccess:admin.site_access});
}
export async function requireAdmin(req: Request,res: Response,next: NextFunction) {
  const token = readCookie(req);
  if (!token) return res.status(401).json({error:'Admin sign-in required'});
  const result = await getPool().query(`SELECT a.id,a.email,a.role,a.site_access
    FROM admin_sessions s JOIN admin_accounts a ON a.id=s.admin_id
    WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(token)]);
  if (!result.rowCount) return res.status(401).json({error:'Session expired'});
  res.locals.admin=result.rows[0];
  return next();
}
export async function logoutAdmin(req: Request,res: Response) {
  const token=readCookie(req);
  if (token) await getPool().query('DELETE FROM admin_sessions WHERE token_hash=$1',[hash(token)]);
  res.clearCookie(COOKIE_NAME,{path:'/api/admin'});
  return res.json({ok:true});
}
export function requireSameOrigin(req: Request,res: Response,next: NextFunction) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  const origin=req.get('origin');
  const expected=`${req.protocol}://${req.get('host')}`;
  // Origin required for browser-originating mutating requests; do not allow blind cross-site posts.
  if (!origin || origin!==expected) return res.status(403).json({error:'Invalid request origin'});
  return next();
}
