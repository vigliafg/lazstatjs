import test from 'node:test';
import assert from 'node:assert/strict';
import type { TableSpec } from './types.ts';
import type { ReportSpec } from './report.ts';
import {
  anovaReport,
  chiSquareReport,
  correlationReport,
  descriptiveReport,
  regressionReport,
  ttestReport,
} from './report.ts';
import { descriptiveTables } from './descriptive.ts';
import { ttestTables } from './ttest.ts';
import { anovaTables } from './anova.ts';
import { regressionTables } from './regression.ts';
import { correlationTables } from './correlation.ts';
import { chiSquareTables } from './chisquare.ts';

const rowsBy = (groups: Record<string, number[]>) => {
  const length = Math.max(...Object.values(groups).map(values => values.length));
  const rows: string[][] = [];
  for (let i = 0; i < length; i++) {
    rows.push(Object.values(groups).map(values => (values[i] === undefined ? '' : String(values[i]))));
  }
  return rows;
};

const serialized = (report: ReportSpec) => JSON.stringify(report);

/** No placeholder may leak into the prose the user reads. */
const assertReadable = (report: ReportSpec) => {
  const text = serialized(report);
  assert.ok(!text.includes('NaN'), `NaN nel report ${report.id}`);
  assert.ok(!text.includes('undefined'), `undefined nel report ${report.id}`);
  assert.ok(report.headline.trim().length > 0);
  assert.ok(report.intro.length > 0);
  assert.ok(report.sections.length > 0);
};

const independentTables = (a: number[], b: number[], level = 95): TableSpec[] =>
  ttestTables({
    type: 'ind',
    rows: rowsBy({ a, b }),
    i1: 0,
    i2: 1,
    name1: 'A',
    name2: 'B',
    mu: 0,
    equalVar: true,
    level,
    useNonParam: true,
  });

const baseRows: string[][] = Array.from({ length: 20 }, (_, i) => [
  String(10 + (i % 10)),
  String(20 + (i % 10)),
  String(1 + (i % 2)),
  String(30 + (i % 7)),
]);

test('t-test report states a significant difference when p < alpha', () => {
  const tables = independentTables([10, 11, 12, 13, 14, 15], [20, 21, 22, 23, 24, 25]);
  const report = ttestReport({
    tables,
    type: 'ind',
    name1: 'A',
    name2: 'B',
    mu: 0,
    level: 95,
    equalVar: true,
    useNonParam: true,
  });
  assertReadable(report);
  assert.match(report.headline, /sono diverse/);
  assert.equal(report.tone === 'caution' ? 'caution' : 'positive', 'positive');
  assert.ok(report.sections.some(section => section.heading === 'Il test principale'));
});

test('t-test report avoids significance language when p >= alpha', () => {
  const tables = independentTables([10, 12, 14, 16, 18, 20], [10, 12, 14, 16, 18, 20]);
  const report = ttestReport({
    tables,
    type: 'ind',
    name1: 'A',
    name2: 'B',
    mu: 0,
    level: 95,
    equalVar: true,
    useNonParam: true,
  });
  assertReadable(report);
  assert.match(report.headline, /Non emerge/);
  assert.equal(report.tone, 'neutral');
});

test('descriptive report explains every selected variable', () => {
  const tables = descriptiveTables(baseRows, [0, 1], ['Score_Pre', 'Score_Post'], 95);
  const report = descriptiveReport(tables, 95);
  assertReadable(report);
  const bullets = report.sections[0].bullets ?? [];
  assert.equal(bullets.length, 2);
  assert.ok(bullets[0].startsWith('Score_Pre:'));
  assert.ok(report.sections.some(section => section.heading === 'Come leggere i numeri'));
});

test('ANOVA report reads F, eta squared and post-hoc comparisons', () => {
  const tables = anovaTables({
    rows: baseRows,
    depIdx: 0,
    grpIdx: 2,
    depName: 'Score_Pre',
    grpName: 'Group',
    posthoc: 'holm',
    kwPosthoc: 'holm',
    level: 95,
    useNonParam: true,
  });
  const report = anovaReport({
    tables,
    depName: 'Score_Pre',
    grpName: 'Group',
    level: 95,
    postHoc: 'holm',
    useNonParam: true,
  });
  assertReadable(report);
  assert.match(report.headline, /F =/);
  assert.ok(report.sections.some(section => section.heading.startsWith('Confronti post-hoc')));
});

test('regression, correlation and chi-square reports have no placeholders', () => {
  const regression = regressionTables({
    rows: baseRows,
    depIdx: 0,
    indepIdxs: [3],
    depName: 'Score_Pre',
    predNames: ['Age'],
    level: 95,
  });
  assertReadable(regressionReport({ tables: regression, depName: 'Score_Pre', predNames: ['Age'], level: 95 }));

  const correlation = correlationTables({
    rows: baseRows,
    varIdxs: [0, 1],
    varNames: ['Score_Pre', 'Score_Post'],
    level: 95,
    method: 'pearson',
    showSpearman: true,
    showKendall: true,
  });
  assertReadable(correlationReport({ tables: correlation, method: 'pearson', level: 95 }));

  const chiSquare = chiSquareTables({
    o11: 30,
    o12: 20,
    o21: 15,
    o22: 35,
    row1: 'Group A',
    row2: 'Group B',
    col1: 'Success',
    col2: 'Failure',
    level: 95,
    runFisher: true,
  });
  const chiReport = chiSquareReport({
    tables: chiSquare,
    level: 95,
    row1: 'Group A',
    row2: 'Group B',
    col1: 'Success',
    col2: 'Failure',
  });
  assertReadable(chiReport);
  assert.match(chiReport.headline, /associazione/);
});

test('reports follow the selected confidence level', () => {
  const tables = descriptiveTables(baseRows, [0], ['Score_Pre'], 99);
  const report = descriptiveReport(tables, 99);
  assertReadable(report);
  assert.ok(serialized(report).includes('CI 99%'));
});
