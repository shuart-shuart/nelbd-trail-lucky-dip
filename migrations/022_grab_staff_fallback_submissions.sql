-- Separate emergency backup contact capture. NO draws, prizes, codes or claim sessions touched.
BEGIN;
CREATE TABLE IF NOT EXISTS grab_staff_fallback_submissions (
 id uuid PRIMARY KEY,
 collection_site text NOT NULL CHECK (collection_site IN ('PDD','PS','FARM')),
 award_cents integer NOT NULL CHECK (award_cents IN (500,1000)),
 contact_kind text NOT NULL CHECK (contact_kind IN ('email','phone')),
 contact_value text NOT NULL,
 notification_state text NOT NULL DEFAULT 'pending' CHECK (notification_state IN ('pending','sending','accepted','uncertain','not_configured')),
 created_at timestamptz NOT NULL DEFAULT now(),
 contacted_at timestamptz,
 CHECK (collection_site <> 'FARM' OR contact_kind='email')
);
CREATE INDEX IF NOT EXISTS grab_staff_fallback_pending_idx
 ON grab_staff_fallback_submissions(created_at) WHERE contacted_at IS NULL;
COMMIT;
