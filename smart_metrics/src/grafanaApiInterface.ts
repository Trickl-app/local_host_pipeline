import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const GRAFANA_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
const GRAFANA_USER = process.env.GRAFANA_USER || 'admin';
const GRAFANA_PASSWORD = process.env.GRAFANA_PASSWORD || 'admin';

// Root response
export interface QueryHistoryResponse {
  result: QueryHistoryResult;
}

export interface QueryHistoryResult {
  totalCount: number;
  queryHistory: QueryHistoryEntry[];
  page: number;
  perPage: number;
}

// Query history entry
export interface QueryHistoryEntry {
  uid: string;
  datasourceUid: string;
  createdBy: number;
  createdAt: number;
  comment: string;
  queries: QueryDefinition[];
  starred: boolean;
}

// Query definition
export interface QueryDefinition {
  datasource: DatasourceRef;

  // Shared query fields
  refId: string;

  // Optional Grafana/VictoriaMetrics fields
  editorMode?: string;
  expr?: string;
  format?: string;
  instant?: boolean;
  key?: string;
  legendFormat?: string;
  range?: boolean;
  queryType?: string;
}

// Datasource reference
export interface DatasourceRef {
  type: string;
  uid: string;
}

async function collectQueries() {
  try {
    //returns expression at index 0, property expr.
    const response = await axios.get(`${GRAFANA_URL}/api/query-history`, {
      auth: {
        username: GRAFANA_USER,
        password: GRAFANA_PASSWORD,
      },
    });

    const queries = response.data.result.queryHistory
    return queries
  } catch (err) {
    if (err instanceof Error) console.error('Error', err.message)
  }
}

async function collectDashboardQueries() {
  try {
    const response = await axios.get(`${GRAFANA_URL}/api/search`, {
      auth: {
        username: GRAFANA_USER,
        password: GRAFANA_PASSWORD,
      },
    });

    const dashboardObjs = response.data
    
    const dashboardQueries = await Promise.all(
      dashboardObjs.map(async (dashboardObj: any) => {
        const response = await axios.get(
          `${GRAFANA_URL}/api/dashboards/uid/${dashboardObj.uid}`,
          {
            auth: {
              username: GRAFANA_USER,
              password: GRAFANA_PASSWORD,
            },
          }
        );

        const dashboard = response.data.dashboard;
        const panels = dashboard.panels;
        const targets = panels?.[0]?.targets;
        const expr = targets?.[0]?.expr;

        return expr;
      })
    );
    
    return dashboardQueries;
  } catch (err) {
    if (err instanceof Error) console.error('Error', err.message)
  }
}

collectDashboardQueries().then(console.log)