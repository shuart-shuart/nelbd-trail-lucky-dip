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

## Step 3 — delivery confirmation (implemented in PR #25; not deployed)

Add a Power Automate HTTP action **after the shared mailbox Outlook action**. Configure its **Run after** setting for **is successful** only.

- Method: `POST`
- URL (staging): `https://nelbd-trail-lucky-dip-staging.onrender.com/api/grab/automation/complete`
- Headers: `Content-Type: application/json` and `Authorization: Bearer <shared-secret>`
- Body (insert the actual trigger dynamic-content field, not a literal placeholder):
  ```json
  {"deliveryId":"<deliveryId from HTTP trigger>","status":"sent"}
  ```
- Save a **new strong random 32+ character secret** as `NELBD_POWER_AUTOMATE_CALLBACK_KEY` in Render and use the exact same secret in the Power Automate confirmation action. Do not share it in chat, GitHub, screenshots or flow run history.
- Keep `NELBD_POWER_AUTOMATE_ENABLED=NO` until migration 007 is applied and a controlled test passes.
- If Outlook definitively fails, staff should review the `processing` item; it is intentionally not automatically retried. An action timeout can mean the message was sent, so never reissue without reconciliation.
- If the callback itself fails after Outlook succeeds, **do not rerun the Outlook send step** to fix it. Staff must reconcile the recorded delivery state.

Backend endpoint uses server-side bearer secret verification and an atomic transition from `processing` to `sent`; duplicate `sent` callbacks acknowledge without sending again. Email provider acceptance is not proof of inbox arrival.

## Dispatch worker

When the app is running with `NELBD_POWER_AUTOMATE_ENABLED=YES`, `NELBD_GRAB_FULFILMENT_ENABLED=YES`, `DRAW_BACKEND=postgres`, the signed trigger URL and callback secret configured, the worker periodically leases one queued eligible voucher record in a PostgreSQL transaction and POSTs it to Power Automate. The claim is marked `processing` **before** the HTTP request, protecting against duplicate dispatch on restart. An uncertain outcome remains `processing` for staff review. This prioritizes **at-most-once dispatch** over automatic recovery. It does not guarantee that Power Automate or its connectors themselves will never retry a send; check the flow's retry/concurrency settings and test with dummy data.

## Required environment

- `NELBD_POWER_AUTOMATE_TRIGGER_URL`: signed HTTPS request trigger URL, stored only in Render.
- `NELBD_POWER_AUTOMATE_CALLBACK_KEY`: new random 32+ character secret, shared between Render and Power Automate HTTP callback.
- `NELBD_POWER_AUTOMATE_ENABLED=NO` until activation; set `YES` only after controlled test and approved deployment.
- `NELBD_GRAB_FULFILMENT_ENABLED`: existing voucher claim flag, requires `YES` for live flow.
- `DRAW_BACKEND=postgres`: active PostgreSQL drawing engine.

## Backend architecture work remaining

1. Review the implemented periodic transactional dispatch worker and confirm Render startup, lease behavior, and error handling with integration tests.
2. Verify secure Render configuration and flow run-history settings; do not log full voucher codes or request bodies.
3. Implement staff reconciliation UI/actions for ambiguous outcomes without replay; the authenticated callback endpoint exists in PR #25 but is not deployed.
4. Review the added **Grab Vouchers** admin tab and expand delivery-history details as needed.
5. Verify existing database migrations and inventory counts; never re-import the 11,720 codes without checking current inventory.
6. Test with dummy vouchers and a designated test mailbox; do not enable real sends before controlled acceptance testing.

## Feature flags

- `NELBD_POWER_AUTOMATE_TRIGGER_URL`: signed HTTP trigger URL (secret).
- `NELBD_POWER_AUTOMATE_ENABLED=NO` during setup/testing (activation only after deployment/verification).
- Existing `NELBD_GRAB_FULFILMENT_ENABLED` and Postgres migration flags continue to apply.

The old recurrence/polling design was superseded by this trigger-driven HTTP push contract. The old Outlook Email Centre should not be used to manually send an item that the automatic system is processing.
