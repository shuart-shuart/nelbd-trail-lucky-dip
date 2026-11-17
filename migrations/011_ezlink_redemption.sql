-- Additive, isolated ez-link inventory/redemption schema. Zero stock until explicitly configured.
-- Does not alter existing Lucky Dip or Quest tables and does not issue cards.
BEGIN;
CREATE TABLE IF NOT EXISTS ezlink_inventory (
 id integer PRIMARY KEY CHECK(id=1),
 total_quantity integer NOT NULL DEFAULT 0 CHECK(total_quantity>=0),
 redeemed_quantity integer NOT NULL DEFAULT 0 CHECK(redeemed_quantity>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(redeemed_quantity<=total_quantity)
);
INSERT INTO ezlink_inventory(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS ezlink_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 participant_id uuid NOT NULL UNIQUE REFERENCES participants(id),
 draw_id uuid NOT NULL UNIQUE REFERENCES draws(id),
 site text NOT NULL CHECK(site IN ('PDD','PS')),
 scenario text NOT NULL CHECK(scenario IN ('17_fresh','17_returning')),
 issued_by text NOT NULL,
 redeemed_at timestamptz NOT NULL DEFAULT now(),
 booklet_17_verified boolean NOT NULL CHECK(booklet_17_verified=true),
 second_punch_confirmed boolean NOT NULL CHECK(second_punch_confirmed=true)
);
CREATE INDEX IF NOT EXISTS ezlink_redemptions_time_idx ON ezlink_redemptions(redeemed_at DESC);
CREATE TABLE IF NOT EXISTS ezlink_inventory_audit (
 id bigserial PRIMARY KEY,
 previous_total integer NOT NULL,
 new_total integer NOT NULL,
 actor text NOT NULL,
 happened_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
