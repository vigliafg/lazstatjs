import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  alphaReport,
  alphaTables,
  cronbachAlpha,
  pcaReport,
  pcaTables,
  principalComponents,
} from './multivariate';

const close = (actual: number, expected: number, tolerance = 1e-9): void => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual}`
  );
};

/** Center to mean 0 and scale to sample variance 1. */
const standardize = (values: number[]): number[] => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return values.map((value) => (value - mean) / Math.sqrt(variance));
};

/**
 * Two standardized variables with an exact sample correlation of 0.6:
 * x = q1, y = 0.6·q1 + 0.8·q2, with q1 ⟂ q2 and both with unit variance.
 */
const correlatedPair = (): { x: number[]; y: number[] } => {
  const q1 = standardize([-2, -1, 0, 1, 2]);
  const q2 = standardize([1, -1, 0, -1, 1]);
  return {
    x: q1,
    y: q1.map((value, index) => 0.6 * value + 0.8 * q2[index]),
  };
};

describe('PCA', () => {
  it('reproduces the eigenvalues of a two-variable correlation matrix', () => {
    const { x, y } = correlatedPair();
    const result = principalComponents(
      x.map((value, index) => [value, y[index]]),
      ['x', 'y'],
      true
    );
    assert.ok(result);
    close(result.eigenvalues[0], 1.6, 1e-9);
    close(result.eigenvalues[1], 0.4, 1e-9);
    close(result.variancePct[0], 80, 1e-8);
    close(result.variancePct[1], 20, 1e-8);
    close(result.cumulativePct[1], 100, 1e-8);
    assert.equal(result.retained, 1);
    close(result.loadings[0][0], Math.sqrt(0.8), 1e-9);
    close(result.loadings[1][0], Math.sqrt(0.8), 1e-9);
    close(result.communalities[0], 0.8, 1e-9);
    // KMO with two variables: r² / (r² + partial²) = 0.5 because the partial
    // correlation equals r when there is no third variable to condition on.
    close(result.kmo, 0.5, 1e-9);
  });

  it('computes Bartlett sphericity from the determinant of R', () => {
    const { x, y } = correlatedPair();
    const result = principalComponents(
      x.map((value, index) => [value, y[index]]),
      ['x', 'y'],
      true
    );
    assert.ok(result);
    close(result.determinant, 0.64, 1e-9);
    const expectedChi2 = -(5 - 1 - 9 / 6) * Math.log(0.64);
    close(result.bartlettChi2, expectedChi2, 1e-9);
    assert.equal(result.bartlettDf, 1);
  });

  it('scores are centered and uncorrelated across components', () => {
    const { x, y } = correlatedPair();
    const result = principalComponents(
      x.map((value, index) => [value, y[index]]),
      ['x', 'y'],
      true
    );
    assert.ok(result);
    const pc1 = result.scores.map((row) => row[0]);
    const mean = pc1.reduce((sum, value) => sum + value, 0) / pc1.length;
    close(mean, 0, 1e-9);
    const cross = result.scores.reduce((sum, row) => sum + row[0] * row[1], 0);
    close(cross, 0, 1e-9);
  });

  it('rejects constant variables under standardization', () => {
    const result = principalComponents(
      [
        [1, 2],
        [1, 3],
        [1, 4],
      ],
      ['costante', 'y'],
      true
    );
    assert.equal(result, null);
  });

  it('builds tables and a readable report', () => {
    const { x, y } = correlatedPair();
    const result = principalComponents(
      x.map((value, index) => [value, y[index]]),
      ['x', 'y'],
      true
    );
    assert.ok(result);
    const tables = pcaTables(result);
    assert.deepEqual(tables.map((table) => table.id), ['pca-eigen', 'pca-loadings', 'pca-adequacy']);
    const report = pcaReport(tables, result, 95);
    assert.ok(report.headline.includes('80.0%'));
    assert.ok(report.sections.length >= 3);
  });
});

/**
 * Three standardized items with a common factor and an exact 0.25
 * equicorrelation: x_i = 0.5·q0 + √0.75·q_i. Then α = 3r/(1+2r) = 0.5,
 * the corrected item-total correlation is 0.5/√2.5 and α-if-deleted = 0.4.
 */
const equicorrelatedItems = (): number[][] => {
  const n = 5;
  const vectors = [
    [1, -1, 0, 0, 0],
    [1, 1, -2, 0, 0],
    [1, 1, 1, -3, 0],
    [1, 1, 1, 1, -4],
  ].map(standardize);
  const items = [0, 1, 2].map((index) =>
    vectors[0].map((value, row) => 0.5 * value + Math.sqrt(0.75) * vectors[index + 1][row])
  );
  return Array.from({ length: n }, (_, row) => items.map((item) => item[row]));
};

describe('Cronbach alpha', () => {
  it('matches the closed form for two items', () => {
    const { x, y } = correlatedPair();
    const result = cronbachAlpha(
      x.map((value, index) => [value, y[index]]),
      ['x', 'y']
    );
    assert.ok(result);
    close(result.alpha, 0.75, 1e-9);
    close(result.standardizedAlpha, 0.75, 1e-9);
    close(result.meanInterItem, 0.6, 1e-9);
    close(result.items[0].itemTotal, 0.6, 1e-9);
    assert.ok(Number.isNaN(result.items[0].alphaIfDeleted));
  });

  it('matches the equicorrelation closed form for three items', () => {
    const result = cronbachAlpha(equicorrelatedItems(), ['a', 'b', 'c']);
    assert.ok(result);
    close(result.alpha, 0.5, 1e-9);
    close(result.standardizedAlpha, 0.5, 1e-9);
    close(result.meanInterItem, 0.25, 1e-9);
    result.items.forEach((item) => {
      close(item.itemTotal, 0.5 / Math.sqrt(2.5), 1e-9);
      close(item.alphaIfDeleted, 0.4, 1e-9);
    });
    result.correlations.forEach((row, i) => {
      row.forEach((value, j) => {
        if (i === j) close(value, 1, 1e-9);
        else close(value, 0.25, 1e-9);
      });
    });
  });

  it('builds tables and a readable report', () => {
    const result = cronbachAlpha(equicorrelatedItems(), ['a', 'b', 'c']);
    assert.ok(result);
    const tables = alphaTables(result);
    assert.deepEqual(tables.map((table) => table.id), ['alpha-summary', 'alpha-items', 'alpha-matrix']);
    const report = alphaReport(tables, result);
    assert.ok(report.headline.includes('0.5'));
    assert.ok(report.sections.length >= 3);
  });

  it('returns null with fewer than two items or constant totals', () => {
    assert.equal(cronbachAlpha([[1], [2], [3]], ['a']), null);
    assert.equal(cronbachAlpha([[1, 1], [1, 1], [1, 1]], ['a', 'b']), null);
  });
});
