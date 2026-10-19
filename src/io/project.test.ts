import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PARAMS,
  DEFAULT_SETTINGS,
  MAX_AUTOSAVE_CHARS,
  PROJECT_STORAGE_KEY,
  clearAutosaveProject,
  createProjectSnapshot,
  loadAutosaveProject,
  parseGrid,
  parseProject,
  saveAutosaveProject,
  serializeProject,
} from './project';
import { DEFAULT_PREFS } from './prefs';
import type { GridData } from '../grid/types';

const grid: GridData = {
  cols: [
    { name: 'Score', type: 'num' },
    { name: 'Group', type: 'int' },
    { name: 'Age', type: 'int' },
  ],
  rows: [
    ['12.5', '1', '30'],
    ['8', '2', '41'],
  ],
};

const makeSnapshot = () =>
  createProjectSnapshot(
    {
      grid,
      prefs: DEFAULT_PREFS,
      settings: { ciLevel: 99, activeAnalysis: 'ttest', activeTab: 'analysis' },
      params: DEFAULT_PARAMS,
    },
    '2026-10-19T10:00:00.000Z'
  );

describe('project snapshot roundtrip', () => {
  it('serialises and restores grid, settings and params', () => {
    const restored = parseProject(serializeProject(makeSnapshot()));
    assert.deepEqual(restored.grid, grid);
    assert.equal(restored.savedAt, '2026-10-19T10:00:00.000Z');
    assert.equal(restored.settings.ciLevel, 99);
    assert.equal(restored.settings.activeAnalysis, 'ttest');
    assert.equal(restored.settings.activeTab, 'analysis');
    assert.deepEqual(restored.params, DEFAULT_PARAMS);
  });

  it('rejects non-project payloads', () => {
    assert.throws(() => parseProject('not json'), /invalid JSON/);
    assert.throws(() => parseProject('[]'), /not a valid/i);
    assert.throws(() => parseProject('{"app":"other"}'), /lazstats/i);
    assert.throws(
      () => parseProject('{"app":"lazstats","version":9}'),
      /Unsupported project version 9/
    );
    assert.throws(() => parseProject('{"app":"lazstats"}'), /no version/);
  });

  it('requires a usable grid', () => {
    const base = makeSnapshot();
    assert.throws(() => parseProject(JSON.stringify({ ...base, grid: { cols: [], rows: [] } })), /no columns/);
    assert.throws(() => parseProject(JSON.stringify({ ...base, grid: { cols: grid.cols, rows: 'x' } })), /no rows/);
  });
});

describe('project sanitisation', () => {
  it('normalises columns, cells and empty grids', () => {
    const parsed = parseGrid({
      cols: [
        { name: 'A', type: 'num' },
        { name: 'a', type: 'bogus' },
        { type: 'int' },
      ],
      rows: [['1', 2, true, 'extra'], [], 'junk'],
    });
    assert.deepEqual(parsed.cols.map((c) => c.name), ['A', 'a_2', 'Var3']);
    assert.deepEqual(parsed.cols.map((c) => c.type), ['num', 'str', 'int']);
    assert.deepEqual(parsed.rows, [
      ['1', '2', '1'],
      ['', '', ''],
      ['', '', ''],
    ]);

    const empty = parseGrid({ cols: [{ name: 'Only', type: 'str' }], rows: [] });
    assert.deepEqual(empty.rows, [['']]);
  });

  it('preserves the extended column types in a project file', () => {
    const parsed = parseGrid({
      cols: [
        { name: 'Quando', type: 'dtm' },
        { name: 'Ora', type: 'tim' },
        { name: 'Gruppo', type: 'cat' },
        { name: 'Codice', type: 'id' },
      ],
      rows: [['2026-10-19 10:00', '09:30', 'A', 'ABC-1']],
    });
    assert.deepEqual(parsed.cols.map((c) => c.type), ['dtm', 'tim', 'cat', 'id']);
  });

  it('round-trips categorical levels and the reference level', () => {
    const withLevels = createProjectSnapshot({
      grid: {
        cols: [
          {
            name: 'Gruppo',
            type: 'cat',
            levels: [
              { value: '1', label: 'Controllo' },
              { value: '2', label: 'Trattamento' },
            ],
            reference: '1',
          },
          { name: 'Score', type: 'num' },
        ],
        rows: [['1', '10'], ['2', '12']],
      },
      prefs: DEFAULT_PREFS,
      settings: DEFAULT_SETTINGS,
      params: DEFAULT_PARAMS,
    });
    const restored = parseProject(serializeProject(withLevels));
    assert.deepEqual(restored.grid.cols[0].levels, [
      { value: '1', label: 'Controllo' },
      { value: '2', label: 'Trattamento' },
    ]);
    assert.equal(restored.grid.cols[0].reference, '1');
  });

  it('sanitises invalid levels and drops a reference outside the list', () => {
    const parsed = parseGrid({
      cols: [
        {
          name: 'G',
          type: 'cat',
          levels: [
            { value: ' 1 ', label: 'A' },
            { value: '1', label: 'B' },
            { value: '', label: 'C' },
            { value: '2', label: 'a' },
          ],
          reference: '9',
        },
      ],
      rows: [['1']],
    });
    assert.deepEqual(parsed.cols[0].levels, [
      { value: '1', label: 'A' },
      { value: '2', label: 'a 2' },
    ]);
    assert.equal(parsed.cols[0].reference, undefined);
  });

  it('falls back on invalid settings and params without losing valid ones', () => {
    const base = makeSnapshot();
    const parsed = parseProject(
      JSON.stringify({
        ...base,
        settings: { ciLevel: 42, activeAnalysis: 7, activeTab: 'nope' },
        params: {
          ...DEFAULT_PARAMS,
          descVars: [1, -2, 'x', 1.9],
          corr: { ...DEFAULT_PARAMS.corr, vars: [] },
          anova: { ...DEFAULT_PARAMS.anova, kwPosthoc: 'nope' },
          ttest: { ...DEFAULT_PARAMS.ttest, type: 'bogus', mu: 'x' },
        },
      })
    );
    assert.deepEqual(parsed.settings, DEFAULT_SETTINGS);
    assert.deepEqual(parsed.params.descVars, [1]);
    assert.deepEqual(parsed.params.corr.vars, []);
    assert.equal(parsed.params.anova.kwPosthoc, 'bonferroni');
    assert.equal(parsed.params.ttest.type, 'ind');
    assert.equal(parsed.params.ttest.mu, 0);
  });

  it('clamps parameter indexes to the restored grid width', () => {
    const narrow = createProjectSnapshot(
      {
        grid: { cols: [{ name: 'Only', type: 'num' }], rows: [['1']] },
        prefs: DEFAULT_PREFS,
        settings: DEFAULT_SETTINGS,
        params: DEFAULT_PARAMS,
      },
      '2026-10-19T10:00:00.000Z'
    );
    assert.deepEqual(narrow.params.descVars, [0]);
    assert.equal(narrow.params.ttest.var2, 0);
    assert.deepEqual(narrow.params.reg.indeps, [0]);
    assert.deepEqual(narrow.params.corr.vars, [0]);
  });

  it('rejects grids above the import limits', () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ name: `C${i}`, type: 'num' }));
    assert.throws(() => parseGrid({ cols: tooMany, rows: [] }), /Too many columns/);
  });
});

class MemoryStorage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const withStorage = (run: (storage: MemoryStorage) => void) => {
  const storage = new MemoryStorage();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  try {
    run(storage);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
};

describe('project autosave', () => {
  it('roundtrips through localStorage', () => {
    withStorage(() => {
      assert.equal(saveAutosaveProject(makeSnapshot()), true);
      assert.deepEqual(loadAutosaveProject()?.grid, grid);
      clearAutosaveProject();
      assert.equal(loadAutosaveProject(), null);
    });
  });

  it('ignores corrupted or unsupported autosaves', () => {
    withStorage((storage) => {
      storage.setItem(PROJECT_STORAGE_KEY, '{oops');
      assert.equal(loadAutosaveProject(), null);
      storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({ ...makeSnapshot(), version: 99 }));
      assert.equal(loadAutosaveProject(), null);
    });
  });

  it('refuses snapshots over the autosave budget instead of throwing', () => {
    withStorage(() => {
      const huge = makeSnapshot();
      huge.grid.rows = [['x'.repeat(MAX_AUTOSAVE_CHARS)]];
      assert.equal(saveAutosaveProject(huge), false);
      assert.equal(loadAutosaveProject(), null);
    });
  });
});
