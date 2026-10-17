import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupChecks,
  profileColumns,
  recommendWizard,
  runWizard,
  type ColumnProfile,
  type WizardContext,
} from './wizard';
import type { TableSpec } from './types';

const columns = [
  { name: 'Y' },
  { name: 'Group' },
  { name: 'X' },
  { name: 'Category' },
  { name: 'Empty' },
];

const rows: string[][] = [];
for (let index = 0; index < 40; index++) {
  rows.push([
    String(10 + (index % 7) * 0.5 + (index % 2 === 0 ? 0 : 3)),
    index % 2 === 0 ? '1' : '2',
    String(index % 9),
    ['a', 'b', 'c'][index % 3],
    '',
  ]);
}

const profile = (overrides: Partial<ColumnProfile> = {}): ColumnProfile => ({
  index: 0,
  name: 'Y',
  kind: 'numeric',
  n: 30,
  missing: 0,
  unique: 30,
  levels: [],
  min: 0,
  max: 1,
  mean: 0.5,
  sd: 0.2,
  normalityP: 0.4,
  ...overrides,
});

const context = (overrides: Partial<WizardContext> = {}): WizardContext => ({
  goal: 'compare',
  outcome: profile(),
  second: null,
  groupLevels: ['1', '2'],
  groups: [
    { level: '1', n: 20, mean: 10, sd: 1, normalityP: 0.4 },
    { level: '2', n: 20, mean: 13, sd: 1, normalityP: 0.3 },
  ],
  leveneP: 0.6,
  pairedDifferenceP: NaN,
  paired: false,
  level: 95,
  ...overrides,
});

const table = (tables: TableSpec[], id: string): TableSpec => {
  const found = tables.find(spec => spec.id === id);
  assert.ok(found, `missing table ${id}`);
  return found!;
};

test('columns are classified and missing values counted', () => {
  const profiles = profileColumns(columns, rows);
  assert.equal(profiles.length, 5);
  assert.equal(profiles[0].kind, 'numeric');
  assert.equal(profiles[1].kind, 'binary');
  assert.equal(profiles[2].kind, 'numeric');
  assert.equal(profiles[3].kind, 'categorical');
  assert.equal(profiles[4].kind, 'empty');
  assert.equal(profiles[0].missing, 0);
  assert.equal(profiles[4].n, 0);
  assert.ok(profiles[0].normalityP >= 0 && profiles[0].normalityP <= 1);
  assert.equal(profiles[1].levels.length, 2);
});

test('group checks compute means, SD and normality per level', () => {
  const values = rows.map(row => (row[0] === '' ? null : Number(row[0])));
  const labels = rows.map(row => row[1]);
  const checks = groupChecks(values, labels);
  assert.equal(checks.length, 2);
  assert.equal(checks[0].n + checks[1].n, 40);
  checks.forEach(check => assert.ok(check.sd > 0));
});

test('two independent groups recommend Welch when assumptions hold', () => {
  const recommendation = recommendWizard(context());
  assert.equal(recommendation.analysis, 'ttest');
  assert.match(recommendation.title, /Welch/);
  assert.equal(recommendation.parametric, true);
  assert.ok(recommendation.selection.some(item => item.includes('Independent')));
});

test('non-normal groups switch to the rank test', () => {
  const recommendation = recommendWizard(
    context({
      groups: [
        { level: '1', n: 20, mean: 10, sd: 1, normalityP: 0.001 },
        { level: '2', n: 20, mean: 13, sd: 1, normalityP: 0.002 },
      ],
    })
  );
  assert.equal(recommendation.analysis, 'ttest');
  assert.match(recommendation.title, /Mann–Whitney/);
  assert.equal(recommendation.parametric, false);
});

test('three groups recommend ANOVA and paired designs recommend the paired test', () => {
  const anova = recommendWizard(
    context({
      groupLevels: ['1', '2', '3'],
      groups: [
        { level: '1', n: 15, mean: 10, sd: 1, normalityP: 0.4 },
        { level: '2', n: 15, mean: 11, sd: 1, normalityP: 0.5 },
        { level: '3', n: 15, mean: 12, sd: 1, normalityP: 0.6 },
      ],
    })
  );
  assert.equal(anova.analysis, 'anova');
  assert.match(anova.title, /ANOVA/);

  const paired = recommendWizard(context({ paired: true, pairedDifferenceP: 0.5 }));
  assert.equal(paired.analysis, 'ttest');
  assert.match(paired.title, /appaiato/);

  const pairedNonNormal = recommendWizard(context({ paired: true, pairedDifferenceP: 0.001 }));
  assert.match(pairedNonNormal.title, /Wilcoxon/);
});

test('binary outcomes and categorical associations go to frequency tests', () => {
  const binary = recommendWizard(
    context({ outcome: profile({ kind: 'binary', name: 'Outcome' }) })
  );
  assert.equal(binary.analysis, 'chisquare');

  const association = recommendWizard(
    context({
      goal: 'associate',
      outcome: profile({ name: 'A' }),
      second: profile({ index: 2, name: 'B' }),
      groupLevels: [],
      groups: [],
    })
  );
  assert.equal(association.analysis, 'correlation');
  assert.match(association.title, /Pearson/);

  const robust = recommendWizard(
    context({
      goal: 'associate',
      outcome: profile({ normalityP: 0.001 }),
      second: profile({ index: 2, name: 'B', normalityP: 0.5 }),
      groupLevels: [],
      groups: [],
    })
  );
  assert.match(robust.title, /Spearman/);
  assert.equal(robust.parametric, false);
});

test('prediction and survival pick the model that matches the outcome', () => {
  assert.equal(
    recommendWizard(context({ goal: 'predict', outcome: profile({ kind: 'binary' }) })).analysis,
    'logistic'
  );
  assert.equal(
    recommendWizard(context({ goal: 'predict', outcome: profile() })).analysis,
    'regression'
  );
  assert.equal(
    recommendWizard(context({ goal: 'survive', groupLevels: [], groups: [] })).analysis,
    'cox'
  );
  assert.equal(
    recommendWizard(context({ goal: 'survive', groupLevels: ['a', 'b'] })).analysis,
    'survival'
  );
  assert.equal(recommendWizard(context({ goal: 'forecast' })).analysis, 'timeseries');
  assert.equal(recommendWizard(context({ goal: 'plan' })).analysis, 'samplesize');
  assert.equal(recommendWizard(context({ goal: 'describe' })).analysis, 'descriptive');
});

test('a missing outcome produces a request instead of a wrong test', () => {
  const recommendation = recommendWizard(context({ outcome: null, groups: [], groupLevels: [] }));
  assert.equal(recommendation.analysis, 'ttest');
  assert.match(recommendation.headline, /Scegli la colonna/);
});

test('the wizard bundles audit, checks, path and a readable report', () => {
  const analysis = runWizard({
    columns,
    rows,
    selection: { goal: 'compare', outcome: 0, group: 1, second: 2, paired: false },
    level: 95,
  });

  const ids = analysis.tables.map(spec => spec.id);
  for (const id of ['wiz-audit', 'wiz-groups', 'wiz-checks', 'wiz-path']) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
  assert.equal(table(analysis.tables, 'wiz-audit').rows.length, 5);
  assert.equal(table(analysis.tables, 'wiz-groups').rows.length, 2);
  assert.ok(table(analysis.tables, 'wiz-path').rows.length >= 2);

  const text = [
    analysis.report.headline,
    ...analysis.report.intro,
    ...analysis.report.sections.flatMap(section => [...(section.body ?? []), ...(section.bullets ?? [])]),
    ...analysis.report.limitations,
  ].join(' ');
  assert.doesNotMatch(text, /NaN|undefined|Infinity/);
  assert.match(text, /confrontare gruppi/);
});

test('the audit table tolerates an empty sheet', () => {
  const analysis = runWizard({
    columns: [{ name: 'A' }],
    rows: [['']],
    selection: { goal: 'describe', outcome: 0, group: -1, second: -1, paired: false },
    level: 95,
  });
  assert.equal(analysis.recommendation.analysis, 'descriptive');
  assert.equal(table(analysis.tables, 'wiz-audit').rows[0].kind, 'vuota');
  assert.doesNotMatch(analysis.report.headline, /NaN|undefined/);
});
