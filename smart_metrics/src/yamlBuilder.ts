import axios from 'axios';
import type { Recommendation } from './recommendationGenerator.js';

//../../vmagent/aggregations.yaml
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { appendFile, readFile, writeFile } from 'fs/promises';
const __dirname = dirname(fileURLToPath(import.meta.url));
const YAML_PATH = process.env.YAML_PATH || resolve(__dirname, '../../vmagent/aggregations.yml');

type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

const VMSELECT_METADATA_ENDPOINT = `${process.env.VMSELECT_ENDPOINT || 'http://localhost:8481/select/0/prometheus/api/v1'}/metadata`;


interface VMMetadataResponse { 
  status: 'success' | 'error';
  data: {
    [metricName: string]: Array<{ type: string }>;
  };
}

export interface acceptedRecommendations {
  [key: string]: {
    problemLabels: string[];
    allLabels: string[];
  }
}

// {
//   metricA: {
//     problemLabels: [1,2]
//     allLabels: [1,2,3,4,]
//   },
//   metricB: {
//     problemLabels: ["a", "b"],
//     allLabels: ["a", "b", "c", "d"]
//   }
// }

//needs to be renamed
//this is called in the api endpoint (POST), when the grafana front end, submits a batch of recommendations.
//the shape at point of invocation is acceptedRecommendations (which is the shape we built in front endd)
export async function yamlBuilderCoordinator(acceptedRecommendations: acceptedRecommendations) {
  // we need the metric name; we have to get this from the key, so we use object.entries cos it gives us the KEYs and values.
  const entries = Object.entries(acceptedRecommendations);
  //now looks like this:
  //[["metricA", {problemLabels: ..., allLabels: ...}], ["metricB", {problemLabels: ..., allLabels: ...}]]
  for (const subArr of entries) {
    //determine type for aggregation function
    //...subArr = metricName, {problemLabels: ..., allLabels: ...}
    const type = await detectMetricType(...subArr);
    //for testing
    const rule = buildRule(...subArr, type);
    console.log(rule);
    await writeRule(rule);
  }
}

//once we build rule, we need to actually somehow, write that rule, to vmagent's aggregations.yaml
//the rule is json
//so somehow we need to create a multiline string from the json, which should actually be easy enough
//and then we insert into aggregations.yaml, a newline string, the multiline string, and that's it.
//and finally when all rules are inserted into aggregations,yaml, we hit vmagent's reload endpoint.

export async function writeRule(rule: AggregationRule) {
  const writtenRule = 
  `- match: '${rule.match}'
  interval: ${rule.interval}
  outputs: [${rule.outputs}]
  without: [${rule.without}]\n`

  
  const existing = await readFile(YAML_PATH, 'utf-8');
  //this will only ever run if aggregations.yml is empty / if it's the first ever aggregation rule.
  if (existing.replace(/\s/g, '') === '[]') {
    await writeFile(YAML_PATH, writtenRule);
  } else {
    await appendFile(YAML_PATH, writtenRule);
  }
  await axios.get(`${process.env.VMAGENT_URL || 'http://localhost:8429'}/-/reload`);
}

export async function detectMetricType(metricName: string, allAndProblemLabelsObj: acceptedRecommendations[string]): Promise<MetricType> {
  const { allLabels } = allAndProblemLabelsObj;

  // label-based checks are most reliable
  if (allLabels.includes('le')) return 'histogram';
  if (allLabels.includes('quantile')) return 'summary';

  // name suffix checks — [._] handles both Prometheus (underscore) and OTel (dot) naming
  if (/[._]total$/.test(metricName)) return 'counter';
  if (/[._](bucket|sum|count|created)$/.test(metricName)) return 'histogram';
  if (/[._]info$/.test(metricName)) return 'gauge';

  // fallback to VM metadata API
  try {
    const response = await axios.get<VMMetadataResponse>(VMSELECT_METADATA_ENDPOINT, {
      params: { metric: metricName },
    });
    const type = response.data?.data?.[metricName]?.[0]?.type;
    if (type === 'counter' || type === 'gauge' || type === 'histogram' || type === 'summary') {
      return type;
    }
  } catch {
    // API unreachable, fall through to default
  }

  // Needs more research here to determine the default. 
  // default to gauge** (subject to change)
  return 'gauge';
}

//needs to change in the future.
export interface AggregationRule {
    match: string;
    interval: string;
    outputs: string[];
    without: string[]
}

export function buildRule(metricName: string, allAndProblemLabelsObj: acceptedRecommendations[string], type: MetricType): AggregationRule {
    const rule = (outputs: string): AggregationRule => ({
        match: metricName,
        interval: '1m',
        outputs: [outputs],
        without: allAndProblemLabelsObj.problemLabels
    });

    switch (type) {
    case "counter":
        return rule('total');
    // we can change this to just drop labels in case the user misnamed a metric
    case "gauge":
        return rule('avg');
    case "histogram":
        return rule('histogram_bucket');
    case "summary":
        return rule('avg');
    }
}

// buildRule return shape (AggregationRule):
//
// {
//   match:    string       — the metric name to target, e.g. 'example_requests_total'
//   interval: string       — aggregation window, currently hardcoded to '1m'
//   outputs:  string[]     — aggregation strategy derived from metric type:
//                              counter   -> ['total']
//                              gauge     -> ['avg']
//                              histogram -> ['histogram_bucket']
//                              summary   -> ['avg']
//   without:  string[]     — the high-cardinality labels to drop, e.g. ['example_label']
// }
//
// example:
// {
//   match: 'example_requests_total',
//   interval: '1m',
//   outputs: ['total'],
//   without: ['example_label']
// }