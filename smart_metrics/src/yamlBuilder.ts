import axios from 'axios';
import type { Recommendation } from './recommendationGenerator.js';

type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

const VMSELECT_METADATA_ENDPOINT = process.env.VMSELECT_METADATA_ENDPOINT
  || 'http://localhost:8481/select/0/prometheus/api/v1/metadata';

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

//needs to be renamed
//this is called in the api endpoint (POST), when the grafana front end, submits a batch of recommendations.
//the shape at point of invocation is acceptedRecommendations (which is the shape we built in front endd)
export async function yamlBuilderCoordinator(acceptedRecommendations: acceptedRecommendations) {
  // we need the metric name; we have to get this from the key, so we use object.entries cos it gives us the KEYs and values.
  const entries = Object.entries(acceptedRecommendations);
  entries.forEach(async (subArr) => {
    //determine type for aggregation function
    const type = await detectMetricType(...subArr);
    //for testing
    console.log(buildRule(...subArr, type));
  })
}


export async function detectMetricType(metricName: string, recommendation: acceptedRecommendations[string]): Promise<MetricType> {

  const { allLabels } = recommendation

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

export function buildRule(metricName: string, recommendation: acceptedRecommendations[string], type: MetricType): AggregationRule {

    const rule = (outputs: string): AggregationRule => ({
        match: metricName,
        interval: '1m',
        outputs: [outputs],
        without: recommendation.problemLabels
    });

    switch (type) {
    case "counter":
        return rule('total');
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