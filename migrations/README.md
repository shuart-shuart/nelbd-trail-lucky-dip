# PostgreSQL migration — staging only

## State
This branch is **not deployed** and does not switch any existing route away from Firebase. The Render PostgreSQL instance is provisioned, but its connection URL has not been injected into the web service and SQL has not been executed. The Render integration exposed to this assistant supports **read-only SQL**, so schema migrations require a separate privileged migration runner or a secure operator action.

## Safe cutover checklist
1. Obtain the database's **internal connection URL** from the Render dashboard. Set `DATABASE_URL` as a secret on the staging web service, never in GitHub. Do not send the URL in chat.
2. Apply `migrations/001_inventory_catalog.sql` followed by `migrations/002_core_tables.sql` using a privileged migration process. Confirm seven prize rows and fourteen zero-stock site rows.
3. Implement and test PostgreSQL-backed prize drawing with a single transaction, row locks and unique mobile-number enforcement. Do not enable a public draw endpoint until remote abuse protection is in place.
4. Replace all client Firestore subscriptions and mutations in the admin dashboard with authenticated server endpoints; implement password hashing, secure session cookies, CSRF protection, and role/site checks.
5. Migrate kiosk settings, participant duplicate checks and redemption history queries to the new server API.
6. Remove Firebase imports and dependencies only after the replacement paths have passed tests. Seed admin access securely out-of-band.
7. Validate both sites, zero-stock behavior, concurrent draws, duplicate numbers, admin changes, and redemption history in staging before cutover.

## Confirmed prize tiers
TOP: Pick a merch of your choice!
STANDARD: NELBD Fan, NELBD Pencil, NELBD Enamel Pin, NELBD Towel, NELBD Mosquito Patch, Grab Voucher.

## Retention
No historical participant, draw or redemption records will be imported. No old inventory quantities are carried over. Prize images and full truncated descriptions must be supplied or re-entered separately.

## Operational caution
The free Render Postgres database expires on 26 November 2026. Upgrade to a durable plan before the event. Database backups, encryption, data retention and access controls must be reviewed before handling participants' mobile numbers.
