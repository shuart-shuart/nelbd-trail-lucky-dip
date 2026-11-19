-- Synthetic daily report email smoke tests only.
-- Never touches participant, voucher, Lucky Dip, or Goodie Bag ledgers.
CREATE TABLE IF NOT EXISTS nelbd_daily_report_tests(
 delivery_attempt_id uuid PRIMARY KEY,
 requested_by text NOT NULL,
 state text NOT NULL CHECK(state IN ('sending','accepted','rejected','uncertain','sent','failed')),
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS nelbd_daily_report_tests_created_idx
 ON nelbd_daily_report_tests(created_at DESC);
