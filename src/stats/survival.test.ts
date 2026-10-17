import test from 'node:test';
import assert from 'node:assert/strict';
import { kaplanMeier, lifeTable, logRankTest, survivalReport, survivalTables } from './survival';
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

test('Kaplan-Meier with all events follows the product-limit formula', () => {
  const km = kaplanMeier([1, 2, 3, 4, 5], [1, 1, 1, 1, 1], 95);
  km.points.forEach((point, index) => close(point.survival, [0.8, 0.6, 0.4, 0.2, 0][index]));
  assert.deepEqual(km.points.map(point => point.nRisk), [5, 4, 3, 2, 1]);
  assert.equal(km.median, 3);
  close(km.rmst, 3);
  assert.equal(km.events, 5);
  assert.equal(km.censored, 0);
});

test('censored observations stay in the risk set until they leave the study', () => {
  const km = kaplanMeier([1, 2, 3, 4], [1, 0, 1, 0], 95);
  assert.equal(km.points.length, 2);
  assert.deepEqual(km.points.map(point => point.nRisk), [4, 2]);
  close(km.points[0].survival, 0.75);
  close(km.points[1].survival, 0.375);
  assert.equal(km.median, 3);
  close(km.rmst, 2.875);
  assert.equal(km.censored, 2);
});

test('confidence intervals are ordered and inside [0, 1]', () => {
  const km = kaplanMeier([1, 2, 3, 4, 5, 6, 7, 8], [1, 1, 1, 1, 1, 1, 1, 1], 95);
  km.points.forEach(point => {
    if (Number.isFinite(point.lo) && Number.isFinite(point.hi)) {
      assert.ok(point.lo <= point.survival + 1e-12);
      assert.ok(point.hi >= point.survival - 1e-12);
      assert.ok(point.lo >= 0 && point.hi <= 1);
    }
  });
});

test('log-rank is zero for identical curves and detects separated ones', () => {
  const same = logRankTest([
    { name: 'A', time: [1, 2, 3], event: [1, 1, 1] },
    { name: 'B', time: [1, 2, 3], event: [1, 1, 1] },
  ]);
  close(same.chi2, 0);
  close(same.p, 1);

  const different = logRankTest([
    { name: 'A', time: [1, 2, 3], event: [1, 1, 1] },
    { name: 'B', time: [4, 5, 6], event: [1, 1, 1] },
  ]);
  close(different.chi2, 5.05166, 1e-5);
  close(different.p, 0.024602, 1e-5);
  close(different.hazardRatio, 15.3425, 1e-3);
  assert.ok(different.hrLo > 1);
});

test('the life table is monotone and ends at the Kaplan-Meier survival', () => {
  const time = [1, 2, 3, 4, 5, 6, 7, 8];
  const event = [1, 1, 0, 1, 1, 0, 1, 1];
  const rows = lifeTable(time, event, 4);
  assert.equal(rows.length, 4);
  for (let index = 1; index < rows.length; index++) {
    assert.ok(rows[index].survival <= rows[index - 1].survival + 1e-12);
  }
  // Actuarial rule: the censored observation in the last interval counts as
  // half a person at risk, so the curve does not reach zero.
  close(rows[rows.length - 1].survival, 0.088846, 1e-6);

  const noCensoring = lifeTable([1, 2, 3, 4, 5, 6, 7, 8], [1, 1, 1, 1, 1, 1, 1, 1], 4);
  close(noCensoring[noCensoring.length - 1].survival, 0, 1e-12);
});

test('tables include summary, curve, log-rank and life table', () => {
  const tables = survivalTables({
    time: [1, 2, 3, 4, 5, 6, 7, 8],
    event: [1, 1, 0, 1, 1, 0, 1, 1],
    groups: ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'],
    level: 95,
  });
  const ids = tables.map(spec => spec.id);
  for (const id of ['surv-summary', 'surv-km', 'surv-logrank', 'surv-life']) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
  assert.equal(table(tables, 'surv-summary').rows.length, 2);

  const report = survivalReport(tables, 95);
  const text = [
    report.headline,
    ...report.intro,
    ...report.sections.flatMap(section => [...(section.body ?? []), ...(section.bullets ?? [])]),
    ...report.limitations,
  ].join(' ');
  assert.doesNotMatch(text, /NaN|undefined/);
  assert.match(report.headline, /log-rank/);
});

test('a single group omits the log-rank test and keeps the summary', () => {
  const tables = survivalTables({
    time: [1, 2, 3, 4, 5, 6],
    event: [1, 1, 1, 0, 1, 1],
    groups: ['', '', '', '', '', ''],
    level: 90,
  });
  const ids = tables.map(spec => spec.id);
  assert.ok(!ids.includes('surv-logrank'));
  assert.ok(ids.includes('surv-summary'));
});

test('too few observations produce no tables', () => {
  assert.deepEqual(survivalTables({ time: [1, 2], event: [1, 1], groups: ['A', 'A'], level: 95 }), []);
});
