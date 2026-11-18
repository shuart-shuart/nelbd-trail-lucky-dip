-- PR #48 preflight: READ ONLY. Safe before optional migration 015.
-- Requested physical counts: Goodie Bags PDD 50 / PS 50; new Lucky Dip
-- ez-link Card PDD 220 / PS 220. These are input targets, NOT database truth.
-- Requires PostgreSQL access from a trusted environment.
WITH global AS (
 SELECT total_quantity,redeemed_quantity,total_quantity-redeemed_quantity AS unissued
 FROM ezlink_inventory WHERE id=1
), issued AS (
 SELECT site,count(*)::integer AS historically_issued FROM ezlink_redemptions GROUP BY site
), hub AS (
 SELECT site,allocated_quantity,redeemed_quantity,
    allocated_quantity-redeemed_quantity AS unissued_at_hub
 FROM ezlink_hub_inventory
), required AS (
 SELECT 'PDD'::text AS site,50 AS goodie_target,220 AS lucky_dip_card_target
 UNION ALL SELECT 'PS',50,220
)
SELECT required.site,
 required.goodie_target,required.lucky_dip_card_target,
 global.total_quantity AS legacy_total,
 global.redeemed_quantity AS legacy_issued,
 global.unissued AS legacy_unissued,
 hub.allocated_quantity AS legacy_hub_allocated,
 hub.redeemed_quantity AS legacy_hub_issued,
 hub.unissued_at_hub AS legacy_hub_unissued,
 coalesce(issued.historically_issued,0) AS historical_redemptions
FROM required
CROSS JOIN global
LEFT JOIN hub ON hub.site=required.site
LEFT JOIN issued ON issued.site=required.site
ORDER BY required.site;

SELECT (SELECT redeemed_quantity FROM ezlink_inventory WHERE id=1) AS legacy_issued,
 (SELECT count(*) FROM ezlink_redemptions) AS historical_redemptions,
 (SELECT coalesce(sum(redeemed_quantity),0) FROM ezlink_hub_inventory) AS hub_issued,
 (SELECT total_quantity-redeemed_quantity FROM ezlink_inventory WHERE id=1) AS legacy_unissued,
 (SELECT coalesce(sum(allocated_quantity-redeemed_quantity),0) FROM ezlink_hub_inventory) AS legacy_hub_unissued,
 (SELECT total_quantity FROM ezlink_inventory WHERE id=1) -
 (SELECT coalesce(sum(allocated_quantity),0) FROM ezlink_hub_inventory) AS centrally_unallocated,
 (SELECT count(*) FROM draws WHERE prize_id='ezlink-card') AS lucky_dip_ezlink_draws,
 to_regclass('public.goodie_bag_inventory') AS goodie_bag_table,
 to_regclass('public.goodie_bag_redemptions') AS goodie_bag_redemption_table;

-- IMPORTANT:
-- 1. Confirm the DB matches the Render service's actual DATABASE_URL.
-- 2. Compare these current figures with physical counts at BOTH hubs.
-- 3. Check legacy global issued = historical redemptions = sum hub issued.
-- 4. All transfers to the new Lucky Dip must DEBIT the same physical unissued
--    cards from their legacy location (hub or central), never mint a second 440.
-- 5. Do not modify legacy redeemed counts, historical draw rows, or prior audit.
-- 6. The 50 + 50 Goodie Bags are new physical inventory, not old ez-link cards.
-- 7. No allocation is approved until the source of 220 cards at each hub is
--    reconciled; current 440 may not exist despite older logs showing 499.

-- OPERATOR-VERIFIED PHYSICAL COUNT UPDATE (19 Nov 2026):
-- 220 unissued cards are physically present at PDD, 220 at PS (440 total).
-- One earlier card redemption was a real system-issued TEST by the operator.
-- KEEP that historical row and do not count it as part of the 440 available.
-- The old 500 total from migration-time logs is NOT a current physical count.
-- If legacy inventory still reads 500 total / 1 redeemed, it implies 499
-- available on the old ledger versus 440 confirmed onsite: a 59-card variance.
-- DO NOT automatically treat 59 cards as lost, transferred, or available.
-- Record its explanation in a signed inventory adjustment before retiring
-- legacy available stock. On conversion the 440 physical cards must be
-- available ONLY in new ez-link Lucky Dip site_inventory (220 each hub).
-- A zero-balance legacy redemption pool may retain the 1 test as already
-- issued for audit; don't delete it to make the inventory equations fit.
