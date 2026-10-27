-- Fresh PostgreSQL schema for NELBD. Apply only to staging database.
-- Prize catalogue is seeded separately by 001_inventory_catalog.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS participants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 nickname text NOT NULL CHECK (length(trim(nickname)) BETWEEN 1 AND 64),
 mobile_number text NOT NULL UNIQUE CHECK (mobile_number ~ '^\\+65[89][0-9]{7}$'),
 site text NOT NULL CHECK (site IN ('PDD','PS')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS draws (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ticket_number text NOT NULL UNIQUE,
 participant_id uuid NOT NULL UNIQUE REFERENCES participants(id),
 prize_id text NOT NULL REFERENCES prizes(id),
 prize_name text NOT NULL,
 prize_tier text NOT NULL CHECK (prize_tier IN ('TOP','STANDARD')),
 site text NOT NULL CHECK (site IN ('PDD','PS')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','forfeited')),
 kiosk_id text NOT NULL,
 drawn_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz
);
CREATE INDEX IF NOT EXISTS draws_site_time_idx ON draws(site,drawn_at DESC);
CREATE TABLE IF NOT EXISTS inventory_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 prize_id text NOT NULL REFERENCES prizes(id),
 site text NOT NULL CHECK (site IN ('PDD','PS')),
 previous_quantity integer NOT NULL,
 new_quantity integer NOT NULL,
 delta integer NOT NULL,
 reason text NOT NULL CHECK (reason IN ('initial_stock','restock','draw','manual_adjustment','transfer')),
 adjusted_by text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kiosk_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK(id=1),
 festival_name text NOT NULL DEFAULT 'NELBD Trail Lucky Dip',
 kiosk_active boolean NOT NULL DEFAULT true,
 active_site text NOT NULL DEFAULT 'PDD' CHECK (active_site IN ('PDD','PS')),
 welcome_message text NOT NULL DEFAULT '',
 terms_summary text NOT NULL DEFAULT '',
 max_draws_per_participant integer NOT NULL DEFAULT 1 CHECK(max_draws_per_participant=1),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO kiosk_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
-- Password hashes only, never plaintext. Admin authentication will be server-side.
CREATE TABLE IF NOT EXISTS admin_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE,
 password_hash text NOT NULL,
 role text NOT NULL CHECK (role IN ('super_admin','staff')),
 site_access text NOT NULL DEFAULT 'ALL' CHECK(site_access IN ('ALL','PDD','PS')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 admin_id uuid NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
