-- Add note-taking to the existing shared ez-link inventory audit.
-- Existing audit records are retained; they are clearly marked as historical.
BEGIN;
ALTER TABLE ezlink_inventory_audit
  ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '[Historical adjustment: note not recorded]';
ALTER TABLE ezlink_inventory_audit
  ADD CONSTRAINT ezlink_inventory_audit_note_length CHECK (char_length(note) BETWEEN 1 AND 500) NOT VALID;
COMMIT;
