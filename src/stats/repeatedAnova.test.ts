import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  repeatedAnovaReport,
  repeatedAnovaTables,
  repeatedMeasuresAnova,
} from './repeatedAnova';

const close = (actual: number, expected: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected} (diff ${Math.abs(actual - expected)})`);

const three = [
  [5, 6, 7],
  [4, 5, 6],
  [6, 7, 8],
  [5, 4, 6],
  [7, 6, 9],
  [6, 5, 7],
  [4, 6, 5],
  [5, 7, 7],
];

const four = [
  [3.805, 5.909, 6.154, 7.74],
  [5.282, 6.881, 8.624, 8.857],
  [4.046, 6.263, 6.412, 7.743],
  [5.416, 6.553, 6.493, 5.825],
  [3.738, 5.83, 6.617, 7.171],
  [4.068, 6.514, 6.982, 7.265],
  [4.773, 6.508, 6.754, 7.574],
  [3.939, 7.02, 6.253, 5.972],
  [4.505, 6.533, 6.575, 8.242],
  [4.968, 5.37, 6.547, 7.993],
  [5.234, 5.355, 5.611, 6.409],
  [4.632, 6.523, 6.209, 6.77],
];

describe('repeated-measures ANOVA', () => {
  it('matches the ANOVA and sphericity references for three conditions', () => {
    const result = repeatedMeasuresAnova(three)!;
    close(result.f, 9.404040404040407, 1e-9);
    close(result.p, 0.0025765019052553443, 1e-10);
    close(result.ssConditions, 11.083333333333334, 1e-9);
    close(result.ssSubjects, 17.624999999999996, 1e-9);
    close(result.ssError, 8.249999999999998, 1e-9);
    close(result.partialEta2, 0.5732758620689656, 1e-9);
    close(result.generalizedEta2, 0.2998872604284104, 1e-9);
    close(result.mauchlyW, 0.3966942148760327, 1e-9);
    close(result.mauchlyChi2, 5.5475372081331065, 1e-8);
    close(result.mauchlyP, 0.06242630087250718, 1e-9);
    close(result.ggEpsilon, 0.6237113402061855, 1e-9);
    close(result.hfEpsilon, 0.693548387096774, 1e-9);
    close(result.pGG, 0.011119313057265606, 1e-9);
    close(result.pHF, 0.00845072353221537, 1e-9);
  });

  it('includes the second-order Mauchly correction for four conditions', () => {
    const result = repeatedMeasuresAnova(four)!;
    close(result.f, 41.65106679323473, 1e-9);
    close(result.p, 2.5292093688111538e-11, 1e-14);
    close(result.mauchlyW, 0.5267469634117914, 1e-9);
    close(result.mauchlyChi2, 6.232284635462307, 1e-8);
    close(result.mauchlyP, 0.28642047444436947, 1e-9);
    close(result.ggEpsilon, 0.7457658288227522, 1e-9);
    close(result.hfEpsilon, 0.9452019244538008, 1e-9);
    close(result.pGG, 5.996296226064601e-9, 1e-13);
    close(result.pHF, 8.200129870436316e-11, 1e-14);
  });

  it('builds tables, corrections and a report', () => {
    const result = repeatedMeasuresAnova(three)!;
    const tables = repeatedAnovaTables(result, ['A', 'B', 'C'], 90);
    assert.deepEqual(tables.map(table => table.id), ['rm-anova', 'rm-sphericity', 'rm-descriptives']);
    const sphericity = tables[1].rows;
    assert.equal(sphericity.find(row => row.metric === 'p GG')?.value, result.pGG);
    assert.equal(tables[2].rows[0].n, 8);
    const report = repeatedAnovaReport(tables, ['A', 'B', 'C'], 90);
    assert.ok(report.headline.includes('9.404'));
    assert.equal(report.badge, 'Sfericità violata');
  });

  it('rejects incomplete or too-small designs', () => {
    assert.equal(repeatedMeasuresAnova([[1, 2]]), null);
    assert.equal(repeatedMeasuresAnova([[1, 2, 3], [1, 2]]), null);
    assert.equal(repeatedMeasuresAnova([[1, 2], [3, 4]]), null);
  });
});
