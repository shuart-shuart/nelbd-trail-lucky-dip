# Daily 10:30 PM NELBD report via existing Power Automate

## What is reused
The existing `NELBD_POWER_AUTOMATE_TRIGGER_URL` HTTPS trigger and
`NELBD_POWER_AUTOMATE_CALLBACK_KEY` authentication. The app sends the same
top-level fields already used by the voucher and Quest integrations:
`deliveryId`, `ticketNumber`, `to`, `subject`, `html`.

No Gmail OAuth, Gmail refresh tokens, third-party SMTP provider or new webhook
secret are needed. This is a **daily report**, not a voucher fulfilment request.

## One change needed in the existing Microsoft flow
Before enabling the report sender, edit the Power Automate flow behind
`NELBD_POWER_AUTOMATE_TRIGGER_URL` and **save and validate** these branches:

1. Near the beginning, add a condition: 
   `startsWith(triggerBody()?['ticketNumber'], 'NELBD-DAILY-')`.
2. In the **Yes / Daily Summary** branch, use *Send an email (V2)* in the
   existing Outlook connector:
   - **To**: `triggerBody()?['to']` (semicolon-separated addresses)
   - **Subject**: `triggerBody()?['subject']`
   - **Body**: `triggerBody()?['html']`, as HTML
   - After a successful Outlook send, call the **separate** NELBD callback:
     `POST https://nelbd-trail-lucky-dip-staging.onrender.com/api/grab/daily-report/complete`
     with `Authorization: Bearer <existing NELBD_POWER_AUTOMATE_CALLBACK_KEY>`,
     `Content-Type: application/json`, and
     `{"deliveryId": "@{triggerBody()?['deliveryId']}", "status":"sent"}`.
     On explicit Outlook failure, POST the same payload with `status=failed`.
     Protect this shared secret in Power Automate's secure inputs/outputs.
   - End this branch after its callback. Do NOT continue into the voucher path.
3. In the **No / Existing voucher or Quest** branch, leave every existing
   email action and existing voucher callback unchanged.
4. Test the flow with **dummy summary content**, verify that the two intended
   recipients receive the message, and confirm that the report callback (not
   the Grab voucher callback) returns a success response.

The current app does NOT have direct access to edit the Microsoft flow. A
successful HTTP trigger response is not proof that Outlook delivered email;
the new report status remains `sending` until the separate callback reports
`sent` or `failed`.

## App activation
Run one-time database migration **018** using existing authorised flag:
`APPLY_NELBD_DAILY_REPORT_MIGRATION=YES`. Check server logs for
`NELBD_DAILY_REPORT_POWER_AUTOMATE_SCHEMA_READY`, then turn that flag OFF.

After the Power Automate flow branch above is saved and tested, set both:
- `NELBD_DAILY_REPORT_ENABLED=YES`
- `NELBD_DAILY_REPORT_POWER_AUTOMATE_ENABLED=YES`

The app checks Singapore time and attempts exactly once per date during
22:30–22:44 SGT. Recipients are fixed to `nelbd2026@gmail.com` and
`bernando@farm.sg`. The database ledger rejects additional attempts for a
date, including uncertain outcomes; investigate in Outlook and report logs
rather than blindly resending.

Use authenticated super-admin read-only preview:
`GET /api/admin/daily-report/preview`

**Important:** Because this runs in a web service timer, it requires a
running Render instance at 22:30 SGT; a sleeping free-tier service can miss
the window. For guaranteed on-time execution consider a proper Render cron
job later, reusing exactly the same report generator and Power Automate
handoff. Never run both schedules simultaneously.

## Other automations
The earlier ChatGPT/Gmail daily task has been paused to avoid conflicting
report emails. No emails will be automatically sent until the Power Automate
flow branch is verified and the two server flags above are enabled.
