-- Opt-in staff contact collection; does not touch existing voucher allocations.
BEGIN;
ALTER TABLE grab_voucher_claim_sessions DROP CONSTRAINT IF EXISTS grab_voucher_claim_sessions_status_check;
ALTER TABLE grab_voucher_claim_sessions
  ADD CONSTRAINT grab_voucher_claim_sessions_status_check
  CHECK (status IN ('awaiting_email','queued','processing','sent','failed','manual_followup','manual_contacted'));
CREATE TABLE IF NOT EXISTS grab_staff_sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS grab_staff_contact_submissions (
  draw_id uuid PRIMARY KEY REFERENCES draws(id),
  collection_site text NOT NULL CHECK (collection_site IN ('PDD','PS','FARM')),
  contact_kind text NOT NULL CHECK (contact_kind IN ('email','phone')),
  contact_email text,
  contact_phone text,
  notification_state text NOT NULL DEFAULT 'not_applicable'
    CHECK (notification_state IN ('not_applicable','pending','sending','accepted','uncertain','not_configured')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  contacted_at timestamptz,
  CHECK ((contact_kind='email' AND contact_email IS NOT NULL AND contact_phone IS NULL)
      OR (contact_kind='phone' AND contact_phone IS NOT NULL AND contact_email IS NULL))
);
CREATE INDEX IF NOT EXISTS grab_staff_contacts_pending_idx ON grab_staff_contact_submissions(submitted_at)
 WHERE contact_kind='phone' AND contacted_at IS NULL;
COMMIT;
