import {createDecipheriv} from 'node:crypto';

/** Decryption stays server-side and must only be used by authorized admin actions. */
export function decryptGrabCredential(payload:string):string {
 const key=Buffer.from(process.env.NELBD_VOUCHER_ENCRYPTION_KEY||'','base64');
 if(key.length!==32)throw new Error('Voucher encryption not configured');
 const data=Buffer.from(payload,'base64');
 if(data.length<29)throw new Error('Invalid encrypted voucher');
 const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
 decipher.setAuthTag(data.subarray(12,28));
 return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8');
}
