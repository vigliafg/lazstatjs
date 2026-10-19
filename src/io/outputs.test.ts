import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MAX_SINGLE_OUTPUT_CHARS,
  MAX_STORED_OUTPUTS,
  MAX_STORED_OUTPUT_CHARS,
  capStoredOutputs,
  extractOutputTitle,
  parseStoredOutputs,
  type StoredOutput,
} from './outputs';
import {
  createProjectSnapshot,
  DEFAULT_PARAMS,
  DEFAULT_SETTINGS,
  parseProject,
  serializeProject,
} from './project';
import { DEFAULT_PREFS } from './prefs';
import { ResultTables } from '../components/ResultTable';
import type { TableSpec } from '../stats/types';
import type { GridData } from '../grid/types';

const entry = (index: number, length = 10): StoredOutput => ({
  id: `run-${index}`,
  title: `Run ${index}`,
  createdAt: `2026-10-19T10:00:${String(index).padStart(2, '0')}.000Z`,
  html: 'x'.repeat(length),
});

describe('output title extraction', () => {
  it('reads the first output-title from rendered markup', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        'div',
        { className: 'output-block' },
        React.createElement('div', { className: 'output-title' }, 'One-Sample T-Test & Wilcoxon'),
        React.createElement('p', null, 'body')
      )
    );
    assert.equal(extractOutputTitle(html), 'One-Sample T-Test & Wilcoxon');
  });

  it('falls back when the block has no title', () => {
    assert.equal(extractOutputTitle('<div><p>no title</p></div>'), 'Analysis output');
  });
});

describe('output snapshots sizing', () => {
  it('keeps the newest blocks within the count budget', () => {
    const many = Array.from({ length: MAX_STORED_OUTPUTS + 5 }, (_, i) => entry(i));
    const capped = capStoredOutputs(many);
    assert.equal(capped.length, MAX_STORED_OUTPUTS);
    assert.equal(capped[capped.length - 1].id, `run-${MAX_STORED_OUTPUTS + 4}`);
    assert.equal(capped[0].id, 'run-5');
  });

  it('keeps the newest blocks within the character budget', () => {
    const size = 400_000; // 3 × 400k fit, the 4th would exceed 1.5M
    const many = Array.from({ length: 6 }, (_, i) => entry(i, size));
    const capped = capStoredOutputs(many);
    assert.equal(capped.length, 3);
    assert.equal(capped[capped.length - 1].id, 'run-5');
  });

  it('always keeps the newest block even when it is the largest', () => {
    const capped = capStoredOutputs([entry(0, 10), entry(1, MAX_STORED_OUTPUT_CHARS)]);
    assert.equal(capped.length, 1);
    assert.equal(capped[0].id, 'run-1');
  });
});

describe('output snapshot validation', () => {
  it('ignores non-arrays and malformed entries', () => {
    assert.deepEqual(parseStoredOutputs(undefined), []);
    assert.deepEqual(parseStoredOutputs('html'), []);
    assert.deepEqual(parseStoredOutputs([null, 3, { html: 7 }, { html: '' }]), []);
  });

  it('drops a single oversized snapshot and defaults missing metadata', () => {
    const parsed = parseStoredOutputs([
      { html: 'ok' },
      { html: 'x'.repeat(MAX_SINGLE_OUTPUT_CHARS + 1) },
    ]);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].html, 'ok');
    assert.equal(parsed[0].id, 'run-1');
    assert.equal(parsed[0].title, 'Analysis output');
  });

  it('caps a hostile array before it reaches the app', () => {
    const many = Array.from({ length: 60 }, (_, i) => entry(i, 100));
    assert.equal(parseStoredOutputs(many).length, MAX_STORED_OUTPUTS);
  });
});

describe('output snapshots in project files', () => {
  const grid: GridData = {
    cols: [{ name: 'Score', type: 'num' }],
    rows: [['1'], ['2'], ['3']],
  };

  const table: TableSpec = {
    id: 'sample',
    title: 'Sample',
    columns: [
      { key: 'mean', label: 'Mean', format: 'dec3' },
      { key: 'n', label: 'N', format: 'int' },
    ],
    rows: [{ mean: 2, n: 3 }],
  };

  it('round-trips the rendered console through a .lzs file', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        'div',
        { className: 'output-block' },
        React.createElement('div', { className: 'output-title' }, 'Descriptive Statistics'),
        React.createElement(ResultTables, { specs: [table] })
      )
    );
    const stored: StoredOutput = {
      id: 'run-1',
      title: extractOutputTitle(html),
      createdAt: '2026-10-19T10:00:00.000Z',
      html,
    };
    const snapshot = createProjectSnapshot({
      grid,
      prefs: DEFAULT_PREFS,
      settings: DEFAULT_SETTINGS,
      params: DEFAULT_PARAMS,
      outputs: [stored],
    });
    const restored = parseProject(serializeProject(snapshot));
    assert.equal(restored.outputs.length, 1);
    assert.equal(restored.outputs[0].title, 'Descriptive Statistics');
    assert.ok(restored.outputs[0].html.includes('<table'));
    assert.ok(restored.outputs[0].html.includes('Mean'));
  });

  it('keeps legacy projects without outputs readable', () => {
    const snapshot = createProjectSnapshot({
      grid,
      prefs: DEFAULT_PREFS,
      settings: DEFAULT_SETTINGS,
      params: DEFAULT_PARAMS,
    });
    assert.deepEqual(snapshot.outputs, []);
    const raw = JSON.parse(serializeProject(snapshot));
    delete raw.outputs;
    assert.deepEqual(parseProject(JSON.stringify(raw)).outputs, []);
  });
});
