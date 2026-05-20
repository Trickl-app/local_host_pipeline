import { collectQueries, collectDashboardQueries } from './grafanaApiInterface.js';
import type { QueryHistoryEntry, QueryDefinition } from './grafanaApiInterface.js';
import { getMetricsData, getLabelValueCountsForMetric } from './vmSelectApiInterface.js';
import type { MetricsData } from './vmSelectApiInterface.js';
import { parsePromqlExpression } from './promQLQueryParser.js';
import { MetricName } from '@prometheus-io/lezer-promql';

export async function grafanaQueriesParser() {
  const queryHistory = await collectQueries() as QueryHistoryEntry[]
  const grafanaQueriesObject: Record<string, string[]> = {}
  // get the types right
  queryHistory.forEach((queryHistoryEntry: QueryHistoryEntry) => {
    const query: string = queryHistoryEntry.queries[0].expr as string
    const { metrics, labels } = parsePromqlExpression(query);

    metrics.forEach((metricName: string) => { 
      grafanaQueriesObject[metricName] ? grafanaQueriesObject[metricName].concat(labels) : grafanaQueriesObject[metricName] = labels;
    })
  })
  return grafanaQueriesObject;
}

export async function grafanaDashboardQueriesParser() {
  const dashboardQueries = await collectDashboardQueries() as string[]
  const grafanaQueriesObj: Record<string, string[]> = {}

  dashboardQueries.forEach((query: string) => {
    const { metrics, labels } = parsePromqlExpression(query);
    metrics.forEach((metricName: string) => {
      grafanaQueriesObj[metricName] ? grafanaQueriesObj[metricName].concat(labels) : grafanaQueriesObj[metricName] = labels;
    })
  })
  return grafanaQueriesObj;
}

grafanaDashboardQueriesParser().then(console.log)


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

export async function vmParser(date: Date) {

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

//vmParser(new Date).then(console.log)
//grafanaQueriesParser().then(console.log)

// determining those labels that are never queried

export function determineUnqueriedMetricLabels(grafanaQueriesObj: Record<string, string[]>, vmObject: MetricLabelsMap) {
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

// const grafanaObj = await grafanaQueriesParser();
// const vmObj = await vmParser(new Date);
// const unusued_labels = determineUnqueriedMetricLabels(grafanaObj, vmObj);
// console.log(unusued_labels)