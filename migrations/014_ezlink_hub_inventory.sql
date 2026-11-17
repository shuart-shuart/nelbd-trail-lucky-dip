-- Separate physical ez-link holdings. Historical claims remain attached to their original hub.
-- Old unallocated stock stays in the central pool until a super-admin allocates it.
BEGIN;
CREATE TABLE IF NOT EXISTS ezlink_hub_inventory (
 site text PRIMARY KEY CHECK(site IN ('PDD','PS')),
 allocated_quantity integer NOT NULL DEFAULT 0 CHECK(allocated_quantity>=0),
 redeemed_quantity integer NOT NULL DEFAULT 0 CHECK(redeemed_quantity>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(redeemed_quantity<=allocated_quantity)
);
INSERT INTO ezlink_hub_inventory(site,allocated_quantity,redeemed_quantity)
 SELECT hub.site,COUNT(e.id)::integer,COUNT(e.id)::integer
 FROM (VALUES ('PDD'),('PS')) AS hub(site)
 LEFT JOIN ezlink_redemptions e ON e.site=hub.site
 GROUP BY hub.site
 ON CONFLICT(site) DO NOTHING;
CREATE TABLE IF NOT EXISTS ezlink_hub_stock_audit (
 id bigserial PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('ADJUST','TRANSFER')),
 from_site text CHECK(from_site IN ('PDD','PS','UNALLOCATED')),
 to_site text CHECK(to_site IN ('PDD','PS')),
 delta integer NOT NULL,
 previous_total integer,
 new_total integer,
 actor text NOT NULL,
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 500),
 happened_at timestamptz NOT NULL DEFAULT now()
);
-- Never write to original pooled counts during migration. No cards are issued.
COMMIT;
