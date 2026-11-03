import {createDecipheriv} from 'node:crypto';

function decryptVoucher(payload:string):string {
  const key=Buffer.from(process.env.NELBD_VOUCHER_ENCRYPTION_KEY||'','base64');
  if(key.length!==32)throw new Error('Voucher key unavailable');
  const data=Buffer.from(payload,'base64');
  const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
  decipher.setAuthTag(data.subarray(12,28));
  return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8');
}
function encoded(s:string):string {return Buffer.from(s,'utf8').toString('base64url');}
async function gmailAccessToken():Promise<string> {
  const clientId=process.env.NELBD_GMAIL_CLIENT_ID;
  const secret=process.env.NELBD_GMAIL_CLIENT_SECRET;
  const refresh=process.env.NELBD_GMAIL_REFRESH_TOKEN;
  if(!clientId||!secret||!refresh)throw new Error('Gmail OAuth not configured');
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:clientId,client_secret:secret,refresh_token:refresh,grant_type:'refresh_token'})
  });
  if(!response.ok)throw new Error('Gmail OAuth token request failed');
  const result=await response.json() as {access_token?:string};
  if(!result.access_token)throw new Error('Gmail OAuth access token missing');
  return result.access_token;
}
/** Must only be called by an explicitly authorized, idempotent delivery worker. */
export async function sendGrabVoucherEmail(recipient:string,codeCiphertext:string,urlCiphertext:string,expiresAt:Date):Promise<string> {
  if(process.env.NELBD_GMAIL_SEND_ENABLED!=='YES')throw new Error('Live Gmail sending disabled');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)||/[\r\n]/.test(recipient))
    throw new Error('Invalid recipient');
  const code=decryptVoucher(codeCiphertext),link=decryptVoucher(urlCiphertext);
  const expires=new Intl.DateTimeFormat('en-SG',{dateStyle:'long',timeZone:'Asia/Singapore'}).format(expiresAt);
  const body=[
    'Congratulations on winning a S$5 Grab voucher at NELBD Trail Lucky Dip!',
    '', 'Your Grab gift code: '+code, 'Your official Grab gift link: '+link,
    '', 'Open the link or redeem the code using the Grab app.',
    'Voucher expiry (Singapore time): '+expires,
    '', 'Please keep this email private. Terms and conditions apply.'
  ].join('\r\n');
  const raw=[
    'From: NELBD Trail Lucky Dip <nelbd2026@gmail.com>',
    'To: '+recipient,
    'Subject: Your NELBD S$5 Grab voucher',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',Buffer.from(body,'utf8').toString('base64')
  ].join('\r\n');
  const accessToken=await gmailAccessToken();
  const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
    method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
    body:JSON.stringify({raw:encoded(raw)})
  });
  if(!response.ok)throw new Error('Gmail API delivery request failed ('+response.status+')');
  const data=await response.json() as {id?:string};
  if(!data.id)throw new Error('Gmail API returned no message ID');
  return data.id;
}
