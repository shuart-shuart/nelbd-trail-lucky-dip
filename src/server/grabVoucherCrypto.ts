import {createCipheriv,createHmac,randomBytes} from 'node:crypto';

/** Server-only voucher secrets; never expose these in client bundles or logs. */
function key():Buffer {
  const raw=process.env.NELBD_VOUCHER_ENCRYPTION_KEY||'';
  const decoded=Buffer.from(raw,'base64');
  if(decoded.length!==32)throw new Error('Voucher encryption key not configured');
  return decoded;
}
export function fingerprint(value:string):string {
  return createHmac('sha256',key()).update(value,'utf8').digest('hex');
}
export function encryptVoucher(value:string):string {
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key(),iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');
}
