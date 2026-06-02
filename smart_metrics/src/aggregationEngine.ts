// Core analysis pipeline: determines which VictoriaMetrics labels are unqueried by Grafana
// and estimates the series reduction that would result from dropping them.
import { collectQueries, collectDashboardQueries } from './grafanaApiInterface.js';
import type { QueryHistoryEntry } from './grafanaApiInterface.js';
import { getMetricsData, getLabelValueCountsForMetric } from './vmSelectApiInterface.js';
import type { TSDBDataItem } from './vmSelectApiInterface.js';
import { parsePromqlExpression } from './promQLQueryParser.js';
import axios from 'axios';
import { pool } from "./database.js";

// Derive the query endpoint from VMSELECT_ENDPOINT so only one env var needs
// to be set in ECS. Falls back to localhost for local docker-compose dev.
const vmSelectBase = process.env.VMSELECT_ENDPOINT || "http://localhost:8481/select/0/prometheus/api/v1";
const VMSELECT_QUERY_ENDPOINT = `${vmSelectBase}/query`;

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

// Returns { metric → Set<label> } built from Grafana's ad-hoc query history (Explore panel).
export async function grafanaQueriesParser() {
  const queryHistory = await collectQueries() || [];
  const grafanaQueriesObject: Record<string, Set<string>> = {}
  queryHistory.forEach((queryHistoryEntry: QueryHistoryEntry) => {
    const query = queryHistoryEntry.queries[0]?.expr;
    if (!query) { return }
    const { metrics, labels } = parsePromqlExpression(query);

    metrics.forEach((metricName: string) => {
      grafanaQueriesObject[metricName] ??= new Set();
      const set = grafanaQueriesObject[metricName];
      if (!isDefined(set)) { return }
      labels.forEach(label => set.add(label));
    })
  })
  return grafanaQueriesObject;
}

// Same as grafanaQueriesParser but sourced from saved Grafana dashboard panels.
export async function grafanaDashboardQueriesParser() {
  const dashboardQueries = await collectDashboardQueries() || [];
  const grafanaQueriesObj: Record<string, Set<string>> = {}

  dashboardQueries.forEach((query: string) => {
    const { metrics, labels } = parsePromqlExpression(query);
    metrics.forEach((metricName: string) => {
      grafanaQueriesObj[metricName] ??= new Set();
      const set = grafanaQueriesObj[metricName];
      if (!isDefined(set)) { return }
      labels.forEach(label => set.add(label));
    })
  })
  return grafanaQueriesObj;
}

// "Manual" refers to ad-hoc Explore queries. Merges both Grafana sources into one metric → Set<label> map.
export async function combineManualandDashboardQueries(): Promise<Record<string, Set<string>>> {
  const [grafanaQueriesObj, grafanaDashboardQueriesObj] = await Promise.all([
    grafanaQueriesParser(),
    grafanaDashboardQueriesParser(),
  ]);

  const combined: Record<string, Set<string>> = {};

  for (const [metric, labels] of Object.entries(grafanaQueriesObj)) {
    combined[metric] = new Set(labels);
  }

  for (const [metric, labels] of Object.entries(grafanaDashboardQueriesObj)) {
    combined[metric] ??= new Set();
    const set = combined[metric];
    if (!isDefined(set)) { throw new Error("combineManualAndDashboardQueries tried to iterate over undefined") };
    labels.forEach(label => set.add(label));
  }

  return combined;
}

type LabelValueCount = TSDBDataItem;

interface MetricLabelsMap {
  [metricName: string]: LabelValueCount[];
}

// Fetches VictoriaMetrics (VM) TSDB stats for a given day.
// Returns { metric → label cardinality data } — label name plus unique value count.
export async function vmParser(date: Date) {
  const metricsData = await getMetricsData(date);
  const vmObject: MetricLabelsMap = {};
  const { seriesCountByMetricName } = metricsData;

  await Promise.all(
    seriesCountByMetricName.map(async metric => {
      const { labelValueCountByLabelName } = await getLabelValueCountsForMetric(metric.name, date);
      
      vmObject[metric.name] = labelValueCountByLabelName;
    })
  )
  return vmObject
}

export async function getTotalSeriesCount(date: Date) {
  const metricsData = await getMetricsData(date);
  return metricsData.totalSeries;
}

export async function getSeriesCountForMetric(metricName: string, date: Date) {
  const metricData = await getLabelValueCountsForMetric(metricName, date);
  return metricData.totalSeries;
}

// example use for today's (utc timezone) data:
// vmParser(new Date).then(console.log)

// determining those labels that are never queried
export function determineUnqueriedMetricLabels(grafanaQueriesObj: Record<string, Set<string>>, vmObject: MetricLabelsMap) {
  const output: typeof vmObject = {}

  for (let metric in vmObject) {
    output[metric] = []
    const queriedLabels = grafanaQueriesObj[metric] ?? new Set();
    const labelObjsForMetric = vmObject[metric] as LabelValueCount[];
    labelObjsForMetric.forEach(labelObj => {
      if (!queriedLabels.has(labelObj.name) && output[metric]) {
        output[metric].push(labelObj);
      }
    })
  }
  return output;
}

//example use
// const grafanaQueriesObj = await grafanaQueriesParser();
// const grafanaDashboardQueriesObj = await grafanaDashboardQueriesParser();
// const allGrafanaQueriesObj = combineManualandDashboardQueries(grafanaQueriesObj, grafanaDashboardQueriesObj);
// console.log(allGrafanaQueriesObj);
// const vmObj = await vmParser(new Date);
// const unusued_labels = determineUnqueriedMetricLabels(allGrafanaQueriesObj, vmObj);
// console.log(unusued_labels)

interface VMQueryResponse {
  status: 'success' | 'error';
  data: {
    result: Array<{
      value: [number, string];
    }>;
  };
}

// Estimates the % of series that would be eliminated if a given label were dropped.
// PromQL counts distinct series ignoring the label, divides by total series — the gap
// is what's driven purely by that label's cardinality variance.
export async function getSeriesReduction(metric: string, label: string): Promise<number> {
  //we're searching over the last hour to estimate series reduction
  const query = `100 * (1 - (count(count without (${label}) (present_over_time(${metric}[1h]))) / count(present_over_time(${metric}[1h]))))`;

  try {
    const response = await axios.get<VMQueryResponse>(VMSELECT_QUERY_ENDPOINT, {
      params: { query }
    });

    // type checking
    const rawValue = response.data?.data?.result?.[0]?.value?.[1];

    if (response.data?.status === "success" && rawValue) {
      return parseFloat(rawValue);
    }
  } catch (error) {
    console.error("Failed to fetch metric reduction:", error);
  }
  return 0;
}

//getSeriesReduction("http.requests.total", "request_id").then(console.log)

interface NormalizedMetricsData {
  grafanaUsage: {
    usedLabels: string[];
  };

  metricLabels: {
    [metricName: string]: {
      name: string;
      uniqueValueCount: number;
    }[];
  };

  seriesEstimates: {
    [metricName: string]: {
      current: number;
      afterByRemovedLabel: {
        [labelName: string]: number;
      };
      percentageReduction: {
        [labelName: string]: number;
      };
    };
  };
}

// Metrics with an active aggregation rule are excluded from analysis — their cardinality
// is already being reduced upstream via recording rules.
async function getAggregations() {
  const aggregations = await pool.query(`SELECT metric_name FROM rules WHERE aggregated = true`)
  return aggregations.rows.map(rowObj => rowObj.metric_name)
}

// Labels already scheduled for removal (existing drop rules) are excluded from recommendations
// to avoid surfacing work that's already in progress.
async function getLabelDropRules(): Promise<Map<string, Set<string>>> {
  const result = await pool.query(`SELECT metric_name, labels FROM rules WHERE aggregated = false`);
  const map = new Map<string, Set<string>>();
  for (const row of result.rows) {
    map.set(row.metric_name, new Set(row.labels));
  }
  return map;
}

// Main orchestration function. Fetches all data sources in parallel and produces the
// normalized shape consumed by the API layer to drive the recommendations UI.
export async function normalizeMetricsData(date: Date, ): Promise<NormalizedMetricsData> {
  //get our usedlabels, raw tsdb stats (series counts per metric), and labelvalue counts per metric
  const [combinedGrafanaObj, metricsData, vmObject, aggregations, labelDropRules] = await Promise.all([
    combineManualandDashboardQueries(),
    getMetricsData(date),
    vmParser(date),
    getAggregations(),
    getLabelDropRules(),
  ]);

  // Intentionally global: a label queried for any metric is excluded from drop recommendations
  // across all metrics, not just the one it was queried against.
  const usedLabels = new Set(
    Object.values(combinedGrafanaObj).flatMap(labelSet => [...labelSet])
  );

  // filter vmEntries to exclude any metrics that are in aggregations list
  // filtering here to avoid needing to filter twice
  const filteredVmObject = Object.entries(vmObject).filter(([metricName]) => !aggregations.includes(metricName));


  // renaming vmObject essentially
  const metricLabels: NormalizedMetricsData['metricLabels'] = {};
  for (const [metricName, labelItems] of filteredVmObject) {
    metricLabels[metricName] = labelItems.map(item => ({
      name: item.name,
      uniqueValueCount: item.value,
    }));
  }

  // each metrics current series count
  const seriesCountByName = new Map(
    metricsData.seriesCountByMetricName.map(m => [m.name, m.value])
  );

  const seriesEstimates: NormalizedMetricsData['seriesEstimates'] = {};

  //process each metric in vmObject concurrently (necessary because of getSeriesReduction being async)
  await Promise.all(
    filteredVmObject.map(async ([metricName, labelItems]) => {
      //current series count for a metric
      const current = seriesCountByName.get(metricName) ?? 0;
      // filters out labels queried by grafana, and labels already covered by an existing drop rule
      const unqueriedLabels = labelItems
        .filter(l => !usedLabels.has(l.name))
        .filter(l => !labelDropRules.get(metricName)?.has(l.name));

      const afterByRemovedLabel: Record<string, number> = {};
      const percentageReduction: Record<string, number> = {};

      //process each label for a metric concurrently; this is where getSeriesReduction is actually called.
      await Promise.all(
        unqueriedLabels.map(async labelItem => {
          const pct = await getSeriesReduction(metricName, labelItem.name);
          percentageReduction[labelItem.name] = pct;
          afterByRemovedLabel[labelItem.name] = Math.round(current * (1 - pct / 100));
        })
      );

      seriesEstimates[metricName] = { current, afterByRemovedLabel, percentageReduction };
    })
  );

  return {
    grafanaUsage: { usedLabels: [...usedLabels] },
    metricLabels, //metric labels and cardinality { name: string, uniqueValueCount: number }
    seriesEstimates,
  };
}

// Return shape of normalizeMetricsData:
//
// {
//   grafanaUsage: {
//     usedLabels: ["env", "region", "job"]   // global across all metrics, not per-metric
//   },
//   metricLabels: {
//     "http_requests_total": [
//       { name: "env",        uniqueValueCount: 3  },
//       { name: "request_id", uniqueValueCount: 894 }
//     ]
//   },
//   seriesEstimates: {
//     "http_requests_total": {
//       current: 1200,
//       afterByRemovedLabel:   { "request_id": 24  },  // projected series if label dropped
//       percentageReduction:   { "request_id": 98  }   // % reduction if label dropped
//     }
//   }
// }
//
// Consumed by: orchestrator.ts → generateRecommendations()
// Recommendations are then written to the `recommendations` DB table,
// where the API reads them to present drop candidates to the user.