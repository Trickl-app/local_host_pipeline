import express from "express";
import cors from "cors";
import { pool, setupDatabase } from "./database.js";
import { runOrchestrator } from "./orchestrator.js";
import { getAiContext } from "./aiContext.js";
import { investigateCardinality } from "./aiInvestigator.js";
import type { acceptedRecommendations } from "./yamlBuilder.js";
import { writeNewRulestoYaml, writeYaml } from "./yamlBuilder.js";
// import { getAggregations } from "./aggregationEngine.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3001;

// allow all origins — this is an internal tool, not a public API
app.use(cors());

app.get("/api/recommendations", async (_req, res) => {
  await runOrchestrator();
  const result = await pool.query(
    `SELECT * FROM recommendations WHERE status = 'pending' ORDER BY created_at DESC`
  );
  res.json(result.rows);
});

app.get("/api/ai/context", async (req, res) => {
  const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
  res.json(await getAiContext(date));
});

app.post("/api/ai/investigate", async (req, res) => {
  try {
    const question = req.body?.question;
    if (typeof question !== "string" || question.trim() === "") {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const date =
      typeof req.body?.date === "string"
        ? req.body.date
        : new Date().toISOString().slice(0, 10);

    res.json(await investigateCardinality({ question, date }));
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "AI investigation failed",
    });
  }
});

app.get("/api/rules", async (req, res) => {
  const rules = await pool.query(
    `SELECT id, metric_name, labels, json_snippet, aggregated FROM rules`
  );
  res.json(rules.rows);
})

app.delete("/api/rules", async (req, res) => {
  const rulesToRemove = req.body;
  await Promise.all(rulesToRemove.map((aggregationId: number) => {
    return pool.query(`DELETE FROM rules WHERE ID = $1`, [aggregationId]);
  }));
  await writeYaml();
  res.status(200).send();
})

app.post("/api/acceptedRecommendations", async(req, res) => {
  const acceptedRecs: acceptedRecommendations = req.body;
  const createdRows = await writeNewRulestoYaml(acceptedRecs);
  // const output = await getAggregations()
  // console.log(output)
  res.json(createdRows);
})

app.get('/health', (req, res) => {
  res.json( { status: "I'M HEALTHY" })
})

await setupDatabase();
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
