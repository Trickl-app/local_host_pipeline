import express from "express";
import cors from "cors";
import { pool } from "./database.js";
import { runOrchestrator } from "./orchestrator.js";
const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: "http://localhost:4000" }));

app.get("/api/recommendations", async (_req, res) => {
  //we have the cron job run on each load for testing purposes
  await runOrchestrator();
  const result = await pool.query(
    `SELECT * FROM recommendations WHERE status = 'pending' ORDER BY created_at DESC`
  );
  res.json(result.rows);
});

interface acceptedRecommendations {
  [key: string]: {
    problemLabels: string[];
    allLabels: string[];
  }
}

app.post("/api/acceptedRecommendations", (req, res) => {
  const acceptedRecs = req.body;
  console.log(acceptedRecs);
})

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
