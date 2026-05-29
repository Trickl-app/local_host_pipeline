import express from "express";
import cors from "cors";
import { pool, setupDatabase } from "./database.js";
import { runOrchestrator } from "./orchestrator.js";
import type { acceptedRecommendations } from "./yamlBuilder.js";
import { writeNewRulestoYaml, writeYaml } from "./yamlBuilder.js";
// import { getAggregations } from "./aggregationEngine.js";

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

app.get("/api/aggregations", async (req, res) => {
  const aggregations = await pool.query(
    `SELECT id, metric_name, labels, json_snippet FROM aggregations`
  );

  res.json(aggregations.rows);
})

app.delete("/api/aggregations", async (req, res) => {
  const aggregationsToRemove = req.body;
  await Promise.all(aggregationsToRemove.map((aggregationId: number) => {
    return pool.query(`DELETE FROM aggregations WHERE ID = $1`, [aggregationId]);
  }));
  await writeYaml();
  res.status(200).send();
})

app.post("/api/acceptedRecommendations", async(req, res) => {
  const acceptedRecs: acceptedRecommendations = req.body;
  await writeNewRulestoYaml(acceptedRecs);
  // const output = await getAggregations()
  // console.log(output)
  res.json({ status: "OK"});
})

app.get('/health', (req, res) => {
  res.json( { status: "I'M HEALTHY"})
})

await setupDatabase();
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});