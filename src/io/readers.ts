import { parseCsv, inferColumnType, type InferredType } from '../csv';
import type { ColType } from '../grid/types';
import type { Delimiter } from './detect';

export interface ImportTable {
  names: string[];
  types: ColType[];
  rows: string[][];
  skippedEmpty: number;
  renamedDupes: number;
}

export const MAX_ROWS = 50000;
export const MAX_COLS = 500;

const toColType = (t: InferredType): ColType => t as ColType;

/** Parse delimited text with explicit options (delimiter/header/decimal). */
export const readDelimited = (
  text: string,
  opts: { delimiter: Delimiter | string; hasHeader: boolean; decimalComma?: boolean }
): { rows: string[][]; skippedEmpty: number } => {
  const delim = opts.delimiter === 'tab' ? '\t' : (opts.delimiter as string);
  const rows = parseCsv(text, delim, { keepEmpty: true });
  const before = rows.length;
  const kept = rows.filter((r) => r.some((v) => v.trim() !== ''));
  return { rows: kept, skippedEmpty: before - kept.length };
};

const flatten = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/** Accept array-of-objects, array-of-arrays, or {columns, data}. */
export const readJson = (text: string): { names: string[]; rows: string[][] } => {
  const parsed: unknown = JSON.parse(text);
  if (Array.isArray(parsed) && parsed.length === 0) throw new Error('No data rows found');
  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && !Array.isArray(parsed[0])) {
    const objs = parsed as Record<string, unknown>[];
    const names = [...new Set(objs.flatMap((o) => Object.keys(o)))];
    return { names, rows: objs.map((o) => names.map((n) => flatten(o[n]))) };
  }
  if (Array.isArray(parsed) && parsed.every((r) => Array.isArray(r))) {
    const arr = parsed as unknown[][];
    const width = Math.max(0, ...arr.map((r) => r.length));
    return { names: Array.from({ length: width }, (_, i) => `Var${i + 1}`), rows: arr.map((r) => Array.from({ length: width }, (_, i) => flatten(r[i]))) };
  }
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).columns) && Array.isArray((parsed as Record<string, unknown>).data)) {
    const p = parsed as { columns: unknown[]; data: unknown[][] };
    return { names: p.columns.map((c) => String(c)), rows: p.data.map((r) => r.map(flatten)) };
  }
  throw new Error('Unsupported JSON shape: expected array of objects or array of arrays');
};

/** Build the final table: dedupe headers, infer types, normalize decimals, enforce caps. */
export const toImportTable = (
  names: string[],
  rows: string[][],
  opts: { hasHeader: boolean; decimalComma?: boolean; typeOverrides?: Record<number, ColType>; skippedEmpty?: number }
): ImportTable => {
  // The caller's header decision is authoritative: never re-detect.
  // csvToTable's probe is bypassed entirely (it misfires on numeric
  // headers and corrupts the headerless first data row).
  const bodyRaw = rows.map((r) => r.map((c) => String(c ?? '')));
  const width = Math.max(names.length, 0, ...bodyRaw.map((r) => r.length));
  if (width > MAX_COLS) throw new Error(`Too many columns (${width} > ${MAX_COLS})`);
  if (bodyRaw.length > MAX_ROWS) throw new Error(`Too many rows (${bodyRaw.length} > ${MAX_ROWS})`);
  const baseNames = opts.hasHeader
    ? Array.from({ length: width }, (_, i) => names[i] ?? `Var${i + 1}`)
    : Array.from({ length: width }, (_, i) => `Var${i + 1}`);
  const padded = bodyRaw.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  // Dedupe headers case-insensitively.
  const seen = new Map<string, number>();
  let renamedDupes = 0;
  const finalNames = baseNames.map((n) => {
    const base = (n.trim() || 'Var').slice(0, 60);
    const key = base.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) return base;
    renamedDupes += 1;
    return `${base}_${count + 1}`;
  });
  // Infer directly from the real body in both paths.
  const types: ColType[] = finalNames.map((_, i) => {
    const override = opts.typeOverrides?.[i];
    if (override) return override;
    return toColType(inferColumnType(padded.map((row) => row[i] ?? '')));
  });
  // Decimal comma normalization for numeric columns.
  const numeric = types.map((t) => t === 'dec' || t === 'num');
  const normalized = (opts.decimalComma ?? true)
    ? padded.map((row) => row.map((cell, i) => (numeric[i] && cell.includes(',') ? cell.trim().replace(/\./g, '').replace(',', '.') : cell)))
    : padded;
  const skippedEmpty = opts.skippedEmpty ?? 0;
  return { names: finalNames, types, rows: normalized, skippedEmpty, renamedDupes };
};

export const readDelimitedTable = (
  text: string,
  opts: { delimiter: Delimiter | string; hasHeader: boolean; decimalComma?: boolean; typeOverrides?: Record<number, ColType> }
): ImportTable => {
  const { rows, skippedEmpty } = readDelimited(text, opts);
  if (rows.length === 0) throw new Error('No data rows found');
  const first = rows[0];
  const names = opts.hasHeader ? first.map((c, i) => c.trim() || `Var${i + 1}`) : first.map((_, i) => `Var${i + 1}`);
  const body = opts.hasHeader ? rows.slice(1) : rows;
  if (opts.hasHeader && body.length === 0) throw new Error('Header found but no data rows');
  return toImportTable(names, body, { ...opts, skippedEmpty });
};

export const readJsonTable = (
  text: string,
  opts: { typeOverrides?: Record<number, ColType>; decimalComma?: boolean } = {}
): ImportTable => {
  const { names, rows } = readJson(text);
  if (rows.length === 0) throw new Error('No data rows found');
  return toImportTable(names, rows, { hasHeader: true, decimalComma: opts.decimalComma, typeOverrides: opts.typeOverrides });
};
