-- NELBD Quest prizes. Additive migration; NEVER sends or allocates vouchers.
BEGIN;
CREATE TABLE IF NOT EXISTS quest_prize_slots (
 slot_id text PRIMARY KEY,
 tier text NOT NULL CHECK(tier IN ('first','second','third','consolation')),
 prize_cents integer NOT NULL,
 voucher_denomination_cents integer NOT NULL,
 voucher_quantity integer NOT NULL,
 pair_number integer NOT NULL,
 claim_token_hash text UNIQUE,
 winner_name text,
 winner_email text,
 state text NOT NULL DEFAULT 'unclaimed'
   CHECK(state IN ('unclaimed','submitted','approved','processing','sent','cancelled','needs_review')),
 submitted_at timestamptz,
 approved_by text,
 approved_at timestamptz,
 viewer_token_hash text UNIQUE,
 viewer_expires_at timestamptz,
 viewer_revoked_at timestamptz,
 delivery_attempt_id uuid UNIQUE,
 delivery_started_at timestamptz,
 delivery_status text,
 delivery_detail text,
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (prize_cents = voucher_quantity * voucher_denomination_cents)
);
INSERT INTO quest_prize_slots(slot_id,tier,prize_cents,voucher_denomination_cents,voucher_quantity,pair_number)
VALUES
('F1','first',200000,25000,8,1),('F2','first',200000,25000,8,1),
('S1','second',100000,25000,4,2),('S2','second',100000,25000,4,2),
('T1','third',50000,25000,2,3),('T2','third',50000,25000,2,3),
('C1A','consolation',10000,10000,1,1),('C1B','consolation',10000,10000,1,1),
('C2A','consolation',10000,10000,1,2),('C2B','consolation',10000,10000,1,2),
('C3A','consolation',10000,10000,1,3),('C3B','consolation',10000,10000,1,3),
('C4A','consolation',10000,10000,1,4),('C4B','consolation',10000,10000,1,4),
('C5A','consolation',10000,10000,1,5),('C5B','consolation',10000,10000,1,5),
('C6A','consolation',10000,10000,1,6),('C6B','consolation',10000,10000,1,6),
('C7A','consolation',10000,10000,1,7),('C7B','consolation',10000,10000,1,7)
ON CONFLICT(slot_id) DO NOTHING;
CREATE TABLE IF NOT EXISTS quest_vouchers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 denomination_cents integer NOT NULL CHECK(denomination_cents IN (10000,25000)),
 code_ciphertext text NOT NULL,
 url_ciphertext text NOT NULL,
 code_fingerprint text NOT NULL UNIQUE,
 url_fingerprint text NOT NULL UNIQUE,
 source_batch text NOT NULL,
 starts_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 slot_id text REFERENCES quest_prize_slots(slot_id),
 assigned_at timestamptz,
 CHECK(expires_at>starts_at)
);
CREATE INDEX IF NOT EXISTS quest_vouchers_unassigned_idx ON quest_vouchers(denomination_cents,id) WHERE slot_id IS NULL;
CREATE TABLE IF NOT EXISTS quest_events (
 id bigserial PRIMARY KEY, slot_id text REFERENCES quest_prize_slots(slot_id),
 event text NOT NULL, actor text NOT NULL, detail text,
 happened_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;