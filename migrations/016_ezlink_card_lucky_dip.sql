-- One-time controlled conversion of physically verified 440 unissued ez-link Cards
-- into a STANDARD Lucky Dip prize. PDD 220, PS 220. No Goodie Bag writes.
-- Historic legacy 500 total / 1 redeemed is an accounting snapshot, NOT live stock.
-- One former redemption was a test and remains in ezlink_redemptions.
-- Requires exact preflight snapshot below; failure rolls the entire transaction back.
BEGIN;
SELECT pg_advisory_xact_lock(7102026);
SELECT pg_advisory_xact_lock(7102027);

INSERT INTO prizes(id,name,description,tier,icon,is_active,probability)
 VALUES ('ezlink-card','ez-link Card','Physical ez-link Card awarded through the regular 8-stamp Lucky Dip','STANDARD','gift',false,'normal')
 ON CONFLICT(id) DO NOTHING;
INSERT INTO site_inventory(prize_id,site)
 VALUES ('ezlink-card','PDD'),('ezlink-card','PS')
 ON CONFLICT(prize_id,site) DO NOTHING;

DO $$
DECLARE
 global_total integer;
 global_issued integer;
 history_count integer;
 hub_record record;
 prior_prize record;
 new_row record;
BEGIN
 SELECT total_quantity,redeemed_quantity INTO global_total,global_issued
 FROM ezlink_inventory WHERE id=1 FOR UPDATE;
 SELECT count(*) INTO history_count FROM ezlink_redemptions;
 PERFORM 1 FROM ezlink_hub_inventory ORDER BY site FOR UPDATE;
 SELECT id,is_active,tier,probability INTO prior_prize FROM prizes WHERE id='ezlink-card' FOR UPDATE;
 PERFORM 1 FROM site_inventory WHERE prize_id='ezlink-card' ORDER BY site FOR UPDATE;

 IF global_total=1 AND global_issued=1 AND prior_prize.is_active
  AND (SELECT count(*) FROM site_inventory WHERE prize_id='ezlink-card' AND
   allocated_quantity=220 AND allocated_quantity=remaining_quantity+claimed_quantity)=2 THEN
   RAISE NOTICE 'ez-link card Lucky Dip already initialized. Existing prize claims and stock left untouched.';
   RETURN;
 END IF;

 IF global_total IS DISTINCT FROM 500 OR global_issued IS DISTINCT FROM 1 OR history_count<>1
   OR (SELECT count(*) FROM ezlink_hub_inventory)<>2
   OR (SELECT coalesce(sum(redeemed_quantity),0) FROM ezlink_hub_inventory)<>1
   OR (SELECT allocated_quantity FROM ezlink_hub_inventory WHERE site='PDD') IS DISTINCT FROM 0
   OR (SELECT redeemed_quantity FROM ezlink_hub_inventory WHERE site='PDD') IS DISTINCT FROM 0
   OR (SELECT allocated_quantity FROM ezlink_hub_inventory WHERE site='PS') IS DISTINCT FROM 1
   OR (SELECT redeemed_quantity FROM ezlink_hub_inventory WHERE site='PS') IS DISTINCT FROM 1
   OR (SELECT count(*) FROM site_inventory WHERE prize_id='ezlink-card'
        AND allocated_quantity=0 AND remaining_quantity=0 AND claimed_quantity=0)<>2
   OR (SELECT count(*) FROM draws WHERE prize_id='ezlink-card')<>0
   OR prior_prize.is_active OR prior_prize.tier<>'STANDARD'
   OR (SELECT count(*) FROM goodie_bag_inventory WHERE site IN ('PDD','PS'))<>2
 THEN
   RAISE EXCEPTION 'STOP: live legacy balances differ from verified 500/1 snapshot or prize was already initialized. No inventory changed.';
 END IF;

 -- Legacy ledger is closed to unissued cards, retaining the 1 issued test.
 UPDATE ezlink_inventory SET total_quantity=redeemed_quantity,updated_at=now() WHERE id=1;
 INSERT INTO ezlink_inventory_audit(previous_total,new_total,actor)
 VALUES (500,1,'ezlink_lucky_dip_440_conversion');
 INSERT INTO ezlink_hub_stock_audit(kind,from_site,delta,previous_total,new_total,actor,note)
 VALUES ('ADJUST','UNALLOCATED',-499,499,0,'ezlink_lucky_dip_440_conversion',
  'Retire 499 formerly unallocated card units: 440 physical unissued cards verified onsite and transferred to Lucky Dip 220 PDD/220 PS; 59-unit accounting variance relative to historic 500, not asserted lost. One test claim remains issued.');

 -- The source 440 physical cards become 440 new Lucky Dip units, NOT an
 -- additional 440 atop the old available balance.
 UPDATE site_inventory
 SET allocated_quantity=220,remaining_quantity=220,claimed_quantity=0,updated_at=now()
 WHERE prize_id='ezlink-card' AND site IN ('PDD','PS');
 INSERT INTO inventory_adjustments(prize_id,site,previous_quantity,new_quantity,delta,reason,adjusted_by)
 VALUES ('ezlink-card','PDD',0,220,220,'transfer','ezlink_lucky_dip_440_conversion'),
        ('ezlink-card','PS',0,220,220,'transfer','ezlink_lucky_dip_440_conversion');
 UPDATE prizes SET is_active=true,updated_at=now() WHERE id='ezlink-card';

 IF (SELECT total_quantity-redeemed_quantity FROM ezlink_inventory WHERE id=1)<>0
 OR (SELECT count(*) FROM site_inventory WHERE prize_id='ezlink-card'
      AND allocated_quantity=220 AND remaining_quantity=220 AND claimed_quantity=0)<>2
 OR (SELECT count(*) FROM ezlink_redemptions)<>1 THEN
  RAISE EXCEPTION 'STOP: post-conversion invariant failed';
 END IF;
 RAISE NOTICE '220 PDD + 220 PS ez-link Cards active for standard Lucky Dip, old issued test retained; Goodie Bag unchanged.';
END $$;
COMMIT;
