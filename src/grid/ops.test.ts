import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addColumnEnd, insertColumnAt, duplicateColumn, moveColumn, deleteColumn,
  insertRowAt, deleteRow, clearGrid, pasteTsvAt, parseTsv, fillDownRange,
  coerceGrid, findReplace, trimGrid, removeEmptyRows, removeDuplicateRows,
  fillMissing, findInvalid, sortByColumn, recodeColumn, splitColumn,
  mergeColumns, computeColumn,
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
    assert.equal(removeDuplicateRows(g).removed, 1);
    assert.equal(removeEmptyRows(g).removed, 1);
  });

  it('fill missing with mean', () => {
    const g: GridData = { cols: [{ name: 'A', type: 'num' }], rows: [['2'], ['4'], ['']] };
    const { filled, fillWith } = fillMissing(g, 0, 'mean');
    assert.equal(filled, 1);
    assert.equal(fillWith, '3');
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
});
