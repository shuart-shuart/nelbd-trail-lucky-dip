-- Optional weighting applies to eligible prizes; unchanged historical draws and TOP rules.
BEGIN;
ALTER TABLE prizes
  ADD COLUMN IF NOT EXISTS probability text NOT NULL DEFAULT 'normal'
  CHECK (probability IN ('low','normal','high'));
COMMIT;
