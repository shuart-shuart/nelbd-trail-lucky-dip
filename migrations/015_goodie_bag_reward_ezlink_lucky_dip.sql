-- Add the NELBD Goodie Bag as the 17-stamp guaranteed reward.
-- Add ez-link Card as an inactive, zero-stock Lucky Dip prize.
-- Never rename previous ez-link redemptions or auto-transfer their physical stock.
BEGIN;
CREATE TABLE IF NOT EXISTS goodie_bag_inventory (
 site text PRIMARY KEY CHECK(site IN ('PDD','PS')),
 total_quantity integer NOT NULL DEFAULT 0 CHECK(total_quantity>=0),
 redeemed_quantity integer NOT NULL DEFAULT 0 CHECK(redeemed_quantity>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(redeemed_quantity<=total_quantity)
);
INSERT INTO goodie_bag_inventory(site) VALUES ('PDD'),('PS') ON CONFLICT DO NOTHING;
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
INSERT INTO prizes(id,name,description,tier,icon,is_active)
 VALUES ('ezlink-card','ez-link Card','Physical ez-link card awarded through the regular Lucky Dip','STANDARD','gift',false)
 ON CONFLICT(id) DO NOTHING;
INSERT INTO site_inventory(prize_id,site)
 VALUES ('ezlink-card','PDD'),('ezlink-card','PS')
 ON CONFLICT(prize_id,site) DO NOTHING;
COMMIT;
