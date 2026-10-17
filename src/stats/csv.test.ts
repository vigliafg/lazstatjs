import test from 'node:test';
import assert from 'node:assert/strict';
import { csvToTable, detectDelimiter, parseCsv, toCsv, trimEmptyRows } from '../csv';

test('parses quoted fields with embedded delimiters, quotes and newlines', () => {
  const text = 'name,value\n"Smith, J.",10\n"say ""hi""",20\n"multi\nline",30\n';
  const rows = parseCsv(text);
  assert.deepEqual(rows, [
    ['name', 'value'],
    ['Smith, J.', '10'],
    ['say "hi"', '20'],
    ['multi\nline', '30'],
  ]);
});

test('detects semicolons and normalises decimal commas', () => {
  const text = 'Gruppo;Peso;Note\nA;12,5;ok\nB;13,75;ok\n';
  assert.equal(detectDelimiter(text), ';');
  const table = csvToTable(parseCsv(text));
  assert.deepEqual(table.names, ['Gruppo', 'Peso', 'Note']);
  assert.deepEqual(table.types, ['str', 'dec', 'str']);
  assert.equal(table.rows[0][1], '12.5');
  assert.equal(table.rows[1][1], '13.75');
});

test('infers column types and keeps header-less files usable', () => {
  const table = csvToTable([
    ['Group', 'Score', 'Flag', 'Date'],
    ['A', '1', '0', '2024-01-31'],
    ['B', '2', '1', '2024-02-01'],
  ]);
  assert.deepEqual(table.types, ['str', 'int', 'int', 'dat']);

  const headerless = csvToTable([
    ['1', '2'],
    ['3', '4'],
  ]);
  assert.deepEqual(headerless.names, ['Var1', 'Var2']);
  assert.deepEqual(headerless.types, ['int', 'int']);
  assert.equal(headerless.rows.length, 2);
});

test('serialises back to a round-trippable CSV', () => {
  const names = ['A', 'B'];
  const rows = [
    ['x,y', 'say "hi"'],
    ['1', ''],
  ];
  const csv = toCsv(names, rows);
  assert.equal(csv, 'A,B\n"x,y","say ""hi"""\n1,');

  const parsed = parseCsv(csv);
  assert.deepEqual(parsed[1], ['x,y', 'say "hi"']);
  assert.deepEqual(parsed[2], ['1', '']);
});

test('empty trailing rows are not exported', () => {
  assert.deepEqual(trimEmptyRows([['1', ''], ['', ''], ['', '  ']]), [['1', '']]);
});
