/**
 * LazStats project files (.lzs) and silent autosave.
 *
 * A snapshot contains the data grid, the IO preferences, the analysis
 * settings/parameters and static snapshots of the output console. Rendered
 * results are React nodes, so the console stores the HTML produced for each
 * run (tables, charts and report) in `src/io/outputs.ts`.
 */

import type { CategoryLevel, ColType, GridData } from '../grid/types';
import { COL_TYPES, MAX_LEVELS } from '../grid/types';
import { MAX_COLS, MAX_ROWS } from './readers';
import { normalizePrefs, type IoPreferences } from './prefs';
import {
  MAX_SINGLE_OUTPUT_CHARS,
  capStoredOutputs,
  parseStoredOutputs,
  type StoredOutput,
} from './outputs';

export const PROJECT_APP = 'lazstats';
export const PROJECT_VERSION = 1;
export const PROJECT_STORAGE_KEY = 'lazstats.project.v1';
/** Keep autosave comfortably below the ~5 MB localStorage budget. */
export const MAX_AUTOSAVE_CHARS = 4_000_000;

export type ProjectTab = 'data' | 'analysis' | 'settings' | 'help';

export interface TTestParams {
  type: 'ind' | 'dep' | 'one';
  var1: number;
  var2: number;
  mu: number;
  useNonParam: boolean;
  equalVar: boolean;
}

export interface AnovaParams {
  dep: number;
  grp: number;
  posthoc: string;
  useNonParam: boolean;
  kwPosthoc: 'none' | 'bonferroni' | 'holm';
}

export interface RegParams {
  dep: number;
  indeps: number[];
  useNonParam: boolean;
  robustEstimator: string;
}

export interface CorrParams {
  vars: number[];
  method: string;
  showSpearman: boolean;
  showKendall: boolean;
}

export interface ChiSqParams {
  row1col1: number;
  row1col2: number;
  row2col1: number;
  row2col2: number;
  row1Label: string;
  row2Label: string;
  col1Label: string;
  col2Label: string;
  runFisherExact: boolean;
}

export interface ProjectParams {
  descVars: number[];
  ttest: TTestParams;
  anova: AnovaParams;
  reg: RegParams;
  corr: CorrParams;
  chisq: ChiSqParams;
}

export interface ProjectSettings {
  ciLevel: number;
  activeAnalysis: string;
  activeTab: ProjectTab;
}

export interface ProjectSnapshot {
  app: typeof PROJECT_APP;
  version: number;
  savedAt: string;
  grid: GridData;
  prefs: IoPreferences;
  settings: ProjectSettings;
  params: ProjectParams;
  /** Static snapshots of the output console, oldest first. */
  outputs: StoredOutput[];
}

export interface ProjectInput {
  grid: GridData;
  prefs: IoPreferences;
  settings: ProjectSettings;
  params: ProjectParams;
  outputs?: StoredOutput[];
}

export const DEFAULT_PARAMS: ProjectParams = {
  descVars: [0, 1],
  ttest: { type: 'ind', var1: 0, var2: 1, mu: 0, useNonParam: true, equalVar: true },
  anova: { dep: 0, grp: 2, posthoc: 'holm', useNonParam: true, kwPosthoc: 'bonferroni' },
  reg: { dep: 1, indeps: [0], useNonParam: true, robustEstimator: 'theilsen' },
  corr: { vars: [0, 1], method: 'pearson', showSpearman: true, showKendall: true },
  chisq: {
    row1col1: 30,
    row1col2: 20,
    row2col1: 15,
    row2col2: 35,
    row1Label: 'Group A',
    row2Label: 'Group B',
    col1Label: 'Success',
    col2Label: 'Failure',
    runFisherExact: true,
  },
};

export const DEFAULT_SETTINGS: ProjectSettings = {
  ciLevel: 95,
  activeAnalysis: 'wizard',
  activeTab: 'data',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const integer = (value: unknown, fallback: number): number => Math.trunc(finite(value, fallback));

const index = (value: unknown, fallback: number, width: number): number =>
  Math.max(0, Math.min(Math.max(0, width - 1), integer(value, fallback)));

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

const indexList = (value: unknown, fallback: number[], width: number): number[] => {
  const source = Array.isArray(value) ? value : fallback;
  // Preserve an intentionally empty selection, but never let negatives,
  // non-numeric junk or indexes past the restored grid reach the panels.
  return Array.from(
    new Set(
      source
        .filter(
          (v): v is number =>
            typeof v === 'number' && Number.isFinite(v) && v >= 0 && Math.trunc(v) < width
        )
        .map((v) => Math.trunc(v))
    )
  );
};

const parseType = (value: unknown): ColType =>
  typeof value === 'string' && COL_TYPES.some((t) => t.id === value) ? (value as ColType) : 'str';

const parseCell = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return '';
};

/** Declared categorical levels from an untrusted project file. */
const parseLevels = (value: unknown): CategoryLevel[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const values = new Set<string>();
  const labels = new Set<string>();
  const out: CategoryLevel[] = [];
  for (const raw of value) {
    if (out.length >= MAX_LEVELS) break;
    if (!isRecord(raw)) continue;
    const code = typeof raw.value === 'string' || typeof raw.value === 'number' ? String(raw.value).trim() : '';
    if (code === '' || values.has(code)) continue;
    const base = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : code;
    let label = base;
    let suffix = 2;
    while (labels.has(label.toLowerCase())) {
      label = `${base} ${suffix}`;
      suffix += 1;
    }
    values.add(code);
    labels.add(label.toLowerCase());
    out.push({ value: code, label });
  }
  return out.length > 0 ? out : undefined;
};

export const parseGrid = (value: unknown): GridData => {
  if (!isRecord(value)) throw new Error('The project has no data grid');
  const colsRaw = value.cols;
  const rowsRaw = value.rows;
  if (!Array.isArray(colsRaw) || colsRaw.length === 0) throw new Error('The project grid has no columns');
  if (colsRaw.length > MAX_COLS) throw new Error(`Too many columns (${colsRaw.length} > ${MAX_COLS})`);
  if (!Array.isArray(rowsRaw)) throw new Error('The project grid has no rows');
  if (rowsRaw.length > MAX_ROWS) throw new Error(`Too many rows (${rowsRaw.length} > ${MAX_ROWS})`);

  const taken = new Set<string>();
  const cols = colsRaw.map((col, i) => {
    const record = isRecord(col) ? col : {};
    const base = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : `Var${i + 1}`;
    let name = base;
    let n = 2;
    while (taken.has(name.toLowerCase())) {
      name = `${base}_${n}`;
      n += 1;
    }
    taken.add(name.toLowerCase());
    const levels = parseLevels(record.levels);
    const reference =
      levels && typeof record.reference === 'string' && levels.some((level) => level.value === record.reference)
        ? record.reference
        : undefined;
    return {
      name,
      type: parseType(record.type),
      ...(levels ? { levels } : {}),
      ...(reference ? { reference } : {}),
    };
  });

  const width = cols.length;
  const rows = rowsRaw.map((row) => {
    const cells = Array.isArray(row) ? row : [];
    return cols.map((_, i) => parseCell(cells[i]));
  });
  return { cols, rows: rows.length ? rows : [new Array(width).fill('')] };
};

const parseParams = (value: unknown, width: number): ProjectParams => {
  const raw = isRecord(value) ? value : {};
  const ttest = isRecord(raw.ttest) ? raw.ttest : {};
  const anova = isRecord(raw.anova) ? raw.anova : {};
  const reg = isRecord(raw.reg) ? raw.reg : {};
  const corr = isRecord(raw.corr) ? raw.corr : {};
  const chisq = isRecord(raw.chisq) ? raw.chisq : {};
  const d = DEFAULT_PARAMS;

  return {
    descVars: indexList(raw.descVars, d.descVars, width),
    ttest: {
      type: ttest.type === 'ind' || ttest.type === 'dep' || ttest.type === 'one' ? ttest.type : d.ttest.type,
      var1: index(ttest.var1, d.ttest.var1, width),
      var2: index(ttest.var2, d.ttest.var2, width),
      mu: finite(ttest.mu, d.ttest.mu),
      useNonParam: bool(ttest.useNonParam, d.ttest.useNonParam),
      equalVar: bool(ttest.equalVar, d.ttest.equalVar),
    },
    anova: {
      dep: index(anova.dep, d.anova.dep, width),
      grp: index(anova.grp, d.anova.grp, width),
      posthoc: text(anova.posthoc, d.anova.posthoc),
      useNonParam: bool(anova.useNonParam, d.anova.useNonParam),
      kwPosthoc:
        anova.kwPosthoc === 'none' || anova.kwPosthoc === 'bonferroni' || anova.kwPosthoc === 'holm'
          ? anova.kwPosthoc
          : d.anova.kwPosthoc,
    },
    reg: {
      dep: index(reg.dep, d.reg.dep, width),
      indeps: indexList(reg.indeps, d.reg.indeps, width),
      useNonParam: bool(reg.useNonParam, d.reg.useNonParam),
      robustEstimator: text(reg.robustEstimator, d.reg.robustEstimator),
    },
    corr: {
      vars: indexList(corr.vars, d.corr.vars, width),
      method: text(corr.method, d.corr.method),
      showSpearman: bool(corr.showSpearman, d.corr.showSpearman),
      showKendall: bool(corr.showKendall, d.corr.showKendall),
    },
    chisq: {
      row1col1: finite(chisq.row1col1, d.chisq.row1col1),
      row1col2: finite(chisq.row1col2, d.chisq.row1col2),
      row2col1: finite(chisq.row2col1, d.chisq.row2col1),
      row2col2: finite(chisq.row2col2, d.chisq.row2col2),
      row1Label: text(chisq.row1Label, d.chisq.row1Label),
      row2Label: text(chisq.row2Label, d.chisq.row2Label),
      col1Label: text(chisq.col1Label, d.chisq.col1Label),
      col2Label: text(chisq.col2Label, d.chisq.col2Label),
      runFisherExact: bool(chisq.runFisherExact, d.chisq.runFisherExact),
    },
  };
};

const parseSettings = (value: unknown): ProjectSettings => {
  const raw = isRecord(value) ? value : {};
  const ci = finite(raw.ciLevel, DEFAULT_SETTINGS.ciLevel);
  const activeTab = raw.activeTab;
  return {
    ciLevel: ci === 90 || ci === 95 || ci === 99 ? ci : DEFAULT_SETTINGS.ciLevel,
    activeAnalysis: text(raw.activeAnalysis, DEFAULT_SETTINGS.activeAnalysis),
    activeTab:
      activeTab === 'analysis' || activeTab === 'settings' || activeTab === 'data' || activeTab === 'help'
        ? activeTab
        : DEFAULT_SETTINGS.activeTab,
  };
};

export const createProjectSnapshot = (input: ProjectInput, savedAt = new Date().toISOString()): ProjectSnapshot => ({
  app: PROJECT_APP,
  version: PROJECT_VERSION,
  savedAt,
  grid: {
    cols: input.grid.cols.map((col) => ({
      ...col,
      levels: col.levels?.map((level) => ({ ...level })),
    })),
    rows: input.grid.rows.map((row) => [...row]),
  },
  prefs: { ...input.prefs },
  settings: { ...input.settings },
  params: parseParams(input.params, input.grid.cols.length),
  outputs: capStoredOutputs(
    (input.outputs ?? [])
      .filter((entry) => entry.html.length > 0 && entry.html.length <= MAX_SINGLE_OUTPUT_CHARS)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        createdAt: entry.createdAt,
        html: entry.html,
      }))
  ),
});

export const serializeProject = (snapshot: ProjectSnapshot): string => JSON.stringify(snapshot, null, 2);

/** Throws a user-facing Error when the file is not a valid LazStats project. */
export const parseProject = (text: string): ProjectSnapshot => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not a valid .lzs file (invalid JSON)');
  }
  if (!isRecord(raw)) throw new Error('Not a valid .lzs project');
  if (raw.app !== PROJECT_APP) throw new Error('Not a LazStats project file');
  if (raw.version !== PROJECT_VERSION) {
    throw new Error(
      typeof raw.version === 'number'
        ? `Unsupported project version ${raw.version} (expected ${PROJECT_VERSION})`
        : 'The project file has no version'
    );
  }

  const grid = parseGrid(raw.grid);
  return {
    app: PROJECT_APP,
    version: PROJECT_VERSION,
    savedAt:
      typeof raw.savedAt === 'string' && Number.isFinite(Date.parse(raw.savedAt))
        ? raw.savedAt
        : new Date().toISOString(),
    grid,
    prefs: normalizePrefs(isRecord(raw.prefs) ? (raw.prefs as Partial<IoPreferences>) : {}),
    settings: parseSettings(raw.settings),
    params: parseParams(raw.params, grid.cols.length),
    outputs: parseStoredOutputs(raw.outputs),
  };
};

const getStorage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export const loadAutosaveProject = (): ProjectSnapshot | null => {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PROJECT_STORAGE_KEY);
    return raw ? parseProject(raw) : null;
  } catch {
    return null;
  }
};

/** Serialize once and store, for callers that already compare the payload. */
export const saveAutosaveText = (text: string): boolean => {
  const storage = getStorage();
  if (!storage) return false;
  try {
    if (text.length > MAX_AUTOSAVE_CHARS) return false;
    storage.setItem(PROJECT_STORAGE_KEY, text);
    return true;
  } catch {
    return false;
  }
};

/** Returns false when autosave is unavailable, over quota or the data is too large. */
export const saveAutosaveProject = (snapshot: ProjectSnapshot): boolean =>
  saveAutosaveText(serializeProject(snapshot));

export const clearAutosaveProject = (): void => {
  const storage = getStorage();
  try {
    storage?.removeItem(PROJECT_STORAGE_KEY);
  } catch {
    // Private mode: nothing to clear.
  }
};
