import type { CellFormat, CellValue } from './types';

const isFiniteNumber = (x: unknown): x is number =>
  typeof x === 'number' && isFinite(x);

/** Plain numeric formatting with a fixed number of decimals (trailing zeros kept for alignment). */
export const fmt = (x: number, decimals = 4): string => {
  if (!isFiniteNumber(x)) return '—';
  return x.toFixed(decimals);
};

/** Adaptive estimate formatting: up to `decimals`, trailing zeros removed. */
export const fmtEst = (x: number, decimals = 4): string => {
  if (!isFiniteNumber(x)) return '—';
  return String(parseFloat(x.toFixed(decimals)));
};

export const fmtP = (p: number): string => {
  if (!isFiniteNumber(p)) return '—';
  if (p < 0.001) return '< 0.001';
  if (p > 0.999) return '0.999';
  return p.toFixed(3);
};

export const fmtPct = (x: number, decimals = 1): string => {
  if (!isFiniteNumber(x)) return '—';
  return `${x.toFixed(decimals)}%`;
};

export const stars = (p: number): string => {
  if (!isFiniteNumber(p)) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
};

export const fmtCI = (lo: number, hi: number, decimals = 3): string => {
  if (!isFiniteNumber(lo) || !isFiniteNumber(hi)) return '—';
  return `${fmtEst(lo, decimals)} – ${fmtEst(hi, decimals)}`;
};

export const formatCell = (value: CellValue, format: CellFormat = 'text'): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'text') return String(value);
  if (typeof value !== 'number') return String(value);
  if (!isFinite(value)) return '—';

  switch (format) {
    case 'int':
      return String(Math.round(value));
    case 'dec1':
      return value.toFixed(1);
    case 'dec2':
      return value.toFixed(2);
    case 'dec3':
      return value.toFixed(3);
    case 'dec4':
      return value.toFixed(4);
    case 'p':
      return fmtP(value);
    case 'pct':
      return `${value.toFixed(1)}%`;
    default:
      return String(value);
  }
};

export const isSignificantP = (value: CellValue): boolean =>
  typeof value === 'number' && isFinite(value) && value < 0.05;

export const interpretD = (d: number): string => {
  if (!isFiniteNumber(d)) return '—';
  const a = Math.abs(d);
  if (a < 0.2) return 'trascurabile';
  if (a < 0.5) return 'piccolo';
  if (a < 0.8) return 'medio';
  return 'grande';
};

export const interpretR = (r: number): string => {
  if (!isFiniteNumber(r)) return '—';
  const a = Math.abs(r);
  if (a < 0.1) return 'trascurabile';
  if (a < 0.3) return 'debole';
  if (a < 0.5) return 'moderata';
  if (a < 0.7) return 'forte';
  return 'molto forte';
};

export const interpretEta = (eta: number): string => {
  if (!isFiniteNumber(eta)) return '—';
  if (eta < 0.01) return 'trascurabile';
  if (eta < 0.06) return 'piccolo';
  if (eta < 0.14) return 'medio';
  return 'grande';
};

export const interpretPhi = (value: number): string => {
  if (!isFiniteNumber(value)) return '—';
  const a = Math.abs(value);
  if (a < 0.1) return 'trascurabile';
  if (a < 0.3) return 'debole';
  if (a < 0.5) return 'moderata';
  return 'forte';
};

export const pStars = (p: number): string => stars(p);
