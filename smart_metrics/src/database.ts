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
  ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false,
});

export async function closeDatabase() {
  await pool.end();
}
