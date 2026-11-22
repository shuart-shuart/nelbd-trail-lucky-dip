# Grab voucher denominations: $5 / $10 / $50

## Safety and activation
This feature is **inactive until a super-admin explicitly clicks Set up $5 / $10 / $50 prizes** in Prize Inventory. Setup requires confirmation, runs within a database transaction, and:
- Migrates the legacy `grab_voucher_codes.assigned_draw_id` column from UNIQUE (one $5 code per draw) to a non-unique indexed reference (several $5 codes per draw), preserving existing associations;
- Adds three disabled, zero-stock prize categories (IDs `grab-voucher-5`, `grab-voucher-10`, `grab-voucher-50`);
- Preserves historical draws and voucher claims;
- Deactivates the old `grab-voucher` from **future** Lucky Dip draws, but existing winners can still claim their vouchers.
If the database user lacks the schema-alteration permission, the transaction fails and the old prize remains active; request a controlled migration through the database owner instead.

## Independent controls
In Admin > Prize Inventory, each denomination has its own:
- Enable/disable toggle;
- PDD and PS **remaining prize-award quantities** (not $5 code counts);
- Relative probability: low / normal / high (0.5x / 1x / 2x). Actual chance is also stock-weighted and depends on all other prize inventory.

These settings are saved per denomination using a single admin-only database transaction. No voucher value or codes are ever returned to the settings panel.

## Fulfilment
- $5: **1** available valid $5 Grab gift code
- $10: **2** available valid $5 codes
- $50: **10** available valid $5 codes

Draws are excluded from the eligible pool if there are insufficient **unassigned, unexpired, active** $5 codes. The draw transaction locks and assigns the full code bundle or rolls back entirely. It cannot partially issue a $10/$50 prize. A single recipient email and claim session are used per draw; automated and manual emails include every allocated code and its corresponding link.

**Before enabling**, ensure voucher import and automatic/manual fulfilment are configured, review remaining $5 code stock, and complete a controlled end-to-end test including both hubs and all three denominations. Do not use live visitor accounts or real gift codes for tests.

## Compatibility
Existing single-code `grab-voucher` claims remain compatible; the first code of every bundle is linked through the existing `grab_voucher_claim_sessions.voucher_id` for compatibility and all codes are associated through `grab_voucher_codes.assigned_draw_id`.
