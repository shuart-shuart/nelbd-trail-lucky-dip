-- PIN controlled by super-admin, never stored in plaintext.
BEGIN;
CREATE TABLE IF NOT EXISTS ezlink_staff_config(
 id integer PRIMARY KEY CHECK(id=1),
 pin_salt text NOT NULL,
 pin_hash text NOT NULL,
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;