import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LEVELS,
  analysisRows,
  columnLevels,
  distinctColumnValues,
  groupColumnIndexes,
  isGroupColumn,
  levelLabel,
  naturalCompare,
  orderedColumnLevels,
  referenceFirst,
  type GridData,
} from './types';
import { levelsFromColumnValues, recodeColumnValues, setColumnLevels } from './ops';

const grid = (): GridData => ({
  cols: [
    { name: 'Score', type: 'num' },
    { name: 'Group', type: 'cat' },
  ],
  rows: [
    ['10', '1'],
    ['12', '2'],
    ['14', '1'],
    ['', ''],
  ],
});

describe('categorical levels', () => {
  it('stores trimmed, unique levels and drops an invalid reference', () => {
    const out = setColumnLevels(
      grid(),
      1,
      [
        { value: ' 1 ', label: '  Controllo ' },
        { value: '2', label: 'Trattamento' },
        { value: '1', label: 'Duplicato' },
        { value: '', label: 'Vuoto' },
      ],
      '2'
    );
    assert.deepEqual(out.cols[1].levels, [
      { value: '1', label: 'Controllo' },
      { value: '2', label: 'Trattamento' },
    ]);
    assert.equal(out.cols[1].reference, '2');
    // Cell data is never rewritten by the editor.
    assert.deepEqual(out.rows, grid().rows);

    const badRef = setColumnLevels(grid(), 1, [{ value: '1', label: 'A' }], 'nope');
    assert.equal(badRef.cols[1].reference, undefined);
  });

  it('keeps labels unique with a numeric suffix', () => {
    const out = setColumnLevels(grid(), 1, [
      { value: '1', label: 'Gruppo' },
      { value: '2', label: 'gruppo' },
      { value: '3', label: 'Gruppo' },
    ]);
    assert.deepEqual(out.cols[1].levels?.map((level) => level.label), ['Gruppo', 'gruppo 2', 'Gruppo 3']);
  });

  it('caps the number of levels and ignores out-of-range columns', () => {
    const many = Array.from({ length: MAX_LEVELS + 10 }, (_, i) => ({ value: String(i + 1), label: `L${i + 1}` }));
    assert.equal(setColumnLevels(grid(), 1, many).cols[1].levels?.length, MAX_LEVELS);
    const untouched = grid();
    assert.equal(setColumnLevels(untouched, 9, many), untouched);
  });

  it('clears the metadata when every level is removed', () => {
    const out = setColumnLevels(grid(), 1, [], '1');
    assert.equal(out.cols[1].levels, undefined);
    assert.equal(out.cols[1].reference, undefined);
  });

  it('merges declared labels with the values found in the data', () => {
    const declared = setColumnLevels(grid(), 1, [{ value: '1', label: 'Controllo' }]);
    const merged = levelsFromColumnValues(declared, 1);
    assert.deepEqual(merged, [
      { value: '1', label: 'Controllo' },
      { value: '2', label: '2' },
    ]);
  });
});

describe('group recoding', () => {
  const labelled = (): GridData => {
    const g = grid();
    g.cols[1] = {
      ...g.cols[1],
      levels: [
        { value: '1', label: 'Controllo' },
        { value: '2', label: 'Trattamento' },
      ],
      reference: '1',
    };
    return g;
  };

  it('renames codes across the cells and keeps labels, order and reference', () => {
    const out = recodeColumnValues(labelled(), 1, { '1': 'C', '2': 'T' });
    assert.deepEqual(out.grid.rows.map((row) => row[1]), ['C', 'T', 'C', '']);
    assert.deepEqual(out.grid.cols[1].levels, [
      { value: 'C', label: 'Controllo' },
      { value: 'T', label: 'Trattamento' },
    ]);
    assert.equal(out.grid.cols[1].reference, 'C');
    assert.equal(out.changed, 3);
    assert.equal(out.cleared, 0);
    assert.equal(out.merged, 0);
  });

  it('merges two codes into one target and reports the fused group', () => {
    const out = recodeColumnValues(labelled(), 1, { '1': 'A', '2': 'A' });
    assert.deepEqual(out.grid.rows.map((row) => row[1]), ['A', 'A', 'A', '']);
    assert.deepEqual(out.grid.cols[1].levels, [{ value: 'A', label: 'Controllo' }]);
    assert.equal(out.merged, 1);
    assert.equal(out.changed, 3);
  });

  it('clears cells mapped to an empty code and drops the level and reference', () => {
    const out = recodeColumnValues(labelled(), 1, { '1': '' });
    assert.deepEqual(out.grid.rows.map((row) => row[1]), ['', '2', '', '']);
    assert.deepEqual(out.grid.cols[1].levels, [{ value: '2', label: 'Trattamento' }]);
    assert.equal(out.grid.cols[1].reference, undefined);
    assert.equal(out.cleared, 2);
    // A cleared code disappears; it is not a merge.
    assert.equal(out.merged, 0);
  });

  it('counts a merge into an existing unmapped code as one fused group', () => {
    const g = grid();
    g.cols[1] = {
      ...g.cols[1],
      levels: [
        { value: '1', label: 'Controllo' },
        { value: '2', label: 'Trattamento' },
      ],
    };
    // 20 is not remapped: code 2 is folded into the group that already exists.
    const out = recodeColumnValues(g, 1, { '2': '1' });
    assert.equal(out.merged, 1);
    assert.deepEqual(out.grid.rows.map((row) => row[1]), ['1', '1', '1', '']);
  });

  it('applies swaps against the original values', () => {
    const out = recodeColumnValues(labelled(), 1, { '1': '2', '2': '1' });
    assert.deepEqual(out.grid.rows.map((row) => row[1]), ['2', '1', '2', '']);
  });

  it('leaves unmapped values untouched and is a no-op without changes', () => {
    const g = grid();
    g.rows.push(['16', '9']);
    const out = recodeColumnValues(g, 1, { '1': 'Uno' });
    assert.deepEqual(out.grid.rows.map((row) => row[1]), ['Uno', '2', 'Uno', '', '9']);
    const same = grid();
    const noop = recodeColumnValues(same, 1, { '1': '1', '2': '2' });
    assert.deepEqual(noop.grid.rows, same.rows);
    assert.equal(noop.changed, 0);
    assert.equal(recodeColumnValues(same, 9, { '1': '2' }).grid, same);
  });

  it('keeps a recoded group selectable after a merge leaves one code', () => {
    const out = recodeColumnValues(labelled(), 1, { '2': '1' });
    assert.deepEqual(out.grid.cols[1].levels, [{ value: '1', label: 'Controllo' }]);
    assert.deepEqual(out.grid.rows.map((row) => row[1]), ['1', '1', '1', '']);
    assert.equal(isGroupColumn(out.grid, 1), true);
  });

  it('switches a numeric column to cat when the new codes are not numeric', () => {
    const g: GridData = {
      cols: [{ name: 'Score', type: 'num' }, { name: 'Group', type: 'int' }],
      rows: [['10', '1'], ['12', '2']],
    };
    const out = recodeColumnValues(g, 1, { '1': 'Controllo', '2': 'Trattamento' });
    assert.equal(out.grid.cols[1].type, 'cat');
    assert.equal(out.typeChangedTo, 'cat');
    const numeric = recodeColumnValues(g, 1, { '1': '10', '2': '20' });
    assert.equal(numeric.grid.cols[1].type, 'int');
    assert.equal(numeric.typeChangedTo, undefined);
  });
});

describe('group column detection', () => {
  it('accepts categorical types and small integer codes', () => {
    const g: GridData = {
      cols: [
        { name: 'Cat', type: 'cat' },
        { name: 'Code', type: 'int' },
        { name: 'Continuous', type: 'num' },
        { name: 'Id', type: 'id' },
        { name: 'Text', type: 'str' },
        { name: 'Wide', type: 'int' },
      ],
      rows: Array.from({ length: 20 }, (_, i) => [
        i % 2 === 0 ? 'A' : 'B',
        String((i % 3) + 1),
        String(i * 1.5),
        `S${i}`,
        `t${i}`,
        String(i + 1),
      ]),
    };
    assert.equal(isGroupColumn(g, 0), true);
    assert.equal(isGroupColumn(g, 1), true);
    assert.equal(isGroupColumn(g, 2), false);
    assert.equal(isGroupColumn(g, 3), false);
    // Free text with one value per row is not a grouping variable.
    assert.equal(isGroupColumn(g, 4), false);
    assert.equal(isGroupColumn(g, 5), false);
    assert.deepEqual(groupColumnIndexes(g), [0, 1]);

    const letters: GridData = {
      cols: [{ name: 'Arm', type: 'str' }],
      rows: [['A'], ['B'], ['C'], ['A']],
    };
    assert.equal(isGroupColumn(letters, 0), true);

    // Declared levels keep a column selectable even after a recode leaves a
    // single code, so the editor stays reachable and can be undone by hand.
    const recoded: GridData = {
      cols: [{ name: 'Group', type: 'int', levels: [{ value: '1', label: 'Controllo' }], reference: '1' }],
      rows: [['1'], ['1'], ['']],
    };
    assert.equal(isGroupColumn(recoded, 0), true);
    assert.deepEqual(groupColumnIndexes(recoded), [0]);
    const undeclaredSingle: GridData = {
      cols: [{ name: 'Group', type: 'int' }],
      rows: [['1'], ['1'], ['']],
    };
    assert.equal(isGroupColumn(undeclaredSingle, 0), false);
  });
});

describe('level order and labels', () => {
  it('sorts values naturally', () => {
    const values = ['10', '2', '1'];
    assert.deepEqual([...values].sort(naturalCompare), ['1', '2', '10']);
  });

  it('prefers declared order and appends undeclared observed values', () => {
    const g = grid();
    g.cols[1] = {
      ...g.cols[1],
      levels: [
        { value: '2', label: 'Trattamento' },
        { value: '1', label: 'Controllo' },
      ],
    };
    const ordered = orderedColumnLevels(g.cols[1], g.rows, 1);
    assert.deepEqual(ordered.map((level) => level.label), ['Trattamento', 'Controllo']);
    g.rows.push(['16', '3']);
    const withExtra = orderedColumnLevels(g.cols[1], g.rows, 1);
    assert.equal(withExtra[withExtra.length - 1].value, '3');
  });

  it('moves the reference level first', () => {
    assert.deepEqual(referenceFirst(['A', 'B', 'C'], 'B'), ['B', 'A', 'C']);
    assert.deepEqual(referenceFirst(['A', 'B'], 'Z'), ['A', 'B']);
  });

  it('falls back to observed values when no levels are declared', () => {
    const levels = columnLevels(grid().cols[1], grid().rows, 1);
    assert.deepEqual(levels, [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
    ]);
    assert.equal(levelLabel(grid().cols[1], '2'), '2');
  });

  it('uses the declared label for analysis rows', () => {
    const g = grid();
    g.cols[1] = {
      ...g.cols[1],
      levels: [
        { value: '1', label: 'Controllo' },
        { value: '2', label: 'Trattamento' },
      ],
    };
    const rows = analysisRows(g, [1]);
    assert.deepEqual(rows.map((row) => row[1]), ['Controllo', 'Trattamento', 'Controllo', '']);
    // Other columns are untouched.
    assert.deepEqual(rows.map((row) => row[0]), ['10', '12', '14', '']);
  });

  it('does not merge groups when two labels collide', () => {
    const g = grid();
    g.cols[1] = {
      ...g.cols[1],
      levels: [
        { value: '1', label: 'Same' },
        { value: '2', label: 'Same' },
      ],
    };
    const rows = analysisRows(g, [1]);
    assert.deepEqual(rows.map((row) => row[1]), ['1', '2', '1', '']);
  });

  it('caps the distinct values of a column', () => {
    const rows = Array.from({ length: 120 }, (_, i) => [String(i)]);
    assert.equal(distinctColumnValues(rows, 0).length, MAX_LEVELS);
  });
});
