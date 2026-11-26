# Grab voucher staff-input fallback (no winning ticket required)

Staff page: `/staff/grab-redemption`, behind the **separate staff password**.

Use only if the normal Lucky Dip app fails **before a winner receives a prize**. The staff member must first check the participant has not already drawn/received an award; the fallback does not identify participants by their kiosk mobile number.

## Workflow

- Staff choose collection location **PDD**, **PS**, or **FARM**.
- Staff choose **S$5** (one S$5 Grab code) or **S$10** (two separate S$5 Grab codes).
- **PDD/PS:** email or Singapore handphone. **FARM:** email only, enforced in UI and backend.
- Submit **only an email or phone**, with no pre-existing winning ticket.
- The server creates a new `STAFF_INPUT` draw reference, reserves the correct number of existing unassigned S$5 voucher codes, and deducts **one award from the general `grab-voucher` PDD/PS `site_inventory` row**, *not* the dormant S$5/S$10 inventory rows, all in one PostgreSQL transaction using the shared draw advisory lock. `inventory_adjustments.adjusted_by='staff-input'`.
- For FARM, records the collection location as **FARM**, and uses an eligible PDD or PS existing stock row with the largest remaining quantity. There is no independent FARM inventory pool.
- **Email:** creates a queued claim for the existing automatic Grab voucher worker and Power Automate email delivery (same codes/template/callback logic).
- **Handphone:** creates a `manual_followup` claim, reserves the assigned codes without an email, and requests a **separate** Power Automate notification to `nelbd2026@gmail.com`. No voucher codes are sent in the notification. Super-admin can review/mark contacted in the Grab Email Centre.
- Grab Voucher Email Centre labels synthetic rows **staff-input** and displays collection location; draw history also shows `staff-input`. The ticket is an audit reference generated automatically, *not* something staff enter.

## Safety checks

- Staff password must be ≥12 chars in the Render `NELBD_GRAB_STAFF_PASSWORD` secret; public 3-digit PINs not permitted.
- Server-side authenticated sessions, same-origin write checks and per-session request throttling remain in place.
- The general `grab-voucher` prize may be inactive for random Lucky Dip draws; staff-input explicitly uses its PDD/PS stock row regardless of that inactive flag. Sufficient remaining general stock and available, in-date Grab S$5 codes are required; general hub pause and daily caps remain enforced. The S$5/S$10 prize identifiers remain on draw records solely to preserve the correct one-code/two-code email bundle.
- Contact fingerprint is keyed using existing voucher encryption secret and has a unique index for staff submissions. Email is also checked against existing queued/sent claims; handphone against existing Lucky Dip participants. Existing real winner records are never edited by the fallback.
- All stock, draw, code assignment, claim and staff-input audit writes are in one transaction. A failure rolls back everything.
- The staff page cannot reveal voucher codes, arbitrarily change inventory, use a S$50 prize, or submit more than one claim with the same contact.
- **Limitation:** Without a kiosk identity or prior winning ticket, this cannot prove two different email addresses belong to the same participant, and using a shared family email can legitimately trigger the duplicate check. Staff verification remains essential.

## Rollout

1. Merge approved PR and deploy with `APPLY_NELBD_GRAB_STAFF_MIGRATION=YES` **one time**; runner applies idempotent 021 followed by 022. Confirm `NELBD_GRAB_STAFF_CONTACT_SCHEMA_READY` and deployment Live. Do not submit real vouchers while the migration runs.
2. Set migration flag to `NO` again (triggers another deployment).
3. Confirm staff password and separate `NELBD_GRAB_STAFF_NOTIFY_TRIGGER_URL` are configured privately on Render.
4. Use authenticated login to open the staff page. Verify form options and admin labels **without clicking Confirm staff-input voucher** on real data. Confirm stock and Power Automate only after a deliberately authorized non-production test.

## Existing portal

PR #74 previously required a ticket number, intended as a redemption/contact collection helper. This change **replaces that workflow** with an emergency award/fulfilment fallback. It does not alter already recorded staff submissions or existing Grab email sends.

## Stock pool clarification (26 November 2026)

Staff-input S$5 and S$10 both deduct **one** from the general `grab-voucher` award count in the chosen PDD/PS inventory (or whichever of those is selected for FARM). They do **not** reduce the dormant denomination-specific award counts. Independently, S$5 reserves **one** real S$5 Grab code; S$10 reserves **two**. When the general Grab Voucher remaining quantity is zero, the staff-input form rejects issuance rather than pulling from S$5/S$10 award inventory.

## FARM-only second verification (26 November 2026)

The main staff portal password continues to cover PDD and PS. FARM requires an **additional, distinct** password before its S$5 / S$10 email-only redemption fields appear. The backend independently rejects FARM award submissions until the same staff session has verified the FARM password. Authorization expires after 15 minutes, on logout, or after a server restart. A password guess throttle is applied per client and globally.

To enable FARM, set a separate secret `NELBD_GRAB_FARM_VERIFICATION_PASSWORD` on the **Render web service → Environment**. Use a unique, randomly generated password of **at least 12 characters**, different from `NELBD_GRAB_STAFF_PASSWORD`. The secret is read server-side only. Never put it in GitHub, the page code, screenshots, or this chat. If the setting is absent/too short/the same as the main password, **FARM access fails closed**; PDD/PS are unaffected. Saving an environment variable in Render triggers a deploy; wait for Live before testing.

Verification authorizes access only. It does not reserve codes or change inventory. Only the final explicitly confirmed staff-input submission allocates a voucher, from the general `grab-voucher` stock as before.
