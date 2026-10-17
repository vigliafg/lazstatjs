import test from 'node:test';
import assert from 'node:assert/strict';
import { concordanceIndex, coxReport, coxTables, fitCox } from './cox';
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

/**
 * Breslow partial log-likelihood written independently of the module: the
 * only thing shared is the statistical definition.
 */
const breslowLogLik = (
  times: number[],
  events: number[],
  covariates: number[][],
  beta: number[]
): number => {
  const subjects = times.map((time, index) => ({ time, event: events[index], x: covariates[index] }));
  const eventTimes = Array.from(
    new Set(subjects.filter(subject => subject.event === 1).map(subject => subject.time))
  ).sort((left, right) => left - right);

  let value = 0;
  eventTimes.forEach(atTime => {
    const atRisk = subjects.filter(subject => subject.time >= atTime);
    const deaths = subjects.filter(subject => subject.time === atTime && subject.event === 1);
    const linear = (x: number[]) => x.reduce((sum, item, index) => sum + item * beta[index], 0);
    const denominator = atRisk.reduce((sum, subject) => sum + Math.exp(linear(subject.x)), 0);
    value += deaths.reduce((sum, subject) => sum + linear(subject.x), 0);
    value -= deaths.length * Math.log(denominator);
  });
  return value;
};

test('a single covariate with three events has the closed-form estimate', () => {
  const fit = fitCox({
    time: [1, 2, 3],
    event: [1, 1, 1],
    covariates: [{ name: 'X', values: [0, 1, 0] }],
  });
  assert.ok(fit);

  // dL/db = 1 - e^b/(2+e^b) - e^b/(1+e^b) = 0 gives e^b = sqrt(2).
  close(fit!.coefficients[0].beta, Math.log(Math.SQRT2), 1e-8);
  close(fit!.coefficients[0].hr, Math.SQRT2, 1e-8);
  // I(b) = 2 * (sqrt(2)-1) * sqrt(2) / ... computed as two risk-set variances.
  const information =
    (Math.SQRT2 / (2 + Math.SQRT2) - Math.pow(Math.SQRT2 / (2 + Math.SQRT2), 2)) +
    (Math.SQRT2 / (1 + Math.SQRT2) - Math.pow(Math.SQRT2 / (1 + Math.SQRT2), 2));
  close(fit!.coefficients[0].se, 1 / Math.sqrt(information), 1e-6);
  close(fit!.lr, 0.0580248, 1e-6);
  close(fit!.concordance, 0.5);
  assert.ok(fit!.converged);
});

test('the partial likelihood ignores censored subjects as events and uses the risk sets', () => {
  const times = [2, 4, 4, 6, 8, 9, 10, 12, 12, 14, 16, 18, 20, 22, 24];
  const events = [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1];
  const values = [0.5, -0.2, 1.1, 0.3, -0.9, 1.4, 0.1, -0.4, 0.8, 1.9, -1.2, 0.6, 2.2, 0.0, -0.7];
  const fit = fitCox({ time: times, event: events, covariates: [{ name: 'X', values }] });
  assert.ok(fit);

  const independent = breslowLogLik(
    times,
    events,
    values.map(value => [value]),
    [fit!.coefficients[0].beta]
  );
  close(fit!.logLik, independent, 1e-9);
  assert.ok(fit!.lr >= 0);
  assert.ok(fit!.lrP >= 0 && fit!.lrP <= 1);
});

test('the sign of the effect follows the risk ordering of the covariate', () => {
  const times = [3, 5, 6, 8, 9, 11, 12, 15, 17, 19, 21, 24, 26, 28, 30, 33, 35, 38];
  const events = new Array(18).fill(1);
  const values = [12.0, 10.1, 9.6, 7.3, 8.1, 6.2, 5.9, 4.1, 4.8, 3.2, 2.9, 2.4, 1.1, 1.9, 0.8, -0.4, -0.9, -1.6];
  const fit = fitCox({ time: times, event: events, covariates: [{ name: 'Exposure', values }] });
  assert.ok(fit);
  assert.ok(fit!.coefficients[0].beta > 1, `beta = ${fit!.coefficients[0].beta}`);
  assert.ok(fit!.coefficients[0].hr > 2);
  assert.ok(fit!.concordance > 0.9);
  assert.ok(fit!.lrP < 0.001);
  assert.ok(fit!.phGlobal.p >= 0 && fit!.phGlobal.p <= 1);
});

test('concordance counts ties as half and ignores censored index cases', () => {
  close(concordanceIndex([1, 2, 3], [1, 1, 0], [3, 2, 1]), 1);
  close(concordanceIndex([1, 2, 3], [1, 1, 0], [1, 2, 3]), 0);
  close(concordanceIndex([1, 2, 3], [1, 1, 0], [2, 2, 2]), 0.5);
  close(concordanceIndex([1, 2, 3], [0, 1, 1], [3, 2, 1]), 1);
});

test('tables and report stay consistent with the estimated model', () => {
  const times = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const events = [1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1];
  const first = [0.2, -0.4, 0.9, 0.1, -0.8, 1.2, 0.4, -0.3, 1.5, 0.6, -1.1, 0.8, 1.9, 0.0, -0.6, 0.3];
  const second = [1, 2, 1, 3, 2, 4, 5, 3, 4, 6, 5, 7, 8, 6, 7, 9];
  const fit = fitCox({
    time: times,
    event: events,
    covariates: [
      { name: 'Marker', values: first },
      { name: 'Age', values: second },
    ],
    level: 95,
  });
  assert.ok(fit);
  assert.equal(fit!.k, 2);
  assert.equal(fit!.df, 2);

  const tables = coxTables(fit!, 95);
  for (const id of ['cox-summary', 'cox-tests', 'cox-coefficients', 'cox-ph', 'cox-baseline']) {
    assert.ok(tables.some(spec => spec.id === id), `missing ${id}`);
  }

  const coefficients = table(tables, 'cox-coefficients');
  assert.equal(coefficients.rows.length, 2);
  coefficients.rows.forEach(row => {
    const hr = Number(row.hr);
    const lo = Number(row.lo);
    const hi = Number(row.hi);
    assert.ok(hr > 0);
    assert.ok(lo <= hr && hr <= hi, `CI must contain the point estimate: ${lo} ${hr} ${hi}`);
    assert.ok(Number(row.p) >= 0 && Number(row.p) <= 1);
  });

  const baseline = table(tables, 'cox-baseline');
  const hazards = baseline.rows.map(row => Number(row.hazard));
  for (let index = 1; index < hazards.length; index++) {
    assert.ok(hazards[index] >= hazards[index - 1] - 1e-12, 'baseline hazard must not decrease');
  }
  assert.ok(hazards[hazards.length - 1] > 0, 'the baseline hazard must not stay flat at zero');

  const report = coxReport(tables, 95);
  const text = [
    report.headline,
    ...report.intro,
    ...report.sections.flatMap(section => [...(section.body ?? []), ...(section.bullets ?? [])]),
    ...report.limitations,
  ].join(' ');
  assert.doesNotMatch(text, /NaN|undefined|Infinity/);
});

test('separation is flagged instead of being reported as a real hazard ratio', () => {
  const times = [50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72];
  const events = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const values = [60, 62.5, 65, 67.5, 70, 72.5, 75, 77.5, 80, 82.5, 55, 57, 59, 61, 63, 65, 67, 69, 71, 73];
  const fit = fitCox({ time: times, event: events, covariates: [{ name: 'Score', values }] });
  assert.ok(fit);
  assert.equal(fit!.separation, true);
  assert.ok(fit!.warnings.length > 0);

  const tables = coxTables(fit!, 95);
  const report = coxReport(tables, 95);
  assert.equal(report.badge, 'Stime instabili');
  assert.match(report.headline, /Stime instabili/);
  assert.doesNotMatch(report.headline, /Infinity/);
});

test('impossible models are refused instead of guessed', () => {
  assert.equal(fitCox({ time: [1, 2, 3], event: [0, 0, 0], covariates: [{ name: 'X', values: [1, 2, 3] }] }), null);
  assert.equal(fitCox({ time: [1, 2, 3], event: [1, 1, 1], covariates: [] }), null);
  assert.equal(
    fitCox({
      time: [1, 2, 3],
      event: [1, 1, 1],
      covariates: [{ name: 'Constant', values: [2, 2, 2] }],
    }),
    null
  );
});
