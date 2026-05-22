import { describe, test, expect } from 'vitest';
import { detectMetricType } from '../src/yamlBuilder.js';
import type { Recommendation } from '../src/recommendationGenerator.js';

function makeRec(metricName: string, remainingLabels: string[] = [], problemLabels: string[] = []): Recommendation {
  return {
    metricName,
    status: 'pending',
    problemLabels,
    remainingLabels,
    estimatedCurrentSeries: 1000,
    estimatedAfterSeries: 500,
    estimatedReductionPercent: 50,
    explanation: '',
  };
}

describe('detectMetricType', () => {

  // counters — _total suffix
  test('detects counter via _total suffix', async () => expect(await detectMetricType(makeRec('http_requests_total'))).toBe('counter'));
  test('detects counter via _total suffix (2)', async () => expect(await detectMetricType(makeRec('grpc_server_handled_total'))).toBe('counter'));
  test('detects counter via _total suffix (3)', async () => expect(await detectMetricType(makeRec('process_cpu_seconds_total'))).toBe('counter'));
  test('detects counter via _total suffix (4)', async () => expect(await detectMetricType(makeRec('db_queries_total'))).toBe('counter'));
  test('detects counter via _total suffix (5)', async () => expect(await detectMetricType(makeRec('errors_total'))).toBe('counter'));

  // histograms — le label
  test('detects histogram via le label in remainingLabels', async () => expect(await detectMetricType(makeRec('http_request_duration_bucket', ['le', 'method']))).toBe('histogram'));
  test('detects histogram via le label in problemLabels', async () => expect(await detectMetricType(makeRec('http_request_duration_bucket', [], ['le']))).toBe('histogram'));

  // histograms — name suffix
  test('detects histogram via _bucket suffix', async () => expect(await detectMetricType(makeRec('http_request_duration_bucket'))).toBe('histogram'));
  test('detects histogram via _sum suffix', async () => expect(await detectMetricType(makeRec('http_request_duration_sum'))).toBe('histogram'));
  test('detects histogram via _count suffix', async () => expect(await detectMetricType(makeRec('http_request_duration_count'))).toBe('histogram'));
  test('detects histogram via _created suffix', async () => expect(await detectMetricType(makeRec('http_request_duration_created'))).toBe('histogram'));
  test('detects histogram via _bucket suffix (2)', async () => expect(await detectMetricType(makeRec('grpc_server_handling_seconds_bucket'))).toBe('histogram'));

  // summaries — quantile label
  test('detects summary via quantile label in remainingLabels', async () => expect(await detectMetricType(makeRec('go_gc_duration_seconds', ['quantile']))).toBe('summary'));
  test('detects summary via quantile label in problemLabels', async () => expect(await detectMetricType(makeRec('go_gc_duration_seconds', [], ['quantile']))).toBe('summary'));
  test('detects summary via quantile label (2)', async () => expect(await detectMetricType(makeRec('rpc_duration_seconds', ['quantile', 'method']))).toBe('summary'));

  // gauges — _info suffix
  test('detects gauge via _info suffix', async () => expect(await detectMetricType(makeRec('target_info'))).toBe('gauge'));
  test('detects gauge via _info suffix (2)', async () => expect(await detectMetricType(makeRec('process_runtime_info'))).toBe('gauge'));

  // plain names with no signals — API unreachable in test env, falls back to gauge default
  test('defaults to gauge for plain name (no signals)', async () => expect(await detectMetricType(makeRec('cpu_usage_percent'))).toBe('gauge'));
  test('defaults to gauge for plain name (2)', async () => expect(await detectMetricType(makeRec('memory_usage_bytes'))).toBe('gauge'));
  test('defaults to gauge for plain name (3)', async () => expect(await detectMetricType(makeRec('active_connections'))).toBe('gauge'));
  test('defaults to gauge for plain name (4)', async () => expect(await detectMetricType(makeRec('queue_depth'))).toBe('gauge'));
  test('defaults to gauge for plain name (5)', async () => expect(await detectMetricType(makeRec('up'))).toBe('gauge'));

  // label check takes priority over name
  test('le label overrides non-histogram name', async () => expect(await detectMetricType(makeRec('some_metric_total', ['le']))).toBe('histogram'));
  test('quantile label overrides non-summary name', async () => expect(await detectMetricType(makeRec('some_metric_total', ['quantile']))).toBe('summary'));

  // dotted metric names (OTel style)
  test('detects counter with dotted OTel name ending in .total', async () => expect(await detectMetricType(makeRec('http.requests.total', ['method']))).toBe('counter'));
  test('detects histogram via le with dotted name', async () => expect(await detectMetricType(makeRec('http.request.duration', ['le', 'method']))).toBe('histogram'));
  test('detects summary via quantile with dotted name', async () => expect(await detectMetricType(makeRec('http.response.time', ['quantile']))).toBe('summary'));

  // edge cases
  test('defaults to gauge for empty metric name', async () => expect(await detectMetricType(makeRec(''))).toBe('gauge'));
  test('defaults to gauge for metric with no matching signals', async () => expect(await detectMetricType(makeRec('foo_bar_baz', ['method', 'status']))).toBe('gauge'));
});
