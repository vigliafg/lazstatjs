import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distributionCdf,
  distributionFitReport,
  distributionFitTables,
  distributionQuantile,
  fitDistributions,
  probabilityPlotData,
} from './distfit';
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

test('normal MLE recovers the sample mean and the population SD', () => {
  const values = [2, 4, 4, 4, 5, 5, 7, 9];
  const fit = fitDistributions(values, ['normal'])[0];
  close(fit.params.mu, 5);
  close(fit.params.sigma, 2);
  // -n/2 ln(2pi) - n ln(sigma) - sum((x-mu)^2) / (2 sigma^2), sigma = 2 (MLE)
  close(fit.logLik, -16.8967, 1e-3);
});

test('exponential rate is 1/mean and its log-likelihood has a closed form', () => {
  const fit = fitDistributions([1, 2, 3, 4], ['exponential'])[0];
  close(fit.params.rate, 0.4);
  // n ln(rate) - rate * sum(x) = 4 ln(0.4) - 4
  close(fit.logLik, 4 * Math.log(0.4) - 4, 1e-9);
});

test('gamma MLE solves the digamma equation', () => {
  const fit = fitDistributions([1, 2, 3, 4, 5], ['gamma'])[0];
  close(fit.params.shape, 3.70, 0.08);
  close(fit.params.scale, 3 / fit.params.shape, 1e-9);
  // median from the fitted distribution, checked against the CDF at that point
  const median = distributionQuantile(fit, 0.5);
  close(distributionCdf(fit, median), 0.5, 1e-6);
});

test('Weibull MLE recovers the parameters of simulated Weibull quantiles', () => {
  const values = Array.from({ length: 40 }, (_, i) =>
    Math.pow(-Math.log(1 - (i + 0.5) / 40), 1 / 2)
  );
  const fit = fitDistributions(values, ['weibull'])[0];
  close(fit.params.shape, 2, 0.1);
  close(fit.params.scale, 1, 0.05);
});

test('positive-support distributions are skipped when the data contain zeros', () => {
  const fits = fitDistributions([0, 1, 2, 3, 4], ['lognormal', 'exponential', 'gamma', 'weibull']);
  assert.deepEqual(fits, []);
  const normal = fitDistributions([0, 1, 2, 3, 4], ['normal']);
  assert.equal(normal.length, 1);
});

test('fits are ranked by AIC and the tables expose parameters and fit quality', () => {
  const values = [2.1, 3.4, 2.8, 5.6, 3.3, 4.1, 2.9, 6.2, 3.8, 4.4, 2.5, 5.1, 3.1, 4.8, 3.6];
  const fits = fitDistributions(values);
  assert.ok(fits.length >= 4);
  const aics = fits.map(fit => fit.aic);
  assert.deepEqual(aics, [...aics].sort((a, b) => a - b));

  const tables = distributionFitTables(values, ['normal', 'gamma', 'weibull'], 95);
  assert.equal(table(tables, 'fit-parameters').rows.length, 3);
  assert.equal(table(tables, 'fit-gof').rows.length, 3);
  assert.equal(table(tables, 'fit-percentiles').rows.length, 9);

  const report = distributionFitReport(tables, 95);
  const text = [
    report.headline,
    ...report.intro,
    ...report.sections.flatMap(section => [...(section.body ?? []), ...(section.bullets ?? [])]),
    ...report.limitations,
  ].join(' ');
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('probability plot pairs fitted quantiles with sorted observations', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const fit = fitDistributions(values, ['normal'])[0];
  const plot = probabilityPlotData(fit, values);
  assert.equal(plot.length, values.length);
  assert.ok(plot[0].x < plot[plot.length - 1].x);
  assert.equal(plot[0].y, 1);
  assert.equal(plot[plot.length - 1].y, 10);
  // A normal fit of roughly symmetric data should track the diagonal closely.
  const maxDeviation = Math.max(...plot.map(point => Math.abs(point.x - point.y)));
  assert.ok(maxDeviation < 4);
});
