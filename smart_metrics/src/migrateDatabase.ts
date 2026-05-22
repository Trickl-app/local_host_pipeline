import { readFile } from "node:fs/promises";
import { pool, closeDatabase } from "./database.js";

const schemaPath = new URL("../../db/schema.sql", import.meta.url);

async function migrateDatabase() {
  const schemaSql = await readFile(schemaPath, "utf8");
  await pool.query(schemaSql);
  console.log("database schema is ready");
}

migrateDatabase()
  .catch((err) => {
    if (err instanceof Error) {
      console.error("database migration failed:", err.message);
    } else {
      console.error("database migration failed:", err);
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
