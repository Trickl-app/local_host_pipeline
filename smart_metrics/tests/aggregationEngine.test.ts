import { vi, test, expect, beforeEach } from 'vitest'
import { vmParser, grafanaQueriesParser, grafanaDashboardQueriesParser, combineManualandDashboardQueries, determineUnqueriedMetricLabels, getTotalSeriesCount, getSeriesCountForMetric, getSeriesReduction } from '../src/aggregationEngine.js'
import getMetricsDataTestData from './getMetricsDataTestData.json' with { type: 'json' }
import getLabelValueCountsForMetricTestData from './getLabelValueCountsForMetricTestData.json' with { type: 'json' }
import collectQueriesTestData from './collectQueriesTestData.json' with { type: 'json' }

// Safe defaults are required here because aggregationEngine.ts has top-level awaits
// that fire the moment the module is imported — before beforeEach can set return values.
const { mockGetMetricsData, mockGetLabelValueCountsForMetric, mockCollectQueries, mockCollectDashboardQueries, mockAxiosPost } = vi.hoisted(() => ({
  mockGetMetricsData: vi.fn().mockResolvedValue({ seriesCountByMetricName: [] }),
  mockGetLabelValueCountsForMetric: vi.fn().mockResolvedValue({ labelValueCountByLabelName: [] }),
  mockCollectQueries: vi.fn().mockResolvedValue([]),
  mockCollectDashboardQueries: vi.fn().mockResolvedValue(['count(http.requests.total{method="GET"})']),
  mockAxiosPost: vi.fn().mockResolvedValue({ data: { status: 'success', data: { result: [{ value: [0, '75.5'] }] } } }),
}))

vi.mock('axios', () => ({ default: { post: mockAxiosPost } }))

vi.mock('../src/vmSelectApiInterface.js', () => ({
  getMetricsData: mockGetMetricsData,
  getLabelValueCountsForMetric: mockGetLabelValueCountsForMetric,
}))

vi.mock('../src/grafanaApiInterface.js', () => ({
  collectQueries: mockCollectQueries,
  collectDashboardQueries: mockCollectDashboardQueries,
}))

const testDate = new Date('2026-05-19')
const expectedMetricNames = getMetricsDataTestData.data.seriesCountByMetricName.map(m => m.name)
const expectedLabelCounts = getLabelValueCountsForMetricTestData.data.labelValueCountByLabelName

beforeEach(() => {
  vi.clearAllMocks()
  mockGetMetricsData.mockResolvedValue(getMetricsDataTestData.data)
  mockGetLabelValueCountsForMetric.mockResolvedValue(getLabelValueCountsForMetricTestData.data)
  mockCollectQueries.mockResolvedValue(collectQueriesTestData.result.queryHistory)
})

// grafanaQueriesParser tests

test('grafanaQueriesParser returns an object with exactly the queried metric names as keys', async () => {
  const result = await grafanaQueriesParser()
  expect(Object.keys(result).sort()).toEqual(['http.active_connections', 'http.requests.total'])
})

test('grafanaQueriesParser maps http.requests.total to all labels it has been queried with', async () => {
  const result = await grafanaQueriesParser()
  expect(result['http.requests.total']).toEqual(new Set(['method']))
})

test('grafanaQueriesParser maps http.active_connections to all labels it has been queried with', async () => {
  const result = await grafanaQueriesParser()
  expect(result['http.active_connections']).toEqual(new Set(['scope.name']))
})

test('grafanaQueriesParser calls collectQueries exactly once', async () => {
  await grafanaQueriesParser()
  expect(mockCollectQueries).toHaveBeenCalledTimes(1)
})

// grafanaDashboardQueriesParser tests

test('grafanaDashboardQueriesParser returns an object with exactly the queried metric names as keys', async () => {
  const result = await grafanaDashboardQueriesParser()
  expect(Object.keys(result)).toEqual(['http.requests.total'])
})

test('grafanaDashboardQueriesParser maps http.requests.total to all labels it has been queried with', async () => {
  const result = await grafanaDashboardQueriesParser()
  expect(result['http.requests.total']).toEqual(new Set(['method']))
})

test('grafanaDashboardQueriesParser calls collectDashboardQueries exactly once', async () => {
  await grafanaDashboardQueriesParser()
  expect(mockCollectDashboardQueries).toHaveBeenCalledTimes(1)
})

// combineManualandDashboardQueries tests

test('combineManualandDashboardQueries returns keys from both query sources', async () => {
  const result = await combineManualandDashboardQueries()
  expect(Object.keys(result).sort()).toEqual(['http.active_connections', 'http.requests.total'])
})

test('combineManualandDashboardQueries merges label sets for a metric that appears in both sources', async () => {
  // dashboard mock returns a query that adds a second label for http.requests.total
  mockCollectDashboardQueries.mockResolvedValueOnce(['http.requests.total{region="us-east-1"}'])
  const result = await combineManualandDashboardQueries()
  expect(result['http.requests.total']).toEqual(new Set(['method', 'region']))
})

// vmParser tests

test('returns an object keyed by all metric names from getMetricsData', async () => {
  const result = await vmParser(testDate)
  expect(Object.keys(result).sort()).toEqual(expectedMetricNames.slice().sort())
})

test('http.requests.total in the vmParser() object, maps to the correct labelValueCountByLabelName value', async () => {
  const result = await vmParser(testDate)
  expect(result['http.requests.total']).toEqual(expectedLabelCounts)
})

test('getLabelValueCountsForMetric is called once per metric', async () => {
  await vmParser(testDate)
  expect(mockGetLabelValueCountsForMetric).toHaveBeenCalledTimes(expectedMetricNames.length)
})

test('getLabelValueCountsForMetric is called with the correct metric name and date for each metric', async () => {
  await vmParser(testDate)
  for (const metricName of expectedMetricNames) {
    expect(mockGetLabelValueCountsForMetric).toHaveBeenCalledWith(metricName, testDate)
  }
})

// determineUnqueriedMetricLabels tests

test('queried labels are excluded from the output', () => {
  const grafanaQueriesObj = { 'http.requests.total': new Set(['method']) }
  const vmObject = { 'http.requests.total': getLabelValueCountsForMetricTestData.data.labelValueCountByLabelName }
  const result = determineUnqueriedMetricLabels(grafanaQueriesObj, vmObject)
  const expected = getLabelValueCountsForMetricTestData.data.labelValueCountByLabelName.filter(l => l.name !== 'method')
  expect(result['http.requests.total']).toEqual(expected)
})

test('a metric absent from grafanaQueriesObj retains all its labels', () => {
  const grafanaQueriesObj = {}
  const vmObject = { 'http.requests.total': getLabelValueCountsForMetricTestData.data.labelValueCountByLabelName }
  const result = determineUnqueriedMetricLabels(grafanaQueriesObj, vmObject)
  expect(result['http.requests.total']).toEqual(getLabelValueCountsForMetricTestData.data.labelValueCountByLabelName)
})

test('a metric whose every label was queried maps to an empty array', () => {
  const grafanaQueriesObj = { 'some.metric': new Set(['label_a', 'label_b']) }
  const vmObject = { 'some.metric': [{ name: 'label_a', value: 10 }, { name: 'label_b', value: 5 }] }
  const result = determineUnqueriedMetricLabels(grafanaQueriesObj, vmObject)
  expect(result['some.metric']).toEqual([])
})

test('output has a key for every metric in vmObject', () => {
  const grafanaQueriesObj = { 'http.requests.total': new Set(['method']) }
  const vmObject = {
    'http.requests.total': getLabelValueCountsForMetricTestData.data.labelValueCountByLabelName,
    'http.active_connections': [{ name: 'scope.name', value: 1 }, { name: '__name__', value: 1 }],
  }
  const result = determineUnqueriedMetricLabels(grafanaQueriesObj, vmObject)
  expect(Object.keys(result).sort()).toEqual(['http.active_connections', 'http.requests.total'])
})

// getTotalSeriesCount tests

test('getTotalSeriesCount returns the totalSeries value from getMetricsData', async () => {
  const result = await getTotalSeriesCount(testDate)
  expect(result).toBe(getMetricsDataTestData.data.totalSeries)
})

// getSeriesCountForMetric tests

test('getSeriesCountForMetric returns the totalSeries value from getLabelValueCountsForMetric', async () => {
  const result = await getSeriesCountForMetric('http.requests.total', testDate)
  expect(result).toBe(getLabelValueCountsForMetricTestData.data.totalSeries)
})

// getSeriesReduction tests

test('getSeriesReduction returns the parsed reduction percentage on success', async () => {
  const result = await getSeriesReduction('http.requests.total', 'request_id')
  expect(result).toBe(75.5)
})

test('getSeriesReduction returns 0 when the result array is empty', async () => {
  mockAxiosPost.mockResolvedValueOnce({ data: { status: 'success', data: { result: [] } } })
  const result = await getSeriesReduction('http.requests.total', 'request_id')
  expect(result).toBe(0)
})

test('getSeriesReduction returns 0 when axios throws', async () => {
  mockAxiosPost.mockRejectedValueOnce(new Error('network error'))
  const result = await getSeriesReduction('http.requests.total', 'request_id')
  expect(result).toBe(0)
})
