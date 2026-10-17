import test from 'node:test';
import assert from 'node:assert/strict';
import {
  noncentralFSF,
  sampleSizeAnova,
  sampleSizeCorrelation,
  sampleSizeOneMean,
  sampleSizePrecision,
  sampleSizeReport,
  sampleSizeTables,
  sampleSizeTwoMeans,
  sampleSizeTwoProportions,
} from './samplesize';
import { fSF } from './distributions';
import type { TableSpec } from './types';

const table = (tables: TableSpec[], id: string): TableSpec => {
  const found = tables.find(spec => spec.id === id);
  assert.ok(found, `missing table ${id}`);
  return found!;
};

test('two-sample means reproduce the textbook 64 per group (d = 0.5, 80% power)', () => {
  const result = sampleSizeTwoMeans(5, 10, 0.05, 0.8, 2);
  assert.equal(result.nPerGroup, 64);
  assert.equal(result.total, 128);
  assert.ok(result.achievedPower >= 0.8 && result.achievedPower < 0.82);
});

test('one-sample and paired designs need 34 observations for d = 0.5', () => {
  const one = sampleSizeOneMean(5, 10, 0.05, 0.8, 2);
  assert.equal(one.nPerGroup, 34);
  const paired = sampleSizeOneMean(5, 10, 0.05, 0.8, 2, 'paired');
  assert.equal(paired.design, 'paired');
  assert.equal(paired.nPerGroup, 34);
});

test('two proportions 50% vs 30% need 93 per group', () => {
  const result = sampleSizeTwoProportions(0.5, 0.3, 0.05, 0.8, 2);
  assert.equal(result.nPerGroup, 93);
  assert.ok(Math.abs(result.achievedPower - 0.8) < 0.01);
});

test('correlation r = 0.3 needs 85 observations (Fisher z)', () => {
  const result = sampleSizeCorrelation(0.3, 0.05, 0.8, 2);
  assert.equal(result.nPerGroup, 85);
});

test('one-way ANOVA f = 0.25 with 3 groups matches G*Power (159 total, 53 per group)', () => {
  const result = sampleSizeAnova(3, 0.25, 0.05, 0.8);
  assert.equal(result.total, 159);
  assert.equal(result.nPerGroup, 53);
  assert.ok(Math.abs(result.achievedPower - 0.8) < 0.01);
});

test('noncentral F reduces to the central F when lambda is zero', () => {
  const x = 2.7;
  assert.ok(Math.abs(noncentralFSF(x, 3, 40, 0) - fSF(x, 3, 40)) < 1e-12);
});

test('precision-based sample size follows (z * SD / margin)^2', () => {
  assert.equal(sampleSizePrecision(10, 2, 95, 1), 97);
  assert.equal(sampleSizePrecision(10, 2, 95, 2), 193);
});

test('tables and report are produced for every design without NaN text', () => {
  const designs = [
    { design: 'twoMeans' as const, delta: 5, sd: 10 },
    { design: 'oneMean' as const, delta: 5, sd: 10 },
    { design: 'paired' as const, delta: 5, sd: 10 },
    { design: 'twoProportions' as const, p1: 0.5, p2: 0.3 },
    { design: 'correlation' as const, r: 0.3 },
    { design: 'anova' as const, groups: 3, f: 0.25 },
  ];

  for (const design of designs) {
    const { tables } = sampleSizeTables({ ...design, alpha: 0.05, power: 0.8, tails: 2, sd: 10 });
    assert.equal(table(tables, 'ss-result').rows.length >= 4, true);
    const curve = table(tables, 'ss-curve').rows;
    assert.ok(curve.length >= 5);
    const powers = curve.map(row => Number(row.power));
    assert.ok(powers[powers.length - 1] >= powers[0]);

    const report = sampleSizeReport(tables, 95);
    const text = [
      report.headline,
      ...report.intro,
      ...report.sections.flatMap(section => [...(section.body ?? []), ...(section.bullets ?? [])]),
      ...report.limitations,
    ].join(' ');
    assert.doesNotMatch(text, /NaN|undefined/);
  }
});

test('impossible inputs return no tables', () => {
  const { tables } = sampleSizeTables({ design: 'twoMeans', alpha: 0.05, power: 0.8, tails: 2, delta: 0, sd: 10 });
  assert.deepEqual(tables, []);
});
