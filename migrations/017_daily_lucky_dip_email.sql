-- Additive delivery ledger only; never changes prize stock, draws or claims.
CREATE TABLE IF NOT EXISTS nelbd_daily_report_delivery(
 date date PRIMARY KEY,
 state text NOT NULL CHECK(state IN ('sending','sent','failed')),
 started_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 gmail_message_id text,
 last_error text
);
