import { describe, test, expect } from 'vitest'
import { parsePromqlExpression } from '../src/promQLQueryParser.js'

test('extracts quoted metric name with a label filter', () => {
  const { metrics, labels } = parsePromqlExpression('{"http.requests.total", method="GET"}')
  expect([...metrics]).toEqual(['http.requests.total'])
  expect(labels).toEqual(['method'])
})

test('extracts quoted metric name with no label filters', () => {
  const { metrics, labels } = parsePromqlExpression('{"http.requests.total"}')
  expect([...metrics]).toEqual(['http.requests.total'])
  expect(labels).toEqual([])
})

test('handles two-block syntax: quoted metric name followed by label matcher block', () => {
  const { metrics, labels } = parsePromqlExpression('{"http.requests.total"}{method="GET"}')
  expect([...metrics]).toEqual(['http.requests.total'])
  expect(labels).toEqual(['method'])
})

test('extracts quoted metric name and quoted label name with dots', () => {
  const { metrics, labels } = parsePromqlExpression('{"http.active_connections", "scope.name"="high-cardinality-simulator"}')
  expect([...metrics]).toEqual(['http.active_connections'])
  expect(labels).toEqual(['scope.name'])
})

test('extracts plain metric name and label filter', () => {
  const { metrics, labels } = parsePromqlExpression('http_requests_total{method="GET"}')
  expect([...metrics]).toEqual(['http_requests_total'])
  expect(labels).toEqual(['method'])
})

test('deduplicates metric names that appear more than once', () => {
  const { metrics } = parsePromqlExpression('{"http.requests.total"} / {"http.requests.total"}')
  expect([...metrics]).toEqual(['http.requests.total'])
})
