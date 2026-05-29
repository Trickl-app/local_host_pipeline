import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// In ECS, DB_HOST/DB_USER/DB_PASSWORD are injected individually by CDK.
// DB_USER and DB_PASSWORD come from Secrets Manager (never stored in plaintext).
// Fallback values support local development via docker-compose or direct node execution.
export const pool = new pg.Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5433"),
  database: process.env.DB_NAME     || "metropolis",
  user:     process.env.DB_USER     || "metropolis",
  password: process.env.DB_PASSWORD || "metropolis",
  // RDS requires SSL; rejectUnauthorized: false trusts the RDS cert without
  // needing to bundle the AWS CA — safe for an internal VPC-only connection.
  ssl: (process.env.DB_HOST && process.env.OFFLINE_MODE !== 'true') ? { rejectUnauthorized: false } : false,
});

export async function closeDatabase() {
  await pool.end();
}

// NOTE: migrateDatabase.ts reads ../../db/schema.sql via import.meta.url. In the
// Docker image the compiled file sits at /app/dist/migrateDatabase.js, so the
// relative path resolves to /db/schema.sql — outside the container filesystem.
// The db/ directory is also outside the smart_metrics Docker build context
// (it lives at local_host_pipeline/db/), so COPY can't reach it.
// Until the build context is widened to include local_host_pipeline/db/, the
// schema is inlined here and run at startup via setupDatabase().
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
      decision_reason             TEXT,
      yaml_content                TEXT,
      created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      decided_at                  TIMESTAMPTZ,

      CONSTRAINT recommendations_status_check
        CHECK (status IN ('pending', 'accepted', 'declined')),

      CONSTRAINT recommendations_decision_fields_check
        CHECK (
          (status = 'pending'                        AND decided_at IS NULL)
          OR
          (status IN ('accepted', 'declined') AND decided_at IS NOT NULL)
        )
    );

    CREATE TABLE IF NOT EXISTS aggregations(
      id                BIGSERIAL   PRIMARY KEY,
      metric_name       TEXT         NOT NULL,
      labels            TEXT[]       NOT NULL,
      json_snippet      JSONB        NOT NULL, 
      created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS recommendations_status_created_at_idx
      ON recommendations (status, created_at DESC);

    CREATE INDEX IF NOT EXISTS recommendations_metric_name_idx
      ON recommendations (metric_name);
  `);
  console.log('database schema ready');
}
