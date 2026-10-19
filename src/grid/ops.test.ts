import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addColumnEnd, insertColumnAt, duplicateColumn, moveColumn, deleteColumn,
  insertRowAt, deleteRow, clearGrid, pasteTsvAt, parseTsv, fillDownRange, clearRange,
  coerceGrid, coerceValue, findReplace, trimGrid, removeEmptyRows, removeDuplicateRows,
  fillMissing, findInvalid, sortByColumn, recodeColumn, splitColumn,
  mergeColumns, computeColumn, rowMatchesFilter, filterRowIndexes, rowMatches,
} from './ops';
import type { GridData } from './types';

const demo = (): GridData => ({
  cols: [
    { name: 'A', type: 'num' },
    { name: 'B', type: 'int' },
  ],
  rows: [
    ['1', '2'],
    ['3', 'x'],
    ['', ''],
  ],
});

describe('grid ops foundation', () => {
  it('clearGrid keeps column width', () => {
    const out = clearGrid(demo());
    assert.equal(out.rows.length, 3);
    assert.deepEqual(out.rows[0], ['', '']);
  });

  it('structural ops keep shape', () => {
    const g = demo();
    assert.equal(insertColumnAt(g, 1).cols.length, 3);
    assert.equal(duplicateColumn(g, 0).cols[1].name, 'A_copy');
    assert.equal(moveColumn(g, 0, 1).cols[0].name, 'B');
    assert.equal(deleteColumn(g, 0).cols.length, 1);
    assert.equal(insertRowAt(g, 1).rows.length, 4);
    assert.equal(deleteRow(g, 0).rows.length, 2);
    assert.equal(addColumnEnd(g).rows[0].length, 3);
  });

  it('paste expands grid', () => {
    const out = pasteTsvAt(demo(), 2, 1, parseTsv('9\t8\n7\t6'));
    assert.ok(out.rows.length >= 4);
    assert.ok(out.cols.length >= 3);
    assert.equal(out.rows[2][1], '9');
  });

  it('fill down copies top row', () => {
    const out = fillDownRange(demo(), { r0: 0, c0: 0, r1: 1, c1: 0 });
    assert.equal(out.rows[1][0], '1');
  });

  it('validation finds bad int cell', () => {
    assert.equal(findInvalid(demo()).length, 1);
  });

  it('coerce fixes decimal comma', () => {
    const g: GridData = { cols: [{ name: 'A', type: 'dec' }], rows: [['1,5']] };
    const { grid, changed } = coerceGrid(g);
    assert.equal(changed, 1);
    assert.equal(grid.rows[0][0], '1.5');
  });

  it('find/replace counts', () => {
    const { grid, count } = findReplace(demo(), '1', '9');
    assert.equal(count, 1);
    assert.equal(grid.rows[0][0], '9');
  });

  it('trim + empty + dupes', () => {
    const g: GridData = { cols: [{ name: 'A', type: 'str' }], rows: [['  a  '], ['a'], ['a'], ['']] };
    assert.equal(trimGrid(g).changed, 1);
    // Cells are compared after trimming, so the padded first row is also a
    // duplicate of 'a': the two extra 'a' rows are dropped.
    assert.equal(removeDuplicateRows(g).removed, 2);
    assert.equal(removeEmptyRows(g).removed, 1);
  });

  it('fill missing with mean', () => {
    const g: GridData = { cols: [{ name: 'A', type: 'num' }], rows: [['2'], ['4'], ['']] };
    const { filled, fillWith } = fillMissing(g, 0, 'mean');
    assert.equal(filled, 1);
    assert.equal(fillWith, '3');
  });

  it('row filters are type-aware and view-only', () => {
    const g: GridData = {
      cols: [{ name: 'Name', type: 'str' }, { name: 'Score', type: 'num' }],
      rows: [['Ann', '12'], ['Bob', '7'], ['ann', ''], ['Cara', '12.5']],
    };
    const names = (filter: Parameters<typeof filterRowIndexes>[1]) => filterRowIndexes(g, filter);
    assert.deepEqual(names({ col: 0, op: 'contains', value: 'an' }), [0, 2]);
    assert.deepEqual(names({ col: 0, op: 'equals', value: 'ann' }), [0, 2]);
    assert.deepEqual(names({ col: 0, op: 'equals', value: 'Ann', caseSensitive: true }), [0]);
    assert.deepEqual(names({ col: 1, op: 'gt', value: '10' }), [0, 3]);
    assert.deepEqual(names({ col: 1, op: 'lte', value: '7' }), [1]);
    assert.deepEqual(names({ col: 1, op: 'empty', value: '' }), [2]);
    assert.deepEqual(names({ col: 1, op: 'notEmpty', value: '' }), [0, 1, 3]);
    assert.equal(rowMatches(g, g.rows[0], null), true);
    assert.equal(rowMatches(g, g.rows[0], { col: 9, op: 'contains', value: 'x' }), true);
    assert.equal(rowMatchesFilter(g.rows[0], { col: 1, op: 'gt', value: 'nope' }), false);
  });

  it('sort keeps nulls last', () => {
    const g: GridData = { cols: [{ name: 'A', type: 'num' }], rows: [['3'], [''], ['1']] };
    const out = sortByColumn(g, 0, 'asc');
    assert.deepEqual(out.rows.map((r) => r[0]), ['1', '3', '']);
  });

  it('recode maps values', () => {
    const g: GridData = { cols: [{ name: 'G', type: 'str' }], rows: [['1'], ['2']] };
    const { changed, grid } = recodeColumn(g, 0, { '1': 'Yes', '2': 'No' });
    assert.equal(changed, 2);
    assert.equal(grid.rows[0][0], 'Yes');
  });

  it('split and merge roundtrip', () => {
    const g: GridData = { cols: [{ name: 'A', type: 'str' }], rows: [['x;y']] };
    const split = splitColumn(g, 0, ';');
    assert.equal(split.cols.length, 2);
    assert.equal(split.rows[0][1], 'y');
    const merged = mergeColumns(split, 0, 1, ';', 'A');
    assert.equal(merged.cols.length, 1);
    assert.equal(merged.rows[0][0], 'x;y');
  });

  it('compute adds column', () => {
    const g: GridData = {
      cols: [{ name: 'A', type: 'num' }, { name: 'B', type: 'num' }],
      rows: [['3', '1']],
    };
    const { grid, error } = computeColumn(g, 'A - B', 'Diff', { A: 0, B: 1 });
    assert.equal(error, undefined);
    assert.equal(grid.cols.length, 3);
    assert.equal(grid.rows[0][2], '2');
  });

  it('guards out of range indexes', () => {
    const g = demo();
    assert.equal(sortByColumn(g, 99, 'asc'), g);
    assert.deepEqual(recodeColumn(g, -1, { a: 'b' }).grid, g);
    assert.equal(splitColumn(g, 9, ';'), g);
    assert.equal(mergeColumns(g, 0, 9, '_'), g);
    assert.equal(fillMissing(g, 5, 'mean').filled, 0);
    assert.equal(pasteTsvAt(g, 0, 0, []), g);
  });

  it('paste clamps anchor', () => {
    const g = demo();
    const out = pasteTsvAt(g, 99, -5, [['x']]);
    assert.equal(out.rows[out.rows.length - 1][0], 'x');
  });

  it('deleteRow keeps at least one row', () => {
    const g: GridData = { cols: [{ name: 'A', type: 'str' }], rows: [['a']] };
    assert.equal(deleteRow(g, 0).rows.length, 1);
  });

  it('coerce handles num trim-only and thousands', () => {
    assert.equal(coerceValue('  12  ', 'num'), '12');
    assert.equal(coerceValue('1,5', 'num'), '1,5');
    assert.equal(coerceValue('1.234,56', 'dec'), '1234.56');
    assert.equal(coerceValue('1,234.56', 'dec'), '1234.56');
    assert.equal(coerceValue(' 3 ', 'int'), '3');
  });

  it('regex replacement treats $ literally', () => {
    const g: GridData = { cols: [{ name: 'A', type: 'str' }], rows: [['abc']] };
    const { grid, count } = findReplace(g, 'b', '$$', { regex: true });
    assert.equal(count, 1);
    assert.equal(grid.rows[0][0], 'a$$c');
  });

  it('dedupe normalizes ragged rows', () => {
    const g: GridData = {
      cols: [{ name: 'A', type: 'str' }, { name: 'B', type: 'str' }],
      rows: [['x'], ['x', '']],
    };
    assert.equal(removeDuplicateRows(g).removed, 1);
  });

  it('compute rejects unsafe expressions', () => {
    const g: GridData = { cols: [{ name: 'A', type: 'num' }], rows: [['1']] };
    assert.match(computeColumn(g, 'A.constructor', 'X', { A: 0 }).error ?? '', /Unsafe|Unknown/);
    assert.match(computeColumn(g, 'nosuch + 1', 'X', { A: 0 }).error ?? '', /Unknown/);
    assert.match(computeColumn(g, 'A'.repeat(600), 'X', { A: 0 }).error ?? '', /too long/);
  });

  it('compute ignores dangerous column names', () => {
    const g: GridData = { cols: [{ name: 'A', type: 'num' }], rows: [['4']] };
    const { grid, error } = computeColumn(g, 'A * 2', 'X', { A: 0, __proto__: 0 } as Record<string, number>);
    assert.equal(error, undefined);
    assert.equal(grid.rows[0][1], '8');
  });

  it('merge keeps name when unambiguous', () => {
    const g: GridData = {
      cols: [{ name: 'A', type: 'str' }, { name: 'B', type: 'str' }],
      rows: [['x', 'y']],
    };
    const out = mergeColumns(g, 0, 1, ';', 'A');
    assert.equal(out.cols[0].name, 'A');
    assert.equal(out.rows[0][0], 'x;y');
  });

  it('fill down clamps out-of-range selection', () => {
    const g: GridData = {
      cols: [{ name: 'A', type: 'str' }],
      rows: [['top'], ['']],
    };
    const out = fillDownRange(g, { r0: 0, c0: 0, r1: 99, c1: 99 });
    assert.equal(out.rows[1][0], 'top');
  });

  it('fill down preserves ragged row width', () => {
    const g: GridData = {
      cols: [{ name: 'A', type: 'str' }, { name: 'B', type: 'str' }],
      rows: [['top', 't2'], ['x']],
    };
    const out = fillDownRange(g, { r0: 0, c0: 0, r1: 1, c1: 1 });
    assert.deepEqual(out.rows[1], ['top']);
  });

  it('clear range preserves ragged row width', () => {
    const g: GridData = {
      cols: [{ name: 'A', type: 'str' }, { name: 'B', type: 'str' }],
      rows: [['a', 'b'], ['c']],
    };
    const out = clearRange(g, { r0: 0, c0: 0, r1: 5, c1: 5 });
    assert.deepEqual(out.rows[1], ['']);
  });
});
