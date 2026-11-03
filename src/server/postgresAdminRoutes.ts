import { Router } from 'express';
import {encryptVoucher,fingerprint} from './grabVoucherCrypto.ts';
import {decryptGrabCredential} from './grabVoucherDecrypt.ts';
import { getPool, withTransaction } from './postgres.ts';
import { loginAdmin, logoutAdmin, requireAdmin, requireSameOrigin } from './postgresAdminAuth.ts';

export const postgresAdminRouter = Router();
postgresAdminRouter.use(requireSameOrigin);
postgresAdminRouter.post('/login', async (req,res) => {
  try { await loginAdmin(req,res); } catch(e) { console.error('Admin login error',e); res.status(503).json({error:'Admin sign-in unavailable'}); }
});
postgresAdminRouter.use(async (req,res,next) => {
  try { await requireAdmin(req,res,next); } catch(e) { console.error('Admin session error',e); res.status(503).json({error:'Admin session unavailable'}); }
});
postgresAdminRouter.post('/logout', async (req,res) => {
  try { await logoutAdmin(req,res); } catch { res.status(503).json({error:'Logout unavailable'}); }
});
postgresAdminRouter.get('/me',(req,res)=>res.json(res.locals.admin));

/** Prize-site throttles. NULL daily_cap means unlimited; zero means no awards. */
postgresAdminRouter.get('/prize-limits',async (_req,res)=>{
  try {
    const {rows}=await getPool().query(`SELECT l.prize_id AS "prizeId",l.site,l.daily_cap AS "dailyCap",l.paused,
      i.allocated_quantity AS "allocatedQuantity",i.remaining_quantity AS "remainingQuantity",
      i.claimed_quantity AS "claimedQuantity",
      (SELECT count(*)::int FROM draws d WHERE d.prize_id=l.prize_id AND d.site=l.site
       AND (d.drawn_at AT TIME ZONE 'Asia/Singapore')::date =
       (now() AT TIME ZONE 'Asia/Singapore')::date) AS "awardedToday"
      FROM prize_site_limits l JOIN site_inventory i ON i.prize_id=l.prize_id AND i.site=l.site
      ORDER BY l.prize_id,l.site`);
    res.json(rows);
  } catch(e) {console.error('Prize limits read failed',e);res.status(503).json({error:'Prize limits unavailable'});}
});
postgresAdminRouter.put('/prize-limits/:prizeId/:site',async (req,res)=>{
  if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
  const {prizeId,site}=req.params;
  const {dailyCap,paused}=req.body||{};
  if(!['PDD','PS'].includes(site)||typeof paused!=='boolean'||
     !(dailyCap===null||(Number.isSafeInteger(dailyCap)&&dailyCap>=0&&dailyCap<=1000000)))
    return res.status(400).json({error:'Invalid daily cap or pause setting'});
  try {
    const {rows}=await getPool().query(`UPDATE prize_site_limits
      SET daily_cap=$3,paused=$4,updated_at=now()
      WHERE prize_id=$1 AND site=$2 RETURNING prize_id AS "prizeId",site,daily_cap AS "dailyCap",paused`,
      [prizeId,site,dailyCap,paused]);
    if(!rows.length)return res.status(404).json({error:'Prize-site allocation not found'});
    res.json(rows[0]);
  }catch(e){console.error('Prize limit update failed',e);res.status(503).json({error:'Prize limit update unavailable'});}
});


/** Grab voucher credentials are never returned by inventory endpoints. */

/** Outlook Email Centre: draft-only, manually sent by authorized staff. */
postgresAdminRouter.get('/outlook-centre',async (_req,res)=>{
  if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
  try {
    const {rows}=await getPool().query(`SELECT c.draw_id AS "drawId",
      d.ticket_number AS "ticketNumber",d.site,c.recipient_email AS "recipientEmail",
      c.status,c.created_at AS "createdAt",c.updated_at AS "updatedAt"
      FROM grab_voucher_claim_sessions c JOIN draws d ON d.id=c.draw_id
      ORDER BY c.created_at DESC LIMIT 200`);
    res.setHeader('Cache-Control','no-store');
    res.json(rows);
  }catch {res.status(503).json({error:'Outlook draft queue unavailable; check database migration'});}
});
postgresAdminRouter.get('/outlook-centre/:drawId/draft',async (req,res)=>{
  if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
  if(!/^[0-9a-f-]{36}$/i.test(req.params.drawId))return res.status(400).json({error:'Invalid draw'});
  try {
    const {rows}=await getPool().query(`SELECT c.recipient_email,c.status,d.ticket_number,
      v.code_ciphertext,v.url_ciphertext,v.expires_at
      FROM grab_voucher_claim_sessions c
      JOIN draws d ON d.id=c.draw_id
      JOIN grab_voucher_codes v ON v.id=c.voucher_id AND v.assigned_draw_id=c.draw_id
      WHERE c.draw_id=$1`,[req.params.drawId]);
    if(!rows.length)return res.status(404).json({error:'Draft not found'});
    const row=rows[0];
    if(!row.recipient_email)return res.status(409).json({error:'Winner has not submitted an email'});
    if(row.status==='processing'||row.status==='sent'||process.env.NELBD_POWER_AUTOMATE_ENABLED==='YES')
      return res.status(409).json({error:'This voucher is managed by automatic fulfilment or has already been sent'});
    const code=decryptGrabCredential(row.code_ciphertext);
    const link=decryptGrabCredential(row.url_ciphertext);
    const expires=new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',dateStyle:'long'}).format(new Date(row.expires_at));
    res.setHeader('Cache-Control','no-store, private');
    return res.json({to:row.recipient_email,subject:'Your NELBD S$5 Grab voucher',
      body:`Congratulations on winning a S$5 Grab voucher at NELBD Trail Lucky Dip!

Your Grab gift code: ${code}
Your official Grab gift link: ${link}

Open the link or redeem the code using the Grab app.
Voucher expires: ${expires} (Singapore time).
Please keep this email private. Terms and conditions apply.`,
      status:row.status,ticketNumber:row.ticket_number});
  }catch {res.status(503).json({error:'Unable to prepare draft'});}
});
postgresAdminRouter.post('/outlook-centre/:drawId/mark-sent',async(req,res)=>{
  if(process.env.NELBD_POWER_AUTOMATE_ENABLED==='YES') return res.status(423).json({error:'Manual sending is disabled during automatic fulfilment'});
  if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
  if(!/^[0-9a-f-]{36}$/i.test(req.params.drawId)||req.body?.confirmed!==true)
    return res.status(400).json({error:'Explicit confirmation required'});
  try {
    const {rows}=await getPool().query(`UPDATE grab_voucher_claim_sessions
      SET status='sent',updated_at=now() WHERE draw_id=$1 AND status IN ('queued','failed')
      RETURNING draw_id`,[req.params.drawId]);
    if(!rows.length)return res.status(409).json({error:'Draft is not ready or already marked sent'});
    res.json({markedSent:true,deliveryVerification:'manual_confirmation_only'});
  }catch {res.status(503).json({error:'Unable to update draft status'});}
});

postgresAdminRouter.get('/grab-vouchers/summary',async (_req,res)=>{
  try {
    const {rows}=await getPool().query(`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE assigned_draw_id IS NULL)::int AS unassigned,
      count(*) FILTER(WHERE assigned_draw_id IS NOT NULL)::int AS assigned,
      count(*) FILTER(WHERE assigned_draw_id IS NULL AND starts_at<=now() AND expires_at>now())::int AS currently_eligible,
      min(starts_at) AS earliest_start,max(expires_at) AS latest_expiry
      FROM grab_voucher_codes`);
    res.setHeader('Cache-Control','no-store');
    res.json(rows[0]);
  }catch {res.status(503).json({error:'Voucher summary unavailable'});}
});
/** Explicitly gated, authenticated and batched. Never returns plaintext codes or links. */
postgresAdminRouter.post('/grab-vouchers/import-batch',async (req,res)=>{
  if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
  if(process.env.NELBD_GRAB_IMPORT_ENABLED!=='YES')
    return res.status(423).json({error:'Voucher import is disabled pending security approval'});
  const {batch,rows}=req.body||{};
  if(typeof batch!=='string'||!/^[-_a-zA-Z0-9.]{1,100}$/.test(batch)||
     !Array.isArray(rows)||rows.length<1||rows.length>100)
    return res.status(400).json({error:'Invalid import batch'});
  const normalized=[];
  const seenCodes=new Set<string>(),seenUrls=new Set<string>();
  for(const row of rows) {
    const code=row?.code,url=row?.url,start=row?.startsAt,expiry=row?.expiresAt;
    if(typeof code!=='string'||!/^[A-Z0-9_-]{5,80}$/.test(code)||
       typeof url!=='string'||url.length>1000||
       typeof start!=='string'||typeof expiry!=='string'||
       row.country!=='SG'||row.status!=='ISSUED'||row.denominationCents!==500)
      return res.status(400).json({error:'Invalid voucher row'});
    let parsed:URL;
    try{parsed=new URL(url);}catch{return res.status(400).json({error:'Invalid redemption URL'});}
    if(parsed.protocol!=='https:'||parsed.hostname!=='api.grab.com'||
       !parsed.pathname.startsWith('/gifts/'))
      return res.status(400).json({error:'Unexpected Grab redemption URL'});
    const from=new Date(start),to=new Date(expiry);
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to)
      return res.status(400).json({error:'Invalid voucher validity dates'});
    const codeHash=fingerprint(code),urlHash=fingerprint(url);
    if(seenCodes.has(codeHash)||seenUrls.has(urlHash))
      return res.status(400).json({error:'Duplicate voucher in batch'});
    seenCodes.add(codeHash);seenUrls.add(urlHash);
    normalized.push({code:encryptVoucher(code),url:encryptVoucher(url),codeHash,urlHash,from,to});
  }
  try {
    const imported=await withTransaction(async client=>{
      let count=0;
      for(const v of normalized) {
        const inserted=await client.query(`INSERT INTO grab_voucher_codes
          (code_ciphertext,url_ciphertext,code_fingerprint,url_fingerprint,denomination_cents,starts_at,expires_at,source_batch)
          VALUES($1,$2,$3,$4,500,$5,$6,$7)
          ON CONFLICT DO NOTHING RETURNING id`,
          [v.code,v.url,v.codeHash,v.urlHash,v.from,v.to,batch]);
        count+=inserted.rowCount||0;
      }
      return count;
    });
    res.setHeader('Cache-Control','no-store');
    res.json({imported,duplicates:normalized.length-imported});
  }catch {res.status(503).json({error:'Voucher import failed; batch rolled back'});}
});

postgresAdminRouter.get('/inventory',async (_req,res)=>{
  try {
    const {rows}=await getPool().query(`SELECT p.id,p.name,p.description,p.tier,p.icon,p.image_url AS "imageUrl",
      p.is_active AS "isActive",i.site,i.allocated_quantity AS "allocatedQuantity",
      i.remaining_quantity AS "remainingQuantity",i.claimed_quantity AS "claimedQuantity"
      FROM prizes p JOIN site_inventory i ON i.prize_id=p.id ORDER BY p.name,i.site`);
    res.json(rows);
  } catch {res.status(503).json({error:'Inventory unavailable'});}
});
postgresAdminRouter.get('/draws',async (req,res)=>{
  try {
    const limit=Math.min(500,Math.max(1,Number(req.query.limit)||50));
    const offset=Math.max(0,Math.min(1000000,Number(req.query.offset)||0));
    const {rows}=await getPool().query(`SELECT d.id,d.ticket_number AS "ticketNumber",
      p.nickname AS "participantNickname",d.prize_id AS "prizeId",d.prize_name AS "prizeName",
      d.prize_tier AS "prizeTier",d.site,d.status,d.kiosk_id AS "kioskId",
      d.drawn_at AS "drawnAt",d.claimed_at AS "claimedAt",
      rev.classification AS "reviewLabel",rev.note AS "reviewNote"
      FROM draws d JOIN participants p ON p.id=d.participant_id
      LEFT JOIN draw_review_labels rev ON rev.draw_id=d.id
      ORDER BY d.drawn_at DESC,d.id DESC LIMIT $1 OFFSET $2`,[limit,offset]);
    res.json(rows);
  } catch {res.status(503).json({error:'Draw history unavailable'});}
});

/** Annotate draw history only; never undo awarded inventory, eligibility or voucher allocation. */
postgresAdminRouter.put('/draws/:id/review',async(req,res)=>{
  if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
  const {id}=req.params,{classification,note}=req.body||{};
  if(!/^[0-9a-f-]{36}$/i.test(id)||
    !(classification===null||classification==='test'||classification==='error')||
    typeof note!=='string'||note.length>500)
    return res.status(400).json({error:'Invalid draw review label'});
  try {
    const result=await withTransaction(async client=>{
      const existing=await client.query('SELECT id FROM draws WHERE id=$1',[id]);
      if(!existing.rowCount)return null;
      if(classification===null){
        await client.query('DELETE FROM draw_review_labels WHERE draw_id=$1',[id]);
      }else{
        await client.query(`INSERT INTO draw_review_labels(draw_id,classification,note,updated_by)
          VALUES($1,$2,$3,$4)
          ON CONFLICT(draw_id) DO UPDATE SET classification=EXCLUDED.classification,
            note=EXCLUDED.note,updated_by=EXCLUDED.updated_by,updated_at=now()`,
          [id,classification,note,res.locals.admin.email||'admin']);
      }
      return {id,classification,note:classification===null?'':note};
    });
    if(!result)return res.status(404).json({error:'Draw not found'});
    return res.json(result);
  }catch{return res.status(503).json({error:'Unable to update review label'});}
});

postgresAdminRouter.get('/settings',async (_req,res)=>{
  try {const {rows}=await getPool().query('SELECT * FROM kiosk_settings WHERE id=1');res.json(rows[0]||null);}
  catch {res.status(503).json({error:'Settings unavailable'});}
});
postgresAdminRouter.post('/inventory/:id/:site/quantity',async (req,res)=>{
  const {id,site}=req.params;
  const remaining=req.body?.remainingQuantity;
  if (!['PDD','PS'].includes(site)||!Number.isSafeInteger(remaining)||remaining<0||remaining>1000000)
    return res.status(400).json({error:'Invalid inventory quantity'});
  const admin=res.locals.admin;
  if (admin.site_access!=='ALL'&&admin.site_access!==site) return res.status(403).json({error:'Site access denied'});
  try {
    const row=await withTransaction(async(client)=>{
      const old=await client.query('SELECT * FROM site_inventory WHERE prize_id=$1 AND site=$2 FOR UPDATE',[id,site]);
      if (!old.rowCount) return null;
      const previous=old.rows[0].remaining_quantity;
      const updated=await client.query(`UPDATE site_inventory SET remaining_quantity=$3,
        allocated_quantity=claimed_quantity+$3,updated_at=now()
        WHERE prize_id=$1 AND site=$2 RETURNING *`,[id,site,remaining]);
      await client.query(`INSERT INTO inventory_adjustments
        (prize_id,site,previous_quantity,new_quantity,delta,reason,adjusted_by)
        VALUES($1,$2,$3,$4,$5,'manual_adjustment',$6)`,
        [id,site,previous,remaining,remaining-previous,admin.email]);
      return updated.rows[0];
    });
    if (!row) return res.status(404).json({error:'Inventory item not found'});
    return res.json(row);
  } catch(e) {console.error('Inventory adjustment failed',e);return res.status(503).json({error:'Inventory update failed'});}
});

postgresAdminRouter.put('/settings',async (req,res)=>{
  const admin=res.locals.admin;
  if(admin.role!=='super_admin') return res.status(403).json({error:'Super admin required'});
  const b=req.body||{};
  if(typeof b.festivalName!=='string'||b.festivalName.trim().length<1||b.festivalName.length>120||
     typeof b.kioskActive!=='boolean'||!['PDD','PS'].includes(b.activeSite)||
     typeof b.welcomeMessage!=='string'||b.welcomeMessage.length>2000||
     typeof b.termsSummary!=='string'||b.termsSummary.length>4000||
     b.maxDrawsPerParticipant!==1)
    return res.status(400).json({error:'Invalid settings; maximum draws per participant must remain one'});
  try {
    const {rows}=await getPool().query(`UPDATE kiosk_settings
      SET festival_name=$1,kiosk_active=$2,active_site=$3,welcome_message=$4,
          terms_summary=$5,max_draws_per_participant=1,updated_at=now()
      WHERE id=1 RETURNING *`,
      [b.festivalName.trim(),b.kioskActive,b.activeSite,b.welcomeMessage,b.termsSummary]);
    return res.json(rows[0]);
  } catch {return res.status(503).json({error:'Settings update unavailable'});}
});

postgresAdminRouter.get('/dashboard-stats',async (_req,res)=>{
  try {
    const [drawCount,participantCount,today]=await Promise.all([
      getPool().query('SELECT count(*)::integer AS count FROM draws'),
      getPool().query('SELECT count(*)::integer AS count FROM participants'),
      getPool().query(`SELECT d.id,d.ticket_number AS "ticketNumber",
        p.nickname AS "participantNickname",d.prize_id AS "prizeId",
        d.prize_name AS "prizeName",d.prize_tier AS "prizeTier",d.site,d.status,
        d.kiosk_id AS "kioskId",d.drawn_at AS "drawnAt",d.claimed_at AS "claimedAt"
        FROM draws d JOIN participants p ON p.id=d.participant_id
        WHERE (d.drawn_at AT TIME ZONE 'Asia/Singapore')::date =
              (now() AT TIME ZONE 'Asia/Singapore')::date ORDER BY d.drawn_at DESC`)
    ]);
    return res.json({totalDraws:drawCount.rows[0].count,totalParticipants:participantCount.rows[0].count,todayDraws:today.rows});
  } catch {return res.status(503).json({error:'Dashboard statistics unavailable'});}
});

postgresAdminRouter.get('/participants',async (req,res)=>{
  try {
    const limit=Math.min(1000,Math.max(1,Number(req.query.limit)||500));
    const offset=Math.max(0,Math.min(1000000,Number(req.query.offset)||0));
    const {rows}=await getPool().query(`SELECT id,nickname,mobile_number AS "mobileNumber",
      site,created_at AS "createdAt" FROM participants ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2`,[limit,offset]);
    return res.json(rows);
  } catch {return res.status(503).json({error:'Participants unavailable'});}
});
postgresAdminRouter.get('/inventory-adjustments',async (req,res)=>{
  try {
    const limit=Math.min(1000,Math.max(1,Number(req.query.limit)||500));
    const {rows}=await getPool().query(`SELECT a.id,a.prize_id AS "prizeId",p.name AS "prizeName",
      a.site,a.previous_quantity AS "previousQuantity",a.new_quantity AS "newQuantity",
      a.delta,a.reason,a.adjusted_by AS "adjustedByEmail",a.created_at AS "createdAt"
      FROM inventory_adjustments a JOIN prizes p ON p.id=a.prize_id
      ORDER BY a.created_at DESC LIMIT $1`,[limit]);
    return res.json(rows);
  } catch {return res.status(503).json({error:'Inventory audit unavailable'});}
});


postgresAdminRouter.patch('/prizes/:id',async(req,res)=>{
  if(res.locals.admin.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
  const {name,description,tier,isActive,imageUrl,icon}=req.body||{};
  if(name!==undefined&&(typeof name!=='string'||!name.trim()||name.length>120)||
     description!==undefined&&(typeof description!=='string'||description.length>2000)||
     tier!==undefined&&!['TOP','STANDARD'].includes(tier)||
     isActive!==undefined&&typeof isActive!=='boolean'||
     imageUrl!==undefined&&(typeof imageUrl!=='string'||imageUrl.length>2000000)||
     icon!==undefined&&(typeof icon!=='string'||icon.length>100))
    return res.status(400).json({error:'Invalid prize fields'});
  if(Object.keys(req.body||{}).some(k=>!['name','description','tier','isActive','imageUrl','icon'].includes(k)))
    return res.status(400).json({error:'Unsupported prize field'});
  try{
    const result=await withTransaction(async client=>{
      const current=await client.query('SELECT * FROM prizes WHERE id=$1 FOR UPDATE',[req.params.id]);
      if(!current.rowCount)return null;
      const old=current.rows[0];
      const nextTier=tier??old.tier;
      const nextActive=isActive??old.is_active;
      if(nextTier==='TOP'&&nextActive){
        const other=await client.query("SELECT id FROM prizes WHERE tier='TOP' AND is_active=true AND id<>$1 LIMIT 1",[req.params.id]);
        if(other.rowCount)throw new Error('ONLY_ONE_TOP');
      }
      const updated=await client.query(`UPDATE prizes SET name=$2,description=$3,tier=$4,is_active=$5,
        image_url=$6,icon=$7,updated_at=now() WHERE id=$1 RETURNING *`,
        [req.params.id,name?.trim()??old.name,description??old.description,nextTier,nextActive,imageUrl??old.image_url,icon??old.icon]);
      return updated.rows[0];
    });
    return result?res.json(result):res.status(404).json({error:'Prize not found'});
  }catch(e){
    if(e instanceof Error&&e.message==='ONLY_ONE_TOP')return res.status(409).json({error:'Only one active TOP prize is allowed'});
    return res.status(503).json({error:'Prize update unavailable'});
  }
});
