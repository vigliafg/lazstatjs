import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adfTest,
  arimaAnalysis,
  arimaLabel,
  differenceSeries,
  fitArima,
  integrateForecast,
} from './arima';
import type { TableSpec } from './types';

const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} != ${expected} (diff ${Math.abs(actual - expected)})`
  );

const table = (tables: TableSpec[], id: string): TableSpec => {
  const found = tables.find(spec => spec.id === id);
  assert.ok(found, `missing table ${id}`);
  return found!;
};

/** Deterministic standard-normal stream so the reference values are stable. */
const makeNormal = (seed = 42) => {
  let state = seed;
  const uniform = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  return () => {
    const u1 = Math.max(uniform(), 1e-12);
    const u2 = uniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
};

const ar1Series = (phi: number, constant: number, n: number, seed = 42): number[] => {
  const normal = makeNormal(seed);
  const values = [constant / (1 - phi)];
  for (let index = 1; index < n; index++) {
    values.push(constant + phi * values[index - 1] + normal());
  }
  return values;
};

const olsAr1 = (values: number[]): { constant: number; phi: number } => {
  const n = values.length - 1;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let index = 1; index < values.length; index++) {
    const lagged = values[index - 1];
    sx += lagged;
    sy += values[index];
    sxx += lagged * lagged;
    sxy += lagged * values[index];
  }
  const phi = (sxy - (sx * sy) / n) / (sxx - (sx * sx) / n);
  return { constant: (sy - phi * sx) / n, phi };
};

test('pure AR estimates coincide with ordinary least squares', () => {
  const values = ar1Series(0.7, 2, 240);
  const reference = olsAr1(values);
  const fit = fitArima(values, { p: 1, d: 0, q: 0, P: 0, D: 0, Q: 0, s: 0 });
  assert.ok(fit);
  close(fit!.coefficients[0].estimate, reference.constant, 1e-3);
  close(fit!.coefficients[1].estimate, reference.phi, 1e-3);
  assert.ok(fit!.stationary);
  assert.ok(fit!.invertible);
});

test('AR(1) standard error matches the asymptotic formula (1 - phi^2)/n', () => {
  const values = ar1Series(0.7, 0, 400);
  const fit = fitArima(values, { p: 1, d: 0, q: 0, P: 0, D: 0, Q: 0, s: 0 });
  assert.ok(fit);
  const expected = Math.sqrt((1 - 0.49) / 400);
  close(fit!.coefficients[1].se, expected, 0.012);
});

test('MA(1) recovers theta and leaves white-noise residuals', () => {
  const normal = makeNormal(7);
  const innovations = Array.from({ length: 400 }, () => normal());
  const values = innovations.map((value, index) =>
    index === 0 ? value : value + 0.5 * innovations[index - 1]
  );
  const fit = fitArima(values, { p: 0, d: 0, q: 1, P: 0, D: 0, Q: 0, s: 0 });
  assert.ok(fit);
  close(fit!.coefficients[1].estimate, 0.5, 0.12);
  close(fit!.coefficients[1].se, Math.sqrt((1 - 0.25) / 400), 0.02);
  assert.ok(
    Math.abs(fit!.coefficients[1].estimate - 0.5) < 3 * fit!.coefficients[1].se,
    'the estimate should be within three standard errors of the true value'
  );
  assert.ok(fit!.ljungBox.p > 0.05, `residuals still autocorrelated: p = ${fit!.ljungBox.p}`);
});

test('ARIMA(0,1,0) has unit psi-weights and forecast error variance sigma^2 h', () => {
  const normal = makeNormal(11);
  const values = [0];
  for (let index = 1; index < 150; index++) values.push(values[index - 1] + normal());
  const fit = fitArima(values, { p: 0, d: 1, q: 0, P: 0, D: 0, Q: 0, s: 0 }, { horizon: 6 });
  assert.ok(fit);
  fit!.psi.slice(0, 6).forEach(psi => close(psi, 1, 1e-9));
  const slope = fit!.coefficients[0].estimate;
  const last = values[values.length - 1];
  fit!.forecast.forEach((point, index) => {
    close(point.mean, last + slope * (index + 1), 1e-6);
    close(point.se, fit!.residualSe * Math.sqrt(index + 1), 1e-9);
    assert.ok(point.lo < point.mean && point.mean < point.hi);
  });
  const widths = fit!.forecast.map(point => point.hi - point.lo);
  for (let index = 1; index < widths.length; index++) {
    assert.ok(widths[index] >= widths[index - 1] - 1e-12, 'intervals must not shrink with the horizon');
  }
});

test('seasonal differencing is integrated back to the original scale', () => {
  const values = [5, 7, 6, 8];
  for (let index = 4; index < 16; index++) values.push(values[index - 4] + 1);
  const fit = fitArima(values, { p: 0, d: 0, q: 0, P: 0, D: 1, Q: 0, s: 4 }, { horizon: 4 });
  assert.ok(fit);
  assert.equal(fit!.label, 'SARIMA(0,0,0)(0,1,0)[4]');
  // The last observed season is 8, 10, 9, 11 and every seasonal difference is 1.
  assert.deepEqual(
    fit!.forecast.map(point => Math.round(point.mean * 1e6) / 1e6),
    [9, 11, 10, 12]
  );
});

test('integrateForecast reverses each differencing step', () => {
  const levels = [[2, 5, 9, 14, 20], [3, 4, 5, 6], [1, 1, 1]];
  const steps = [{ lag: 1 }, { lag: 1 }];
  assert.deepEqual(integrateForecast(levels, steps, [1, 1]), [27, 35]);
  assert.deepEqual(differenceSeries([2, 5, 9, 14, 20], 1, 2), [1, 1, 1]);
});

test('ADF separates a stationary series from a random walk', () => {
  const stationary = adfTest(ar1Series(0.6, 0, 240, 3));
  assert.ok(stationary.p < 0.05, `stationary series p = ${stationary.p}`);

  const normal = makeNormal(5);
  const walk = [0];
  for (let index = 1; index < 240; index++) walk.push(walk[index - 1] + normal());
  const nonStationary = adfTest(walk);
  assert.ok(nonStationary.p > 0.1, `random walk p = ${nonStationary.p}`);
});

test('order search recovers the airline SARIMA model on simulated data', () => {
  const s = 12;
  const normal = makeNormal(7);
  const innovations = Array.from({ length: 240 }, () => normal());
  const seasonalInnovation = (index: number) =>
    innovations[index] +
    0.4 * (innovations[index - 1] ?? 0) +
    0.6 * (innovations[index - 12] ?? 0) +
    0.24 * (innovations[index - 13] ?? 0);

  const seasonallyDifferenced: number[] = [];
  for (let index = 0; index < 240; index++) {
    seasonallyDifferenced.push(
      seasonalInnovation(index) + (index >= s ? seasonallyDifferenced[index - s] : 100 * Math.cos(index / 3))
    );
  }
  const values: number[] = [];
  for (let index = 0; index < 240; index++) {
    values.push((index > 0 ? values[index - 1] : 50) + seasonallyDifferenced[index]);
  }

  const analysis = arimaAnalysis({ values, period: s, horizon: 12, level: 95 });
  assert.ok(analysis.fit);
  assert.equal(analysis.selection?.d, 1);
  assert.equal(analysis.selection?.D, 1);
  assert.equal(analysis.fit!.label, 'SARIMA(0,1,1)(0,1,1)[12]');

  const ma = analysis.fit!.coefficients.find(coefficient => coefficient.term === 'MA(1)')!;
  const sma = analysis.fit!.coefficients.find(coefficient => coefficient.term === 'SMA(1) [12]')!;
  close(ma.estimate, 0.4, 0.12);
  close(sma.estimate, 0.6, 0.12);
  assert.ok(analysis.fit!.stationary && analysis.fit!.invertible);
  assert.ok(analysis.candidates.length > 10, 'the search should compare more than a handful of orders');

  const best = analysis.candidates[0].aicc;
  analysis.candidates.forEach(candidate => assert.ok(candidate.aicc >= best - 1e-9));
});

test('tables expose the model, coefficients, diagnostics and intervals', () => {
  const normal = makeNormal(13);
  const values: number[] = [];
  for (let index = 0; index < 120; index++) {
    values.push(20 + 0.2 * index + (index === 0 ? 0 : 0.6 * (values[index - 1] - 20 - 0.2 * (index - 1))) + normal());
  }
  const analysis = arimaAnalysis({ values, period: 0, horizon: 8, level: 95 });
  assert.ok(analysis.fit);
  const ids = analysis.tables.map(spec => spec.id);
  for (const id of [
    'ts-arima-model',
    'ts-arima-candidates',
    'ts-arima-coefficients',
    'ts-arima-diagnostics',
    'ts-arima-accuracy',
    'ts-arima-forecast',
  ]) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }

  const forecast = table(analysis.tables, 'ts-arima-forecast');
  assert.equal(forecast.rows.length, 8);
  forecast.rows.forEach(row => {
    assert.ok(Number(row.lo) < Number(row.forecast));
    assert.ok(Number(row.forecast) < Number(row.hi));
  });

  const models = table(analysis.tables, 'ts-arima-candidates');
  models.rows.forEach((row, index) => {
    assert.ok(Number(row.delta) >= -1e-9, `delta must be non-negative at row ${index}`);
  });
});

test('manual differencing overrides the automatic choice', () => {
  const normal = makeNormal(17);
  const walk = [0];
  for (let index = 1; index < 80; index++) walk.push(walk[index - 1] + normal());
  const auto = arimaAnalysis({ values: walk, horizon: 4 });
  const manual = arimaAnalysis({ values: walk, horizon: 4, d: 0, D: 0 });
  assert.equal(auto.selection?.d, 1);
  assert.equal(manual.selection?.d, 0);
  assert.equal(manual.selection?.dAuto, false);
  assert.ok(manual.fit);
  assert.ok(manual.fit!.label.startsWith('ARIMA(') && manual.fit!.label.includes(',0,'));
});

test('short or constant series are handled without inventing results', () => {
  assert.equal(arimaAnalysis({ values: [1, 2, 3], horizon: 2 }).fit, null);
  const constant = arimaAnalysis({ values: new Array(40).fill(5), horizon: 3 });
  assert.ok(constant.fit);
  constant.fit!.forecast.forEach(point => close(point.mean, 5, 1e-6));
});

test('arimaLabel writes the multiplicative seasonal notation', () => {
  assert.equal(arimaLabel({ p: 1, d: 1, q: 2, P: 0, D: 0, Q: 0, s: 0 }), 'ARIMA(1,1,2)');
  assert.equal(arimaLabel({ p: 0, d: 1, q: 1, P: 0, D: 1, Q: 1, s: 4 }), 'SARIMA(0,1,1)(0,1,1)[4]');
});
