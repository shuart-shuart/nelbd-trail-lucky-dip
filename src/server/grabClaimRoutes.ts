import {Router} from 'express';
import {createHash} from 'node:crypto';
import {getPool} from './postgres.ts';

export const grabClaimRouter=Router();
grabClaimRouter.post('/submit-email',async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(process.env.NELBD_GRAB_FULFILMENT_ENABLED!=='YES')
    return res.status(423).json({error:'Voucher fulfilment is not yet enabled'});
  const token=req.body?.claimToken,email=req.body?.email;
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{40,100}$/.test(token)||
     typeof email!=='string'||email.length>254||
     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return res.status(400).json({error:'Enter a valid email address'});
  const hash=createHash('sha256').update(token).digest('hex');
  try {
    const {rows}=await getPool().query(`UPDATE grab_voucher_claim_sessions
      SET recipient_email=$2,status='queued',updated_at=now()
      WHERE token_hash=$1 AND status='awaiting_email'
      RETURNING draw_id`,[hash,email.trim().toLowerCase()]);
    if(!rows.length)return res.status(409).json({error:'This claim has already been submitted or has expired. Please ask booth staff for help.'});
    return res.json({accepted:true,message:process.env.NELBD_POWER_AUTOMATE_ENABLED==='YES' ? 'Email recorded. Your voucher is being prepared for delivery.' : 'Email recorded. Voucher delivery is pending activation.'});
  }catch {return res.status(503).json({error:'Unable to record email right now'});}
});
