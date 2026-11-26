# Ground-staff Grab voucher contact page (NOT enabled by this PR)

Purpose: collect a winning S$5 or S$10 Grab voucher ticket's **email OR SG handphone**, without exposing voucher codes or allowing staff access to inventory. Staff may record collection at PDD, PS, or FARM. FARM is a **collection location only**, not a draw hub.

## Staff experience

Proposed URL: `/staff/grab-redemption`. The app checks a **separate server-side password** (not super-admin credentials) before ticket lookup or submission. Ticket must be a previously drawn `NELBD-PDD-XXXXXX` or `NELBD-PS-XXXXXX` Grab S$5/S$10 prize. S$50 and arbitrary/manual code assignment are intentionally excluded. Each claim accepts one submission:

- Email: sets existing claim from `awaiting_email` to `queued`. The existing Grab Power Automate email worker sends the same already assigned codes.
- Phone: sets claim to `manual_followup`, preserving the reserved vouchers without an email send; stores location and normalized SG number in private database; attempts a **separate** Power Automate alert to `nelbd2026@gmail.com`. Admin can review pending phone submissions at `/admin/grab-vouchers` and mark contacted after manual outreach.

Concurrent contact submissions are serialized with a row lock and a single-state transition. Claims already queued, processing, sent, failed, or manually followed up cannot be overwritten through the staff page.

## Activation requirements (deliberately not fulfilled automatically)

1. Apply `migrations/021_grab_staff_contact_portal.sql` through the existing opt-in migration runner (`APPLY_NELBD_GRAB_STAFF_MIGRATION=YES` for **one** authorized deploy, then remove flag). Validate schema before enabling the page.
2. Configure `NELBD_GRAB_STAFF_PASSWORD` **only in Render secrets**, using a unique random password **at least 12 characters**. The short example PIN proposed in chat is intentionally rejected. Never commit or share the password in Git or support messages. The login uses an HttpOnly, SameSite=Strict, four-hour cookie and limits login attempts; it is distinct from admin.
3. Create a **separate** Power Automate flow with HTTP trigger schema: `ticketNumber`, `to`, `subject`, `html` (all strings), with `additionalProperties:false`. Send an HTML email through the authorized shared mailbox. Optionally validate `to` is `nelbd2026@gmail.com` in the flow. **Do not reuse** the existing Grab voucher delivery flow; it posts Grab status callbacks and could incorrectly mark voucher emails. Store its signed HTTPS trigger as `NELBD_GRAB_STAFF_NOTIFY_TRIGGER_URL` **in Render**, never the repository. Verify the flow to the designated mailbox using a dummy payload **without real participant numbers** before enabling live staff submissions. A 2xx response means trigger acceptance, not inbox delivery.
4. Set `NELBD_GRAB_STAFF_PORTAL_ENABLED=YES` in Render, then deploy, test an existing dedicated **test-only** S$5 / S$10 winning ticket with contact submission, review audit list, and confirm the Power Automate notification arrived. Do **not** use real winners for testing without a clear authorization; submissions cannot be undone by ground staff.
5. Remove migration flag from Render afterward. Restrict visibility of the admin manual-followup table to super-admin staff and limit the data-retention period under your event's privacy policy.

When notification HTTP is unavailable, the phone claim stays saved as `manual_followup` with `notification_state=uncertain` or `not_configured`. This never silently marks the participant's voucher sent. Admin's table is the fallback; staff should alert a supervisor. There is no blind automatic retry of sensitive notifications.

## Limitations

- This does not provide a PIN-only deployment for a three-digit passcode. On a public site collecting minors' or guardians' contact data, short shared PINs can be guessed.
- The staff password authenticates the team as a whole, not an individual employee. For per-staff audit attribution, provision individual accounts in a separate enhancement.
- Marking **contacted** is an administrative attestation of follow-up, not proof of voucher redemption.
- Existing Grab processing or sent records are not changed by this feature.
