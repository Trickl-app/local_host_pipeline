import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

//tenant id here is 0 since that seems to always work
//read about tenant id
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

interface BaseAPIResponse {
  status: string;
  isPartial: boolean;
}

interface MetricsAPIResponse extends BaseAPIResponse{
  data: MetricsData;
}

interface MetricsData {
  totalSeries: number;
  totalLabelValuePairs: number;
  seriesCountByMetricName: MetricStats[];
  seriesCountByLabelName: TSDBDataItem[];
  seriesCountByFocusLabelValue: TSDBDataItem[];
  seriesCountByLabelValuePair: TSDBDataItem[];
  labelValueCountByLabelName: TSDBDataItem[];
}

interface TSDBDataItem {
  name: string;
  value: number;
}

interface MetricStats extends TSDBDataItem {
  requestsCount: number;
  lastRequestTimestamp: number;
}

// we won't format the strings like this every time; you can pass parameters to axios.get using a config obj

// we are interested in seriesCountByMetricName and labelValueCountByLabelName
// use like this:
// const { seriesCountByMetricName } = await getCurrentActiveMetrics();
// also gives label value counts but we have no idea which metrics they're associated with
const getMetricsData = async (date?: Date) => {
  // this gives utc date; can be off by 1 for certain timezones at certain times
  // for example when i tested it I had to use today's date to get yesterday's results.
  const targetDay = date && date.toISOString().slice(0, 10);
  const endpoint = targetDay ? `${vmSelectEndpoint}//status/tsdb?topN=100&date=${targetDay}`
    : `${vmSelectEndpoint}//status/tsdb?topN=100`;
  const res = await axios.get<MetricsAPIResponse>(endpoint);
  return res.data.data;
}

// this is how we understand which labels are associated with which metrics
// note, there can and often is overlap
// use just like the above function
const getLabelValueCountsForMetric = async (metricName: string) => {
  const res = await axios.get<MetricsAPIResponse>(`${vmSelectEndpoint}//status/tsdb?match[]=${metricName}&topN=100`);
  return res.data.data;
}

// // example usage:
// const { seriesCountByMetricName } = await getMetricsData();

// let todaysTopMetrics = seriesCountByMetricName.map((metricStat: MetricStats) => metricStat.name)

// let labelsOfEachMetric: { [key: string]: TSDBDataItem[] } = {}

// for (let metric of todaysTopMetrics) {
//   let labels = await getLabelValueCountsForMetric(metric)
//   labelsOfEachMetric[metric] = labels.labelValueCountByLabelName;
// }

// // there is often overlap (almost all of mine had overlapped)
// console.log(labelsOfEachMetric)


interface labelsForMetricsAPIResponse extends BaseAPIResponse{
  data: string[];
}

// http://localhost:8481/select/0/prometheus/api/v1/label/request_id/values?match[]=http.request.duration_ms_bucket&limit=500
// is an example of getting up to 500 label values for a label belonging to a metric
// the data field will be a massive array.
const getEachLabelValueForMetric = async (metricName: string, labelName: string, limit: number) => {
  const res = await axios.get<labelsForMetricsAPIResponse>(`${vmSelectEndpoint}/label/${labelName}/values?match[]=${metricName}&limit=${limit}`)
  return res.data.data
}