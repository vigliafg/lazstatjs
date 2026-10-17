import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistogram, pairedValues, pooledTTest, welchTTest } from './core.ts';

const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('pairedValues keeps only row-wise complete pairs', () => {
  const rows = [
    ['1', '2'],
    ['', '20'],
    ['3', '4'],
    ['non-numerico', '5'],
  ];
  const { a, b } = pairedValues(rows, 0, 1);
  assert.deepEqual(a, [1, 3]);
  assert.deepEqual(b, [2, 4]);
});

test('pooled t-test matches the hand-computed reference', () => {
  const a = [1, 2, 3, 4, 5];
  const b = [2, 4, 6, 8, 10, 12];
  const res = pooledTTest(a, b);
  close(res.t, -2.215647, 1e-5);
  close(res.df, 9, 1e-12);
  close(res.se, 1.805343, 1e-5);
  assert.ok(res.p > 0 && res.p < 1);
});

test('Welch t-test matches the hand-computed reference', () => {
  const a = [1, 2, 3, 4, 5];
  const b = [2, 4, 6, 8, 10, 12];
  const res = welchTTest(a, b);
  close(res.t, -2.376354, 1e-5);
  close(res.df, 6.9722, 1e-3);
  assert.ok(res.se > 0);
  assert.ok(res.p > 0 && res.p < 1);
});

test('Welch p-value differs from pooled when variances are unequal', () => {
  const a = [1, 1, 1, 2, 5];
  const b = [10, 12, 14, 16, 30];
  const pooled = pooledTTest(a, b);
  const welch = welchTTest(a, b);
  assert.ok(Math.abs(pooled.p - welch.p) > 1e-4);
});

test('buildHistogram reproduces jStat bins and edges', () => {
  const pre = [50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72];
  const hist = buildHistogram(pre);
  assert.equal(hist.bins, 5);
  assert.deepEqual(hist.data.map(d => d.y), [3, 4, 5, 5, 3]);
  assert.equal(hist.edges.length, 6);
  close(hist.edges[0], 45);
  close(hist.edges[5], 72);
  close(hist.binWidth, 5.4);
});

test('buildHistogram handles constant data without NaN', () => {
  const hist = buildHistogram([5, 5, 5]);
  assert.equal(hist.bins, 1);
  assert.equal(hist.binWidth, 0);
  assert.deepEqual(hist.data, [{ x: 5, y: 3 }]);
  assert.ok(hist.edges.every(v => isFinite(v)));
});

test('buildHistogram handles empty input', () => {
  assert.deepEqual(buildHistogram([]), { bins: 0, binWidth: 0, edges: [], data: [] });
});
