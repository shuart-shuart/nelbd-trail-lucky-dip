-- PR #48: ONE-TIME, OPERATOR-APPROVED PHYSICAL STOCK CONVERSION.
-- DO NOT run as an automatic migration or on application startup.
-- Requires migration 015, a database backup, and a maintenance window.
-- Confirmed PHYSICAL unissued ez-link cards: PDD 220, PS 220 (440 total).
-- Confirmed physical Goodie Bags: PDD 50, PS 50.
-- Historical ONE ez-link redemption is a TEST; preserve it unchanged.
-- Critical: this script REFUSES to run if current legacy stock does not
-- match the older reported 500 total / 1 redeemed and one redemption row.
-- If any balance changed after the log snapshot, stop and revise the plan
-- against new read-only figures; never force or bypass the assertions.

BEGIN;
-- Same lock sequence as the draw engine and old/new reward redemption.
SELECT pg_advisory_xact_lock(7102026);
SELECT pg_advisory_xact_lock(7102027);

DO $$
DECLARE
 old_total integer;
 old_redeemed integer;
 historic_count integer;
 old_hub_issued integer;
 old_hub_total integer;
 new_draw_stock integer;
 goodie_stock integer;
 rec record;
BEGIN
 SELECT total_quantity,redeemed_quantity INTO old_total,old_redeemed
 FROM ezlink_inventory WHERE id=1 FOR UPDATE;
 SELECT count(*) INTO historic_count FROM ezlink_redemptions;
 SELECT coalesce(sum(redeemed_quantity),0),coalesce(sum(allocated_quantity),0)
 INTO old_hub_issued,old_hub_total FROM ezlink_hub_inventory;
 PERFORM 1 FROM ezlink_hub_inventory ORDER BY site FOR UPDATE;
 SELECT coalesce(sum(allocated_quantity+remaining_quantity+claimed_quantity),0)
 INTO new_draw_stock FROM site_inventory WHERE prize_id='ezlink-card';
 SELECT coalesce(sum(total_quantity+redeemed_quantity),0)
 INTO goodie_stock FROM goodie_bag_inventory;
 IF old_total IS DISTINCT FROM 500 OR old_redeemed IS DISTINCT FROM 1 OR
    historic_count<>1 OR old_hub_issued<>1 OR old_hub_total>500 OR
    (SELECT count(*) FROM ezlink_hub_inventory)<>2 OR
    (SELECT count(*) FROM goodie_bag_inventory)<>2 OR
    (SELECT count(*) FROM site_inventory WHERE prize_id='ezlink-card')<>2 OR
    new_draw_stock<>0 OR goodie_stock<>0 THEN
   RAISE EXCEPTION 'STOP: balances differ from reviewed 500/1 legacy snapshot or new stock is already initialized. Reconcile first.';
 END IF;
 -- Full transfer accounting:
 -- 500 old cards = 1 historical test (already issued) +
 -- 440 physical cards converted to new Lucky Dip +
 -- 59 legacy reconciliation variance (not issued and not available).
 -- Old ledger: one card remains in total as already redeemed; no unissued
 -- cards remain under the old guaranteed reward.
 FOR rec IN SELECT site,allocated_quantity,redeemed_quantity FROM ezlink_hub_inventory ORDER BY site LOOP
   IF rec.allocated_quantity<>rec.redeemed_quantity THEN
     UPDATE ezlink_hub_inventory SET allocated_quantity=redeemed_quantity,updated_at=now()
      WHERE site=rec.site;
     INSERT INTO ezlink_hub_stock_audit(kind,to_site,delta,previous_total,new_total,actor,note)
      VALUES('ADJUST',rec.site,rec.redeemed_quantity-rec.allocated_quantity,
       rec.allocated_quantity,rec.redeemed_quantity,'approved_pr48_conversion',
       'Retire old 17-stamp physical card availability in preparation for 440-card Lucky Dip conversion; 1 test redemption retained');
   END IF;
 END LOOP;
 UPDATE ezlink_inventory SET total_quantity=redeemed_quantity,updated_at=now() WHERE id=1;
 INSERT INTO ezlink_hub_stock_audit(kind,from_site,delta,previous_total,new_total,actor,note)
 VALUES('ADJUST','UNALLOCATED',-499,500,1,'approved_pr48_conversion',
  'Global old reward closeout: 440 confirmed unissued cards moved to new Lucky Dip (220 PDD/220 PS); remaining 59 from prior 500-card ledger corrected to verified physical count; 1 historical test redemption retained');
 -- New Lucky Dip: the 440 are transferred, not freshly minted stock.
 UPDATE site_inventory SET allocated_quantity=220,remaining_quantity=220,claimed_quantity=0,updated_at=now()
 WHERE prize_id='ezlink-card' AND site IN ('PDD','PS');
 INSERT INTO inventory_adjustments(prize_id,site,previous_quantity,new_quantity,delta,reason,adjusted_by)
 VALUES
 ('ezlink-card','PDD',0,220,220,'transfer','approved_pr48_conversion'),
 ('ezlink-card','PS',0,220,220,'transfer','approved_pr48_conversion');
 UPDATE prizes SET is_active=true,updated_at=now() WHERE id='ezlink-card';
 IF NOT FOUND THEN RAISE EXCEPTION 'STOP: ez-link Lucky Dip prize missing'; END IF;
 -- Guaranteed Goodie Bag physical opening counts:
 UPDATE goodie_bag_inventory SET total_quantity=50,updated_at=now() WHERE site IN ('PDD','PS');
 INSERT INTO goodie_bag_stock_audit(site,previous_total,new_total,actor,note)
 VALUES
 ('PDD',0,50,'approved_pr48_conversion','Opening count: 50 physical NELBD Goodie Bags confirmed at PDD'),
 ('PS',0,50,'approved_pr48_conversion','Opening count: 50 physical NELBD Goodie Bags confirmed at PS');
END $$;

-- This transaction commits ONLY if all final invariants match.
DO $$
DECLARE
 legacy_remaining integer;
 new_cards integer;
 bag_remaining integer;
BEGIN
 SELECT total_quantity-redeemed_quantity INTO legacy_remaining FROM ezlink_inventory WHERE id=1;
 SELECT coalesce(sum(remaining_quantity),0) INTO new_cards FROM site_inventory WHERE prize_id='ezlink-card';
 SELECT coalesce(sum(total_quantity-redeemed_quantity),0) INTO bag_remaining FROM goodie_bag_inventory;
 IF legacy_remaining<>0 OR new_cards<>440 OR bag_remaining<>100 THEN
  RAISE EXCEPTION 'STOP: post-conversion quantities are inconsistent';
 END IF;
END $$;
COMMIT;

-- AFTER EXECUTION: run reconciliation again and capture output, then enable
-- NELBD_GOODIE_BAG_ENABLED only after reward flow integration tests pass.
-- NOTE: The 59-card variance is between old logged 499 unissued and verified
-- 440 unissued, not a claim that 59 cards were physically lost or shipped.
