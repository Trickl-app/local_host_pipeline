import axios from 'axios';
import { pool } from "./database.js";

//../../vmagent/aggregations.yaml
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { appendFile, writeFile } from 'fs/promises';
const __dirname = dirname(fileURLToPath(import.meta.url));
const YAML_PATH = process.env.YAML_PATH || resolve(__dirname, '../../vmagent/aggregations.yml');
const DROP_LABEL_PATH = process.env.DROP_LABEL_PATH || resolve(__dirname, '../../vmagent/relabel.yml');

type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

const VMSELECT_METADATA_ENDPOINT = `${process.env.VMSELECT_ENDPOINT || 'http://localhost:8481/select/0/prometheus/api/v1'}/metadata`;


interface VMMetadataResponse { 
  status: 'success' | 'error';
  data: {
    [metricName: string]: Array<{ type: string }>;
  };
}

// types concerned with the return of the post route in index.ts after accepted recs. 

type IntervalType = '1m' | '5m' | '15m'

export interface acceptedRecommendations {
  [key: string]: {
    problemLabels: string[];
    allLabels: string[];
    aggregate?: boolean;
    interval: IntervalType;
  }
}

interface RulesTableRow {
  id: number;
  metric_name: string;
  labels: string[];
  json_snippet: Rule;
  aggregated: boolean;
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
export async function writeNewRulestoYaml(acceptedRecommendations: acceptedRecommendations): Promise<RulesTableRow[]> {
  // we need the metric name; we have to get this from the key, so we use object.entries cos it gives us the KEYs and values.
  const entries = Object.entries(acceptedRecommendations);
  //now looks like this:
  //[["metricA", {problemLabels: ..., allLabels: ...}], ["metricB", {problemLabels: ..., allLabels: ...}]]
  const createdRows = await Promise.all(entries.map(async (subArr) => {
    // this saves an unnecessary detect call when we're just dropping labels only
    const type = subArr[1].aggregate ? await detectMetricType(...subArr) : "labelDrop"
    const rule = buildRule(...subArr, type);
    return writeToDb(rule);
  }))
  await writeYaml();
  return createdRows;
}

export async function writeYaml() {
  const queryRes = await pool.query<RulesTableRow>(`SELECT * FROM rules;`);
  const rows = queryRes.rows
  // writeFile wipes the yaml file and replaces with an empty array. 
  const [aggregateRows, labelDropRows] = rows.reduce<[RulesTableRow[], RulesTableRow[]]>(([agg, drop], row) => {
    row.aggregated ? agg.push(row) : drop.push(row);
    return [agg, drop];
  }, [[], []]);
  await Promise.all([YAML_PATH, DROP_LABEL_PATH].map(async path => await writeFile(path, '[]')));
  if (aggregateRows.length && aggregateRows[0]) {
    await writeRule(aggregateRows[0].json_snippet, true);
    await Promise.all(aggregateRows.slice(1).map((row) => {
      return writeRule(row.json_snippet);
    }));
  }
  if (labelDropRows.length && labelDropRows[0]) {
    await writeRule(labelDropRows[0].json_snippet, true);
    await Promise.all(labelDropRows.slice(1).map((row) => {
    return writeRule(row.json_snippet);
    }));
  }
  // tell vmagent to hot-reload its config so the new rule takes effect immediately
  await axios.get(`${process.env.VMAGENT_URL || 'http://localhost:8429'}/-/reload`);
}

export async function writeRule(rule: Rule, overwrite: boolean = false) {
  if (rule.aggregate) {
    const writtenRule = `- match: '${rule.match}'\n  interval: ${rule.interval}\n  outputs: [${rule.outputs}]\n  without: [${rule.without}]\n`;
    overwrite ? await writeFile(YAML_PATH, writtenRule) : await appendFile(YAML_PATH, writtenRule);
  } else {
    const writtenRule = `- if: '${rule.match}'\n  action: labeldrop\n  regex: '${rule.without.join('|')}'\n`;
    overwrite ? await writeFile(DROP_LABEL_PATH, writtenRule) : await appendFile(DROP_LABEL_PATH, writtenRule);
  }
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
export interface Rule {
    match: string;
    interval?: string;
    outputs?: string[];
    aggregate: boolean;
    without: string[]
}

export function buildRule(metricName: string, allAndProblemLabelsObj: acceptedRecommendations[string], type: MetricType | "labelDrop"): Rule {
    const base: Rule = {
        match: metricName,
        without: allAndProblemLabelsObj.problemLabels,
        aggregate: false
    }; 
  
    // evaluate if aggregate is falsy, if so just return obj without an agg rule.
    if (type === "labelDrop" || !allAndProblemLabelsObj.aggregate) return base;

    const outputMap: Record<MetricType, string> = {
        counter: 'total',
        gauge: 'avg',
        histogram: 'histogram_bucket',
        summary: 'avg',
    };

    base.aggregate = true;
    // add in the outputs field if line 138 did not execute. 
    return { ...base, interval: allAndProblemLabelsObj.interval, outputs: [outputMap[type]] };
}
export async function writeToDb(rule: Rule): Promise<RulesTableRow> {
  try {
    const aggregate = rule.aggregate
    const metric = rule.match
    const labels = rule.without
    const json = rule
    const result = await pool.query<RulesTableRow>(`INSERT INTO rules(metric_name, labels, json_snippet, aggregated) VALUES($1, $2, $3, $4) RETURNING *`, [metric, labels, json, aggregate])
    return result.rows[0]!

  } catch (err: any) {
    // let it bubble up to yamlBuilderCoordinator, which will then let it bubble to the index.ts route.
    throw(err);
  }

}