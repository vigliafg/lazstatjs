import test from 'node:test';
import assert from 'node:assert/strict';
import { contingencyReport, contingencyTables } from './contingency';
import { calcFisherExact } from '../statsHelpers';
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

const rowOf = (tables: TableSpec[], id: string, index = 0): any => {
  const spec = table(tables, id);
  assert.ok(spec.rows[index], `missing row ${index} in ${id}`);
  return spec.rows[index];
};

const base = {
  level: 95,
  exact: true,
  monteCarlo: false,
};

test('2x3 table matches the hand-computed chi-square, df and p-value', () => {
  const tables = contingencyTables({
    ...base,
    observed: [
      [15, 25, 10],
      [30, 20, 15],
    ],
    rowLabels: ['A', 'B'],
    colLabels: ['x', 'y', 'z'],
  });

  const pearson = rowOf(tables, 'cont-tests', 0);
  close(pearson.statistic, 4.6786, 1e-3);
  close(pearson.p, 0.0964, 1e-3);
  assert.equal(pearson.df, 2);

  const cramers = rowOf(tables, 'cont-association', 0);
  assert.match(String(cramers.measure), /Cramér/);
  // V = sqrt(chi2 / (N * min(rows - 1, cols - 1))) = sqrt(4.6786 / 115)
  close(Number(cramers.value), 0.2017, 1e-3);

  // 6 cells, 2 of them below 5? (expected: 10.87 and 14.13 -> none below 5)
  assert.equal(table(tables, 'cont-residuals').rows.length, 6);
});

test('2x2 table reproduces the classic chi-square, phi and Fisher p-value', () => {
  const tables = contingencyTables({
    ...base,
    observed: [
      [30, 20],
      [15, 35],
    ],
    rowLabels: ['Treated', 'Control'],
    colLabels: ['Yes', 'No'],
  });

  const pearson = rowOf(tables, 'cont-tests', 0);
  close(pearson.statistic, 9.090909, 1e-5);
  close(pearson.p, 0.00257, 1e-4);

  const yates = rowOf(tables, 'cont-tests', 2);
  assert.match(String(yates.test), /Yates/);
  // (|O - E| - 0.5)^2 / E summed: 2 * (49/22.5) + 2 * (49/27.5)
  close(Number(yates.statistic), 7.919192, 1e-5);

  const fisher = table(tables, 'cont-tests').rows.find(row =>
    String(row.test).includes('Fisher')
  );
  assert.ok(fisher);
  close(Number(fisher!.p), calcFisherExact(30, 20, 15, 35), 1e-12);

  const phi = rowOf(tables, 'cont-association', 0);
  assert.match(String(phi.measure), /phi/);
  close(Number(phi.value), 0.3015, 1e-3);
});

test('Monte Carlo p-value is deterministic, bounded and close to Fisher for a small 2x2', () => {
  const options = {
    level: 95,
    exact: true,
    monteCarlo: true,
    simulations: 4000,
    seed: 7,
  };
  const observed = [
    [3, 1],
    [1, 6],
  ];
  const tables = contingencyTables({ ...options, observed, rowLabels: ['A', 'B'], colLabels: ['x', 'y'] });
  const monteCarlo = table(tables, 'cont-tests').rows.find(row =>
    String(row.test).includes('Monte Carlo')
  );
  assert.ok(monteCarlo, 'expected a Monte Carlo row when a cell has expected count < 5');
  const p = Number(monteCarlo!.p);
  assert.ok(p >= 0 && p <= 1);
  close(p, calcFisherExact(3, 1, 1, 6), 0.05);

  const again = contingencyTables({ ...options, observed, rowLabels: ['A', 'B'], colLabels: ['x', 'y'] });
  const againP = Number(
    table(again, 'cont-tests').rows.find(row => String(row.test).includes('Monte Carlo'))!.p
  );
  close(againP, p, 1e-12);
});

test('degenerate input returns no tables instead of NaN', () => {
  assert.deepEqual(
    contingencyTables({
      ...base,
      observed: [
        [0, 0],
        [0, 0],
      ],
      rowLabels: ['A', 'B'],
      colLabels: ['x', 'y'],
    }),
    []
  );
  assert.deepEqual(
    contingencyTables({
      ...base,
      observed: [[3]],
      rowLabels: ['A'],
      colLabels: ['x'],
    }),
    []
  );
});

test('the written report follows the chosen alpha and never prints NaN', () => {
  const tables = contingencyTables({
    ...base,
    observed: [
      [15, 25, 10],
      [30, 20, 15],
    ],
    rowLabels: ['A', 'B'],
    colLabels: ['x', 'y', 'z'],
  });
  const suspicious = contingencyReport(tables, 95);
  assert.match(suspicious.headline, /Nessuna evidenza/);
  assert.equal(suspicious.tone, 'neutral');

  const significant = contingencyReport(
    contingencyTables({
      ...base,
      observed: [
        [60, 20],
        [20, 60],
      ],
      rowLabels: ['A', 'B'],
      colLabels: ['x', 'y'],
    }),
    95
  );
  assert.match(significant.headline, /non sono indipendenti/);
  assert.equal(significant.tone, 'positive');

  const text = [
    significant.headline,
    ...significant.intro,
    ...significant.sections.flatMap(section => [...(section.body ?? []), ...(section.bullets ?? [])]),
    ...significant.limitations,
  ].join(' ');
  assert.doesNotMatch(text, /NaN|undefined/);
  assert.match(text, /Cramér/);
});
