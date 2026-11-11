-- Isolated test-email acknowledgements, never contains voucher credentials.
BEGIN;
CREATE TABLE IF NOT EXISTS quest_test_emails(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 delivery_attempt_id uuid NOT NULL UNIQUE,
 recipient text NOT NULL,
 status text NOT NULL,
 handoff_status text,
 requested_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
COMMIT;
