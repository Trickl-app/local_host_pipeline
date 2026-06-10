import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

//using 0 tenant id
const vmSelectEndpoint = process.env.VMSELECT_ENDPOINT || "http://localhost:8481/select/0/prometheus/api/v1"

export interface BaseAPIResponse {
  status: string;
  isPartial: boolean;
}

export interface MetricsAPIResponse extends BaseAPIResponse{
  data: MetricsData;
}

export interface MetricsData {
  totalSeries: number;
  totalLabelValuePairs: number;
  seriesCountByMetricName: MetricStats[];
  seriesCountByLabelName: TSDBDataItem[];
  seriesCountByFocusLabelValue: TSDBDataItem[];
  seriesCountByLabelValuePair: TSDBDataItem[];
  labelValueCountByLabelName: TSDBDataItem[];
}

export interface TSDBDataItem {
  name: string;
  value: number;
}

export interface MetricStats extends TSDBDataItem {
  requestsCount: number;
  lastRequestTimestamp: number;
}



// we are interested in seriesCountByMetricName
// use like this:
// const { seriesCountByMetricName } = await getCurrentActiveMetrics();
// also gives label value counts but we have no idea which metrics they're associated with
export const getMetricsData = async (date: Date) => {
  // this gives utc date; can be off by 1 for certain timezones at certain times
  const res = await axios.get<MetricsAPIResponse>(`${vmSelectEndpoint}/status/tsdb`, {
    params: { topN: 100, date: date.toISOString().slice(0, 10) }
  });
  return res.data.data;
}

//getMetricsData(new Date(2026, 4, 18)).then(console.log)

// this is how we understand which labels are associated with which metrics
// note, there can and often is overlap
// use just like the above function
export const getLabelValueCountsForMetric = async (metricName: string, date: Date) => {
  const res = await axios.get<MetricsAPIResponse>(`${vmSelectEndpoint}/status/tsdb`, {
    params: { 'match[]': metricName, topN: 100, date: date.toISOString().slice(0, 10) }
  });
  return res.data.data;
}


interface labelsForMetricsAPIResponse extends BaseAPIResponse{
  data: string[];
}