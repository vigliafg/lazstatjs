import test from 'node:test';
import assert from 'node:assert/strict';
import { fitLogistic, logisticCurve, logisticReport, logisticTables } from './logistic';
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

/** a = 20, b = 10, c = 5, d = 15 -> OR = 6, SE(log OR) = sqrt(1/20+1/10+1/5+1/15). */
const binaryData = () => {
  const y = [
    ...Array(20).fill(1),
    ...Array(10).fill(0),
    ...Array(5).fill(1),
    ...Array(15).fill(0),
  ] as number[];
  const x = [...Array(30).fill(1), ...Array(20).fill(0)] as number[];
  return { y, x };
};

test('a single binary predictor reproduces the closed-form odds ratio and its standard error', () => {
  const { y, x } = binaryData();
  const model = fitLogistic(y, [{ name: 'X', values: x }], 95, 0.5);
  assert.ok(model);

  close(Math.exp(model!.beta[1]), 6, 1e-6);
  close(model!.beta[1], Math.log(6), 1e-6);
  close(
    model!.se[1],
    Math.sqrt(1 / 20 + 1 / 10 + 1 / 5 + 1 / 15),
    1e-9
  );
  // Wald z = ln(6) / SE, two-sided p
  close(model!.beta[1] / model!.se[1], 2.7758, 1e-3);
  // Wald p from the coefficient table (the model-level p is the LR test)
  const waldP = Number(
    logisticTables(model!, 95, 0.5)[1].rows.find(row => String(row.predictor) === 'X')!.p
  );
  assert.ok(Math.abs(waldP - 0.00551) < 1e-4);
  assert.ok(model!.p < 0.01);

  close(model!.auc, 0.7, 1e-9);
  close(model!.accuracy, 0.7, 1e-9);
  close(model!.sensitivity, 0.8, 1e-9);
  close(model!.specificity, 0.6, 1e-9);
});

test('tables expose odds ratios, model test and classification', () => {
  const { y, x } = binaryData();
  const model = fitLogistic(y, [{ name: 'X', values: x }])!;
  const tables = logisticTables(model, 95, 0.5);

  const coefficients = table(tables, 'logit-coefficients').rows;
  const predictor = coefficients.find(row => String(row.predictor) === 'X')!;
  close(Number(predictor.or), 6, 1e-6);
  assert.ok(Number(predictor.orLo) < 6 && Number(predictor.orHi) > 6);

  const fit = table(tables, 'logit-fit').rows;
  assert.equal(fit.find(row => String(row.metric) === 'Osservazioni')?.value, '50');
  assert.equal(fit.find(row => String(row.metric) === 'Eventi (Y = 1)')?.value, '25');

  const classification = table(tables, 'logit-classification').rows;
  assert.equal(classification.find(row => String(row.metric) === 'AUC')?.value, '0.7');

  const report = logisticReport(tables, 95);
  const text = [
    report.headline,
    ...report.intro,
    ...report.sections.flatMap(section => [...(section.body ?? []), ...(section.bullets ?? [])]),
    ...report.limitations,
  ].join(' ');
  assert.doesNotMatch(text, /NaN|undefined/);
  assert.match(text, /OR = 6/);
});

test('a second predictor is fitted and reported', () => {
  const { y, x } = binaryData();
  const second = x.map((value, index) => value * 2 + (index % 3));
  const model = fitLogistic(y, [
    { name: 'X', values: x },
    { name: 'Z', values: second },
  ]);
  assert.ok(model);
  assert.equal(model!.names.length, 3);
  assert.ok(model!.beta.every(value => Number.isFinite(value)));
  assert.ok(Number.isFinite(model!.aic));
});

test('a cut-off different from 0.5 changes sensitivity and specificity but not AUC', () => {
  const { y, x } = binaryData();
  const low = fitLogistic(y, [{ name: 'X', values: x }], 95, 0.2)!;
  const high = fitLogistic(y, [{ name: 'X', values: x }], 95, 0.8)!;
  close(low.auc, high.auc, 1e-12);
  assert.ok(low.sensitivity >= high.sensitivity);
  assert.ok(low.specificity <= high.specificity);
});

test('perfect separation is flagged instead of silently trusted', () => {
  const y = [0, 0, 0, 1, 1, 1] as number[];
  const x = [0, 1, 2, 3, 4, 5] as number[];
  const model = fitLogistic(y, [{ name: 'X', values: x }]);
  assert.ok(model);
  assert.equal(model!.separation, true);
  const tables = logisticTables(model!, 95, 0.5);
  assert.ok(table(tables, 'logit-warning'));
});

test('degenerate outcomes and singular designs return null', () => {
  assert.equal(fitLogistic([1, 1, 1, 1], [{ name: 'X', values: [1, 2, 3, 4] }]), null);
  assert.equal(fitLogistic([0, 0, 1, 1], [{ name: 'X', values: [2, 2, 2, 2] }]), null);
});

test('the probability curve stays inside the 0-100% range and follows the sign of the slope', () => {
  const { y, x } = binaryData();
  const model = fitLogistic(y, [{ name: 'X', values: x }])!;
  const curve = logisticCurve(model, x, 20);
  assert.equal(curve.length, 20);
  assert.ok(curve.every(point => point.y >= 0 && point.y <= 100));
  close(curve[0].y, 100 / (1 + Math.exp(-model.beta[0])), 1e-9);
});
