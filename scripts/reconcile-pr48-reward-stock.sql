-- PR #48 stock reconciliation preflight (READ ONLY).
-- Run against the SAME PostgreSQL database as the Render application.
-- User-confirmed physical target: 50 Goodie Bags each hub; 220 unissued ez-link Cards each hub.
-- This query NEVER moves stock, creates prizes or alters past redemptions.
-- Only current figures from the DB + physical count can authorize the conversion.
WITH legacy_global AS (
 SELECT total_quantity,redeemed_quantity,total_quantity-redeemed_quantity AS unissued
 FROM ezlink_inventory WHERE id=1
), legacy_hubs AS (
 SELECT site,allocated_quantity,redeemed_quantity,
        allocated_quantity-redeemed_quantity AS unissued
 FROM ezlink_hub_inventory
), historical AS (
 SELECT site,count(*)::integer AS redemption_rows FROM ezlink_redemptions GROUP BY site
), current_new_catalogue AS (
 SELECT site,allocated_quantity,remaining_quantity,claimed_quantity
 FROM site_inventory WHERE prize_id='ezlink-card'
), current_goodie AS (
 SELECT site,total_quantity,redeemed_quantity
 FROM goodie_bag_inventory
), requested AS (
 SELECT 'PDD'::text AS site, 50 AS bag_target, 220 AS card_target
 UNION ALL SELECT 'PS',50,220
)
SELECT r.site,
 r.bag_target AS requested_goodie_bags,
 r.card_target AS requested_unissued_lucky_dip_cards,
 lg.total_quantity AS old_global_card_total,
 lg.redeemed_quantity AS old_global_issued_cards,
 lg.unissued AS old_global_unissued_cards,
 lh.allocated_quantity AS old_hub_card_allocated,
 lh.redeemed_quantity AS old_hub_issued,
 lh.unissued AS old_hub_unissued,
 coalesce(h.redemption_rows,0) AS historic_card_redemption_rows,
 n.allocated_quantity AS new_lucky_dip_card_allocated,
 n.remaining_quantity AS new_lucky_dip_card_remaining,
 n.claimed_quantity AS new_lucky_dip_card_claimed,
 g.total_quantity AS goodie_bags_allocated,
 g.redeemed_quantity AS goodie_bags_redeemed
FROM requested r CROSS JOIN legacy_global lg
LEFT JOIN legacy_hubs lh ON lh.site=r.site
LEFT JOIN historical h ON h.site=r.site
LEFT JOIN current_new_catalogue n ON n.site=r.site
LEFT JOIN current_goodie g ON g.site=r.site
ORDER BY r.site;

-- Also validate that old global issued count agrees with historical redemption rows:
SELECT (SELECT redeemed_quantity FROM ezlink_inventory WHERE id=1) AS global_issued,
       (SELECT count(*) FROM ezlink_redemptions) AS historical_redemption_rows,
       (SELECT coalesce(sum(redeemed_quantity),0) FROM ezlink_hub_inventory) AS hub_issued,
       (SELECT total_quantity-redeemed_quantity FROM ezlink_inventory WHERE id=1) AS old_unissued_cards,
       (SELECT coalesce(sum(allocated_quantity-redeemed_quantity),0) FROM ezlink_hub_inventory) AS already_allocated_unissued_hub_cards;

-- GO-LIVE BLOCKERS:
-- 1. If migration 015 has not run, goodie_bag_inventory and ezlink-card site_inventory do not exist:
--    run the first read query ONLY AFTER controlled opt-in migration, not before.
-- 2. The old global ledger and historical claims must match; old inventory and new Lucky Dip
--    MUST NOT both claim the same 440 physical cards.
-- 3. Verify physical unissued 220 at PDD and 220 at PS; if cards are still in legacy stock,
--    physically and transactionally move/decommission their legacy availability before activating Lucky Dip.
-- 4. The 50 Goodie Bags at each site are new physical stock, unrelated to old ez-link stock.
-- 5. No database numbers or migration results were verified by the author: Render's DB IP allowlist
--    currently blocks read-only MCP external SQL connections.
