import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const GRAFANA_URL = process.env.GRAFANA_URL || 'http://grafana:3000';
const GRAFANA_USER = process.env.GRAFANA_USER || 'admin';
const GRAFANA_PASSWORD = process.env.GRAFANA_PASSWORD || 'admin';

// export interface {

// }

async function collectQueries() {
  console.log('Polling Grafana query history...');

  try {
    const response = await axios.get(`${GRAFANA_URL}/api/query-history`, {
      auth: {
        username: GRAFANA_USER,
        password: GRAFANA_PASSWORD,
      },
    });

    const queries = response.data.result.queryHistory;
    console.log(`Found ${queries.length} queries`);
    }

    console.log('Done inserting queries');
  } catch (err) {
    console.error('Error collecting queries:', err.message);
  }
}
