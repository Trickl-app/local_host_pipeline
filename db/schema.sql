CREATE TABLE IF NOT EXISTS recommendations (
  id BIGSERIAL PRIMARY KEY,
  metric_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  problem_labels TEXT[] NOT NULL,
  remaining_labels TEXT[] NOT NULL,
  estimated_current_series BIGINT NOT NULL,
  estimated_after_series BIGINT NOT NULL,
  estimated_reduction_percent NUMERIC(6, 2) NOT NULL,
  explanation TEXT NOT NULL,
  decision_reason TEXT,
  yaml_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,

  CONSTRAINT recommendations_status_check
    CHECK (status IN ('pending', 'accepted', 'declined')),

  CONSTRAINT recommendations_decision_fields_check
    CHECK (
      (status = 'pending' AND decided_at IS NULL)
      OR
      (status IN ('accepted', 'declined') AND decided_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS recommendations_status_created_at_idx
  ON recommendations (status, created_at DESC);

CREATE INDEX IF NOT EXISTS recommendations_metric_name_idx
  ON recommendations (metric_name);
