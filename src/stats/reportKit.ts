import type { TableRow, TableSpec } from './types';
import { fmtCI, fmtEst, fmtP } from './format';

/** Small formatting helpers shared by the report builders of the newer analyses. */

export const alphaOf = (level: number): number => 1 - level / 100;

export const isDecided = (p: number, level: number): boolean =>
  Number.isFinite(p) && p < alphaOf(level);

export const describeP = (value: number, label = 'p'): string =>
  !Number.isFinite(value)
    ? `${label} non calcolabile`
    : value < 0.001
      ? `${label} < 0.001`
      : `${label} = ${fmtP(value)}`;

export const show = (value: number, decimals = 3): string =>
  Number.isFinite(value) ? fmtEst(value, decimals) : '—';

export const showInt = (value: number): string =>
  Number.isFinite(value) ? String(Math.round(value)) : '—';

export const showCI = (lo: number, hi: number, decimals = 3): string =>
  Number.isFinite(lo) && Number.isFinite(hi) ? fmtCI(lo, hi, decimals) : '—';

export const tableById = (tables: TableSpec[], id: string): TableSpec | undefined =>
  tables.find(spec => spec.id === id);

export const rowsOf = (tables: TableSpec[], id: string): TableRow[] =>
  tableById(tables, id)?.rows ?? [];

export const numOf = (row: TableRow | undefined, key: string): number => {
  const value = row?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
};

export const textOf = (row: TableRow | undefined, key: string): string => {
  const value = row?.[key];
  return value === null || value === undefined ? '' : String(value);
};

export const rowLabel = (row: TableRow): string =>
  String(row.test ?? row.variable ?? row.predictor ?? row.distribution ?? row.metric ?? row.measure ?? '');
