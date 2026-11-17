import {Router} from 'express';
import crypto from 'node:crypto';
import {getPool,withTransaction} from './postgres.ts';

export const kioskQuestRewardsRouter=Router();
const attempts=new Map<string,{count:number;until:number}>();
const normalizeMobile=(value:unknown):string|null=>{
 if(typeof value!=='string'||value.length>24)return null;
 const digits=value.replace(/[\s()-]/g,'');
 const mobile=digits.startsWith('+65')?digits:digits.startsWith('65')&&digits.length===10?'+'+digits:'+65'+digits;
 return /^\+65[89]\d{7}$/.test(mobile)?mobile:null;
};
const enabled=()=>process.env.NELBD_EZLINK_ENABLED==='YES'&&process.env.DRAW_BACKEND==='postgres';
kioskQuestRewardsRouter.use((req,res,next)=>{
 res.setHeader('Cache-Control','no-store, private');
 if(!enabled())return res.status(423).json({error:'17-stamp reward redemption is temporarily unavailable'});
 if(!['GET','HEAD'].includes(req.method)){
  const origin=req.get('origin');
  const expected=(process.env.NODE_ENV==='production'?'https':req.protocol)+'://'+req.get('host');
  if(!origin||origin!==expected)return res.status(403).json({error:'Invalid request origin'});
 }
 next();
});
const limit=(req:any,operation:'lookup'|'redeem'):boolean=>{
 const key=operation+':'+(req.ip||req.socket.remoteAddress||'unknown');
 const now=Date.now();
 if(attempts.size>5000)for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
 const old=attempts.get(key);
 const current=old&&old.until>now?old:{count:0,until:now+15*60_000};
 current.count++;
 attempts.set(key,current);
 return current.count<=(operation==='lookup'?400:100);
};
async function verifyPin(pin:unknown):Promise<boolean>{
 if(typeof pin!=='string'||!/^\d{6,12}$/.test(pin))return false;
 const {rows}=await getPool().query('SELECT pin_salt,pin_hash FROM ezlink_staff_config WHERE id=1');
 if(!rows.length)return false;
 const calculated=crypto.scryptSync(pin,rows[0].pin_salt,64);
 const reference=Buffer.from(rows[0].pin_hash,'hex');
 return reference.length===calculated.length&&crypto.timingSafeEqual(reference,calculated);
}
kioskQuestRewardsRouter.get('/status',async(_req,res)=>{
 try{const [stock,pin]=await Promise.all([
  getPool().query('SELECT (total_quantity-redeemed_quantity)>0 AS available FROM ezlink_inventory WHERE id=1'),
  getPool().query('SELECT 1 FROM ezlink_staff_config WHERE id=1')]);
  return res.json({available:Boolean(stock.rows[0]?.available),staffPinConfigured:Boolean(pin.rowCount)});
 }catch{return res.status(503).json({error:'Reward status unavailable'});}
});
/** Phone lookup gives only a minimal eligibility flag, not participant PII. */
kioskQuestRewardsRouter.post('/lookup',async(req,res)=>{
 const mobile=normalizeMobile(req.body?.mobileNumber);
 if(!mobile)return res.status(400).json({error:'Enter a valid Singapore mobile number'});
 if(!limit(req,'lookup'))return res.status(429).json({error:'Too many requests. Ask booth staff for help'});
 try{
  const {rows:[r]}=await getPool().query(
   'SELECT d.status,(e.id IS NOT NULL) AS already_redeemed FROM participants p JOIN draws d ON d.participant_id=p.id LEFT JOIN ezlink_redemptions e ON e.participant_id=p.id WHERE p.mobile_number=$1 LIMIT 1',[mobile]);
  if(!r)return res.json({eligible:false,reason:'NO_PREVIOUS_LUCKY_DIP'});
  if(r.already_redeemed)return res.json({eligible:false,reason:'ALREADY_REDEEMED'});
  return res.json({eligible:r.status==='claimed',reason:r.status==='claimed'?'READY':'LUCKY_DIP_NOT_CLAIMED'});
 }catch{return res.status(503).json({error:'Unable to verify earlier redemption'});}
});
/** Staff PIN is mandatory; client-visible checkboxes are only process acknowledgements. */
kioskQuestRewardsRouter.post('/redeem',async(req,res)=>{
 const scenario=req.body?.scenario,mobile=normalizeMobile(req.body?.mobileNumber);
 if(!['17_fresh','17_returning'].includes(scenario)||!mobile||
    req.body?.seventeenStampsChecked!==true||
    req.body?.secondPunchUnused!==true||
    req.body?.cardHandedOver!==true||
    req.body?.secondPunchApplied!==true||
    (scenario==='17_fresh'&&req.body?.firstRewardCompleted!==true)||
    (scenario==='17_returning'&&req.body?.firstPunchPresent!==true))
   return res.status(400).json({error:'Check booklet, card handover and punch confirmations'});
 if(!limit(req,'redeem'))return res.status(429).json({error:'Too many attempts. Ask an administrator for help'});
 let verified=false;
 try{verified=await verifyPin(req.body?.staffPin);}catch{return res.status(503).json({error:'Staff verification unavailable'});}
 if(!verified)return res.status(403).json({error:'Invalid staff PIN or staff PIN not configured'});
 try{
  const recorded=await withTransaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock($1)',[7102027]);
   const {rows:[r]}=await c.query(
    'SELECT p.id AS participant_id,d.id AS draw_id,d.site,d.status,e.id AS ezlink_id FROM participants p JOIN draws d ON d.participant_id=p.id LEFT JOIN ezlink_redemptions e ON e.participant_id=p.id WHERE p.mobile_number=$1 FOR UPDATE OF p,d',[mobile]);
   if(!r)throw new Error('NO_PREVIOUS_LUCKY_DIP');
   if(r.ezlink_id)throw new Error('ALREADY_REDEEMED');
   if(r.status!=='claimed')throw new Error('LUCKY_DIP_NOT_CLAIMED');
   const stock=await c.query(
    'UPDATE ezlink_inventory SET redeemed_quantity=redeemed_quantity+1,updated_at=now() WHERE id=1 AND redeemed_quantity<total_quantity RETURNING total_quantity-redeemed_quantity AS remaining');
   if(!stock.rowCount)throw new Error('OUT_OF_STOCK');
   await c.query(
    'INSERT INTO ezlink_redemptions(participant_id,draw_id,site,scenario,issued_by,booklet_17_verified,second_punch_confirmed) VALUES($1,$2,$3,$4,$5,true,true)',
    [r.participant_id,r.draw_id,r.site,scenario,'kiosk_staff_pin']);
   return {recorded:true,remaining:Number(stock.rows[0].remaining)};
  });
  return res.json(recorded);
 }catch(e){
  const reason=e instanceof Error?e.message:'';
  if(['NO_PREVIOUS_LUCKY_DIP','ALREADY_REDEEMED','LUCKY_DIP_NOT_CLAIMED','OUT_OF_STOCK'].includes(reason))
   return res.status(409).json({error:reason});
  return res.status(503).json({error:'Redemption status uncertain. Ask an administrator to check the history before retrying'});
 }
});
