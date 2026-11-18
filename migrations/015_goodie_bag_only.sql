-- Dedicated 17-stamp NELBD Goodie Bag schema and verified opening stock.
-- No ez-link Card or Lucky Dip prizes are created, updated or moved.
-- Existing historical ezlink_* data and the 1 test redemption remain intact.
BEGIN;
SELECT pg_advisory_xact_lock(7102027);
CREATE TABLE IF NOT EXISTS goodie_bag_inventory (
 site text PRIMARY KEY CHECK(site IN ('PDD','PS')),
 total_quantity integer NOT NULL DEFAULT 0 CHECK(total_quantity>=0),
 redeemed_quantity integer NOT NULL DEFAULT 0 CHECK(redeemed_quantity>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(redeemed_quantity<=total_quantity)
);
CREATE TABLE IF NOT EXISTS goodie_bag_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 participant_id uuid NOT NULL UNIQUE REFERENCES participants(id),
 draw_id uuid NOT NULL UNIQUE REFERENCES draws(id),
 site text NOT NULL CHECK(site IN ('PDD','PS')),
 scenario text NOT NULL CHECK(scenario IN ('17_fresh','17_returning')),
 issued_by text NOT NULL,
 redeemed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goodie_bag_redemptions_time_idx ON goodie_bag_redemptions(redeemed_at DESC);
CREATE TABLE IF NOT EXISTS goodie_bag_stock_audit (
 id bigserial PRIMARY KEY,
 site text NOT NULL CHECK(site IN ('PDD','PS')),
 previous_total integer NOT NULL,
 new_total integer NOT NULL,
 actor text NOT NULL,
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 500),
 happened_at timestamptz NOT NULL DEFAULT now()
);
-- A fresh installation gets 50 at each hub. Existing rows are NEVER
-- overwritten, preventing redeploy from replenishing already-issued bags.
INSERT INTO goodie_bag_inventory(site,total_quantity,redeemed_quantity)
 VALUES ('PDD',50,0),('PS',50,0) ON CONFLICT(site) DO NOTHING;
-- Reject unexpected/partial starting state; a failed migration rolls back.
DO $$
DECLARE mismatches integer;
BEGIN
 SELECT count(*) INTO mismatches FROM goodie_bag_inventory
 WHERE site IN ('PDD','PS') AND total_quantity=50 AND redeemed_quantity=0;
 IF mismatches<>2 OR (SELECT count(*) FROM goodie_bag_inventory)<>2 OR
    (SELECT count(*) FROM goodie_bag_redemptions)<>0 THEN
  RAISE EXCEPTION 'STOP: Goodie Bag inventory is not a clean 50/50 opening state; do not reset or overwrite previously issued stock';
 END IF;
END $$;
-- Opening audit created at most once; migration is repeatable before first issue.
INSERT INTO goodie_bag_stock_audit(site,previous_total,new_total,actor,note)
SELECT site,0,50,'verified_opening_stock','Opening 50 physical NELBD Goodie Bags verified by operator at '||site
FROM goodie_bag_inventory i
WHERE NOT EXISTS(SELECT 1 FROM goodie_bag_stock_audit a WHERE a.site=i.site);
COMMIT;
