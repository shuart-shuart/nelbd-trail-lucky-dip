import {Router} from 'express';
import {getPool,withTransaction} from './postgres.ts';
export const grabStaffAdminRouter=Router();
grabStaffAdminRouter.use((_req,res,next)=>{
 res.setHeader('Cache-Control','no-store,private');
 if(res.locals.admin?.role!=='super_admin')return res.status(403).json({error:'Super admin required'});
 next();
});
grabStaffAdminRouter.get('/manual-followups',async(_req,res)=>{
 try{
  const {rows}=await getPool().query(`SELECT s.draw_id AS "drawId",
     d.ticket_number AS "ticketNumber",d.site AS "drawHub",
     s.collection_site AS "collectionLocation",s.contact_phone AS "phone",
     CASE d.prize_id WHEN 'grab-voucher-10' THEN 10 ELSE 5 END AS "award",
     s.notification_state AS "notificationState",s.submitted_at AS "submittedAt",
     s.contacted_at AS "contactedAt",c.status
   FROM grab_staff_contact_submissions s
   JOIN draws d ON d.id=s.draw_id
   JOIN grab_voucher_claim_sessions c ON c.draw_id=s.draw_id
   WHERE s.contact_kind='phone'
   ORDER BY s.contacted_at NULLS FIRST,s.submitted_at DESC LIMIT 200`);
  return res.json(rows);
 }catch{return res.status(503).json({error:'Manual follow-up list unavailable'});}
});
grabStaffAdminRouter.post('/manual-followups/:drawId/contacted',async(req,res)=>{
 if(!/^[0-9a-f-]{36}$/i.test(req.params.drawId)||req.body?.confirmed!==true)
  return res.status(400).json({error:'Explicit confirmation required'});
 try{
  const done=await withTransaction(async c=>{
   const updated=await c.query(`UPDATE grab_voucher_claim_sessions
     SET status='manual_contacted',updated_at=now()
     WHERE draw_id=$1 AND status='manual_followup' RETURNING draw_id`,[req.params.drawId]);
   if(!updated.rowCount)return false;
   await c.query(`UPDATE grab_staff_contact_submissions
     SET contacted_at=now()
     WHERE draw_id=$1 AND contact_kind='phone' AND contacted_at IS NULL`,[req.params.drawId]);
   return true;
  });
  if(!done)return res.status(409).json({error:'Already contacted or not awaiting manual follow-up'});
  return res.json({recorded:true});
 }catch{return res.status(503).json({error:'Unable to record follow-up'});}
});
