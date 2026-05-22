import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://metropolis:metropolis@localhost:5433/metropolis";

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
});

export async function closeDatabase() {
  await pool.end();
}
