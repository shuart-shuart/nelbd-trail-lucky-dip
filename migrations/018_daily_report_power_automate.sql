-- Power Automate correlation for the existing daily report delivery ledger.
-- No modification to Lucky Dip, Goodie Bag or existing voucher emails.
ALTER TABLE nelbd_daily_report_delivery
 ADD COLUMN IF NOT EXISTS delivery_attempt_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS nelbd_daily_report_delivery_attempt_unique
 ON nelbd_daily_report_delivery(delivery_attempt_id)
 WHERE delivery_attempt_id IS NOT NULL;
