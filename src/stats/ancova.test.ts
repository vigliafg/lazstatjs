import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ancovaReport, ancovaTables, type AncovaOptions } from './ancova';
import type { TableRow, TableSpec } from './types';

const close = (actual: number, expected: number, tolerance = 1e-9): void => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);
};

const row = (tables: TableSpec[], id: string, predicate: (candidate: TableRow) => boolean): TableRow => {
  const found = tables.find((table) => table.id === id)?.rows.find(predicate);
  assert.ok(found, `row not found in ${id}`);
  return found;
};

/**
 * Y = 2·X + 3·gruppo + e, with e = [1,−1,−1,1] inside each group and X
 * shifted between groups. The residual is orthogonal to the intercept, to
 * the group dummy, to X and to the group × X product, so the closed-form
 * Type III sums of squares can be written down exactly:
 *   SS_group = 3² / [(X'X)⁻¹]_22 = 9 / 0.9 = 10
 *   SS_X     = 2² / [(X'X)⁻¹]_33 = 4 / 0.1 = 40
 *   SSE = 8, df = 5, MSE = 1.6
 */
const dataset = (): AncovaOptions => ({
  response: [3, 3, 5, 9, 10, 10, 12, 16],
  factor: ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'],
  covariates: [[1, 2, 3, 4, 3, 4, 5, 6]],
  responseName: 'Y',
  factorName: 'Gruppo',
  covariateNames: ['X'],
  level: 95,
});

describe('ANCOVA', () => {
  it('computes Type III sums of squares for the factor and the covariate', () => {
    const tables = ancovaTables(dataset());
    assert.deepEqual(tables.map((table) => table.id), [
      'ancova-model',
      'ancova-means',
      'ancova-coefficients',
      'ancova-slopes',
      'ancova-posthoc',
    ]);
    const factor = row(tables, 'ancova-model', (candidate) => candidate.source === 'Gruppo');
    close(Number(factor.ss), 10, 1e-9);
    close(Number(factor.f), 6.25, 1e-9);
    assert.equal(Number(factor.df), 1);

    const covariate = row(tables, 'ancova-model', (candidate) => candidate.source === 'X');
    close(Number(covariate.ss), 40, 1e-9);
    close(Number(covariate.f), 25, 1e-9);

    const residual = row(tables, 'ancova-model', (candidate) => candidate.source === 'Residuo');
    close(Number(residual.ss), 8, 1e-9);
    assert.equal(Number(residual.df), 5);
    close(Number(residual.ms), 1.6, 1e-9);
  });

  it('reports the model fit and the coefficients of the centered model', () => {
    const tables = ancovaTables(dataset());
    const notes = tables.find((table) => table.id === 'ancova-model')?.notes?.join(' ') ?? '';
    assert.ok(notes.includes('R² = 0.945'));
    const intercept = row(tables, 'ancova-coefficients', (candidate) => candidate.term === 'Intercetta');
    close(Number(intercept.b), 7, 1e-9);
    const group = row(tables, 'ancova-coefficients', (candidate) => candidate.term === 'B');
    close(Number(group.b), 3, 1e-9);
    const slope = row(tables, 'ancova-coefficients', (candidate) => candidate.term === 'X');
    close(Number(slope.b), 2, 1e-9);
  });

  it('adjusts the group means at the grand mean of the covariate', () => {
    const tables = ancovaTables(dataset());
    const a = row(tables, 'ancova-means', (candidate) => candidate.group === 'A');
    const b = row(tables, 'ancova-means', (candidate) => candidate.group === 'B');
    close(Number(a.rawMean), 5, 1e-9);
    close(Number(b.rawMean), 12, 1e-9);
    close(Number(a.adjusted), 7, 1e-9);
    close(Number(b.adjusted), 10, 1e-9);
    close(Number(a.se), Math.sqrt(0.56), 1e-9);
    close(Number(b.se), Math.sqrt(0.56), 1e-9);
  });

  it('detects homogeneous slopes on data generated with a common slope', () => {
    const tables = ancovaTables(dataset());
    const interaction = row(tables, 'ancova-slopes', (candidate) => candidate.metric === 'F interazione');
    assert.ok(Math.abs(Number(interaction.value)) < 1e-9);
    const p = row(tables, 'ancova-slopes', (candidate) => candidate.metric === 'p interazione');
    close(Number(p.value), 1, 1e-9);
  });

  it('compares adjusted means and applies Holm to the pairwise p-values', () => {
    const tables = ancovaTables(dataset());
    const pair = row(tables, 'ancova-posthoc', (candidate) => candidate.contrast === 'A − B');
    close(Number(pair.difference), -3, 1e-9);
    close(Number(pair.se), 1.2, 1e-9);
    close(Number(pair.t), -2.5, 1e-9);
    close(Number(pair.pHolm), Number(pair.p), 1e-12);
  });

  it('builds a report that names the factor and the covariate', () => {
    const tables = ancovaTables(dataset());
    const report = ancovaReport(tables, 'Gruppo', ['X'], 95);
    assert.ok(report.headline.includes('Gruppo'));
    assert.ok(report.headline.includes('X'));
    assert.ok(report.sections.length >= 4);
    assert.equal(report.badge, 'Nessun effetto');
  });

  it('supports more than one covariate', () => {
    const base = dataset();
    const tables = ancovaTables({
      ...base,
      covariates: [base.covariates[0], [1, 2, 1, 2, 1, 2, 1, 2]],
      covariateNames: ['X', 'Z'],
    });
    assert.equal(tables.length, 5);
    const covariates = tables[0].rows.filter((candidate) => candidate.source === 'X' || candidate.source === 'Z');
    assert.equal(covariates.length, 2);
  });

  it('returns no tables without two groups or without covariates', () => {
    const base = dataset();
    assert.deepEqual(ancovaTables({ ...base, factor: new Array(8).fill('A') }), []);
    assert.deepEqual(ancovaTables({ ...base, covariates: [], covariateNames: [] }), []);
  });
});
