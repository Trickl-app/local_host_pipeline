import { collectQueries } from './grafanaApiInterface.js';
import type { QueryHistoryEntry, QueryDefinition } from './grafanaApiInterface.js';
import { getMetricsData, getLabelValueCountsForMetric } from './vmSelectApiInterface.js';
import type { MetricsData } from './vmSelectApiInterface.js';
import { parsePromqlExpression } from './promQLQueryParser.js';
import { MetricName } from '@prometheus-io/lezer-promql';

async function queryParser() {
  const queryHistory = await collectQueries() as QueryHistoryEntry[]
  const grafanaQueriesObject: Record<string, string[]> = {}
  // get the types right
  queryHistory.forEach((queryHistoryEntry: any) => {
    const query = queryHistoryEntry.queries[0].expr
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

interface LabelValueCount {
  name: string;
  value: number;
}

interface MetricLabelsMap {
  [metricName: string]: LabelValueCount[];
}

async function databaseParser(date: Date) {

  const metricsData = await getMetricsData(date);
  const vmObject: MetricLabelsMap = {};
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
//queryParser().then(console.log)

// determining those labels that are never queried

function determineUnqueriedMetricLabels(grafanaQueriesObj: Record<string, string[]>, vmObject: MetricLabelsMap) {
  const output: typeof vmObject = {}

  for (let metric in vmObject) {
    output[metric] = []
    const queriedLabels = grafanaQueriesObj[metric] || [];
    const labelObjsForMetric = vmObject[metric] as LabelValueCount[];
    labelObjsForMetric.forEach(labelObj => {
      if (!queriedLabels.includes(labelObj.name) && output[metric]) {
        output[metric].push(labelObj);
      }
    })
  }
  return output;
}

const grafanaObj = await queryParser();
const vmObj = await databaseParser(new Date);
const unusued_labels = determineUnqueriedMetricLabels(grafanaObj, vmObj);
console.log(unusued_labels)