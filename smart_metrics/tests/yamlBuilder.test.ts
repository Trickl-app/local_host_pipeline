import { describe, test, expect } from 'vitest';
import { detectMetricType, buildRule } from '../src/yamlBuilder.js';

describe('detectMetricType', () => {

  // counters — _total suffix
  test('detects counter via _total suffix', async () => expect(await detectMetricType('http_requests_total', { problemLabels: [], allLabels: [] })).toBe('counter'));
  test('detects counter via _total suffix (2)', async () => expect(await detectMetricType('grpc_server_handled_total', { problemLabels: [], allLabels: [] })).toBe('counter'));
  test('detects counter via _total suffix (3)', async () => expect(await detectMetricType('process_cpu_seconds_total', { problemLabels: [], allLabels: [] })).toBe('counter'));
  test('detects counter via _total suffix (4)', async () => expect(await detectMetricType('db_queries_total', { problemLabels: [], allLabels: [] })).toBe('counter'));
  test('detects counter via _total suffix (5)', async () => expect(await detectMetricType('errors_total', { problemLabels: [], allLabels: [] })).toBe('counter'));

  // histograms — le label
  test('detects histogram via le label in remainingLabels', async () => expect(await detectMetricType('http_request_duration_bucket', { problemLabels: [], allLabels: ['le', 'method'] })).toBe('histogram'));
  test('detects histogram via le label in problemLabels', async () => expect(await detectMetricType('http_request_duration_bucket', { problemLabels: ['le'], allLabels: ['le'] })).toBe('histogram'));

  // histograms — name suffix
  test('detects histogram via _bucket suffix', async () => expect(await detectMetricType('http_request_duration_bucket', { problemLabels: [], allLabels: [] })).toBe('histogram'));
  test('detects histogram via _sum suffix', async () => expect(await detectMetricType('http_request_duration_sum', { problemLabels: [], allLabels: [] })).toBe('histogram'));
  test('detects histogram via _count suffix', async () => expect(await detectMetricType('http_request_duration_count', { problemLabels: [], allLabels: [] })).toBe('histogram'));
  test('detects histogram via _created suffix', async () => expect(await detectMetricType('http_request_duration_created', { problemLabels: [], allLabels: [] })).toBe('histogram'));
  test('detects histogram via _bucket suffix (2)', async () => expect(await detectMetricType('grpc_server_handling_seconds_bucket', { problemLabels: [], allLabels: [] })).toBe('histogram'));

  // summaries — quantile label
  test('detects summary via quantile label in remainingLabels', async () => expect(await detectMetricType('go_gc_duration_seconds', { problemLabels: [], allLabels: ['quantile'] })).toBe('summary'));
  test('detects summary via quantile label in problemLabels', async () => expect(await detectMetricType('go_gc_duration_seconds', { problemLabels: ['quantile'], allLabels: ['quantile'] })).toBe('summary'));
  test('detects summary via quantile label (2)', async () => expect(await detectMetricType('rpc_duration_seconds', { problemLabels: [], allLabels: ['quantile', 'method'] })).toBe('summary'));

  // gauges — _info suffix
  test('detects gauge via _info suffix', async () => expect(await detectMetricType('target_info', { problemLabels: [], allLabels: [] })).toBe('gauge'));
  test('detects gauge via _info suffix (2)', async () => expect(await detectMetricType('process_runtime_info', { problemLabels: [], allLabels: [] })).toBe('gauge'));

  // plain names with no signals — API unreachable in test env, falls back to gauge default
  test('defaults to gauge for plain name (no signals)', async () => expect(await detectMetricType('cpu_usage_percent', { problemLabels: [], allLabels: [] })).toBe('gauge'));
  test('defaults to gauge for plain name (2)', async () => expect(await detectMetricType('memory_usage_bytes', { problemLabels: [], allLabels: [] })).toBe('gauge'));
  test('defaults to gauge for plain name (3)', async () => expect(await detectMetricType('active_connections', { problemLabels: [], allLabels: [] })).toBe('gauge'));
  test('defaults to gauge for plain name (4)', async () => expect(await detectMetricType('queue_depth', { problemLabels: [], allLabels: [] })).toBe('gauge'));
  test('defaults to gauge for plain name (5)', async () => expect(await detectMetricType('up', { problemLabels: [], allLabels: [] })).toBe('gauge'));

  // label check takes priority over name
  test('le label overrides non-histogram name', async () => expect(await detectMetricType('some_metric_total', { problemLabels: [], allLabels: ['le'] })).toBe('histogram'));
  test('quantile label overrides non-summary name', async () => expect(await detectMetricType('some_metric_total', { problemLabels: [], allLabels: ['quantile'] })).toBe('summary'));

  // dotted metric names (OTel style)
  test('detects counter with dotted OTel name ending in .total', async () => expect(await detectMetricType('http.requests.total', { problemLabels: [], allLabels: ['method'] })).toBe('counter'));
  test('detects histogram via le with dotted name', async () => expect(await detectMetricType('http.request.duration', { problemLabels: [], allLabels: ['le', 'method'] })).toBe('histogram'));
  test('detects summary via quantile with dotted name', async () => expect(await detectMetricType('http.response.time', { problemLabels: [], allLabels: ['quantile'] })).toBe('summary'));

  // edge cases
  test('defaults to gauge for empty metric name', async () => expect(await detectMetricType('', { problemLabels: [], allLabels: [] })).toBe('gauge'));
  test('defaults to gauge for metric with no matching signals', async () => expect(await detectMetricType('foo_bar_baz', { problemLabels: [], allLabels: ['method', 'status'] })).toBe('gauge'));
});

describe('buildRule', () => {

  test('counter rule has outputs: [total]', () => {
    const rule = buildRule('http_requests_total', { problemLabels: ['pod'], allLabels: ['pod'] }, 'counter');
    expect(rule.outputs).toEqual(['total']);
  });

  test('gauge rule has outputs: [avg]', () => {
    const rule = buildRule('node_memory_bytes', { problemLabels: ['instance'], allLabels: ['instance'] }, 'gauge');
    expect(rule.outputs).toEqual(['avg']);
  });

  test('histogram rule has outputs: [histogram_bucket]', () => {
    const rule = buildRule('http_request_duration_bucket', { problemLabels: ['pod'], allLabels: ['le', 'pod'] }, 'histogram');
    expect(rule.outputs).toEqual(['histogram_bucket']);
  });

  test('summary rule has outputs: [avg]', () => {
    const rule = buildRule('go_gc_duration_seconds', { problemLabels: ['pod'], allLabels: ['quantile', 'pod'] }, 'summary');
    expect(rule.outputs).toEqual(['avg']);
  });

  test('match is set to the metric name', () => {
    const rule = buildRule('http_requests_total', { problemLabels: ['pod'], allLabels: ['pod'] }, 'counter');
    expect(rule.match).toBe('http_requests_total');
  });

  test('without contains the problem label', () => {
    const rule = buildRule('node_memory_bytes', { problemLabels: ['instance'], allLabels: ['instance'] }, 'gauge');
    expect(rule.without).toEqual(['instance']);
  });

  test('interval is 1m', () => {
    const rule = buildRule('http_requests_total', { problemLabels: ['pod'], allLabels: ['pod'] }, 'counter');
    expect(rule.interval).toBe('1m');
  });
});
