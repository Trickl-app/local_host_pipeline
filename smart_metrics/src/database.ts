import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// In ECS, DB_HOST/DB_USER/DB_PASSWORD are injected individually by CDK.
// Fallback values support local development via docker-compose or direct node execution.
export const pool = new pg.Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5433"),
  database: process.env.DB_NAME     || "metropolis",
  user:     process.env.DB_USER     || "metropolis",
  password: process.env.DB_PASSWORD || "metropolis",
  // RDS requires SSL; rejectUnauthorized: false trusts the RDS cert without
  // needing to bundle the AWS CA.
  ssl: (process.env.DB_HOST && process.env.OFFLINE_MODE !== 'true') ? { rejectUnauthorized: false } : false,
});

export async function closeDatabase() {
  await pool.end();
}

export async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recommendations (
      id                          BIGSERIAL    PRIMARY KEY,
      metric_name                 TEXT         NOT NULL,
      status                      TEXT         NOT NULL DEFAULT 'pending',
      problem_label               TEXT         NOT NULL,
      remaining_labels            TEXT[]       NOT NULL,
      estimated_current_series    BIGINT       NOT NULL,
      estimated_after_series      BIGINT       NOT NULL,
      estimated_reduction_percent NUMERIC(6,2) NOT NULL,
      explanation                 TEXT         NOT NULL,
      is_prime_target             BOOLEAN      NOT NULL DEFAULT true,
      created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

      CONSTRAINT recommendations_status_check
        CHECK (status IN ('pending', 'accepted', 'declined'))
    );

    CREATE TABLE IF NOT EXISTS rules(
      id                BIGSERIAL    PRIMARY KEY,
      metric_name       TEXT         NOT NULL,
      labels            TEXT[]       NOT NULL,
      json_snippet      JSONB        NOT NULL,
      aggregated        BOOL         NOT NULL DEFAULT FALSE,
      created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS recommendations_status_created_at_idx
      ON recommendations (status, created_at DESC);

    CREATE INDEX IF NOT EXISTS recommendations_metric_name_idx
      ON recommendations (metric_name);

    -- idempotent migrations for existing databases
    ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS is_prime_target BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE recommendations DROP COLUMN IF EXISTS decision_reason;
    ALTER TABLE recommendations DROP COLUMN IF EXISTS yaml_content;
    ALTER TABLE recommendations DROP COLUMN IF EXISTS decided_at;
    ALTER TABLE recommendations DROP CONSTRAINT IF EXISTS recommendations_decision_fields_check;
  `);
  console.log('database schema ready');
}
