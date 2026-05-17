import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const vmSelectEndpoint = process.env.VMSELECT_ENDPOINT || "http://localhost:8481/select/0/prometheus/api/v1"

//this is in case victoria metrics was taken offline and brought online again
//because the series won't be in memory so we have to do some manual api
//scraping to get the data we need
interface HistoricalAPIResponse {
  status: string;
  isPartial: boolean;
  data: string[];
}

const getAllHistoricalMetricNames = async () => {
  //db will only have max 1 month's worth of data
  const endDate = new Date();
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  //need iso strings for vmselect url parameters
  const endIso = endDate.toISOString();
  const startIso = startDate.toISOString();

  const res = await axios.get<HistoricalAPIResponse>(`${vmSelectEndpoint}/label/__name__/values?start=${startIso}&end=${endIso}`);
  return res.data.data;
}

interface ActiveMetrics {
  status: string;
  isPartial: boolean;
  data: MetricsData;
}

interface MetricsData {
  totalSeries: number;
  totalLabelValuePairs: number;
  seriesCountByMetricName: MetricCount[];
  seriesCountByLabelName: LabelCount[];
  seriesCountByFocusLabelValue: LabelValuePairCount[];
  seriesCountByLabelValuePair: LabelValuePairCount[];
  labelValueCountByLabelName: LabelCount[];
}

interface LabelCount {
  name: string;
  value: number;
}

interface MetricCount extends LabelCount {
  requestsCount: number;
  lastRequestTimestamp: number;
}

interface LabelValuePairCount extends LabelCount {}

// we are interested in seriesCountByMetricName and labelValueCountByLabelName
// use like this:
// const { seriesCountByMetricName, labelValueCountByLabelName } = await getCurrentActiveMetrics();
const getCurrentActiveMetrics = async () => {
  const res = await axios.get<ActiveMetrics>(`${vmSelectEndpoint}//status/tsdb?topN=100`);
  return res.data.data;
}
