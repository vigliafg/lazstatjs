import { jStat } from './jstat';

// ---------------------------------------------------------------------------
// Distributions and confidence intervals
// ---------------------------------------------------------------------------

export const alphaFromLevel = (level: number): number => 1 - level / 100;

export const zCrit = (level: number): number =>
  jStat.normal.inv(1 - alphaFromLevel(level) / 2, 0, 1);

export const tCrit = (level: number, df: number): number =>
  jStat.studentt.inv(1 - alphaFromLevel(level) / 2, df);

export const tSF = (t: number, df: number): number => {
  if (!isFinite(t) || !isFinite(df) || df <= 0) return NaN;
  return jStat.studentt.cdf(-Math.abs(t), df);
};

export const twoSidedTP = (t: number, df: number): number => 2 * tSF(t, df);

export const chi2SF = (x: number, df: number): number => {
  if (!isFinite(x) || df <= 0) return NaN;
  return 1 - jStat.chisquare.cdf(x, df);
};

export const fSF = (f: number, df1: number, df2: number): number => {
  if (!isFinite(f) || df1 <= 0 || df2 <= 0) return NaN;
  return 1 - jStat.centralF.cdf(f, df1, df2);
};

export const zTwoSidedP = (z: number): number =>
  2 * jStat.normal.cdf(-Math.abs(z), 0, 1);

export interface MeanCI {
  mean: number;
  se: number;
  df: number;
  lo: number;
  hi: number;
  crit: number;
}

export const meanCI = (values: number[], level = 95): MeanCI => {
  const n = values.length;
  const mean = jStat.mean(values);
  const sd = jStat.stdev(values, true);
  const se = sd / Math.sqrt(n);
  const df = n - 1;
  const crit = n > 1 ? tCrit(level, df) : NaN;
  return {
    mean,
    se,
    df,
    lo: n > 1 ? mean - crit * se : NaN,
    hi: n > 1 ? mean + crit * se : NaN,
    crit,
  };
};

/** Distribution-free (order statistic) confidence interval for the median. */
export const medianCI = (
  values: number[],
  level = 95
): { median: number; lo: number; hi: number; k: number } => {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const alpha = alphaFromLevel(level);
  let k = 0;
  for (let kk = 1; kk <= Math.floor(n / 2); kk++) {
    if (jStat.binomial.cdf(kk - 1, n, 0.5) <= alpha / 2) k = kk;
  }
  if (k === 0) return { median: jStat.median(sorted), lo: NaN, hi: NaN, k: 0 };
  return {
    median: jStat.median(sorted),
    lo: sorted[k - 1],
    hi: sorted[n - k],
    k,
  };
};

export const trimmedMean = (values: number[], proportion = 0.05): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const trim = Math.floor(n * proportion);
  if (n - 2 * trim <= 0) return jStat.mean(sorted);
  const kept = sorted.slice(trim, n - trim);
  return jStat.mean(kept);
};

export const medianAbsoluteDeviation = (values: number[]): number => {
  const med = jStat.median(values);
  const deviations = values.map(v => Math.abs(v - med));
  return jStat.median(deviations);
};

export const percentile = (values: number[], p: number): number =>
  jStat.percentile([...values].sort((a, b) => a - b), p);

export const skewnessSE = (n: number): number => {
  if (n < 3) return NaN;
  return Math.sqrt((6 * n * (n - 1)) / ((n - 2) * (n + 1) * (n + 3)));
};

export const kurtosisSE = (n: number): number => {
  if (n < 4) return NaN;
  return Math.sqrt(
    (24 * n * (n - 1) * (n - 1)) / ((n - 3) * (n - 2) * (n + 3) * (n + 5))
  );
};

export const fisherZCI = (
  r: number,
  n: number,
  level = 95
): { lo: number; hi: number; z: number } => {
  if (!isFinite(r) || n < 4 || Math.abs(r) >= 1) return { lo: NaN, hi: NaN, z: NaN };
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const se = 1 / Math.sqrt(n - 3);
  const crit = zCrit(level);
  return {
    z,
    lo: Math.tanh(z - crit * se),
    hi: Math.tanh(z + crit * se),
  };
};

export const correlationP = (r: number, n: number): number => {
  if (!isFinite(r) || n < 3 || Math.abs(r) >= 1) return NaN;
  const df = n - 2;
  const t = r * Math.sqrt(df / (1 - r * r));
  return twoSidedTP(t, df);
};

export const kendallP = (tau: number, n: number): number => {
  if (!isFinite(tau) || n < 3) return NaN;
  const z = (3 * tau * Math.sqrt(n * (n - 1))) / Math.sqrt(2 * (2 * n + 5));
  return zTwoSidedP(z);
};

export const spearmanP = (rho: number, n: number): number => {
  if (!isFinite(rho) || n < 3 || Math.abs(rho) >= 1) return NaN;
  const t = rho * Math.sqrt((n - 2) / (1 - rho * rho));
  return twoSidedTP(t, n - 2);
};

// ---------------------------------------------------------------------------
// Effect sizes
// ---------------------------------------------------------------------------

export const pooledSD = (a: number[], b: number[]): number => {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 2 || n2 < 2) return NaN;
  const v1 = jStat.variance(a, true);
  const v2 = jStat.variance(b, true);
  return Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
};

export const cohensD = (m1: number, m2: number, sp: number): number =>
  sp > 0 ? (m1 - m2) / sp : NaN;

export const hedgesCorrection = (n1: number, n2: number): number =>
  1 - 3 / (4 * (n1 + n2) - 9);

export const dStandardError = (d: number, n1: number, n2: number): number =>
  Math.sqrt((n1 + n2) / (n1 * n2) + (d * d) / (2 * (n1 + n2)));

export const pairedDStandardError = (dz: number, n: number): number =>
  Math.sqrt(1 / n + (dz * dz) / (2 * n));

export const dCI = (
  d: number,
  se: number,
  level = 95
): { lo: number; hi: number } => {
  const crit = zCrit(level);
  return { lo: d - crit * se, hi: d + crit * se };
};

// ---------------------------------------------------------------------------
// Assumption tests
// ---------------------------------------------------------------------------

export interface FTestResult {
  stat: number;
  df1: number;
  df2: number;
  p: number;
}

/** Levene's test (center = 'mean') or the Brown-Forsythe variant (center = 'median'). */
export const leveneTest = (
  groups: number[][],
  center: 'mean' | 'median' = 'mean'
): FTestResult => {
  const k = groups.length;
  const nTotal = groups.reduce((s, g) => s + g.length, 0);
  if (k < 2 || nTotal <= k) return { stat: NaN, df1: k - 1, df2: nTotal - k, p: NaN };

  const zGroups = groups.map(g => {
    const c = center === 'median' ? jStat.median(g) : jStat.mean(g);
    return g.map(v => Math.abs(v - c));
  });
  const grand = jStat.mean(zGroups.flat());
  let numerator = 0;
  let denominator = 0;
  zGroups.forEach(zg => {
    const zm = jStat.mean(zg);
    numerator += zg.length * Math.pow(zm - grand, 2);
    zg.forEach(z => {
      denominator += Math.pow(z - zm, 2);
    });
  });
  const df1 = k - 1;
  const df2 = nTotal - k;
  const stat = denominator === 0 ? NaN : ((nTotal - k) / (k - 1)) * (numerator / denominator);
  return { stat, df1, df2, p: fSF(stat, df1, df2) };
};

/** Welch's one-way ANOVA (does not assume equal variances). */
export const welchAnova = (groups: number[][]): FTestResult => {
  const k = groups.length;
  if (k < 2) return { stat: NaN, df1: NaN, df2: NaN, p: NaN };
  const ns = groups.map(g => g.length);
  const means = groups.map(g => jStat.mean(g));
  const variances = groups.map(g => jStat.variance(g, true));
  if (variances.some(v => !isFinite(v) || v <= 0)) {
    return { stat: NaN, df1: k - 1, df2: NaN, p: NaN };
  }
  const weights = ns.map((n, i) => n / variances[i]);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const weightedMean = weights.reduce((s, w, i) => s + w * means[i], 0) / wSum;

  const a = weights.reduce(
    (s, w, i) => s + (w * Math.pow(means[i] - weightedMean, 2)) / (k - 1),
    0
  );
  const lambdaSum = ns.reduce(
    (s, n, i) => s + Math.pow(1 - weights[i] / wSum, 2) / (n - 1),
    0
  );
  const b = 1 + (2 * (k - 2)) / (k * k - 1) * lambdaSum;
  const stat = a / b;
  const df1 = k - 1;
  const df2 = (k * k - 1) / (3 * lambdaSum);
  return { stat, df1, df2, p: fSF(stat, df1, df2) };
};

// ---------------------------------------------------------------------------
// Multiple comparisons
// ---------------------------------------------------------------------------

export const bonferroniAdjust = (pValues: number[]): number[] =>
  pValues.map(p => Math.min(1, p * pValues.length));

/** Holm step-down adjustment, returned in the original order. */
export const holmAdjust = (pValues: number[]): number[] => {
  const m = pValues.length;
  const order = pValues
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p - b.p);
  const adjusted = new Array<number>(m).fill(NaN);
  let running = 0;
  order.forEach((entry, rank) => {
    const value = Math.min(1, Math.max(running, entry.p * (m - rank)));
    running = value;
    adjusted[entry.i] = value;
  });
  return adjusted;
};

export const rankValues = (values: number[]): number[] => {
  const indexed = values.map((value, i) => ({ value, i }));
  indexed.sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length - 1 && indexed[j + 1].value === indexed[i].value) j++;
    const average = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = average;
    i = j + 1;
  }
  return ranks;
};

export interface DunnResult {
  a: string;
  b: string;
  z: number;
  p: number;
  pAdj: number;
}

/** Dunn's post-hoc test for Kruskal-Wallis with Holm adjustment by default. */
export const dunnTest = (
  groups: { [key: string]: number[] },
  adjustment: 'holm' | 'bonferroni' = 'holm'
): DunnResult[] => {
  const keys = Object.keys(groups);
  const all: { value: number; group: string }[] = [];
  keys.forEach(key => groups[key].forEach(value => all.push({ value, group: key })));
  const N = all.length;
  if (N === 0 || keys.length < 2) return [];

  const ranks = rankValues(all.map(v => v.value));
  all.forEach((entry, i) => {
    (entry as any).rank = ranks[i];
  });

  const tieCounts: { [value: number]: number } = {};
  all.forEach(entry => {
    tieCounts[entry.value] = (tieCounts[entry.value] || 0) + 1;
  });
  const tieSum = Object.values(tieCounts).reduce(
    (s, count) => s + (count > 1 ? count ** 3 - count : 0),
    0
  );
  const rankVariance = N * (N + 1) / 12 - tieSum / (12 * (N - 1));

  const meanRanks: { [key: string]: number } = {};
  const ns: { [key: string]: number } = {};
  keys.forEach(key => {
    ns[key] = groups[key].length;
    const sum = all.filter(e => e.group === key).reduce((s, e) => s + (e as any).rank, 0);
    meanRanks[key] = sum / ns[key];
  });

  const results: DunnResult[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i];
      const b = keys[j];
      const se = Math.sqrt(rankVariance * (1 / ns[a] + 1 / ns[b]));
      const z = se > 0 ? (meanRanks[a] - meanRanks[b]) / se : NaN;
      results.push({ a, b, z, p: zTwoSidedP(z), pAdj: NaN });
    }
  }

  const raw = results.map(r => r.p);
  const adjusted = adjustment === 'holm' ? holmAdjust(raw) : bonferroniAdjust(raw);
  results.forEach((r, i) => {
    r.pAdj = adjusted[i];
  });
  return results;
};

// ---------------------------------------------------------------------------
// Bootstrap and normality
// ---------------------------------------------------------------------------

export const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const bootstrapCI = (
  statistic: (rnd: () => number) => number,
  level = 95,
  reps = 1000,
  seed = 20261017
): { estimate: number; lo: number; hi: number } => {
  const rnd = mulberry32(seed);
  const values: number[] = [];
  for (let i = 0; i < reps; i++) {
    const value = statistic(rnd);
    if (isFinite(value)) values.push(value);
  }
  if (values.length === 0) return { estimate: NaN, lo: NaN, hi: NaN };
  values.sort((a, b) => a - b);
  const tail = (1 - level / 100) / 2;
  const loIndex = Math.max(0, Math.floor(tail * (values.length - 1)));
  const hiIndex = Math.min(values.length - 1, Math.ceil((1 - tail) * (values.length - 1)));
  return {
    estimate: jStat.median(values),
    lo: values[loIndex],
    hi: values[hiIndex],
  };
};

const ksDistance = (sorted: number[], mean: number, sd: number): number => {
  const n = sorted.length;
  let d = 0;
  for (let i = 0; i < n; i++) {
    const cdf = jStat.normal.cdf(sorted[i], mean, sd);
    d = Math.max(d, Math.abs((i + 1) / n - cdf), Math.abs(cdf - i / n));
  }
  return d;
};

/**
 * Lilliefors-corrected Kolmogorov-Smirnov test (parameters estimated from the
 * sample). The p-value is obtained by Monte Carlo with a fixed seed so results
 * are reproducible; the naive KS p-value is anti-conservative in this setting.
 */
export const lillieforsTest = (
  values: number[],
  reps = 1000,
  seed = 20261017
): { d: number; p: number } => {
  const n = values.length;
  if (n < 5) return { d: NaN, p: NaN };
  const mean = jStat.mean(values);
  const sd = jStat.stdev(values, true);
  if (!(sd > 0)) return { d: NaN, p: NaN };

  const sorted = [...values].sort((a, b) => a - b);
  const observed = ksDistance(sorted, mean, sd);

  const rnd = mulberry32(seed);
  const randomNormal = () => {
    const u1 = Math.max(rnd(), 1e-12);
    const u2 = rnd();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  let asExtreme = 0;
  for (let r = 0; r < reps; r++) {
    const sample = new Array<number>(n);
    for (let i = 0; i < n; i++) sample[i] = randomNormal();
    sample.sort((a, b) => a - b);
    const sMean = jStat.mean(sample);
    const sSd = jStat.stdev(sample, true);
    if (!(sSd > 0)) continue;
    if (ksDistance(sample, sMean, sSd) >= observed - 1e-12) asExtreme++;
  }

  return { d: observed, p: (asExtreme + 1) / (reps + 1) };
};

/** D'Agostino-Pearson K2 omnibus normality test (skewness + kurtosis). */
export const dagostinoPearson = (
  values: number[]
): { k2: number; p: number; z1: number; z2: number } => {
  const n = values.length;
  if (n < 8) return { k2: NaN, p: NaN, z1: NaN, z2: NaN };
  const skew = jStat.skewness(values);
  const excessKurt = jStat.kurtosis(values);

  const y = skew * Math.sqrt(((n + 1) * (n + 3)) / (6 * (n - 2)));
  const beta2 =
    (3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3)) /
    ((n - 2) * (n + 5) * (n + 7) * (n + 9));
  const w2 = -1 + Math.sqrt(2 * (beta2 - 1));
  const delta = 1 / Math.sqrt(0.5 * Math.log(w2));
  const alpha = Math.sqrt(2 / (w2 - 1));
  const z1 = delta * Math.asinh(y / alpha);

  const b2 = excessKurt + 3;
  const expected = (3 * (n - 1)) / (n + 1);
  const variance =
    (24 * n * (n - 2) * (n - 3)) /
    ((n + 1) * (n + 1) * (n + 3) * (n + 5));
  const x = (b2 - expected) / Math.sqrt(variance);
  const sqrtBeta1 =
    (6 * (n * n - 5 * n + 2)) /
    ((n + 7) * (n + 9)) *
    Math.sqrt((6 * (n + 3) * (n + 5)) / (n * (n - 2) * (n - 3)));
  const A = 6 + (8 / sqrtBeta1) * (2 / sqrtBeta1 + Math.sqrt(1 + 4 / (sqrtBeta1 * sqrtBeta1)));
  if (!(A > 4)) return { k2: NaN, p: NaN, z1: NaN, z2: NaN };
  const term1 = 1 - 2 / (9 * A);
  const term2 = (1 - 2 / A) / (1 + x * Math.sqrt(2 / (A - 4)));
  const z2 = (term1 - Math.cbrt(term2)) / Math.sqrt(2 / (9 * A));

  const k2 = z1 * z1 + z2 * z2;
  return { k2, p: chi2SF(k2, 2), z1, z2 };
};
