import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectDelimiter, detectFormat, detectHeader, looksLikeJson } from './detect';
import { readDelimitedTable, readJsonTable } from './readers';
import { buildSpsSyntax, serializeTable } from './writers';

describe('io detect', () => {
  it('scores delimiters by consistency', () => {
    assert.equal(detectDelimiter('a,b,c\n1,2,3\n4,5,6\n').delimiter, ',');
    assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3\n').delimiter, '\t');
    assert.equal(detectDelimiter('a|b|c\n1|2|3\n').delimiter, '|');
  });

  it('detects header confidence', () => {
    const withHeader = detectHeader([['Name', 'Score'], ['Ann', '12'], ['Bob', '9']]);
    assert.equal(withHeader.hasHeader, true);
    const without = detectHeader([['1', '2'], ['3', '4']]);
    assert.equal(without.hasHeader, false);
  });

  it('detects italian semicolon files with decimal comma', () => {
    const d = detectFormat('dati.csv', 'Gruppo;Peso\nA;12,5\nB;13,75\n');
    assert.equal(d.delimiter, ';');
    assert.equal(d.decimalComma, true);
    assert.equal(d.hasHeader, true);
  });

  it('recognizes json payloads', () => {
    assert.equal(looksLikeJson('[{"a":1}]'), true);
    assert.equal(looksLikeJson('a,b\n1,2'), false);
  });
});

describe('io readers', () => {
  it('reads italian csv into typed table', () => {
    const t = readDelimitedTable('Gruppo;Peso\nA;12,5\nB;13,75\n', { delimiter: ';', hasHeader: true, decimalComma: true });
    assert.deepEqual(t.names, ['Gruppo', 'Peso']);
    assert.equal(t.rows[0][1], '12.5');
  });

  it('dedupes headers and enforces no silent loss', () => {
    const t = readDelimitedTable('A,A,a\n1,2,3\n', { delimiter: ',', hasHeader: true });
    assert.deepEqual(t.names, ['A', 'A_2', 'a_3']);
    assert.equal(t.renamedDupes, 2);
  });

  it('reads json array of objects', () => {
    const t = readJsonTable('[{"x":1,"y":"a"},{"x":2}]');
    assert.deepEqual(t.names, ['x', 'y']);
    assert.equal(t.rows[1][1], '');
  });

  it('infers numeric types without header', () => {
    const t = readDelimitedTable('1,2.5\n3,4.5\n', { delimiter: ',', hasHeader: false });
    assert.deepEqual(t.names, ['Var1', 'Var2']);
    assert.deepEqual(t.types, ['int', 'dec']);
    assert.equal(t.rows.length, 2);
  });

  it('maps tab id to tab character', () => {
    const t = readDelimitedTable('A\tB\n1\t2\n', { delimiter: 'tab', hasHeader: true });
    assert.deepEqual(t.names, ['A', 'B']);
  });

  it('counts skipped empty rows', () => {
    const t = readDelimitedTable('A,B\n1,2\n\n3,4\n', { delimiter: ',', hasHeader: true });
    assert.equal(t.skippedEmpty, 1);
    assert.equal(t.rows.length, 2);
  });

  it('rejects oversized input', () => {
    const wide = [new Array(501).fill('1').join(',')].join('\n');
    assert.throws(() => readDelimitedTable(wide, { delimiter: ',', hasHeader: false }), /Too many columns/);
  });
});

describe('io writers', () => {
  it('round-trips csv with quotes', () => {
    const { content } = serializeTable(['A', 'B'], [['x,y', 'hi']], {
      format: 'csv', delimiter: ',', decimalSeparator: '.', includeHeader: true, dropEmptyRows: true,
    });
    assert.ok(content.includes('"x,y"'));
  });

  it('writes decimal comma exports', () => {
    const { content } = serializeTable(['P'], [['12.5']], {
      format: 'csv', delimiter: ';', decimalSeparator: ',', includeHeader: true, dropEmptyRows: true,
    });
    assert.ok(content.includes('12,5'));
  });

  it('builds spss syntax companion', () => {
    const sps = buildSpsSyntax('lazstats.csv', ['Age', 'Group Name'], ['int', 'str'], {
      format: 'spss', delimiter: ',', decimalSeparator: '.', includeHeader: true, dropEmptyRows: true,
    });
    assert.ok(sps.includes('GET DATA'));
    assert.ok(sps.includes('GROUP_NAME'));
  });

  it('dedupes colliding spss names', () => {
    const sps = buildSpsSyntax('lazstats.csv', ['a-b', 'a b'], ['str', 'str'], {
      format: 'spss', delimiter: ',', decimalSeparator: '.', includeHeader: true, dropEmptyRows: true,
    });
    assert.ok(sps.includes('A_B (A64)'));
    assert.ok(sps.includes('A_B_2 (A64)'));
  });

  it('exports without header preserving quoted newlines', () => {
    const { content } = serializeTable(['A', 'B'], [['line1\nline2', 'x']], {
      format: 'csv', delimiter: ',', decimalSeparator: '.', includeHeader: false, dropEmptyRows: true,
    });
    assert.ok(content.includes('"line1\nline2"'));
    assert.ok(!content.startsWith(','));
  });

  it('keeps a forced numeric header as names', () => {
    const t = readDelimitedTable('2020,2021\n1,2\n3,4\n', { delimiter: ',', hasHeader: true });
    assert.deepEqual(t.names, ['2020', '2021']);
    assert.equal(t.rows.length, 2);
    assert.deepEqual(t.types, ['int', 'int']);
  });

  it('pads ragged rows to full width', () => {
    const t = readDelimitedTable('A,B,C\n1,2\n3,4,5,6\n', { delimiter: ',', hasHeader: true });
    assert.deepEqual(t.names, ['A', 'B', 'C', 'Var4']);
    assert.equal(t.rows[0][2], '');
    assert.equal(t.rows[1][3], '6');
  });

  it('rejects empty json arrays', () => {
    assert.throws(() => readJsonTable('[]'), /No data rows/);
  });

  it('pads ragged json arrays', () => {
    const t = readJsonTable('[[1,2],[3]]');
    assert.deepEqual(t.names, ['Var1', 'Var2']);
    assert.equal(t.rows[1][1], '');
  });
});
