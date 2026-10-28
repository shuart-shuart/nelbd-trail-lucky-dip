-- NELBD PostgreSQL migration draft. Do not run on the live Firebase-backed app.
-- Prize catalogue transcribed from the supplied inventory screenshot.
-- TOP for the first row, STANDARD for the remaining rows (confirm merchandise tiers).
-- No previous quantities, participants, draws or history are imported.
BEGIN;
CREATE TABLE IF NOT EXISTS prizes (
 id text PRIMARY KEY,
 name text NOT NULL,
 description text NOT NULL DEFAULT '',
 tier text NOT NULL CHECK (tier IN ('TOP','STANDARD')),
 icon text NOT NULL DEFAULT 'gift',
 image_url text NOT NULL DEFAULT '',
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS site_inventory (
 prize_id text NOT NULL REFERENCES prizes(id),
 site text NOT NULL CHECK (site IN ('PDD','PS')),
 allocated_quantity integer NOT NULL DEFAULT 0 CHECK (allocated_quantity >= 0),
 remaining_quantity integer NOT NULL DEFAULT 0 CHECK (remaining_quantity >= 0),
 claimed_quantity integer NOT NULL DEFAULT 0 CHECK (claimed_quantity >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(prize_id,site),
 CHECK (allocated_quantity = remaining_quantity + claimed_quantity)
);
INSERT INTO prizes(id,name,tier,icon) VALUES
 ('merch-choice','Pick a merch of your choice!','TOP','gift'),
 ('nelbd-fan','NELBD Fan','STANDARD','gift'),
 ('nelbd-pencil','NELBD Pencil','STANDARD','gift'),
 ('nelbd-enamel-pin','NELBD Enamel Pin','STANDARD','award'),
 ('nelbd-towel','NELBD Towel','STANDARD','gift'),
 ('nelbd-mosquito-patch','NELBD Mosquito Patch','STANDARD','gift'),
 ('grab-voucher','Grab Voucher','STANDARD','gift')
ON CONFLICT(id) DO NOTHING;
INSERT INTO site_inventory(prize_id,site)
SELECT id, site FROM prizes CROSS JOIN (VALUES ('PDD'),('PS')) AS locations(site)
ON CONFLICT(prize_id,site) DO NOTHING;
COMMIT;
