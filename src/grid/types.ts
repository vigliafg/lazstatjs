/** Shared data-grid types. Analyses only rely on `{ cols: { name }[]; rows }`,
 *  so extending Column here stays structurally compatible. */

export type ColType =
  | 'num'
  | 'int'
  | 'dec'
  | 'cat'
  | 'str'
  | 'id'
  | 'bol'
  | 'dat'
  | 'dtm'
  | 'tim'
  | 'alp'
  | 'chr';

/** One stored code plus the label shown in tables, charts and pickers. */
export interface CategoryLevel {
  value: string;
  label: string;
}

export interface Column {
  name: string;
  type: ColType;
  /** Declared categorical levels (code + label), in display order. */
  levels?: CategoryLevel[];
  /** Value used as the reference level in model-based analyses. */
  reference?: string;
}

export interface GridData {
  cols: Column[];
  rows: string[][];
}

export interface ColTypeDef {
  id: ColType;
  label: string;
  full: string;
  regex: RegExp;
}

/**
 * Column types. `label` is the compact code shown in the grid header, `full`
 * the explanation shown in the type menu and in the import wizard.
 *
 * All types drive validation, Auto-fix coercion and the Excel export. Numeric
 * analyses still infer numbers from the cell values, so `cat`, `id`, `dtm` and
 * `tim` are descriptive metadata plus strict cell validation.
 */
export const COL_TYPES: ColTypeDef[] = [
  { id: 'num', label: 'num', full: 'Numeric — auto-detect, decimal comma allowed', regex: /^-?\d*[.,]?\d*$/ },
  { id: 'int', label: 'int', full: 'Integer — whole number', regex: /^-?\d+$/ },
  { id: 'dec', label: 'dec', full: 'Decimal — floating point number', regex: /^-?\d+[.,]?\d*$/ },
  { id: 'cat', label: 'cat', full: 'Categorical — group or label text', regex: /[\s\S]*/ },
  { id: 'str', label: 'str', full: 'Text — free text, numbers included', regex: /[\s\S]*/ },
  { id: 'id', label: 'id', full: 'Identifier — unique key, excluded from statistics', regex: /[\s\S]*/ },
  { id: 'bol', label: 'bol', full: 'Boolean — 0/1, yes/no, true/false, T/F', regex: /^(0|1|t|f|true|false|yes|no)$/i },
  { id: 'dat', label: 'dat', full: 'Date — YYYY-MM-DD', regex: /^\d{4}-\d{2}-\d{2}$/ },
  { id: 'dtm', label: 'dtm', full: 'Date-time — YYYY-MM-DD HH:MM[:SS]', regex: /^\d{4}-\d{2}-\d{2}[ T]([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/ },
  { id: 'tim', label: 'tim', full: 'Time — HH:MM[:SS]', regex: /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/ },
  { id: 'alp', label: 'alp', full: 'Alphabetic — letters a-z / A-Z only', regex: /^[A-Za-z]+$/ },
  { id: 'chr', label: 'chr', full: 'Character — a single character', regex: /^.$/ },
];

export const validateValue = (val: string | null | undefined, type: ColType): boolean => {
  if (val === '' || val === null || val === undefined) return true;
  const ti = COL_TYPES.find((t) => t.id === type) ?? COL_TYPES[0];
  return ti.regex.test(String(val).trim());
};

/** Row of empty cells sized to the grid width. */
export const emptyRow = (width: number): string[] => new Array(width).fill('');

/** Unique column name: Var5, Var5_2, ... */
export const uniqueColName = (cols: Column[], base: string): string => {
  const taken = new Set(cols.map((c) => c.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`.toLowerCase())) i += 1;
  return `${base}_${i}`;
};

export const nonEmptyRowCount = (rows: string[][]): number =>
  rows.filter((r) => r.some((v) => String(v ?? '').trim() !== '')).length;

export const countInvalidCells = (grid: GridData): number => {
  let n = 0;
  grid.rows.forEach((row) => {
    row.forEach((cell, c) => {
      const col = grid.cols[c];
      if (col && !validateValue(cell, col.type)) n += 1;
    });
  });
  return n;
};

/* ---------- Categorical levels / grouping variables ---------- */

/** Declared levels are capped so a category column stays a category column. */
export const MAX_LEVELS = 50;

/** Column types that are categorical by declaration. `id` is never a group. */
export const CATEGORICAL_TYPES: ColType[] = ['cat', 'bol', 'dat', 'dtm', 'tim', 'str', 'alp', 'chr'];

/** Natural order: 1, 2, 10 instead of 1, 10, 2. */
export const naturalCompare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Distinct non-empty cell values of a column, natural-sorted and capped. */
export const distinctColumnValues = (rows: string[][], c: number): string[] => {
  const seen = new Set<string>();
  rows.forEach((row) => {
    const value = String(row[c] ?? '').trim();
    if (value !== '') seen.add(value);
  });
  return Array.from(seen).sort(naturalCompare).slice(0, MAX_LEVELS);
};

/**
 * Declared levels when present, otherwise the observed values. The fallback
 * keeps old projects and freshly imported data usable without opening the
 * editor first.
 */
export const columnLevels = (col: Column | undefined, rows: string[][], c: number): CategoryLevel[] => {
  if (col?.levels && col.levels.length > 0) return col.levels;
  return distinctColumnValues(rows, c).map((value) => ({ value, label: value }));
};

export const levelLabel = (col: Column | undefined, value: string): string =>
  col?.levels?.find((level) => level.value === value)?.label ?? value;

/** Declared levels present in the data, followed by undeclared values. */
export const orderedColumnLevels = (col: Column | undefined, rows: string[][], c: number): CategoryLevel[] => {
  const observed = distinctColumnValues(rows, c);
  const declared = (col?.levels ?? []).filter((level) => observed.includes(level.value));
  const known = new Set(declared.map((level) => level.value));
  return [...declared, ...observed.filter((value) => !known.has(value)).map((value) => ({ value, label: value }))];
};

/** Move the reference level first (treatment coding) without dropping others. */
export const referenceFirst = (values: string[], reference?: string): string[] =>
  reference && values.includes(reference)
    ? [reference, ...values.filter((value) => value !== reference)]
    : values;

/**
 * A group column is categorical by type, or an integer code with a small set
 * of levels. `num`, `dec` and `id` are excluded so continuous variables and
 * identifiers never show up in group pickers.
 */
export const isGroupColumn = (grid: GridData, c: number): boolean => {
  const col = grid.cols[c];
  if (!col || col.type === 'id') return false;
  // `cat` is an explicit declaration and is always offered, however many
  // levels it has. `bol` is binary by definition. The other categorical types
  // (text, dates, alpha...) only make sense as groups with a small set of
  // levels; a unique free-text or date column is not a grouping variable.
  if (col.type === 'cat' || col.type === 'bol') return true;
  // Declaring levels is an explicit "this is a grouping variable" statement:
  // keep offering it even after a recode leaves a single code, so the editor
  // stays reachable and the choice can be undone by hand.
  if (col.levels && col.levels.length > 0) return true;
  const values = distinctColumnValues(grid.rows, c);
  if (!CATEGORICAL_TYPES.includes(col.type)) {
    return (
      (col.type === 'int' || col.type === 'num') &&
      values.length >= 2 &&
      values.length <= 12 &&
      values.every((value) => /^-?\d+$/.test(value))
    );
  }
  return values.length >= 2 && values.length <= 12;
};

export const groupColumnIndexes = (grid: GridData): number[] =>
  grid.cols.map((_, i) => i).filter((i) => isGroupColumn(grid, i));

/**
 * Rows with the group columns rewritten to their labels, for table/chart
 * output. Labels are applied only when the mapping is injective on the values
 * actually present, so two levels can never be merged by a duplicate label.
 */
export const analysisRows = (grid: GridData, groupColumns: number[]): string[][] => {
  const maps = new Map<number, Map<string, string>>();
  groupColumns.forEach((c) => {
    const col = grid.cols[c];
    if (!col?.levels?.length) return;
    const observed = distinctColumnValues(grid.rows, c);
    const labels = observed.map((value) => levelLabel(col, value));
    if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length) return;
    maps.set(c, new Map(observed.map((value, i) => [value, labels[i]])));
  });
  if (maps.size === 0) return grid.rows;
  return grid.rows.map((row) =>
    row.map((cell, c) => {
      const map = maps.get(c);
      if (!map) return cell;
      const raw = String(cell ?? '');
      return map.get(raw) ?? map.get(raw.trim()) ?? cell;
    })
  );
};
