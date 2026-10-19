import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tableToTsv } from './tableTsv';
import { buildReportDocument } from './reportExport';
import type { TableSpec } from '../stats/types';

const spec: TableSpec = {
  id: 't1',
  title: 'Descriptives',
  columns: [
    { key: 'name', label: 'Variable', format: 'text' },
    { key: 'mean', label: 'Mean', format: 'dec3' },
    { key: 'p', label: 'p', format: 'p' },
  ],
  rows: [
    { name: 'Score', mean: 12.34567, p: 0.0004 },
    { name: 'Peso', mean: 70, p: 0.5 },
  ],
};

describe('tableToTsv', () => {
  it('serialises formatted values with a header row', () => {
    assert.equal(
      tableToTsv(spec),
      ['Variable\tMean\tp', 'Score\t12.346\t< 0.001', 'Peso\t70.000\t0.500'].join('\n')
    );
  });

  it('quotes tabs, newlines and quotes', () => {
    const tricky: TableSpec = {
      id: 't2',
      title: 'Tricky',
      columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
      rows: [{ a: 'x\ty', b: 'say "hi"' }, { a: 'line\nbreak', b: '' }],
    };
    assert.equal(
      tableToTsv(tricky),
      ['A\tB', '"x\ty"\t"say ""hi"""', '"line\nbreak"\t—'].join('\n')
    );
  });

  it('keeps empty tables to a header row', () => {
    assert.equal(tableToTsv({ ...spec, rows: [] }), 'Variable\tMean\tp');
  });
});

describe('buildReportDocument', () => {
  it('escapes the title and metadata', () => {
    const html = buildReportDocument('<p>body</p>', {
      title: 'Report <A&B>',
      generatedAt: '2026-10-19 10:00',
      details: ['20 rows', '4 columns'],
    });
    assert.match(html, /<title>Report &lt;A&amp;B&gt;<\/title>/);
    assert.match(html, /Report &lt;A&amp;B&gt;/);
    assert.match(html, /20 rows · 4 columns/);
    assert.ok(html.includes('<p>body</p>'));
  });

  it('is a standalone printable document', () => {
    const html = buildReportDocument('', { title: 'LazStats', generatedAt: 'now' });
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(html.includes('@media print'));
    assert.ok(html.includes('@page'));
  });
});
