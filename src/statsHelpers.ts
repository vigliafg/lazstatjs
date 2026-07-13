import { jStat } from 'jstat';

// Helper for log-factorials to prevent overflow in Fisher's exact test
export const logFactorial = (n: number): number => {
  let ans = 0;
  for (let i = 2; i <= n; i++) {
    ans += Math.log(i);
  }
  return ans;
};

// Calculate probability of a specific 2x2 table configuration
export const fisherTableProb = (a: number, b: number, c: number, d: number): number => {
  const n = a + b + c + d;
  const logNumerator = logFactorial(a + b) + logFactorial(c + d) + logFactorial(a + c) + logFactorial(b + d);
  const logDenominator = logFactorial(a) + logFactorial(b) + logFactorial(c) + logFactorial(d) + logFactorial(n);
  return Math.exp(logNumerator - logDenominator);
};

/**
 * Fisher's Exact Test for 2x2 contingency tables
 * Returns the exact two-tailed p-value
 */
export const calcFisherExact = (a: number, b: number, c: number, d: number): number => {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const c2 = b + d;
  const n = r1 + r2;

  if (n === 0) return 1.0;

  const obsProb = fisherTableProb(a, b, c, d);

  // Determine limits for the top-left cell (x)
  const minX = Math.max(0, r1 - c2, c1 - r2);
  const maxX = Math.min(r1, c1);

  let pValue = 0;
  for (let x = minX; x <= maxX; x++) {
    const ta = x;
    const tb = r1 - x;
    const tc = c1 - x;
    const td = r2 - tc;

    const prob = fisherTableProb(ta, tb, tc, td);
    // Sum probabilities <= observed probability (with tolerance for floating point)
    if (prob <= obsProb + 1e-9) {
      pValue += prob;
    }
  }

  // Cap at 1.0
  return Math.min(1.0, pValue);
};

/**
 * Wilcoxon Signed-Rank Test (One-sample or Paired differences)
 */
export interface WilcoxonResult {
  wStat: number;
  zStat: number;
  pValue: number;
  posRankSum: number;
  negRankSum: number;
  nEffective: number;
}

export const calcWilcoxonSignedRank = (vals: number[], testVal: number = 0): WilcoxonResult => {
  // Subtract testVal and filter zero differences
  const diffs = vals.map(v => v - testVal).filter(v => v !== 0);
  const n = diffs.length;

  if (n < 3) {
    return { wStat: NaN, zStat: NaN, pValue: NaN, posRankSum: 0, negRankSum: 0, nEffective: n };
  }

  // Abs diffs with original values and sign
  const absDiffs = diffs.map((d, idx) => ({
    idx,
    diff: d,
    abs: Math.abs(d),
    rank: 0
  }));

  // Sort by absolute differences
  absDiffs.sort((a, b) => a.abs - b.abs);

  // Assign ranks (with average rank for ties)
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n - 1 && absDiffs[j + 1].abs === absDiffs[i].abs) {
      j++;
    }
    // Average rank for index i to j (which corresponds to ranks i+1 to j+1)
    const sumRanks = ((j + 1) * (j + 2)) / 2 - (i * (i + 1)) / 2;
    const avgRank = sumRanks / (j - i + 1);
    for (let k = i; k <= j; k++) {
      absDiffs[k].rank = avgRank;
    }
    i = j + 1;
  }

  // Sum positive and negative ranks
  let posRankSum = 0;
  let negRankSum = 0;
  absDiffs.forEach(item => {
    if (item.diff > 0) {
      posRankSum += item.rank;
    } else {
      negRankSum += item.rank;
    }
  });

  const wStat = Math.min(posRankSum, negRankSum);

  // Normal approximation
  const muW = (n * (n + 1)) / 4;

  // Tie correction sum (t^3 - t) / 48
  const tieCounts: { [val: number]: number } = {};
  absDiffs.forEach(item => {
    tieCounts[item.abs] = (tieCounts[item.abs] || 0) + 1;
  });
  let tieSum = 0;
  Object.values(tieCounts).forEach(count => {
    if (count > 1) {
      tieSum += (count * count * count - count);
    }
  });

  const sigmaW = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - tieSum / 48);

  let zStat = 0;
  if (sigmaW > 0) {
    const diff = wStat - muW;
    // Continuity correction of 0.5
    if (diff < 0) {
      zStat = (diff + 0.5) / sigmaW;
    } else if (diff > 0) {
      zStat = (diff - 0.5) / sigmaW;
    } else {
      zStat = 0;
    }
  }

  let pValue = 1.0;
  try {
    // 2-tailed p-value
    const standardNormalCDF = (z: number) => {
      // Hand-crafted standard normal CDF approximation or jStat
      // jStat.normal.cdf is reliable, but let's provide a solid fallback just in case
      try {
        return jStat.normal.cdf(z, 0, 1);
      } catch {
        // Fallback approximation of standard normal CDF
        const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
        const d = 0.39894228 * Math.exp(-z * z / 2.0);
        const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
        return z >= 0 ? 1.0 - p : p;
      }
    };
    pValue = 2 * standardNormalCDF(-Math.abs(zStat));
    if (isNaN(pValue)) pValue = 1.0;
  } catch (err) {
    console.error(err);
  }

  return {
    wStat,
    zStat,
    pValue: Math.min(1.0, pValue),
    posRankSum,
    negRankSum,
    nEffective: n
  };
};

/**
 * Mann-Whitney U Test (Wilcoxon Rank-Sum Test)
 */
export interface MannWhitneyResult {
  uStat: number;
  zStat: number;
  pValue: number;
  sumRank1: number;
  sumRank2: number;
  meanRank1: number;
  meanRank2: number;
}

export const calcMannWhitneyU = (a1: number[], a2: number[]): MannWhitneyResult => {
  const n1 = a1.length;
  const n2 = a2.length;

  if (n1 === 0 || n2 === 0) {
    return { uStat: NaN, zStat: NaN, pValue: NaN, sumRank1: 0, sumRank2: 0, meanRank1: 0, meanRank2: 0 };
  }

  // Combine and rank
  const combined = [
    ...a1.map(v => ({ val: v, group: 1, rank: 0 })),
    ...a2.map(v => ({ val: v, group: 2, rank: 0 }))
  ];
  const N = combined.length;

  // Sort
  combined.sort((a, b) => a.val - b.val);

  // Assign ranks with average for ties
  let i = 0;
  while (i < N) {
    let j = i;
    while (j < N - 1 && combined[j + 1].val === combined[i].val) {
      j++;
    }
    const sumRanks = ((j + 1) * (j + 2)) / 2 - (i * (i + 1)) / 2;
    const avgRank = sumRanks / (j - i + 1);
    for (let k = i; k <= j; k++) {
      combined[k].rank = avgRank;
    }
    i = j + 1;
  }

  let sumRank1 = 0;
  let sumRank2 = 0;
  combined.forEach(item => {
    if (item.group === 1) {
      sumRank1 += item.rank;
    } else {
      sumRank2 += item.rank;
    }
  });

  const u1 = n1 * n2 + (n1 * (n1 + 1)) / 2 - sumRank1;
  const u2 = n1 * n2 - u1;
  const uStat = Math.min(u1, u2);

  const muU = (n1 * n2) / 2;

  // Tie correction
  const tieCounts: { [val: number]: number } = {};
  combined.forEach(item => {
    tieCounts[item.val] = (tieCounts[item.val] || 0) + 1;
  });
  let tieSum = 0;
  Object.values(tieCounts).forEach(count => {
    if (count > 1) {
      tieSum += (count * count * count - count);
    }
  });

  const sigmaU = Math.sqrt(
    (n1 * n2 / (N * (N - 1))) * (((N * N * N - N) / 12) - (tieSum / 12))
  );

  let zStat = 0;
  if (sigmaU > 0) {
    const diff = uStat - muU;
    // Continuity correction of 0.5
    if (diff < 0) {
      zStat = (diff + 0.5) / sigmaU;
    } else if (diff > 0) {
      zStat = (diff - 0.5) / sigmaU;
    } else {
      zStat = 0;
    }
  }

  let pValue = 1.0;
  try {
    const standardNormalCDF = (z: number) => {
      try {
        return jStat.normal.cdf(z, 0, 1);
      } catch {
        const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
        const d = 0.39894228 * Math.exp(-z * z / 2.0);
        const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
        return z >= 0 ? 1.0 - p : p;
      }
    };
    pValue = 2 * standardNormalCDF(-Math.abs(zStat));
    if (isNaN(pValue)) pValue = 1.0;
  } catch (err) {
    console.error(err);
  }

  return {
    uStat,
    zStat,
    pValue: Math.min(1.0, pValue),
    sumRank1,
    sumRank2,
    meanRank1: sumRank1 / n1,
    meanRank2: sumRank2 / n2
  };
};

/**
 * Kruskal-Wallis Test (Non-parametric One-Way ANOVA)
 */
export interface KruskalWallisResult {
  hStat: number;
  pValue: number;
  df: number;
  groupMeanRanks: { [key: string]: number };
  groupRankSums: { [key: string]: number };
  groupNs: { [key: string]: number };
}

export const calcKruskalWallis = (groups: { [key: string]: number[] }): KruskalWallisResult => {
  const groupKeys = Object.keys(groups);
  const k = groupKeys.length;

  const combined: { val: number; gKey: string; rank: number }[] = [];
  groupKeys.forEach(key => {
    groups[key].forEach(v => {
      combined.push({ val: v, gKey: key, rank: 0 });
    });
  });

  const N = combined.length;
  if (N < 3) {
    return { hStat: NaN, pValue: NaN, df: k - 1, groupMeanRanks: {}, groupRankSums: {}, groupNs: {} };
  }

  // Sort
  combined.sort((a, b) => a.val - b.val);

  // Assign ranks with average for ties
  let i = 0;
  while (i < N) {
    let j = i;
    while (j < N - 1 && combined[j + 1].val === combined[i].val) {
      j++;
    }
    const sumRanks = ((j + 1) * (j + 2)) / 2 - (i * (i + 1)) / 2;
    const avgRank = sumRanks / (j - i + 1);
    for (let k = i; k <= j; k++) {
      combined[k].rank = avgRank;
    }
    i = j + 1;
  }

  // Rank sums
  const groupRankSums: { [key: string]: number } = {};
  const groupNs: { [key: string]: number } = {};
  groupKeys.forEach(key => {
    groupRankSums[key] = 0;
    groupNs[key] = groups[key].length;
  });

  combined.forEach(item => {
    groupRankSums[item.gKey] += item.rank;
  });

  // H statistic
  let rankSumTerm = 0;
  groupKeys.forEach(key => {
    const R_j = groupRankSums[key];
    const n_j = groupNs[key];
    if (n_j > 0) {
      rankSumTerm += (R_j * R_j) / n_j;
    }
  });

  let hStat = (12 / (N * (N + 1))) * rankSumTerm - 3 * (N + 1);

  // Tie correction
  const tieCounts: { [val: number]: number } = {};
  combined.forEach(item => {
    tieCounts[item.val] = (tieCounts[item.val] || 0) + 1;
  });
  let tieSum = 0;
  Object.values(tieCounts).forEach(count => {
    if (count > 1) {
      tieSum += (count * count * count - count);
    }
  });

  const tieCorrection = 1 - (tieSum / (N * N * N - N));
  if (tieCorrection > 0 && tieCorrection < 1) {
    hStat /= tieCorrection;
  }

  const df = k - 1;
  let pValue = 1.0;
  try {
    pValue = 1.0 - jStat.chisquare.cdf(hStat, df);
    if (isNaN(pValue)) pValue = 1.0;
  } catch (err) {
    console.error(err);
  }

  const groupMeanRanks: { [key: string]: number } = {};
  groupKeys.forEach(key => {
    groupMeanRanks[key] = groupRankSums[key] / groupNs[key];
  });

  return {
    hStat,
    pValue,
    df,
    groupMeanRanks,
    groupRankSums,
    groupNs
  };
};

/**
 * Robust Theil-Sen regression estimator (for simple linear regression)
 */
export interface TheilSenResult {
  slope: number;
  intercept: number;
}

export const calcTheilSen = (xs: number[], ys: number[]): TheilSenResult => {
  const n = xs.length;
  const slopes: number[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (xs[j] !== xs[i]) {
        slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
      }
    }
  }

  if (slopes.length === 0) {
    return { slope: NaN, intercept: NaN };
  }

  const slope = jStat.median(slopes);
  const intercepts = xs.map((x, i) => ys[i] - slope * x);
  const intercept = jStat.median(intercepts);

  return { slope, intercept };
};

/**
 * Kendall's Tau correlation coefficient (Tau-b robust estimation)
 */
export const calcKendallTau = (x: number[], y: number[]): number => {
  const n = x.length;
  if (n < 2) return NaN;

  let concordant = 0;
  let discordant = 0;
  let tieX = 0;
  let tieY = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const xDiff = x[j] - x[i];
      const yDiff = y[j] - y[i];

      if (xDiff === 0 && yDiff === 0) {
        continue;
      } else if (xDiff === 0) {
        tieX++;
      } else if (yDiff === 0) {
        tieY++;
      } else if (xDiff * yDiff > 0) {
        concordant++;
      } else {
        discordant++;
      }
    }
  }

  const totalPairs = (n * (n - 1)) / 2;
  const n1 = tieX;
  const n2 = tieY;
  
  const denominator = Math.sqrt((totalPairs - n1) * (totalPairs - n2));
  if (denominator === 0) return 0;

  return (concordant - discordant) / denominator;
};

/**
 * Normality Tests: Jarque-Bera and Kolmogorov-Smirnov
 */
export interface NormalityResult {
  n: number;
  mean: number;
  stdev: number;
  jbStat: number;
  jbPValue: number;
  ksStat: number;
  ksPValue: number;
}

export const calcNormalityTests = (data: number[]): NormalityResult => {
  const n = data.length;
  if (n < 3) {
    return { n, mean: NaN, stdev: NaN, jbStat: NaN, jbPValue: NaN, ksStat: NaN, ksPValue: NaN };
  }
  
  const mean = jStat.mean(data);
  const stdev = jStat.stdev(data, true); // sample SD
  
  if (stdev === 0) {
    return { n, mean, stdev, jbStat: NaN, jbPValue: NaN, ksStat: NaN, ksPValue: NaN };
  }
  
  // 1. Jarque-Bera Test
  const skew = jStat.skewness(data);
  const excessKurt = jStat.kurtosis(data); // excess kurtosis (0 for normal)
  const jbStat = (n / 6) * (skew * skew + (excessKurt * excessKurt) / 4);
  const jbPValue = Math.exp(-jbStat / 2);
  
  // 2. Kolmogorov-Smirnov Test
  // Sort data ascending
  const sorted = [...data].sort((a, b) => a - b);
  let maxDiff = 0;
  
  for (let i = 0; i < n; i++) {
    const x = sorted[i];
    // Empirical CDF at current and previous steps
    const ecdfPlus = (i + 1) / n;
    const ecdfMinus = i / n;
    // Theoretical CDF
    const theoreticalCDF = jStat.normal.cdf(x, mean, stdev);
    
    const dPlus = Math.abs(ecdfPlus - theoreticalCDF);
    const dMinus = Math.abs(ecdfMinus - theoreticalCDF);
    
    if (dPlus > maxDiff) maxDiff = dPlus;
    if (dMinus > maxDiff) maxDiff = dMinus;
  }
  
  const ksStat = maxDiff;
  
  // KS p-value approximation
  // z = KS_statistic * (sqrt(n) + 0.12 + 0.11 / sqrt(n))
  const sqrtN = Math.sqrt(n);
  const z = ksStat * (sqrtN + 0.12 + 0.11 / sqrtN);
  
  let ksPValue = 1.0;
  if (z >= 0.2) {
    let sum = 0;
    for (let k = 1; k <= 50; k++) {
      const term = Math.pow(-1, k - 1) * Math.exp(-2 * k * k * z * z);
      sum += term;
    }
    ksPValue = 2 * sum;
    ksPValue = Math.max(0, Math.min(1, ksPValue));
  }
  
  return {
    n,
    mean,
    stdev,
    jbStat,
    jbPValue,
    ksStat,
    ksPValue
  };
};

