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

// types for the next function
type DashboardSearchResults = DashboardSearchResult[];

interface DashboardSearchResult {
  id: number;
  uid: string;
  orgId: number;
  title: string;
  uri: string;
  url: string;
  slug: string;
  type: string;
  tags: string[];
  isStarred: boolean;
  sortMeta: number;
  isDeleted: boolean;
}

//reductive, there are loads of additional properties, but this is the chain we're concerned with.
interface DashboardPayload {
  dashboard: Dashboard;
}

interface Dashboard {
  panels: Panel[];
}

interface Panel {
  targets: Target[];
}

interface Target {
  expr: string;
}

export async function collectQueries() {
  try {
    //returns expression at index 0, property expr.
    const response = await axios.get<QueryHistoryResponse>(`${GRAFANA_URL}/api/query-history`, {
      auth: {
        username: GRAFANA_USER,
        password: GRAFANA_PASSWORD,
      },
    });

    const queries = response.data.result.queryHistory;
    return queries;
  } catch (err) {
    if (err instanceof Error) console.error('Error', err.message);
  }
}


export async function collectDashboardQueries() {
  try {
    const response = await axios.get<DashboardSearchResults>(`${GRAFANA_URL}/api/search`, {
      auth: {
        username: GRAFANA_USER,
        password: GRAFANA_PASSWORD,
      },
    });

    const dashboardObjs = response.data;
    
    // Each dashboard fetch returns string[] (one expr per target per panel).
    // Promise.all gives string[][], so .flat() collapses it to string[].
    const dashboardQueries = (await Promise.all(
      dashboardObjs.map(async (dashboardObj: any) => {
        const response = await axios.get<DashboardPayload>(
          `${GRAFANA_URL}/api/dashboards/uid/${dashboardObj.uid}`,
          {
            auth: {
              username: GRAFANA_USER,
              password: GRAFANA_PASSWORD,
            },
          }
        );

        // Each panel holds one query per target; collect every expr across all panels.
        const panels = response.data.dashboard.panels ?? [];
        return panels.flatMap(panel =>
          (panel.targets ?? []).map(target => target.expr).filter(Boolean)
        );
      })
    )).flat();

    return dashboardQueries;
  } catch (err) {
    if (err instanceof Error) console.error('Error', err.message);
  }
}