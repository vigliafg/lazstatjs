import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dagostinoPearson,
  holmAdjust,
  leveneTest,
  lillieforsTest,
  meanCI,
  medianCI,
  welchAnova,
} from './distributions';
import { descriptiveTables } from './descriptive';
import { ttestTables } from './ttest';
import { anovaTables } from './anova';
import { regressionTables } from './regression';
import { correlationTables } from './correlation';
import { chiSquareTables } from './chisquare';
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

const row = (tables: TableSpec[], id: string, index = 0): any => {
  const spec = table(tables, id);
  assert.ok(spec.rows[index], `missing row ${index} in ${id}`);
  return spec.rows[index];
};

test('meanCI and medianCI match the t/order-statistic references', () => {
  const data = Array.from({ length: 20 }, (_, i) => i + 1);
  const ci = meanCI(data, 95);
  close(ci.mean, 10.5);
  close(ci.se, 1.3228756555, 1e-9);
  close(ci.lo, 7.7311895, 1e-5);
  close(ci.hi, 13.2688105, 1e-5);

  const median = medianCI(data, 95);
  close(median.median, 10.5);
  close(median.lo, 6);
  close(median.hi, 15);
});

test('Levene and Brown-Forsythe match SciPy', () => {
  const a = [1, 2, 3, 4, 5];
  const b = [2, 4, 6, 8, 10, 12];
  const levene = leveneTest([a, b], 'mean');
  close(levene.stat, 4.2301740812, 1e-9);
  close(levene.p, 0.0698479148, 1e-8);
  close(levene.df1, 1);
  close(levene.df2, 9);

  const three = leveneTest([[1, 2, 3, 4, 5], [2, 4, 6, 8, 10], [5, 6, 7, 8, 9]], 'mean');
  close(three.stat, 1.7142857143, 1e-9);
  close(three.p, 0.2213773495, 1e-9);
});

test('Welch ANOVA matches SciPy', () => {
  const result = welchAnova([[1, 2, 3, 4, 5], [2, 4, 6, 8, 10], [5, 6, 7, 8, 9]]);
  close(result.stat, 7.5574468085, 1e-9);
  close(result.p, 0.01567029, 1e-7);
  close(result.df1, 2);
  assert.ok(result.df2 > 2);
});

test("D'Agostino-Pearson matches SciPy", () => {
  const data = Array.from({ length: 20 }, (_, i) => i + 1);
  const result = dagostinoPearson(data);
  // SciPy 1.18 skewtest returns a spurious z=1.04 for symmetric data, so the
  // reference here is the correct transform: z_kurt = -1.7058104, z_skew = 0.
  close(result.k2, 2.9097891726, 1e-9);
  close(result.p, 0.2334249688, 1e-9);
});

test('Lilliefors statistic equals the KS distance with estimated parameters', () => {
  const data = Array.from({ length: 20 }, (_, i) => i + 1);
  const result = lillieforsTest(data, 300);
  close(result.d, 0.0765635896, 1e-9);
  assert.ok(result.p > 0.5 && result.p <= 1);
});

test('Holm adjustment is step-down and monotone', () => {
  const adjusted = holmAdjust([0.01, 0.04, 0.03]);
  close(adjusted[0], 0.03);
  close(adjusted[1], 0.06);
  close(adjusted[2], 0.06);
});

test('descriptive tables expose complete location and dispersion statistics', () => {
  const rows = Array.from({ length: 20 }, (_, i) => [String(i + 1)]);
  const tables = descriptiveTables(rows, [0], ['X'], 95);
  const location = row(tables, 'desc-location');
  close(location.mean, 10.5);
  close(location.sum, 210);
  close(location.medianLo, 6);
  close(location.medianHi, 15);

  const dispersion = row(tables, 'desc-dispersion');
  close(dispersion.sd, 5.9160797831, 1e-9);
  close(dispersion.variance, 35);
  // jStat uses Tukey hinges: Q1 = 5.5, Q3 = 15.5 for 1..20.
  close(dispersion.iqr, 10);

  const shape = row(tables, 'desc-shape');
  close(shape.skew, 0);
  close(shape.kurt, -1.2060150376, 1e-9);
});

test('one-sample t-test table matches SciPy', () => {
  const rows = Array.from({ length: 10 }, (_, i) => [String(i + 1)]);
  const tables = ttestTables({
    type: 'one',
    rows,
    i1: 0,
    i2: 0,
    name1: 'X',
    name2: '',
    mu: 5,
    equalVar: true,
    level: 95,
    useNonParam: true,
  });
  const main = row(tables, 'ttest-main');
  close(main.diff, 0.5);
  close(main.t, 0.5222329679, 1e-9);
  close(main.p, 0.6141172548, 1e-9);
  close(main.ciLo, -1.6658505897, 1e-6);
  close(main.ciHi, 2.6658505897, 1e-6);
  assert.ok(table(tables, 'ttest-wilcoxon'));
});

test('independent t-test table matches SciPy (pooled and Welch)', () => {
  const rows: string[][] = [
    ['1', ''], ['2', ''], ['3', ''], ['4', ''], ['5', ''],
    ['', '2'], ['', '4'], ['', '6'], ['', '8'], ['', '10'], ['', '12'],
  ];
  const pooled = ttestTables({
    type: 'ind', rows, i1: 0, i2: 1, name1: 'A', name2: 'B',
    mu: 0, equalVar: true, level: 95, useNonParam: true,
  });
  const mainPooled = row(pooled, 'ttest-main');
  close(mainPooled.t, -2.2156468376, 1e-9);
  close(mainPooled.p, 0.0539459205, 1e-9);
  close(mainPooled.df, 9);

  const welch = ttestTables({
    type: 'ind', rows, i1: 0, i2: 1, name1: 'A', name2: 'B',
    mu: 0, equalVar: false, level: 95, useNonParam: false,
  });
  const mainWelch = row(welch, 'ttest-main');
  close(mainWelch.t, -2.3763541031, 1e-9);
  close(mainWelch.df, 6.9722557298, 1e-8);
  close(mainWelch.p, 0.0492843382, 1e-9);

  const assumptions = table(pooled, 'ttest-assumptions');
  const leveneRow: any = assumptions.rows[0];
  close(leveneRow.statistic, 4.2301740812, 1e-9);
});

test('paired t-test uses row-wise complete pairs', () => {
  const rows: string[][] = [
    ['1', '2'],
    ['2', '4'],
    ['3', '1'],
    ['4', '8'],
    ['5', '10'],
    ['6', ''],
  ];
  const tables = ttestTables({
    type: 'dep', rows, i1: 0, i2: 1, name1: 'A', name2: 'B',
    mu: 0, equalVar: true, level: 95, useNonParam: true,
  });
  const main = row(tables, 'ttest-main');
  close(main.diff, -2);
  close(main.se, 2.7386127875 / Math.sqrt(5), 1e-9);
  close(main.t, -1.6329931619, 1e-9);
  close(main.p, 0.1778078084, 1e-9);
  const sample = table(tables, 'ttest-sample');
  assert.equal(sample.rows[0].n, 5);
  assert.equal(sample.rows[0].missing, 1);
});

test('ANOVA tables match SciPy and expose effect sizes and post-hoc', () => {
  const rows: string[][] = [];
  [1, 2, 3, 4, 5].forEach(value => rows.push([String(value), 'g1']));
  [2, 4, 6, 8, 10].forEach(value => rows.push([String(value), 'g2']));
  [5, 6, 7, 8, 9].forEach(value => rows.push([String(value), 'g3']));

  const tables = anovaTables({
    rows, depIdx: 0, grpIdx: 1, depName: 'Y', grpName: 'G',
    posthoc: 'holm', kwPosthoc: 'holm', level: 95, useNonParam: true,
  });
  const anova = table(tables, 'anova-table');
  close(anova.rows[0].f as number, 4.3333333333, 1e-9);
  close(anova.rows[0].p as number, 0.0383234737, 1e-9);

  const effects = table(tables, 'anova-effects');
  close(effects.rows[0].estimate as number, 43.3333333333 / 103.3333333333, 1e-9);

  const assumptions = table(tables, 'anova-assumptions');
  close(assumptions.rows[0].statistic as number, 1.7142857143, 1e-9);

  const posthoc = table(tables, 'anova-posthoc');
  assert.equal(posthoc.rows.length, 3);
  assert.ok(table(tables, 'anova-kruskal'));
  assert.ok(table(tables, 'anova-dunn'));
});

test('regression tables match SciPy/NumPy', () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8];
  const y = [2, 4, 5, 4, 5, 7, 8, 9];
  const rows = x.map((value, i) => [String(value), String(y[i])]);
  const tables = regressionTables({
    rows, depIdx: 1, indepIdxs: [0], depName: 'Y', predNames: ['X'], level: 95,
  });
  const model = table(tables, 'reg-model');
  const getModel = (metric: string) => model.rows.find(r => r.metric === metric)?.value as number;
  close(getModel('R²'), 0.904762, 1e-6);
  close(getModel('F'), 57, 1e-6);

  const coef = table(tables, 'reg-coefficients');
  close(coef.rows[0].b as number, 1.4285714286, 1e-9);
  close(coef.rows[0].se as number, 0.6051554775, 1e-9);
  close(coef.rows[1].b as number, 0.9047619048, 1e-9);
  close(coef.rows[1].se as number, 0.1198386418, 1e-9);
  close(coef.rows[1].p as number, 0.0002801805, 1e-9);
  close(coef.rows[1].vif as number, 1);

  const diagnostics = table(tables, 'reg-diagnostics');
  const diag = (metric: string) => diagnostics.rows.find(r => r.metric === metric)?.value as number;
  close(diag('White LM'), 4.6489911622, 1e-7);
  close(diag('White p'), 0.0978327803, 1e-8);
  close(diag('RESET F (ŷ²)'), 0.5882352941, 1e-9);
  close(diag('RESET p'), 0.4777340976, 1e-9);
  close(diag('|DFBETAS| massimo'), 0.6062481193, 1e-9);
  assert.equal(diag('DFBETAS oltre 2/√n'), 0);
  close(diag('Condition index massimo'), 4.1678536722, 1e-9);
  assert.equal(diag('Condition index > 30'), 0);
});

test('correlation tables expose N, p-values, CIs and partials', () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8];
  const y = [2, 4, 5, 4, 5, 7, 8, 9];
  const z = [5, 3, 6, 2, 8, 4, 9, 1];
  const rows = x.map((value, i) => [String(value), String(y[i]), String(z[i])]);
  const tables = correlationTables({
    rows, varIdxs: [0, 1, 2], varNames: ['X', 'Y', 'Z'],
    level: 95, method: 'pearson', showSpearman: true, showKendall: true,
  });
  const pair = row(tables, 'corr-pairs');
  close(pair.pearson, 0.9511897312, 1e-9);
  close(pair.pearsonP, 0.0002801805, 1e-9);
  close(pair.lo, 0.7466, 5e-3);
  close(pair.spearman, 0.9398272508, 1e-9);
  close(pair.kendall, 0.88949918, 1e-8);
  assert.equal(pair.n, 8);
  assert.ok(table(tables, 'corr-partial'));
});

test('chi-square tables expose residuals, G2 and association measures', () => {
  const tables = chiSquareTables({
    o11: 30, o12: 20, o21: 15, o22: 35,
    row1: 'A', row2: 'B', col1: 'S', col2: 'F',
    level: 95, runFisher: true,
  });
  const cell = row(tables, 'chisq-contingency');
  close(cell.expected, 22.5);
  close(cell.adjusted, 3.0151134458, 1e-9);

  const tests = table(tables, 'chisq-tests');
  close(tests.rows[0].statistic as number, 9.0909090909, 1e-9);
  close(tests.rows[0].p as number, 0.0025688315, 1e-9);
  close(tests.rows[1].statistic as number, 9.2401658363, 1e-9);
  close(tests.rows[2].statistic as number, 7.9191919192, 1e-9);
  close(tests.rows[3].p as number, 0.0046350202, 1e-9);

  const effects = table(tables, 'chisq-effects');
  close(effects.rows[2].estimate as number, 3.5);
  close(effects.rows[2].ciLo as number, 1.5288, 1e-3);
  close(effects.rows[2].ciHi as number, 8.0131, 1e-3);
  close(effects.rows[3].estimate as number, 2);
});
