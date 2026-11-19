# NELBD private CSV backups through the existing Power Automate flow

## Intended schedule and recipients

- **Daily summary**: 10:30 PM Asia/Singapore, to
  `nelbd2026@gmail.com;bernando@farm.sg;selwyn@farm.sg`.
- **Private operational CSV export**: 10:35 PM Asia/Singapore, to
  `nelbd2026@gmail.com` **only**.
- CSV backup is **OFF by default** (requires `NELBD_CSV_BACKUP_ENABLED=YES`).
- Both stop after 7 December 2026 (the summary becomes a one-off sign-off on that date).
- A separate `nelbd_csv_backup_delivery` ledger allows at most one CSV handoff per date.

The CSV export includes six files:
- `nelbd_participants_DATE.csv` (contains **nicknames and mobile numbers**)
- `nelbd_draws_DATE.csv`
- `nelbd_prize_stock_DATE.csv`
- `nelbd_goodie_stock_DATE.csv`
- `nelbd_goodie_handovers_DATE.csv`
- `nelbd_stock_audit_DATE.csv`

This is a **CSV operational export**, not a complete PostgreSQL disaster-recovery backup. It does not include every schema, app setting, secret or service configuration.

## Required manual Power Automate edit BEFORE enabling CSV backups

The existing HTTP-triggered Power Automate flow already sends email from the
NELBD shared Outlook mailbox. The flow currently ignores `attachments`.
Its existing Send shared mailbox V2 action must accept an optional attachments array
from the incoming JSON **without affecting voucher or summary emails**.

1. Open the existing `manual` trigger. Its JSON request schema can be extended
   with an optional top-level property:
   `"attachments":{"type":"array","items":{"type":"object","properties":{"Name":{"type":"string"},"ContentBytes":{"type":"string"}},"required":["Name","ContentBytes"]}}`
   **Do not add attachments to the trigger's `required` list.**
2. In the **Send an email from a shared mailbox (V2)** action, open advanced
   parameters, show **Attachments**, and configure the action's *attachments
   array* with this Expression (not a literal string):
   `coalesce(triggerBody()?['attachments'], json('[]'))`.
   Depending on the connector's Power Automate designer, the Attachments field
   may appear as an array input or as a multi-row UI. Do not place the
   expression in an individual attachment Name or Content field. It must
   represent the entire attachments array.
3. Preserve existing dynamic `to`, `subject`, `html` mappings, and both
   callback branches. The current daily branch recognizes any ticketNumber
   starting `NELBD-DAILY-`, which includes CSV backup messages.
4. **Save**. Test a normal voucher email only in an authorized safe testing
   environment, not against a live voucher draw; ensure absent attachments
   create no files.
5. In NELBD Operations Overview (super-admin), click **Send CSV Backup Test**.
   It uses real export records but sends only to `nelbd2026@gmail.com` with
   `[TEST ONLY]` subject. Verify six downloadable .csv attachments in Gmail
   and a `sent` callback, not just the email arriving without attachments.
6. Only after this verified test, set the single flag
   `NELBD_CSV_BACKUP_ENABLED=YES` on Render.

Security: these CSV files contain PII. Treat the Outlook HTTP trigger URL and
callback secret as confidential, and enable secure inputs/outputs for the relevant
Power Automate actions and trigger where possible. Keep the backup mailbox
restricted. Avoid forwarding these attachments to Bernando or Selwyn.

One-time migration: run `APPLY_NELBD_DAILY_REPORT_MIGRATION=YES` once to apply
the new idempotent 020 CSV ledger, confirm the schema-ready log, then reset the
flag to NO. The daily summary ledger and test table are not dropped or reset.
