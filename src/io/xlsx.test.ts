import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  buildDataWorkbook,
  readXlsxSheets,
  sanitizeSheetName,
  writeWorkbook,
  xlsxSheetToTable,
} from './xlsx';
import type { GridData } from '../grid/types';

describe('xlsx import', () => {
  it('round-trips sheets and keeps text values', () => {
    const bytes = writeWorkbook([
      { name: 'Dati', rows: [['Nome', 'Peso'], ['Ann', 12.5], ['Bob', 13]] },
      { name: 'Note', rows: [['ok']] },
    ]);
    const sheets = readXlsxSheets(bytes);
    assert.deepEqual(sheets.map((sheet) => sheet.name), ['Dati', 'Note']);
    assert.deepEqual(sheets[0].rows, [
      ['Nome', 'Peso'],
      ['Ann', '12.5'],
      ['Bob', '13'],
    ]);
  });

  it('builds a typed table with deduped headers', () => {
    const bytes = writeWorkbook([
      { name: 'Dati', rows: [['A', 'A', 'B'], [1, 2, 3], [4, 5, 6]] },
    ]);
    const [sheet] = readXlsxSheets(bytes);
    const table = xlsxSheetToTable(sheet, { hasHeader: true });
    assert.deepEqual(table.names, ['A', 'A_2', 'B']);
    assert.deepEqual(table.types, ['int', 'int', 'int']);
    assert.equal(table.rows.length, 2);
  });

  it('treats the first row as data when no header is selected', () => {
    const bytes = writeWorkbook([{ name: 'Dati', rows: [[1, 2], [3, 4]] }]);
    const [sheet] = readXlsxSheets(bytes);
    const table = xlsxSheetToTable(sheet, { hasHeader: false });
    assert.deepEqual(table.names, ['Var1', 'Var2']);
    assert.equal(table.rows.length, 2);
  });

  it('rejects an empty workbook', () => {
    assert.throws(() => readXlsxSheets(new Uint8Array()), /workbook|Unsupported|File is empty/i);
  });
});

describe('xlsx export', () => {
  const grid: GridData = {
    cols: [
      { name: 'Gruppo', type: 'str' },
      { name: 'Peso', type: 'dec' },
      { name: 'Eta', type: 'int' },
    ],
    rows: [
      ['A', '12.5', '31'],
      ['B', '13,75', '42'],
      ['', '', ''],
    ],
  };

  it('writes numeric columns as real numeric cells', () => {
    const bytes = buildDataWorkbook(grid, { includeHeader: true, dropEmptyRows: true });
    const workbook = XLSX.read(bytes, { type: 'array' });
    const data = workbook.Sheets['Dati'];
    assert.equal(data['A2'].v, 'A');
    assert.equal(data['B2'].t, 'n');
    assert.equal(data['B2'].v, 12.5);
    assert.equal(data['C3'].v, 42);
    // Empty row dropped: only header + 2 rows are written.
    assert.equal(data['!ref'], 'A1:C3');
  });

  it('skips the header when requested', () => {
    const bytes = buildDataWorkbook(grid, { includeHeader: false, dropEmptyRows: true });
    const workbook = XLSX.read(bytes, { type: 'array' });
    assert.equal(workbook.Sheets['Dati']['A1'].v, 'A');
  });

  it('adds non-data sheets to the same workbook', () => {
    const bytes = writeWorkbook([
      { name: 'Dati', rows: [['x']] },
      { name: 'ANOVA: effetti [principali]', rows: [['F', 3.2]] },
    ]);
    const names = readXlsxSheets(bytes).map((sheet) => sheet.name);
    assert.equal(names[0], 'Dati');
    assert.equal(names[1], 'ANOVA effetti principali');
  });

  it('sanitizes sheet names and keeps them unique', () => {
    assert.equal(sanitizeSheetName('a/b:c*d?e[f]'), 'a b c d e f');
    assert.ok(sanitizeSheetName('x'.repeat(50)).length <= 31);
    const names = readXlsxSheets(
      writeWorkbook([
        { name: 'Test', rows: [['1']] },
        { name: 'test', rows: [['2']] },
      ])
    ).map((sheet) => sheet.name);
    assert.deepEqual(names, ['Test', 'test_2']);
  });
});
