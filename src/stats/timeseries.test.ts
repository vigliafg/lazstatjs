import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autocorrelation,
  centeredMovingAverage,
  decomposeSeasonal,
  forecastModels,
  ljungBox,
  mannKendall,
  runsTest,
  timeSeriesReport,
  timeSeriesTables,
} from './timeseries';
import type { TableSpec } from './types';

const close = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} != ${expected} (diff ${Math.abs(actual - expected)})`
  );

const table = (tables: TableSpec[], id: string): TableSpec => {
  const found = tables.find(spec => spec.id === id);
  assert.ok(found, `missing table ${id}`);
  return found!;
};

test('ACF matches the hand-computed values for a short series', () => {
  const acf = autocorrelation([1, 2, 3, 4, 5], 2);
  close(acf[1], 0.4);
  close(acf[2], -0.1);
});

test('Mann-Kendall detects a monotone trend with the tie-corrected variance', () => {
  const result = mannKendall([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(result.s, 45);
  close(result.tau, 1);
  close(result.z, 3.93548, 1e-5);
  close(result.p, 0.000083, 1e-6);
});

test('runs test counts the runs and uses the continuity correction', () => {
  const result = runsTest([1, 2, 1, 2, 1, 2]);
  assert.equal(result.runs, 6);
  assert.equal(result.n1, 3);
  close(result.z, 1.36931, 1e-5);
  close(result.p, 0.1709, 1e-4);
});

test('centred moving averages use the 2xMA weights for even windows', () => {
  const odd = centeredMovingAverage([1, 2, 3, 4, 5], 3);
  assert.deepEqual(odd, [NaN, 2, 3, 4, NaN]);

  const even = centeredMovingAverage([1, 2, 3, 4, 5, 6], 4);
  close(even[2], 1.875);
  close(even[3], 2.625);
  assert.ok(Number.isNaN(even[1]) && Number.isNaN(even[4]));
});

test('seasonal decomposition recovers a perfect additive pattern', () => {
  const values = [1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3];
  const decomposition = decomposeSeasonal(values, 3);
  assert.ok(decomposition);
  decomposition!.indices.forEach((value, index) => close(value, index - 1));
  close(decomposition!.strength, 1);
});

test('Ljung-Box returns a positive statistic with the requested degrees of freedom', () => {
  const result = ljungBox([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4);
  assert.equal(result.df, 4);
  assert.ok(result.q > 0);
  assert.ok(result.p >= 0 && result.p <= 1);
});

test('forecasting a constant series is exact and the best model wins', () => {
  const models = forecastModels(new Array(20).fill(5), 0, 4);
  assert.equal(models.length, 2);
  assert.equal(models[0].name, 'Exponential smoothing (SES)');
  close(models[0].rmse, 0);
  assert.deepEqual(models[0].forecast.slice(0, 3), [5, 5, 5]);
  assert.ok(models[0].rmse <= models[1].rmse);
});

test('tables cover the series, tests, seasonality and forecasts without NaN text', () => {
  const series = Array.from({ length: 24 }, (_, index) => 10 + 0.5 * index + 2 * Math.sin((2 * Math.PI * index) / 4));
  const tables = timeSeriesTables({ values: series, period: 4, horizon: 6, level: 95 });

  const ids = tables.map(spec => spec.id);
  for (const id of ['ts-summary', 'ts-acf', 'ts-tests', 'ts-seasonal', 'ts-decomposition', 'ts-models', 'ts-forecast']) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }

  assert.equal(table(tables, 'ts-forecast').rows.length, 6);
  assert.equal(table(tables, 'ts-acf').rows.length, 7);

  const report = timeSeriesReport(tables, 95);
  const text = [
    report.headline,
    ...report.intro,
    ...report.sections.flatMap(section => [...(section.body ?? []), ...(section.bullets ?? [])]),
    ...report.limitations,
  ].join(' ');
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('a series without seasonality omits the decomposition tables', () => {
  const series = [3, 5, 4, 6, 7, 5, 8, 9, 7, 8];
  const tables = timeSeriesTables({ values: series, period: 0, horizon: 3, level: 95 });
  const ids = tables.map(spec => spec.id);
  assert.ok(!ids.includes('ts-seasonal'));
  assert.ok(ids.includes('ts-forecast'));
});

test('short series produce no tables', () => {
  assert.deepEqual(timeSeriesTables({ values: [1, 2, 3], period: 0, horizon: 2 }), []);
});
