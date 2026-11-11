# NELBD Quest — grand-prize implementation (DRAFT; DO NOT DEPLOY)
## Prize structure
20 individual winners, 42 Grab vouchers (S$8,400):
- First F1/F2: S$2,000 each = 8 x S$250 each
- Second S1/S2: S$1,000 each = 4 x S$250 each
- Third T1/T2: S$500 each = 2 x S$250 each
- Consolation C1A/B–C7A/B: 14 winners, S$100 each = 1 x S$100 each

## Two-stage review
1. Draft PR #38: public /quest/claim/:token form, private claim links, super-admin /admin/quest panel, one-time name/email submission and separate approval. Safe by default. Requires migration 009.
2. Draft PR #39: S$250/S$100 encrypted CSV import, manual send, dummy test emails, private /quest/vouchers/:token pages, download, link revocation, Quest Power Automate callback. Requires migrations 009 and 010 and approval of PR #38.

## Security and activation
- Never commit CSVs, code plaintext or signed trigger URLs.
- Do not import 42 codes into the existing $5 pool. Quest records are independent tables.
- Quest imports default OFF. Enable NELBD_QUEST_IMPORT_ENABLED=YES only for a supervised import, then disable it.
- Quest emails default OFF. Configure NELBD_QUEST_TRIGGER_URL as a **new** Power Automate HTTP trigger and enable NELBD_QUEST_SEND_ENABLED=YES only for reviewed testing.
- The new flow accepts JSON strings {deliveryId,ticketNumber,to,subject,html}; sends email from the verified shared mailbox; POSTs to https://<app>/api/quest/automation/complete with Authorization: Bearer <NELBD_POWER_AUTOMATE_CALLBACK_KEY>, JSON {deliveryId,status:"sent"} after successful Outlook action. Failures must callback with status failed when possible.
- Never use the existing $5 Power Automate trigger without verifying that its callback is changed to Quest. Use a separate flow.
- Staff reviews name and email before approval, then manually clicks Approve & send now for each approved winner.
- A failed/ambiguous handoff stays needs_review with vouchers reserved. There is no automatic retry.
- A private viewing URL is a bearer capability; anyone who possesses the link can view the vouchers. Use expiry, no-referrer policy and staff revocation. Consider email OTP / recipient verification before launch.
- Revocation stops future page access only. It cannot recall an email or undo codes already viewed/redeemed.

## Offline/manual acceptance checklist (no live voucher delivery)
- Migration 009 creates 20 unclaimed slots, values sum to S$8,400.
- Generate one F1 claim link and submit test name/email. Second submission must return 409.
- Admin approves; no email should be sent at this stage.
- Verify S$250 and S$100 CSV layouts offline. Confirm duplicates, denomination and malformed URLs are rejected.
- With only dummy test mode configured, test the First, Second, Third and Consolation email content to an internal mailbox.
- Confirm Outlook action success and /api/quest/automation/complete callback; distinguish handoff acceptance from sent.
- Test an expired, revoked, invalid or unassigned voucher viewer link returns an error without secrets.
- Verify a second click on real Send is blocked, no duplicate email/codes, and the public $5 Lucky Dip remains unchanged.
- Confirm voucher values (28 × S$250 and 14 × S$100), no prematurely redeemable voucher and no real email in a trial run.

## Not done
No live migration, import, real email, or deployment has been performed. Full end-to-end tests require an isolated database and a configured Microsoft test flow.
