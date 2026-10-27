-- Global TOP limit: one TOP prize per Singapore calendar date across both sites.
CREATE TABLE IF NOT EXISTS daily_top_awards (
 singapore_date date PRIMARY KEY,
 draw_id uuid NOT NULL UNIQUE REFERENCES draws(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
