import { normalizeMetricsData } from "./aggregationEngine.js";
import { generateRecommendations } from "./recommendationGenerator.js";
import { buildRule } from "./yamlBuilder.js";
import { pool } from "./database.js";

export const runOrchestrator = async () => {
  const data = await normalizeMetricsData(new Date());
  const recommendations = generateRecommendations(data);
  await pool.query(`DELETE FROM recommendations WHERE status = 'pending'`);

  await Promise.all(recommendations.map(rec => {
    const {
      metricName,
      status,
      problemLabel,
      remainingLabels,
      estimatedCurrentSeries,
      estimatedAfterSeries,
      estimatedReductionPercent,
      explanation
    } = rec;
    return pool.query(`INSERT INTO recommendations (
        metric_name,
        status,
        problem_label,
        remaining_labels,
        estimated_current_series,
        estimated_after_series,
        estimated_reduction_percent,
        explanation
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [metricName, status, problemLabel, remainingLabels, estimatedCurrentSeries, estimatedAfterSeries, estimatedReductionPercent, explanation]);
  }));
}

//generate recommendations
//check table if existing rows are pending; if so delete
//write to a table; kept this data model atm so ai tool has access to same data
//presented to user. Eventually switch since we don't need this latency anymore.
