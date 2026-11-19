-- Private NELBD operational CSV email handoff ledger; separate from summary dates.
CREATE TABLE IF NOT EXISTS nelbd_csv_backup_delivery(
 date date PRIMARY KEY,
 delivery_attempt_id uuid NOT NULL UNIQUE,
 state text NOT NULL CHECK(state IN ('sending','accepted','uncertain','sent','failed')),
 last_error text,
 started_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz
);
