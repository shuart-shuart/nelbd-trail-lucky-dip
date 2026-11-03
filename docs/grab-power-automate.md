# Grab vouchers — Power Automate HTTP-trigger integration (planned)

## Current implementation state

**Preparation only: this document does not mean that Render dispatch or callback code exists.** PR #25 is a draft. Do not merge, deploy, or enable fulfilment until the implementation and controlled tests pass.

The winner will enter their email on the existing Lucky Dip result page. PostgreSQL contains the encrypted voucher assignment and an email claim record. The intended integration uses the **When an HTTP request is received** Power Automate trigger, then the working Office 365 Outlook shared-mailbox action.

## Power Automate trigger (user has configured this)

- Trigger: **When an HTTP request is received** (POST).
- Store the generated signed trigger URL **only** as the Render secret environment variable `NELBD_POWER_AUTOMATE_TRIGGER_URL`. Never paste the URL into source, chat, or PR.
- Render will eventually send JSON with the following fields:
  - `deliveryId`: unique dispatch identifier (UUID)
  - `ticketNumber`: NELBD draw ticket
  - `to`: winner's validated email
  - `subject`: `Congratulations! Your NELBD Grab Voucher`
  - `html`: complete branded voucher email HTML containing the unique assigned code and real HTTPS Grab redemption link.
- Trigger schema:

```json
{
  "type": "object",
  "properties": {
    "deliveryId": {"type": "string"},
    "ticketNumber": {"type": "string"},
    "to": {"type": "string"},
    "subject": {"type": "string"},
    "html": {"type": "string"}
  },
  "required": ["deliveryId","ticketNumber","to","subject","html"],
  "additionalProperties": false
}
```

## Outlook email action

**Send an email from a shared mailbox (V2)**:
- Original Mailbox Address: `nelbd@designsingapore.org`
- To: trigger `to`
- Subject: trigger `subject`
- Body: trigger `html` (HTML)
- Do not permit trigger callers to arbitrarily select the sender. The flow is **only** for NELBD Grab fulfilment.
- Enable Secure Inputs and Secure Outputs where supported to protect voucher codes/links in run history.

## Step 3 — delivery confirmation (NOT YET CONFIGURABLE)

The application must first implement a server endpoint such as `POST /api/grab/automation/complete` with separate authenticated credentials and replay-safe semantics.

When that endpoint exists, put an **HTTP POST** action after successful Outlook sending, body:

```json
{"deliveryId":"<dynamic trigger deliveryId>","status":"sent"}
```

The API must authenticate the callback, validate the associated in-flight attempt, and atomically record its result. It must accept an identical repeated callback without resending. If sending fails definitively, report `failed`; if Outlook times out with unknown outcome, **do not blindly retry**.

**Do not set up Step 3 yet**; no callback endpoint is deployed.

## Backend architecture work remaining

1. Implement a durable transactional dispatch/outbox mechanism: reliably trigger HTTP POST after email capture without losing jobs on server restarts, and protect against duplicate sends on retries.
2. Authenticate outbound delivery (signed Power Automate URL kept secret), validate recipient and actual assigned voucher server-side, and fail closed on missing configuration.
3. Implement authenticated delivery-result callback and a mechanism for staff to reconcile ambiguous outcomes without replay.
4. Add the separate **Grab Vouchers** admin tab, preserving existing kiosk UI and protecting voucher code/link display behind permissions.
5. Verify existing database migrations and inventory counts; never re-import the 11,720 codes without checking current inventory.
6. Test with dummy vouchers and a designated test mailbox; do not enable real sends before controlled acceptance testing.

## Feature flags

- `NELBD_POWER_AUTOMATE_TRIGGER_URL`: signed HTTP trigger URL (secret).
- `NELBD_POWER_AUTOMATE_ENABLED=NO` during setup/testing (activation only after deployment/verification).
- Existing `NELBD_GRAB_FULFILMENT_ENABLED` and Postgres migration flags continue to apply.

The old recurrence/polling design was superseded by this trigger-driven HTTP push contract. The old Outlook Email Centre should not be used to manually send an item that the automatic system is processing.
