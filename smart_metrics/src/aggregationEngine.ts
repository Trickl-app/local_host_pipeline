import { collectQueries } from './grafanaApiInterface.js';
import type { QueryHistoryEntry, QueryDefinition } from './grafanaApiInterface.js';
import { getMetricsData, getLabelValueCountsForMetric } from './vmSelectApiInterface.js';
import type { MetricsData } from './vmSelectApiInterface.js';
import { parsePromqlExpression } from './promQLQueryParser.js';

async function queryParser() {
  const queryHistory = await collectQueries() as QueryHistoryEntry[]
  const grafanaQueriesObject: Record<string, string[]> = {}
  // get the types right
  queryHistory.forEach((queryHistoryEntry: any) => {
    const query = queryHistoryEntry.queries[0].expr
    console.log(query)
    const { metrics, labels } = parsePromqlExpression(query);

    metrics.forEach(metricName => { 
      grafanaQueriesObject[metricName] ? grafanaQueriesObject[metricName].concat(labels) : grafanaQueriesObject[metricName] = labels;
    })
  })

  return grafanaQueriesObject;
}

    // - get list of metrics and time series count
    // - for each metric, get label value counts
    //   - create object where each key is metric name
    //     and value is object where each key is label name
    //     and value is label count

async function databaseParser(date: Date) {

  const metricsData = await getMetricsData(date);
  const vmObject: Record<string, Record<string, number>> = {};
  const { seriesCountByMetricName } = metricsData;

  await Promise.all(
    seriesCountByMetricName.map(async metric => {
      const { labelValueCountByLabelName } = await getLabelValueCountsForMetric(metric.name, date);
      
      // resolve this type later
      vmObject[metric.name] = labelValueCountByLabelName as any;
    })
  )
  return vmObject
}

//databaseParser(new Date).then(console.log)
queryParser().then(console.log)