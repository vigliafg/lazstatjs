/** Shared data-grid types. Analyses only rely on `{ cols: { name }[]; rows }`,
 *  so extending Column here stays structurally compatible. */

export type ColType = 'num' | 'int' | 'dec' | 'str' | 'alp' | 'chr' | 'bol' | 'dat';

export interface Column {
  name: string;
  type: ColType;
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

export const COL_TYPES: ColTypeDef[] = [
  { id: 'num', label: 'num', full: 'Numeric (auto-detect)', regex: /^-?\d*\.?\d*$/ },
  { id: 'int', label: 'int', full: 'Integer (whole number)', regex: /^-?\d+$/ },
  { id: 'dec', label: 'dec', full: 'Decimal (floating point)', regex: /^-?\d+\.?\d*$/ },
  { id: 'str', label: 'str', full: 'String (free text)', regex: /[\s\S]*/ },
  { id: 'alp', label: 'alp', full: 'Alpha (a-z, A-Z only)', regex: /^[A-Za-z]+$/ },
  { id: 'chr', label: 'chr', full: 'Char (single character)', regex: /^.$/ },
  { id: 'bol', label: 'bol', full: 'Boolean (0/1/T/F/yes/no)', regex: /^(0|1|t|f|true|false|yes|no)$/i },
  { id: 'dat', label: 'dat', full: 'Date (YYYY-MM-DD)', regex: /^\d{4}-\d{2}-\d{2}$/ },
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
