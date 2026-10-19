import type { CategoryLevel, Column, ColType, GridData } from './types';
import { MAX_LEVELS, distinctColumnValues, emptyRow, uniqueColName, validateValue } from './types';

/* ---------- Structural operations (pure, return new GridData) ---------- */

export const setCell = (grid: GridData, r: number, c: number, val: string): GridData => {
  if (r < 0 || r >= grid.rows.length || c < 0 || c >= grid.cols.length) return grid;
  const rows = grid.rows.map((row, i) => (i === r ? row.map((v, j) => (j === c ? val : v)) : [...row]));
  return { cols: grid.cols, rows };
};

export const renameColumn = (grid: GridData, c: number, name: string): GridData => {
  if (c < 0 || c >= grid.cols.length) return grid;
  const clean = name.trim() || grid.cols[c].name;
  const dupe = grid.cols.some((col, i) => i !== c && col.name.toLowerCase() === clean.toLowerCase());
  const finalName = dupe ? uniqueColName(grid.cols, clean) : clean;
  return { cols: grid.cols.map((col, i) => (i === c ? { ...col, name: finalName } : col)), rows: grid.rows };
};

export const setColType = (grid: GridData, c: number, type: ColType): GridData => ({
  cols: grid.cols.map((col, i) => (i === c ? { ...col, type } : col)),
  rows: grid.rows,
});

/* ---------- Categorical levels ---------- */

/**
 * Store the levels declared for a categorical column. Codes and labels are
 * trimmed, deduplicated (labels case-insensitively with a numeric suffix) and
 * capped; a reference level that no longer exists is dropped. Cell values are
 * never rewritten: existing data outside the list stays visible as "not in
 * the list".
 */
export const setColumnLevels = (
  grid: GridData,
  c: number,
  levels: CategoryLevel[],
  reference?: string
): GridData => {
  if (c < 0 || c >= grid.cols.length) return grid;
  const values = new Set<string>();
  const labels = new Set<string>();
  const clean: CategoryLevel[] = [];
  for (const level of levels) {
    if (clean.length >= MAX_LEVELS) break;
    const value = String(level?.value ?? '').trim();
    if (value === '' || values.has(value)) continue;
    const base = String(level?.label ?? '').trim() || value;
    let label = base;
    let suffix = 2;
    while (labels.has(label.toLowerCase())) {
      label = `${base} ${suffix}`;
      suffix += 1;
    }
    values.add(value);
    labels.add(label.toLowerCase());
    clean.push({ value, label });
  }
  const ref = reference && values.has(reference) ? reference : undefined;
  return {
    cols: grid.cols.map((col, i) =>
      i === c ? { ...col, levels: clean.length > 0 ? clean : undefined, reference: ref } : col
    ),
    rows: grid.rows,
  };
};

export interface RecodeLevelsResult {
  grid: GridData;
  /** Cells whose value actually changed. */
  changed: number;
  /** Cells emptied by mapping a code to "". */
  cleared: number;
  /** Groups that disappeared because two or more codes now share a target. */
  merged: number;
  /** Set when the new codes no longer satisfy the declared column type. */
  typeChangedTo?: ColType;
}

/**
 * Recode the group codes of one column: rename, merge (two codes mapped to the
 * same target) or clear (mapped to "") in a single pass. Every cell is matched
 * against its *original* value, so swaps like 1→2 and 2→1 behave as expected.
 * Declared levels follow the mapping, keeping their labels; a merged level
 * keeps the label of the first code that reaches the target. The reference
 * level follows its own code and is dropped when that code disappears. When
 * the new codes no longer fit the column type (for example text codes in an
 * `int` column) the type becomes `cat`, so validation stays honest.
 */
export const recodeColumnValues = (
  grid: GridData,
  c: number,
  mapping: Record<string, string>
): RecodeLevelsResult => {
  if (c < 0 || c >= grid.cols.length) return { grid, changed: 0, cleared: 0, merged: 0 };
  const map = new Map<string, string>();
  Object.entries(mapping ?? {}).forEach(([from, to]) => {
    const key = String(from ?? '').trim();
    if (key === '') return;
    map.set(key, String(to ?? '').trim());
  });
  if (map.size === 0) return { grid, changed: 0, cleared: 0, merged: 0 };

  let changed = 0;
  let cleared = 0;
  const rows = grid.rows.map((row) => {
    const raw = String(row[c] ?? '').trim();
    if (!map.has(raw)) return [...row];
    const next = map.get(raw) as string;
    if (next === raw) return [...row];
    changed += 1;
    if (next === '') cleared += 1;
    const copy = [...row];
    copy[c] = next;
    return copy;
  });

  const col = grid.cols[c];
  const levels = (col.levels ?? []).flatMap((level) => {
    if (!map.has(level.value)) return [{ ...level }];
    const next = map.get(level.value) as string;
    return next === '' ? [] : [{ value: next, label: level.label }];
  });
  const ref = col.reference && map.has(col.reference) ? map.get(col.reference) : col.reference;

  let next = setColumnLevels({ cols: grid.cols, rows }, c, levels, ref || undefined);
  // Groups that disappear minus the ones removed by clearing: a code emptied
  // by "clear" is not a merge, while 21 → 20 fuses into the existing group 20.
  const before = distinctColumnValues(grid.rows, c);
  const after = distinctColumnValues(rows, c);
  const clearedGroups = before.filter((value) => map.get(value) === '').length;
  const merged = Math.max(0, before.length - after.length - clearedGroups);
  let typeChangedTo: ColType | undefined;
  if (next.cols[c].type !== 'cat' && rows.some((row) => !validateValue(row[c] ?? '', next.cols[c].type))) {
    typeChangedTo = 'cat';
    next = setColType(next, c, 'cat');
  }
  return { grid: next, changed, cleared, merged, typeChangedTo };
};

/** Merge the declared levels with every value present in the column. */
export const levelsFromColumnValues = (grid: GridData, c: number): CategoryLevel[] => {
  if (c < 0 || c >= grid.cols.length) return [];
  const col = grid.cols[c];
  const merged: CategoryLevel[] = (col.levels ?? []).map((level) => ({ ...level }));
  const known = new Set(merged.map((level) => level.value));
  distinctColumnValues(grid.rows, c).forEach((value) => {
    if (!known.has(value)) {
      known.add(value);
      merged.push({ value, label: value });
    }
  });
  return merged;
};

export const addColumnEnd = (grid: GridData): GridData => {
  const name = uniqueColName(grid.cols, `Var${grid.cols.length + 1}`);
  return { cols: [...grid.cols, { name, type: 'num' as ColType }], rows: grid.rows.map((r) => [...r, '']) };
};

export const insertColumnAt = (grid: GridData, at: number): GridData => {
  const pos = Math.max(0, Math.min(grid.cols.length, at));
  const name = uniqueColName(grid.cols, `Var${grid.cols.length + 1}`);
  const cols = [...grid.cols.slice(0, pos), { name, type: 'num' as ColType }, ...grid.cols.slice(pos)];
  return { cols, rows: grid.rows.map((r) => [...r.slice(0, pos), '', ...r.slice(pos)]) };
};

export const duplicateColumn = (grid: GridData, c: number): GridData => {
  if (c < 0 || c >= grid.cols.length) return grid;
  const src = grid.cols[c];
  const name = uniqueColName(grid.cols, `${src.name}_copy`);
  const cols = [...grid.cols.slice(0, c + 1), { name, type: src.type }, ...grid.cols.slice(c + 1)];
  const rows = grid.rows.map((r) => [...r.slice(0, c + 1), r[c] ?? '', ...r.slice(c + 1)]);
  return { cols, rows };
};

export const moveColumn = (grid: GridData, c: number, dir: -1 | 1): GridData => {
  const t = c + dir;
  if (t < 0 || t >= grid.cols.length) return grid;
  const cols = [...grid.cols];
  [cols[c], cols[t]] = [cols[t], cols[c]];
  const rows = grid.rows.map((r) => {
    const copy = [...r];
    [copy[c], copy[t]] = [copy[t], copy[c]];
    return copy;
  });
  return { cols, rows };
};

export const deleteColumn = (grid: GridData, c: number): GridData => {
  if (grid.cols.length <= 1) return grid;
  return { cols: grid.cols.filter((_, i) => i !== c), rows: grid.rows.map((r) => r.filter((_, i) => i !== c)) };
};

export const addRowEnd = (grid: GridData): GridData => ({
  cols: grid.cols,
  rows: [...grid.rows, emptyRow(grid.cols.length)],
});

export const insertRowAt = (grid: GridData, at: number): GridData => {
  const pos = Math.max(0, Math.min(grid.rows.length, at));
  return {
    cols: grid.cols,
    rows: [...grid.rows.slice(0, pos), emptyRow(grid.cols.length), ...grid.rows.slice(pos)],
  };
};

export const deleteRow = (grid: GridData, r: number): GridData => {
  if (grid.rows.length <= 1 || r < 0 || r >= grid.rows.length) return grid;
  return {
    cols: grid.cols,
    rows: grid.rows.filter((_, i) => i !== r),
  };
};

export const clearGrid = (grid: GridData): GridData => ({
  cols: grid.cols,
  rows: grid.rows.map(() => emptyRow(grid.cols.length)),
});

export const newGrid = (): GridData => ({ cols: [{ name: 'Var1', type: 'num' }], rows: Array(20).fill(null).map(() => ['']) });

/* ---------- Selection / clipboard ---------- */

export interface Range {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export const normRange = (a: Range): Range => ({
  r0: Math.min(a.r0, a.r1),
  c0: Math.min(a.c0, a.c1),
  r1: Math.max(a.r0, a.r1),
  c1: Math.max(a.c0, a.c1),
});

export const rangeToTsv = (grid: GridData, range: Range): string => {
  const { r0, c0, r1, c1 } = normRange(range);
  const lines: string[] = [];
  for (let r = r0; r <= r1; r += 1) {
    const cells: string[] = [];
    for (let c = c0; c <= c1; c += 1) cells.push(grid.rows[r]?.[c] ?? '');
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
};

export const parseTsv = (text: string): string[][] =>
  text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.split('\t'));

/** Paste a TSV block at anchor, expanding rows/cols as needed. */
export const pasteTsvAt = (grid: GridData, r0: number, c0: number, block: string[][]): GridData => {
  if (!block || block.length === 0) return grid;
  const ar = Math.max(0, Math.min(grid.rows.length, r0));
  const ac = Math.max(0, c0);
  const needRows = ar + block.length;
  const needCols = Math.max(grid.cols.length, ac + Math.max(0, ...block.map((r) => r.length)));
  let cols: Column[] = [...grid.cols];
  while (cols.length < needCols) cols = [...cols, { name: uniqueColName(cols, `Var${cols.length + 1}`), type: 'num' }];
  const rows: string[][] = grid.rows.map((r) => {
    const copy = [...r];
    while (copy.length < needCols) copy.push('');
    return copy;
  });
  while (rows.length < needRows) rows.push(emptyRow(needCols));
  block.forEach((line, dr) => {
    line.forEach((val, dc) => {
      rows[ar + dr][ac + dc] = val;
    });
  });
  return { cols, rows };
};

export const clearRange = (grid: GridData, range: Range): GridData => {
  const { r0, c0, r1, c1 } = normRange(range);
  // Preserve ragged row widths: only touch cells that exist.
  return {
    cols: grid.cols,
    rows: grid.rows.map((row, r) =>
      r < r0 || r > r1 ? [...row] : row.map((v, c) => (c >= c0 && c <= c1 ? '' : v))
    ),
  };
};

export const fillDownRange = (grid: GridData, range: Range): GridData => {
  const { r0, c0, r1, c1 } = normRange(range);
  if (grid.rows.length === 0 || grid.cols.length === 0) return grid;
  const ar0 = Math.max(0, Math.min(grid.rows.length - 1, r0));
  const ar1 = Math.max(0, Math.min(grid.rows.length - 1, r1));
  const ac0 = Math.max(0, Math.min(grid.cols.length - 1, c0));
  const ac1 = Math.max(0, Math.min(grid.cols.length - 1, c1));
  const rows = grid.rows.map((r) => [...r]);
  for (let c = ac0; c <= ac1; c += 1) {
    const top = rows[ar0]?.[c] ?? '';
    for (let r = ar0 + 1; r <= ar1; r += 1) {
      if (c < rows[r].length) rows[r][c] = top;
    }
  }
  return { cols: grid.cols, rows };
};

/* ---------- View filtering ---------- */

export type RowFilterOp =
  | 'contains'
  | 'equals'
  | 'notEquals'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'empty'
  | 'notEmpty';

export interface RowFilter {
  col: number;
  op: RowFilterOp;
  value: string;
  caseSensitive?: boolean;
}

/** Case-insensitive by default; numeric comparison only when both sides parse. */
export const rowMatchesFilter = (row: string[], filter: RowFilter): boolean => {
  const raw = String(row[filter.col] ?? '').trim();
  if (filter.op === 'empty') return raw === '';
  if (filter.op === 'notEmpty') return raw !== '';

  const needle = filter.value.trim();
  if (needle === '') return true;
  const a = filter.caseSensitive ? raw : raw.toLowerCase();
  const b = filter.caseSensitive ? needle : needle.toLowerCase();

  if (filter.op === 'contains') return a.includes(b);
  if (filter.op === 'equals') return a === b;
  if (filter.op === 'notEquals') return a !== b;

  const na = numVal(raw);
  const nb = numVal(needle);
  if (na === null || nb === null) return false;
  if (filter.op === 'gt') return na > nb;
  if (filter.op === 'gte') return na >= nb;
  if (filter.op === 'lt') return na < nb;
  return na <= nb;
};

export const rowMatches = (grid: GridData, row: string[], filter: RowFilter | null): boolean =>
  !filter || filter.col < 0 || filter.col >= grid.cols.length || rowMatchesFilter(row, filter);

/** Row indexes (original positions) that pass the filter, in grid order. */
export const filterRowIndexes = (grid: GridData, filter: RowFilter | null): number[] =>
  grid.rows.reduce<number[]>((out, row, index) => {
    if (rowMatches(grid, row, filter)) out.push(index);
    return out;
  }, []);

/* ---------- Cleaning ---------- */

export interface ValidationIssue {
  r: number;
  c: number;
  value: string;
  colName: string;
}

export const findInvalid = (grid: GridData): ValidationIssue[] => {
  const out: ValidationIssue[] = [];
  grid.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const col = grid.cols[c];
      if (col && !validateValue(cell, col.type)) out.push({ r, c, value: cell, colName: col.name });
    });
  });
  return out;
};

export const invalidByColumn = (grid: GridData): { name: string; count: number; col: number }[] =>
  grid.cols.map((col, c) => ({
    name: col.name,
    col: c,
    count: grid.rows.filter((row) => !validateValue(row[c] ?? '', col.type)).length,
  }));

const BOOL_MAP: Record<string, string> = {
  true: '1', yes: '1', y: '1', t: '1', vero: '1', si: '1',
  false: '0', no: '0', n: '0', f: '0', falso: '0',
};

/** Best-effort coercion: trim, decimal comma, booleans; returns changed count. */
export const coerceValue = (val: string, type: ColType): string => {
  const t = val.trim();
  if (t === '') return '';
  if (type === 'bol') {
    const low = t.toLowerCase();
    if (low === '0' || low === '1') return low;
    if (low in BOOL_MAP) return BOOL_MAP[low];
    return val;
  }
  if (type === 'num' || type === 'int' || type === 'dec') {
    // 'num' is the permissive auto-detect column: only trim, never rewrite.
    if (type === 'num') return t === val ? val : t;
    let dot = t;
    // Handle thousands + decimal comma ("1.234,56") vs plain decimal comma ("1,5").
    const hasComma = dot.includes(',');
    const hasDot = dot.includes('.');
    if (hasComma && hasDot) {
      const lastComma = dot.lastIndexOf(',');
      const lastDot = dot.lastIndexOf('.');
      dot = lastComma > lastDot ? dot.replace(/\./g, '').replace(',', '.') : dot.replace(/,/g, '');
    } else if (hasComma) {
      dot = dot.replace(',', '.');
    }
    if (type === 'int') {
      const n = Number(dot);
      if (dot.trim() !== '' && Number.isInteger(n)) return String(n);
      return val;
    }
    if (/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(dot)) return dot;
    return val;
  }
  return type === 'str' ? val : t;
};

export const coerceGrid = (grid: GridData): { grid: GridData; changed: number } => {
  let changed = 0;
  const rows = grid.rows.map((row) =>
    row.map((cell, c) => {
      const col = grid.cols[c];
      if (!col) return cell;
      const next = coerceValue(cell ?? '', col.type);
      if (next !== cell) changed += 1;
      return next;
    })
  );
  return { grid: { cols: grid.cols, rows }, changed };
};

export const findReplace = (
  grid: GridData,
  search: string,
  replace: string,
  opts: { regex?: boolean; matchCase?: boolean; col?: number | null } = {}
): { grid: GridData; count: number } => {
  if (!search) return { grid, count: 0 };
  let count = 0;
  let re: RegExp | null = null;
  if (opts.regex) {
    try {
      re = new RegExp(search, opts.matchCase ? 'g' : 'gi');
    } catch {
      return { grid, count: 0 };
    }
  }
  const needle = opts.matchCase ? search : search.toLowerCase();
  const rows = grid.rows.map((row) =>
    row.map((cell, c) => {
      if (opts.col !== null && opts.col !== undefined && c !== opts.col) return cell;
      const v = cell ?? '';
      if (re) {
        // '$$' in the replacement would otherwise insert a literal '$'.
        const next = v.replace(re, () => replace);
        if (next !== v) count += 1;
        return next;
      }
      const hay = opts.matchCase ? v : v.toLowerCase();
      if (!hay.includes(needle)) return cell;
      count += 1;
      if (opts.matchCase) return v.split(search).join(replace);
      // case-insensitive replace preserving rest
      let out = '';
      let rest = v;
      let idx = hay.indexOf(needle);
      while (idx >= 0) {
        out += rest.slice(0, idx) + replace;
        rest = rest.slice(idx + search.length);
        idx = (opts.matchCase ? rest : rest.toLowerCase()).indexOf(needle);
      }
      return out + rest;
    })
  );
  return { grid: { cols: grid.cols, rows }, count };
};

export const trimGrid = (grid: GridData): { grid: GridData; changed: number } => {
  let changed = 0;
  const rows = grid.rows.map((row) =>
    row.map((cell) => {
      const next = String(cell ?? '').trim().replace(/\s+/g, ' ');
      if (next !== cell) changed += 1;
      return next;
    })
  );
  return { grid: { cols: grid.cols, rows }, changed };
};

export const removeEmptyRows = (grid: GridData): { grid: GridData; removed: number } => {
  const kept = grid.rows.filter((r) => r.some((v) => String(v ?? '').trim() !== ''));
  return { grid: { cols: grid.cols, rows: kept.length ? kept : [emptyRow(grid.cols.length)] }, removed: grid.rows.length - kept.length };
};

export const removeDuplicateRows = (grid: GridData): { grid: GridData; removed: number } => {
  const seen = new Set<string>();
  const kept: string[][] = [];
  grid.rows.forEach((r) => {
    const full = grid.cols.map((_, i) => String(r[i] ?? '').trim());
    const key = JSON.stringify(full);
    const empty = full.every((v) => v === '');
    if (empty || !seen.has(key)) {
      if (!empty) seen.add(key);
      kept.push(r);
    }
  });
  return { grid: { cols: grid.cols, rows: kept }, removed: grid.rows.length - kept.length };
};

export const fillMissing = (
  grid: GridData,
  col: number,
  strategy: 'mean' | 'median' | 'mode' | { value: string }
): { grid: GridData; filled: number; fillWith: string } => {
  if (col < 0 || col >= grid.cols.length) return { grid, filled: 0, fillWith: '' };
  const vals = grid.rows.map((r) => r[col] ?? '');
  const filled = vals.filter((v) => String(v).trim() !== '');
  let fillWith = '';
  if (typeof strategy === 'object') {
    fillWith = strategy.value;
  } else if (strategy === 'mode') {
    const freq = new Map<string, number>();
    filled.forEach((v) => freq.set(v, (freq.get(v) ?? 0) + 1));
    let best = '';
    let bestN = -1;
    freq.forEach((n, v) => {
      if (n > bestN) {
        bestN = n;
        best = v;
      }
    });
    fillWith = best;
  } else {
    const nums = filled.map((v) => Number(String(v).replace(',', '.'))).filter((n) => !isNaN(n));
    if (nums.length === 0) return { grid, filled: 0, fillWith: '' };
    const sorted = [...nums].sort((a, b) => a - b);
    fillWith = strategy === 'mean'
      ? String(nums.reduce((a, b) => a + b, 0) / nums.length)
      : String(sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  }
  let n = 0;
  const rows = grid.rows.map((row) => {
    if (String(row[col] ?? '').trim() !== '') return [...row];
    n += 1;
    const copy = [...row];
    copy[col] = fillWith;
    return copy;
  });
  return { grid: { cols: grid.cols, rows }, filled: n, fillWith };
};

/* ---------- Transforms ---------- */

const numVal = (v: string): number | null => {
  const t = String(v ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return isNaN(n) ? null : n;
};

export const sortByColumn = (grid: GridData, col: number, dir: 'asc' | 'desc', nullsFirst = false): GridData => {
  if (col < 0 || col >= grid.cols.length) return grid;
  const rows = grid.rows.map((r, i) => ({ r: [...r], i }));
  rows.sort((a, b) => {
    const va = a.r[col] ?? '';
    const vb = b.r[col] ?? '';
    const na = numVal(va);
    const nb = numVal(vb);
    const aEmpty = String(va).trim() === '';
    const bEmpty = String(vb).trim() === '';
    if (aEmpty || bEmpty) {
      if (aEmpty && bEmpty) return a.i - b.i;
      if (nullsFirst) return aEmpty ? -1 : 1;
      return aEmpty ? 1 : -1;
    }
    let cmp: number;
    if (na !== null && nb !== null) cmp = na - nb;
    else cmp = String(va).localeCompare(String(vb));
    if (dir === 'desc') cmp = -cmp;
    return cmp === 0 ? a.i - b.i : cmp;
  });
  return { cols: grid.cols, rows: rows.map((x) => x.r) };
};

export const recodeColumn = (grid: GridData, col: number, mapping: Record<string, string>, unmatched: 'keep' | 'empty' = 'keep'): { grid: GridData; changed: number } => {
  if (col < 0 || col >= grid.cols.length) return { grid, changed: 0 };
  let changed = 0;
  const rows = grid.rows.map((row) => {
    const v = row[col] ?? '';
    if (v in mapping) {
      if (mapping[v] !== v) changed += 1;
      const copy = [...row];
      copy[col] = mapping[v];
      return copy;
    }
    if (unmatched === 'empty' && String(v).trim() !== '') {
      changed += 1;
      const copy = [...row];
      copy[col] = '';
      return copy;
    }
    return [...row];
  });
  return { grid: { cols: grid.cols, rows }, changed };
};

export const splitColumn = (grid: GridData, col: number, sep: string, newName2?: string): GridData => {
  if (!sep) return grid;
  if (col < 0 || col >= grid.cols.length) return grid;
  const src = grid.cols[col];
  const name2 = uniqueColName(grid.cols, newName2?.trim() || `${src.name}_2`);
  const cols = [...grid.cols.slice(0, col + 1), { name: name2, type: src.type }, ...grid.cols.slice(col + 1)];
  const rows = grid.rows.map((r) => {
    const v = String(r[col] ?? '');
    const idx = v.indexOf(sep);
    const left = idx < 0 ? v : v.slice(0, idx);
    const right = idx < 0 ? '' : v.slice(idx + sep.length);
    const copy = [...r];
    copy[col] = left;
    copy.splice(col + 1, 0, right);
    return copy;
  });
  return { cols, rows };
};

export const mergeColumns = (grid: GridData, a: number, b: number, sep: string, newName?: string): GridData => {
  if (a === b) return grid;
  if (a < 0 || b < 0 || a >= grid.cols.length || b >= grid.cols.length) return grid;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const raw = (newName?.trim() || `${grid.cols[lo].name}_${grid.cols[hi].name}`).trim() || 'Merged';
  const cols = grid.cols.filter((_, i) => i !== hi);
  // uniqueColName checks against the passed list: exclude the slot being
  // renamed so keeping the current name does not gain a spurious suffix.
  const others = cols.filter((_, i) => i !== lo);
  cols[lo] = { ...cols[lo], name: others.some((c) => c.name.toLowerCase() === raw.toLowerCase()) ? uniqueColName(others, raw) : raw };
  const rows = grid.rows.map((r) => {
    const merged = `${r[lo] ?? ''}${sep}${r[hi] ?? ''}`;
    const copy = r.filter((_, i) => i !== hi);
    copy[lo] = merged;
    return copy;
  });
  return { cols, rows };
};

const SAFE_EXPR = /^[A-Za-z0-9_+\-*/().\s^%]+$/;

export const computeColumn = (
  grid: GridData,
  expr: string,
  newName: string,
  colIndex: Record<string, number>
): { grid: GridData; error?: string } => {
  if (!SAFE_EXPR.test(expr)) return { grid, error: 'Unsafe characters in expression' };
  if (expr.length > 500) return { grid, error: 'Expression too long' };
  if (/__(?:proto|prototype|constructor)__/i.test(expr)) return { grid, error: 'Unsafe expression' };
  // Column names arrive from user data: only map sane identifiers, and skip
  // dangerous keys so a column literally named "__proto__" cannot pollute.
  const BLOCKED = new Set(['__proto__', 'prototype', 'constructor', 'V']);
  const names = Object.keys(colIndex)
    .filter((n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) && !BLOCKED.has(n))
    .sort((a, b) => b.length - a.length);
  let js = expr.replace(/\^/g, '**');
  names.forEach((name) => {
    js = js.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), `__v_${colIndex[name]}`);
  });
  if (/[A-Za-z_]/.test(js.replace(/__v_\d+/g, ''))) return { grid, error: 'Unknown column in expression' };
  // Belt and braces: no property access or call expressions may survive.
  if (/[.\[\];,{}'"`\\]/.test(js)) return { grid, error: 'Unsafe expression' };
  let fn: (vals: number[]) => number;
  try {
    fn = new Function('V', `return (${js.replace(/__v_(\d+)/g, 'V[$1]')});`) as (vals: number[]) => number;
  } catch {
    return { grid, error: 'Invalid expression' };
  }
  const name = uniqueColName(grid.cols, newName.trim() || 'Computed');
  const cols = [...grid.cols, { name, type: 'num' as ColType }];
  const rows = grid.rows.map((r) => {
    const nums = r.map((v) => {
      const n = numVal(v);
      return n === null ? NaN : n;
    });
    let out = '';
    try {
      const val = fn(nums);
      out = typeof val === 'number' && isFinite(val) ? String(val) : '';
    } catch {
      out = '';
    }
    return [...r, out];
  });
  return { grid: { cols, rows } };
};
