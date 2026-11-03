-- Prize throttling and Grab fulfilment schema. No live voucher codes imported here.
BEGIN;
CREATE TABLE IF NOT EXISTS prize_site_limits (
 prize_id text NOT NULL REFERENCES prizes(id),
 site text NOT NULL CHECK(site IN ('PDD','PS')),
 daily_cap integer CHECK(daily_cap IS NULL OR daily_cap >= 0),
 paused boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(prize_id,site)
);
INSERT INTO prize_site_limits(prize_id,site)
 SELECT prize_id,site FROM site_inventory ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS grab_voucher_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code_ciphertext text NOT NULL,
 url_ciphertext text NOT NULL,
 code_fingerprint text NOT NULL UNIQUE,
 url_fingerprint text NOT NULL UNIQUE,
 denomination_cents integer NOT NULL CHECK(denomination_cents>0),
 starts_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 source_batch text NOT NULL,
 assigned_draw_id uuid UNIQUE REFERENCES draws(id),
 assigned_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(expires_at>starts_at)
);
CREATE INDEX IF NOT EXISTS grab_vouchers_available_idx ON grab_voucher_codes(starts_at,expires_at) WHERE assigned_draw_id IS NULL;
CREATE TABLE IF NOT EXISTS voucher_fulfilments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 draw_id uuid NOT NULL UNIQUE REFERENCES draws(id),
 voucher_id uuid NOT NULL UNIQUE REFERENCES grab_voucher_codes(id),
 recipient_email text NOT NULL,
 redemption_token_hash text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','queued','sent','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS voucher_email_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 fulfilment_id uuid NOT NULL REFERENCES voucher_fulfilments(id),
 status text NOT NULL CHECK(status IN ('queued','sent','failed')),
 provider_message_id text,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
