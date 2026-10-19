import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cochranQ,
  cochranTables,
  friedmanReport,
  friedmanTables,
  friedmanTest,
  jonckheereTables,
  jonckheereTerpstra,
  mcnemarTables,
  mcnemarTest,
  nemenyiPosthoc,
  studentizedRangeCdf,
  studentizedRangeQuantile,
} from './repeated';

const close = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

describe('studentized range', () => {
  it('matches SciPy for k = 3', () => {
    close(studentizedRangeCdf(3.314, 3), 0.9499558596, 1e-6);
    close(studentizedRangeQuantile(95, 3), 3.314, 2e-3);
  });
});

describe('Friedman + Nemenyi', () => {
  const blocks = [
    [1, 2, 3],
    [1, 3, 2],
    [2, 1, 3],
    [3, 1, 2],
    [2, 3, 1],
    [3, 2, 1],
    [1, 2, 3],
    [2, 1, 3],
  ];

  it('matches the chi-square reference and Kendall W', () => {
    const result = friedmanTest(blocks);
    assert.ok(result);
    close(result.chi2, 0.75);
    close(result.p, 0.6872892788, 1e-9);
    close(result.w, 0.046875);
    close(result.meanRanks[0], 1.875);
    close(result.meanRanks[2], 2.25);
  });

  it('computes Nemenyi pairs with the studentized range distribution', () => {
    const result = friedmanTest(blocks)!;
    const posthoc = nemenyiPosthoc(result, 95);
    close(posthoc.se, 0.5);
    close(posthoc.qCritical, 2.3437005864, 1e-3);
    close(posthoc.criticalDifference, 1.1718502932, 1e-3);
    const first = posthoc.pairs.find(pair => pair.a === 0 && pair.b === 2)!;
    close(first.diff, 0.375);
    close(first.q, 0.75);
    close(first.p, 0.7336256289, 1e-6);
    assert.equal(first.significant, false);
  });

  it('builds tables and a readable report', () => {
    const result = friedmanTest(blocks)!;
    const tables = friedmanTables(result, nemenyiPosthoc(result, 95), ['A', 'B', 'C'], 95);
    assert.deepEqual(tables.map(table => table.id), ['friedman-test', 'friedman-ranks', 'friedman-nemenyi']);
    assert.equal(tables[2].rows.length, 3);
    const report = friedmanReport(tables, ['A', 'B', 'C'], 95);
    assert.ok(report.headline.includes('0.687'));
  });
});

describe('McNemar', () => {
  it('matches the exact binomial and Yates references', () => {
    const pairs: [number, number][] = [
      ...Array.from({ length: 10 }, () => [1, 1] as [number, number]),
      ...Array.from({ length: 12 }, () => [1, 0] as [number, number]),
      ...Array.from({ length: 4 }, () => [0, 1] as [number, number]),
      ...Array.from({ length: 4 }, () => [0, 0] as [number, number]),
    ];
    const result = mcnemarTest(pairs);
    assert.ok(result);
    assert.equal(result.b, 12);
    assert.equal(result.c, 4);
    close(result.exactP, 0.0768127441, 1e-9);
    close(result.chi2Yates, 3.0625);
    close(result.pYates, 0.0801183137, 1e-9);
    close(result.oddsRatio, 3);
    const tables = mcnemarTables(result, ['Before', 'After'], 95);
    assert.equal(tables[0].rows.length, 4);
    assert.equal(tables[1].rows.length, 6);
  });

  it('rejects non-binary data', () => {
    assert.equal(mcnemarTest([[1, 2], [0, 1]]), null);
  });
});

describe('Cochran Q', () => {
  const blocks = [
    [1, 1, 1],
    [1, 1, 0],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [0, 1, 0],
  ];

  it('matches the chi-square reference', () => {
    const result = cochranQ(blocks);
    assert.ok(result);
    close(result.q, 0.4);
    close(result.p, 0.8187307531, 1e-9);
    assert.deepEqual(result.successes, [6, 6, 5]);
    const tables = cochranTables(result, ['T1', 'T2', 'T3'], 95);
    assert.equal(tables[1].rows[2].proportion, 0.625);
  });

  it('rejects invalid designs', () => {
    assert.equal(cochranQ([[1, 2, 3], [0, 1, 0]]), null);
    assert.equal(cochranQ([[1, 1], [0, 0]]), null);
  });
});

describe('Jonckheere-Terpstra', () => {
  it('matches the normal approximation reference', () => {
    const groups = [[1, 2], [3, 4, 5], [6, 7, 8]];
    const result = jonckheereTerpstra(groups);
    assert.ok(result);
    close(result.u, 21);
    close(result.expected, 10.5);
    close(result.variance, 14.25);
    close(result.z, 2.7815179498, 1e-9);
    close(result.p, 0.0054105339, 1e-9);
    close(result.effect, 0.9834151022, 1e-9);
    const tables = jonckheereTables(result, groups, ['Low', 'Mid', 'High'], 95);
    assert.equal(tables[1].rows[2].median, 7);
  });

  it('handles ties and rejects degenerate input', () => {
    const tied = jonckheereTerpstra([[1, 1], [1, 2]]);
    assert.ok(tied);
    close(tied.u, 3);
    assert.equal(jonckheereTerpstra([[], [1, 2]]), null);
    assert.equal(jonckheereTerpstra([[1, 2]]), null);
  });
});
