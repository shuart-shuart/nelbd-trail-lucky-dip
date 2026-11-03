# Grab voucher delivery through Power Automate

The website holds encrypted voucher codes in PostgreSQL. The winner submits an email at the existing result screen; this creates a `queued` claim. A **separately configured** Power Automate flow can collect a queued item and mark the result of an Outlook send.

## Important: safe initial state
- The routes are disabled unless **both** `NELBD_GRAB_FULFILMENT_ENABLED=YES` and `NELBD_POWER_AUTOMATE_ENABLED=YES`.
- Apply `migrations/007_power_automate_delivery.sql` to the intended PostgreSQL environment before enabling.
- On Render, configure `NELBD_POWER_AUTOMATE_TOKEN` as a **new random 32+ character secret**. Enter the same secret in a secure Power Automate secret/connection (not in flow logs, source, or a public screen).
- The Power Automate connection must have Send As/shared mailbox permission for **nelbd@designsingapore.org**.
- Do not upload voucher CSV files to GitHub, Power Automate, or public storage. Import using the already-protected administrator UI after verifying existing stock.
- These instructions do not enable the feature or send any email.

## Recommended flow (recurrence trigger)
1. On a short recurrence, use HTTP **POST** `https://<render-host>/api/grab/automation/next` with header `Authorization: Bearer <secret>`, and no request body.
2. HTTP **204** means there is no eligible job. HTTP **200** returns `deliveryId`, `to`, `subject`, `html`, `ticketNumber`. Turn off HTTP response/body logging because the content includes voucher secrets.
3. Use Microsoft 365 Outlook's **Send an email from a shared mailbox (V2)** with shared mailbox `nelbd@designsingapore.org`; `To` from `to`, `Subject` from `subject`, and HTML body from `html`. Do not wrap the HTML in JSON or Markdown.
4. **Only when Outlook reports successful action completion**, call HTTP **POST** `/api/grab/automation/complete`, Bearer authenticated, with JSON `{"deliveryId":"<deliveryId>","status":"sent","providerMessageId":"<optional-id>"}`.
5. If Outlook explicitly rejects the send, call the same endpoint with `{"deliveryId":"<deliveryId>","status":"failed","errorCode":"OUTLOOK_SEND_FAILED"}`. If Outlook times out or its outcome is uncertain, **do not mark sent or requeue automatically**; the item remains `processing` for staff reconciliation.

## Duplicate prevention
- Each `/next` atomically changes a single queued claim to `processing` with a new unique `deliveryId`. It never automatically offers `processing`, `failed` or `sent` claims again.
- `/complete` only accepts the exact `deliveryId` for an in-flight claim. A repeated callback for the same completed delivery receives an idempotent acknowledgement; it does not resend.
- A successful HTTP request means **mail provider action success as reported by Power Automate**, not confirmed inbox delivery or voucher redemption.
- Human reconciliation is required after a timeout or failed send. Never automatically replay an uncertain send.
- Responses carrying voucher data use `Cache-Control: no-store`; tokens and voucher codes must never be logged.

## Test before activation
Use dummy, nonredeemable vouchers and a test mailbox. Verify duplicate flow runs, parallel pollers, a failed send, callback repetition, no-queue response, expired vouchers, HTML link opening the **actual Grab URL**, and server restarts. Verify database migrations, stock counts, and actual Render environment flags before enabling live draws.

## Note about existing Outlook Email Centre
Its manual copy-and-send flow remains as a fallback. Avoid using manual sending on a `processing` or `sent` claim; the app's manual UI should be reviewed before live cutover to avoid parallel fulfilment.
