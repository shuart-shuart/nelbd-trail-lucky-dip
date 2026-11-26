-- Fallback staff-issued Grab voucher awards without an existing kiosk ticket.
-- A missing participant is allowed ONLY for synthetic STAFF_INPUT draws.
BEGIN;
ALTER TABLE draws ALTER COLUMN participant_id DROP NOT NULL;
ALTER TABLE draws DROP CONSTRAINT IF EXISTS draws_staff_input_participant_check;
ALTER TABLE draws ADD CONSTRAINT draws_staff_input_participant_check
  CHECK (participant_id IS NOT NULL OR kiosk_id='STAFF_INPUT');
ALTER TABLE grab_staff_contact_submissions
  ADD COLUMN IF NOT EXISTS staff_input boolean NOT NULL DEFAULT false;
ALTER TABLE grab_staff_contact_submissions
  ADD COLUMN IF NOT EXISTS contact_fingerprint text;
CREATE UNIQUE INDEX IF NOT EXISTS grab_staff_input_contact_unique
  ON grab_staff_contact_submissions(contact_fingerprint)
  WHERE staff_input=true AND contact_fingerprint IS NOT NULL;
COMMIT;
