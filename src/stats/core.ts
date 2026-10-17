import * as jStatNamespace from 'jstat';

// jstat is a CommonJS module without type declarations: resolve it both under
// Vite (named interop) and under plain Node/tsx (default interop).
const jStat: any = (jStatNamespace as any).jStat ?? (jStatNamespace as any).default ?? jStatNamespace;

export const parseNum = (x: string | number | undefined | null): number => {
  if (x === undefined || x === null) return NaN;
  if (typeof x === 'number') return x;
  const clean = x.trim().replace(',', '.');
  return parseFloat(clean);
};

/**
 * Paired samples must come from the same rows: filtering each column on its
 * own silently pairs values that belong to different observations when cells
 * are empty or invalid. Only complete pairs are returned, so `a[i]` and `b[i]`
 * always belong to the same row.
 */
export const pairedValues = (rows: string[][], var1: number, var2: number) => {
  const a: number[] = [];
  const b: number[] = [];
  rows.forEach(row => {
    const x = parseNum(row[var1]);
    const y = parseNum(row[var2]);
    if (!isNaN(x) && !isNaN(y)) {
      a.push(x);
      b.push(y);
    }
  });
  return { a, b };
};

export interface TTestResult {
  t: number;
  df: number;
  p: number;
  se: number;
}

const pValueFromT = (t: number, df: number): number => {
  if (!isFinite(t) || !isFinite(df) || df <= 0) return NaN;
  return 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));
};

/** Student t-test with pooled variance (equal variances assumed). */
export const pooledTTest = (a: number[], b: number[]): TTestResult => {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 2 || n2 < 2) return { t: NaN, df: NaN, p: NaN, se: NaN };

  const m1 = jStat.mean(a);
  const m2 = jStat.mean(b);
  const v1 = jStat.variance(a, true);
  const v2 = jStat.variance(b, true);

  const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
  const se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
  const df = n1 + n2 - 2;
  const t = (m1 - m2) / se;

  return { t, df, p: pValueFromT(t, df), se };
};

/** Welch's t-test (unequal variances) with Welch-Satterthwaite df. */
export const welchTTest = (a: number[], b: number[]): TTestResult => {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 2 || n2 < 2) return { t: NaN, df: NaN, p: NaN, se: NaN };

  const m1 = jStat.mean(a);
  const m2 = jStat.mean(b);
  const v1 = jStat.variance(a, true);
  const v2 = jStat.variance(b, true);

  const s1 = v1 / n1;
  const s2 = v2 / n2;
  const se = Math.sqrt(s1 + s2);
  const t = (m1 - m2) / se;
  const df = Math.pow(s1 + s2, 2) / (Math.pow(s1, 2) / (n1 - 1) + Math.pow(s2, 2) / (n2 - 1));

  return { t, df, p: pValueFromT(t, df), se };
};

export interface HistogramResult {
  bins: number;
  binWidth: number;
  edges: number[];
  data: { x: number; y: number }[];
}

/**
 * Equal-width histogram using the same bin count as the descriptive table.
 * Handles empty input and constant data (width 0) without producing NaNs.
 */
export const buildHistogram = (values: number[], binCount?: number): HistogramResult => {
  const n = values.length;
  if (n === 0) return { bins: 0, binWidth: 0, edges: [], data: [] };

  const bins = binCount ?? Math.ceil(Math.sqrt(n));
  const min = jStat.min(values);
  const max = jStat.max(values);
  const range = max - min;

  if (range === 0) {
    return { bins: 1, binWidth: 0, edges: [min, max], data: [{ x: min, y: n }] };
  }

  const binWidth = range / bins;
  const counts: number[] = jStat.histogram(values, bins);
  const data = counts.map((y, i) => ({ x: min + i * binWidth + binWidth / 2, y }));
  const edges = Array.from({ length: bins + 1 }, (_, i) => min + i * binWidth);

  return { bins, binWidth, edges, data };
};
