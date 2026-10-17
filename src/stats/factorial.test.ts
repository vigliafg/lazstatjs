import test from 'node:test';
import assert from 'node:assert/strict';
import { factorialReport, factorialTables } from './factorial';
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

const rowOf = (tables: TableSpec[], id: string, index: number): any => {
  const spec = table(tables, id);
  assert.ok(spec.rows[index], `missing row ${index} in ${id}`);
  return spec.rows[index];
};

/** 2x2 balanced design: cell means 1, 3, 5, 9 with +/-1 within each cell. */
const balanced = () => {
  const cellMeans = [
    { a: 'A1', b: 'B1', mean: 1 },
    { a: 'A1', b: 'B2', mean: 3 },
    { a: 'A2', b: 'B1', mean: 5 },
    { a: 'A2', b: 'B2', mean: 9 },
  ];
  const response: number[] = [];
  const factorA: string[] = [];
  const factorB: string[] = [];
  cellMeans.forEach(cell => {
    [-1, 0, 1].forEach(offset => {
      response.push(cell.mean + offset);
      factorA.push(cell.a);
      factorB.push(cell.b);
    });
  });
  return { response, factorA, factorB };
};

test('balanced 2x2 sums of squares match the hand-computed values', () => {
  const data = balanced();
  const tables = factorialTables({
    ...data,
    responseName: 'Y',
    aName: 'A',
    bName: 'B',
    level: 95,
    interaction: true,
  });

  const a = rowOf(tables, 'fac-anova', 0);
  const b = rowOf(tables, 'fac-anova', 1);
  const ab = rowOf(tables, 'fac-anova', 2);
  const residuals = rowOf(tables, 'fac-anova', 3);
  const total = rowOf(tables, 'fac-anova', 4);

  close(a.ss, 75);
  close(b.ss, 27);
  close(ab.ss, 3);
  close(residuals.ss, 8);
  close(total.ss, 113);

  close(a.f, 75);
  close(b.f, 27);
  close(ab.f, 3);
  assert.equal(residuals.df, 8);
  assert.equal(total.df, 11);
  close(a.eta2p, 75 / 83, 1e-9);

  // A, B, A x B, Residuals, Total
  assert.equal(table(tables, 'fac-anova').rows.length, 5);
});

test('cell and marginal means are the group statistics', () => {
  const data = balanced();
  const tables = factorialTables({
    ...data,
    responseName: 'Y',
    aName: 'A',
    bName: 'B',
    level: 95,
    interaction: true,
  });

  const cells = table(tables, 'fac-cells').rows;
  assert.equal(cells.length, 4);
  close(Number(cells[0].mean), 1);
  close(Number(cells[3].mean), 9);

  const marginalA = table(tables, 'fac-marginal-a').rows;
  close(Number(marginalA[0].mean), 2);
  close(Number(marginalA[1].mean), 7);

  const marginalB = table(tables, 'fac-marginal-b').rows;
  close(Number(marginalB[0].mean), 3);
  close(Number(marginalB[1].mean), 6);
});

test('the main-effects-only model drops the interaction row', () => {
  const data = balanced();
  const tables = factorialTables({
    ...data,
    responseName: 'Y',
    aName: 'A',
    bName: 'B',
    level: 95,
    interaction: false,
  });
  const rows = table(tables, 'fac-anova').rows;
  assert.equal(rows.length, 4);
  assert.ok(!rows.some(row => String(row.source).includes('×')));
});

test('unbalanced designs keep the right residual degrees of freedom', () => {
  const response = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12];
  const factorA = ['A1', 'A1', 'A1', 'A1', 'A1', 'A2', 'A2', 'A2', 'A2', 'A2'];
  const factorB = ['B1', 'B1', 'B1', 'B2', 'B2', 'B1', 'B1', 'B2', 'B2', 'B2'];
  const tables = factorialTables({
    response,
    factorA,
    factorB,
    responseName: 'Y',
    aName: 'A',
    bName: 'B',
    level: 95,
    interaction: true,
  });
  const residuals = table(tables, 'fac-anova').rows.find(row => String(row.source) === 'Residuals');
  assert.ok(residuals);
  assert.equal(Number(residuals!.df), 10 - 4);
});

test('an empty cell makes the interaction model non-estimable', () => {
  const response = [1, 2, 3, 4, 5, 6];
  const factorA = ['A1', 'A1', 'A1', 'A2', 'A2', 'A2'];
  const factorB = ['B1', 'B1', 'B1', 'B1', 'B1', 'B1'];
  const tables = factorialTables({
    response,
    factorA,
    factorB,
    responseName: 'Y',
    aName: 'A',
    bName: 'B',
    level: 95,
    interaction: true,
  });
  assert.deepEqual(tables, []);
});

test('a strong interaction changes the headline and the tone', () => {
  const cellMeans = [
    { a: 'A1', b: 'B1', mean: 0 },
    { a: 'A1', b: 'B2', mean: 0 },
    { a: 'A2', b: 'B1', mean: 0 },
    { a: 'A2', b: 'B2', mean: 8 },
  ];
  const response: number[] = [];
  const factorA: string[] = [];
  const factorB: string[] = [];
  cellMeans.forEach(cell => {
    [-0.5, 0, 0.5].forEach(offset => {
      response.push(cell.mean + offset);
      factorA.push(cell.a);
      factorB.push(cell.b);
    });
  });

  const tables = factorialTables({
    response,
    factorA,
    factorB,
    responseName: 'Y',
    aName: 'A',
    bName: 'B',
    level: 95,
    interaction: true,
  });

  const report = factorialReport(tables, 95);
  assert.match(report.headline, /interazione/i);
  assert.equal(report.tone, 'caution');

  const text = [
    report.headline,
    ...report.intro,
    ...report.sections.flatMap(section => [...(section.body ?? []), ...(section.bullets ?? [])]),
    ...report.limitations,
  ].join(' ');
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('too few observations produce no tables', () => {
  assert.deepEqual(
    factorialTables({
      response: [1, 2],
      factorA: ['A1', 'A2'],
      factorB: ['B1', 'B2'],
      responseName: 'Y',
      aName: 'A',
      bName: 'B',
      level: 95,
      interaction: true,
    }),
    []
  );
});
