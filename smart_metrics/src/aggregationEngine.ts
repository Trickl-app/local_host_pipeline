import { collectQueries } from './grafanaApiInterface.js';
import type { QueryHistoryEntry, QueryDefinition } from './grafanaApiInterface.js';
import { getMetricsData, getLabelValueCountsForMetric } from './vmSelectApiInterface.js';
import type { MetricsData } from './vmSelectApiInterface.js';


function parseMetricName(query: string): string {
  const match = query.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)/)
  return match?.[1] ?? ''
}

function parseLabelSelectors(query: string): string[] {
  const match = query.match(/\{([^}]*)\}/)
  if (!match) return []
  return (match[1] ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

async function queryParser() {

  const queryHistory = await collectQueries() as QueryHistoryEntry[]
  const grafanaQueriesObject: Record<string, string[]> = {}
  // get the types right
  queryHistory.forEach((queryHistoryEntry: any) => {
    const query = queryHistoryEntry.queries[0].expr

    const metricName = parseMetricName(query)
    const labelSelectors = parseLabelSelectors(query)

    grafanaQueriesObject[metricName] = labelSelectors

  })
}

    // - get list of metrics and time series count
    // - for each metric, get label value counts
    //   - create object where each key is metric name
    //     and value is object where each key is label name
    //     and value is label count

async function databaseParser(date: Date) {

  const metrics = await getMetricsData()
}