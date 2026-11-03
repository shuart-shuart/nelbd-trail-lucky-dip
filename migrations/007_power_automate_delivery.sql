-- Safe, opt-in state for Power Automate delivery; no existing rows are sent or reset.
BEGIN;
ALTER TABLE grab_voucher_claim_sessions
  DROP CONSTRAINT IF EXISTS grab_voucher_claim_sessions_status_check;
ALTER TABLE grab_voucher_claim_sessions
  ADD CONSTRAINT grab_voucher_claim_sessions_status_check
  CHECK (status IN ('awaiting_email','queued','processing','sent','failed'));
ALTER TABLE grab_voucher_claim_sessions
  ADD COLUMN IF NOT EXISTS delivery_attempt_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS delivery_error_code text;
CREATE UNIQUE INDEX IF NOT EXISTS grab_voucher_delivery_attempt_unique_idx
  ON grab_voucher_claim_sessions(delivery_attempt_id)
  WHERE delivery_attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS grab_voucher_delivery_pending_idx
  ON grab_voucher_claim_sessions(created_at)
  WHERE status='queued';
COMMIT;
