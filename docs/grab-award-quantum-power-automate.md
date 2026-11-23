# NELBD Grab voucher award quantum + Power Automate

## Rollout order — important

1. **Update the existing Power Automate HTTP trigger schema and save the flow FIRST.** The former schema sets `additionalProperties: false`, so a payload with new fields may otherwise be rejected. Do not deploy the backend change before the flow accepts these fields.
2. Confirm the shared-mailbox email and success callback remain connected and test the complete flow with dummy data. Never send real voucher codes as a test.
3. Only then merge and deploy this PR to Render. The existing Render service has auto-deploy disabled.
4. Verify a single controlled $5 test (then $10/$50 with safe dummy data) and confirm the callback changes delivery status to `sent`. Do not requeue currently `processing` vouchers without checking Outlook and Power Automate run history.

## Trigger

Use the **When an HTTP request is received** trigger, POST. The updated request-body JSON schema:

```json
{
  "type": "object",
  "properties": {
    "deliveryId": {"type": "string"},
    "ticketNumber": {"type": "string"},
    "to": {"type": "string"},
    "subject": {"type": "string"},
    "html": {"type": "string"},
    "currency": {"type": "string", "enum": ["SGD"]},
    "awardCents": {"type": "integer", "enum": [500, 1000, 5000]},
    "codeCount": {"type": "integer", "enum": [1, 2, 10]}
  },
  "required": ["deliveryId","ticketNumber","to","subject","html"],
  "additionalProperties": false
}
```

The new quantum fields are **optional in the trigger schema during rollout** so that the currently deployed backend can continue submitting the original five fields until the new app is deployed. After deployment, the new backend always supplies them. A $5 prize sends `awardCents:500,codeCount:1`; $10 sends `1000,2`; $50 sends `5000,10`. All voucher codes are distinct $5 units. Amounts are in cents, not dollars.

## Send the email

Use **Office 365 Outlook > Send an email from a shared mailbox (V2)**:

- Shared mailbox address: `nelbd@designsingapore.org` (verify account permission).
- To: `to` from the HTTP trigger.
- Subject: `subject` from trigger.
- Body: `html` from trigger, as HTML.
- Do not recompose voucher content from `awardCents`. The backend's `html` already contains the correct assigned codes and official links.
- You can use `awardCents` and `codeCount` for a *non-sensitive* internal award-value log or reporting column. Formula for dollars: `div(triggerBody()?['awardCents'],100)`.
- Protect trigger secrets and voucher credentials using Secure Inputs/Outputs where possible; never write voucher codes/URLs into an unsecured reporting log.
- Avoid automatic retries of the email send action where possible. A timeout can have an uncertain delivery result.

## Confirm actual send

Add a separate **HTTP** action AFTER successful execution of the Outlook send action (Configure run after: *is successful* only):

- Method: POST
- URI: `https://nelbd-trail-lucky-dip-staging.onrender.com/api/grab/automation/complete`
- Headers: `Content-Type: application/json`, `Authorization: Bearer <NELBD_POWER_AUTOMATE_CALLBACK_KEY>`
- JSON body:

```json
{"deliveryId":"<dynamic deliveryId from trigger>","status":"sent"}
```

The secret must match Render's `NELBD_POWER_AUTOMATE_CALLBACK_KEY` and must not be pasted into source, PR comments or chat. The HTTP callback endpoint records `sent`; HTTP 202 from the trigger alone only means accepted for processing. If Outlook definitively fails, consider a separate `status:"failed"` callback with carefully configured failure-only run-after; do **not** make ambiguous timeouts automatically eligible for retry.

## Display

The admin Grab Email Centre derives `awardCents` and `codeCount` from the draw's stored prize ID for both historic and future claims; it does not rely on Power Automate having a completed callback to know the awarded amount. The existing queue endpoint displays its latest 200 claims.

## Environment

`DRAW_BACKEND=postgres`, `NELBD_GRAB_FULFILMENT_ENABLED=YES`, `NELBD_POWER_AUTOMATE_ENABLED=YES`, a valid secret `NELBD_POWER_AUTOMATE_TRIGGER_URL`, and the 32+ character callback key must be correctly set. Check settings without exposing secret values.

Never change existing assigned codes, trigger duplicate sends, or replay processing claims just to test the new reporting fields.
