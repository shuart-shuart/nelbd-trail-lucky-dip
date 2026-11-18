-- Separate physical ez-link inventory by handover hub. Idempotent and additive.
-- Historical redemptions remain unchanged; legacy unissued stock is UNALLOCATED.
-- Run only with explicitly approved APPLY_NELBD_EZLINK_MIGRATIONS=YES.
BEGIN;
CREATE TABLE IF NOT EXISTS ezlink_site_inventory (
 site text PRIMARY KEY CHECK(site IN ('PDD','PS')),
 total_quantity integer NOT NULL DEFAULT 0 CHECK(total_quantity>=0),
 redeemed_quantity integer NOT NULL DEFAULT 0 CHECK(redeemed_quantity>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(redeemed_quantity<=total_quantity)
);
-- Existing issued cards count toward each site's history. No unsold stock is guessed.
INSERT INTO ezlink_site_inventory(site,total_quantity,redeemed_quantity)
SELECT s.site,count(e.id)::int,count(e.id)::int
FROM (VALUES ('PDD'),('PS')) AS s(site)
LEFT JOIN ezlink_redemptions e ON e.site=s.site
GROUP BY s.site
ON CONFLICT(site) DO NOTHING;
CREATE TABLE IF NOT EXISTS ezlink_site_stock_audit (
 id bigserial PRIMARY KEY,
 action text NOT NULL CHECK(action IN ('ALLOCATE','RECEIVE','CORRECT','TRANSFER')),
 from_site text CHECK(from_site IN ('PDD','PS')),
 to_site text CHECK(to_site IN ('PDD','PS')),
 quantity integer NOT NULL CHECK(quantity>0),
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 500),
 actor text NOT NULL,
 happened_at timestamptz NOT NULL DEFAULT now(),
 before_from_total integer,
 after_from_total integer,
 before_to_total integer,
 after_to_total integer,
 before_global_total integer NOT NULL,
 after_global_total integer NOT NULL
);
-- Fail the migration if legacy global ledger is inconsistent with site history.
DO $$
BEGIN
 IF (SELECT redeemed_quantity FROM ezlink_inventory WHERE id=1) <>
    (SELECT coalesce(sum(redeemed_quantity),0) FROM ezlink_site_inventory) THEN
  RAISE EXCEPTION 'Site redemption history differs from global ledger; manually reconcile before migration';
 END IF;
 IF (SELECT total_quantity FROM ezlink_inventory WHERE id=1) <
    (SELECT coalesce(sum(total_quantity),0) FROM ezlink_site_inventory) THEN
  RAISE EXCEPTION 'Global stock cannot cover historical hub redemptions';
 END IF;
END $$;
COMMIT;
