import express from "express";
import cors from "cors";
import { pool } from "./database.js";
import { runOrchestrator } from "./orchestrator.js";
import type { acceptedRecommendations } from "./yamlBuilder.js";
import { yamlBuilderCoordinator } from "./yamlBuilder.js";
import { stat } from "node:fs";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3001;

// allow all origins — this is an internal tool, not a public API
app.use(cors());

app.get("/api/recommendations", async (_req, res) => {
  //we have the cron job run on each load for testing purposes
  await runOrchestrator();
  const result = await pool.query(
    `SELECT * FROM recommendations WHERE status = 'pending' ORDER BY created_at DESC`
  );
  res.json(result.rows);
});

app.post("/api/acceptedRecommendations", (req, res) => {
  const acceptedRecs: acceptedRecommendations = req.body;
  yamlBuilderCoordinator(acceptedRecs);
  res.json({ status: "OK"})
})

app.get('/health', (req, res) => {
  res.json( { status: "I'M HEALTHY"})
})

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
