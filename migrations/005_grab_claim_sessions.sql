BEGIN;
CREATE TABLE IF NOT EXISTS grab_voucher_claim_sessions (
 draw_id uuid PRIMARY KEY REFERENCES draws(id),
 voucher_id uuid NOT NULL UNIQUE REFERENCES grab_voucher_codes(id),
 token_hash text NOT NULL UNIQUE,
 recipient_email text,
 status text NOT NULL DEFAULT 'awaiting_email' CHECK(status IN ('awaiting_email','queued','sent','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grab_voucher_claim_status_idx ON grab_voucher_claim_sessions(status,created_at);
COMMIT;
