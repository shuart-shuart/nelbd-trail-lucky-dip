BEGIN;
CREATE TABLE IF NOT EXISTS draw_review_labels (
 draw_id uuid PRIMARY KEY REFERENCES draws(id),
 classification text NOT NULL CHECK(classification IN ('test','error')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
