import { vi, test, expect, beforeEach } from 'vitest'
import { databaseParser } from '../src/aggregationEngine.js'
import getMetricsDataTestData from './getMetricsDataTestData.json' with { type: 'json' }
import getLabelValueCountsForMetricTestData from './getLabelValueCountsForMetricTestData.json' with { type: 'json' }
import collectQueriesTestData from './collectQueriesTestData.json' with { type: 'json' }

// Safe defaults are required here because aggregationEngine.ts has top-level awaits
// that fire the moment the module is imported — before beforeEach can set return values.
const { mockGetMetricsData, mockGetLabelValueCountsForMetric, mockCollectQueries } = vi.hoisted(() => ({
  mockGetMetricsData: vi.fn().mockResolvedValue({ seriesCountByMetricName: [] }),
  mockGetLabelValueCountsForMetric: vi.fn().mockResolvedValue({ labelValueCountByLabelName: [] }),
  mockCollectQueries: vi.fn().mockResolvedValue([]),
}))

vi.mock('../src/vmSelectApiInterface.js', () => ({
  getMetricsData: mockGetMetricsData,
  getLabelValueCountsForMetric: mockGetLabelValueCountsForMetric,
}))

vi.mock('../src/grafanaApiInterface.js', () => ({
  collectQueries: mockCollectQueries,
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

test('returns an object keyed by all metric names from getMetricsData', async () => {
  const result = await databaseParser(testDate)
  expect(Object.keys(result).sort()).toEqual(expectedMetricNames.slice().sort())
})

test('http.requests.total in the databaseParser() object, maps to the correct labelValueCountByLabelName value', async () => {
  const result = await databaseParser(testDate)
  expect(result['http.requests.total']).toEqual(expectedLabelCounts)
})

test('getLabelValueCountsForMetric is called once per metric', async () => {
  await databaseParser(testDate)
  expect(mockGetLabelValueCountsForMetric).toHaveBeenCalledTimes(expectedMetricNames.length)
})

test('getLabelValueCountsForMetric is called with the correct metric name and date for each metric', async () => {
  await databaseParser(testDate)
  for (const metricName of expectedMetricNames) {
    expect(mockGetLabelValueCountsForMetric).toHaveBeenCalledWith(metricName, testDate)
  }
})
