import { normalizeMetricsData } from "./aggregationEngine.js";
import { generateRecommendations } from "./recommendationGenerator.js";
import { buildRule } from "./yamlBuilder.js";
import { pool } from "./database.js";

export const runOrchestrator = async () => {
  const data = await normalizeMetricsData(new Date());
  const recommendations = generateRecommendations(data);
  await pool.query(`DELETE FROM recommendations WHERE status = 'pending'`);

  recommendations.forEach(rec => {
    const {
      metricName,
      status,
      problemLabel,
      remainingLabels,
      estimatedCurrentSeries,
      estimatedAfterSeries,
      estimatedReductionPercent,
      explanation
    } = rec
    pool.query(`INSERT INTO recommendations (
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
  });
}

//generate recommendations
//check table if existing rows are pending; if so delete
//write to a table


////api endpoint:
//when user hits front end, the front end makes an axios call, to an api endpoint which reads that table
//it then presents the user with all the pending rows in the table
//user makes decisions on each label
//rows in the table are updated
//those that are accepted are forwarded to buildRule?
//the json output by buildRule, is then inserted into the appropriate row in the db
//read from all accepted rules in the db; pull all json rows, transform each into a  yaml block in aggregations.yaml