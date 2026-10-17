import { jStat } from './jstat';
import type { TableSpec } from './types';
import { fmtEst, fmtP } from './format';
import { chi2SF, zCrit, zTwoSidedP } from './distributions';
import { isDecided } from './reportKit';
import { autocorrelation, ljungBox, runsTest } from './timeseries';

/**
 * ARIMA / SARIMA models (Box–Jenkins).
 *
 * Estimation is conditional least squares: the residual recursion
 *   z_t = c + Σ φ_i z_{t-i} + e_t + Σ θ_j e_{t-j}
 * is evaluated with pre-sample innovations set to zero, starting once the
 * longest lag is available. Parameters are found with Nelder–Mead and their
 * standard errors come from the Gauss–Newton (J'J) approximation. The orders
 * are searched over a small grid and ranked by AICc.
 *
 * Seasonal models are multiplicative:
 *   (1 − φ(B))(1 − Φ(B^s))(1 − B)^d(1 − B^s)^D y_t
 *     = c + (1 + θ(B))(1 + Θ(B^s)) e_t
 * and forecasts are integrated back to the original scale, with intervals
 * built from the ψ-weights of the full ARIMA operator.
 */

export interface ArimaOrder {
  p: number;
  d: number;
  q: number;
  P: number;
  D: number;
  Q: number;
  s: number;
}

export interface ArimaCoefficient {
  term: string;
  estimate: number;
  se: number;
  z: number;
  p: number;
  lo: number;
  hi: number;
}

export interface ArimaForecastPoint {
  step: number;
  mean: number;
  se: number;
  lo: number;
  hi: number;
}

export interface ArimaHoldout {
  steps: number;
  rmse: number;
  mae: number;
  mape: number;
}

export interface ArimaFit {
  order: ArimaOrder;
  label: string;
  coefficients: ArimaCoefficient[];
  constant: number;
  sigma2: number;
  residualSe: number;
  logLik: number;
  aic: number;
  aicc: number;
  bic: number;
  sse: number;
  nWork: number;
  nEff: number;
  k: number;
  start: number;
  residuals: number[];
  ljungBox: { q: number; df: number; lags: number; p: number };
  jarqueBera: { stat: number; p: number };
  runs: { runs: number; z: number; p: number };
  forecast: ArimaForecastPoint[];
  psi: number[];
  arRoot: number;
  maRoot: number;
  stationary: boolean;
  invertible: boolean;
  converged: boolean;
  holdout?: ArimaHoldout;
}

export interface ArimaSelection {
  d: number;
  D: number;
  dAuto: boolean;
  DAuto: boolean;
  adf: { stat: number; p: number; lags: number; cv5: number } | null;
  seasonalRatio: number;
  seasonalAcf: number;
}

export interface ArimaAnalysisOptions {
  values: number[];
  /** Seasonal period; 0 or 1 means no seasonality. */
  period?: number;
  horizon?: number;
  level?: number;
  /** Explicit regular order of differencing, or 'auto' (ADF test). */
  d?: number | 'auto';
  /** Explicit seasonal order of differencing, or 'auto' (heuristic). */
  D?: number | 'auto';
}

export interface ArimaAnalysisResult {
  fit: ArimaFit | null;
  candidates: ArimaFit[];
  selection: ArimaSelection | null;
  tables: TableSpec[];
}

// ---------------------------------------------------------------------------
// Polynomials, differencing and integration
// ---------------------------------------------------------------------------

const convolve = (left: number[], right: number[]): number[] => {
  const out = new Array<number>(left.length + right.length - 1).fill(0);
  for (let i = 0; i < left.length; i++) {
    for (let j = 0; j < right.length; j++) out[i + j] += left[i] * right[j];
  }
  return out;
};

/** AR polynomial 1 − φ₁B − … − φ_pB^p. */
const arPolynomial = (coefficients: number[]): number[] => [1, ...coefficients.map(value => -value)];

/** MA polynomial 1 + θ₁B + … + θ_qB^q. */
const maPolynomial = (coefficients: number[]): number[] => [1, ...coefficients];

const seasonalPolynomial = (coefficients: number[], s: number, sign: 1 | -1): number[] => {
  if (coefficients.length === 0 || s < 2) return [1];
  const out = new Array<number>(coefficients.length * s + 1).fill(0);
  out[0] = 1;
  coefficients.forEach((value, index) => {
    out[(index + 1) * s] = sign * value;
  });
  return out;
};

const variance = (values: number[]): number => {
  if (values.length < 2) return NaN;
  const mu = jStat.mean(values);
  return values.reduce((sum, value) => sum + Math.pow(value - mu, 2), 0) / (values.length - 1);
};

export const differenceSeries = (values: number[], lag = 1, order = 1): number[] => {
  let current = values.slice();
  for (let step = 0; step < order; step++) {
    const next: number[] = [];
    for (let index = lag; index < current.length; index++) {
      next.push(current[index] - current[index - lag]);
    }
    current = next;
  }
  return current;
};

interface PreparedSeries {
  levels: number[][];
  steps: { lag: number }[];
  work: number[];
}

const prepareSeries = (values: number[], d: number, D: number, s: number): PreparedSeries => {
  const levels: number[][] = [values.slice()];
  const steps: { lag: number }[] = [];
  for (let index = 0; index < d; index++) {
    levels.push(differenceSeries(levels[levels.length - 1], 1, 1));
    steps.push({ lag: 1 });
  }
  if (D > 0 && s >= 2) {
    for (let index = 0; index < D; index++) {
      levels.push(differenceSeries(levels[levels.length - 1], s, 1));
      steps.push({ lag: s });
    }
  }
  return { levels, steps, work: levels[levels.length - 1] };
};

/** Inverts the differencing steps on a block of forecasts, newest level first. */
export const integrateForecast = (
  levels: number[][],
  steps: { lag: number }[],
  future: number[]
): number[] => {
  let current = future.slice();
  for (let stepIndex = steps.length - 1; stepIndex >= 0; stepIndex--) {
    const lag = steps[stepIndex].lag;
    const base = levels[stepIndex];
    const baseLength = base.length;
    const total = new Array<number>(baseLength + current.length).fill(0);
    const next: number[] = [];
    current.forEach((value, index) => {
      const position = baseLength + index;
      const previous = position - lag;
      const previousValue = previous < baseLength ? base[previous] : total[previous];
      const integrated = previousValue + value;
      total[position] = integrated;
      next.push(integrated);
    });
    current = next;
  }
  return current;
};

// ---------------------------------------------------------------------------
// Roots of a polynomial (Durand–Kerner)
// ---------------------------------------------------------------------------

/** Moduli of the roots; coefficients are given in ascending order (constant first). */
const polynomialRootModuli = (coefficients: number[]): number[] => {
  let coeffs = coefficients.slice().reverse();
  while (coeffs.length > 1 && Math.abs(coeffs[0]) < 1e-12) coeffs.shift();
  const degree = coeffs.length - 1;
  if (degree <= 0) return [];
  if (!coeffs.every(value => Number.isFinite(value))) return [];

  const monic = coeffs.map(value => value / coeffs[0]);
  if (degree === 1) return [Math.abs(monic[1])];

  const real = new Array<number>(degree).fill(0);
  const imag = new Array<number>(degree).fill(0);
  for (let index = 0; index < degree; index++) {
    const angle = (2 * Math.PI * index) / degree + 0.4;
    real[index] = Math.cos(angle);
    imag[index] = Math.sin(angle);
  }

  const evaluate = (re: number, im: number): { re: number; im: number } => {
    let outRe = 0;
    let outIm = 0;
    for (let index = 0; index < monic.length; index++) {
      const nextRe = outRe * re - outIm * im + monic[index];
      const nextIm = outRe * im + outIm * re;
      outRe = nextRe;
      outIm = nextIm;
    }
    return { re: outRe, im: outIm };
  };

  for (let iteration = 0; iteration < 200; iteration++) {
    let biggest = 0;
    for (let k = 0; k < degree; k++) {
      const value = evaluate(real[k], imag[k]);
      let denominatorRe = 1;
      let denominatorIm = 0;
      for (let j = 0; j < degree; j++) {
        if (j === k) continue;
        const diffRe = real[k] - real[j];
        const diffIm = imag[k] - imag[j];
        const nextRe = denominatorRe * diffRe - denominatorIm * diffIm;
        const nextIm = denominatorRe * diffIm + denominatorIm * diffRe;
        denominatorRe = nextRe;
        denominatorIm = nextIm;
      }
      const denominator = denominatorRe * denominatorRe + denominatorIm * denominatorIm;
      if (!(denominator > 1e-18)) continue;
      const deltaRe = (value.re * denominatorRe + value.im * denominatorIm) / denominator;
      const deltaIm = (value.im * denominatorRe - value.re * denominatorIm) / denominator;
      real[k] -= deltaRe;
      imag[k] -= deltaIm;
      biggest = Math.max(biggest, Math.hypot(deltaRe, deltaIm));
    }
    if (biggest < 1e-12) break;
  }

  return real.map((value, index) => Math.hypot(value, imag[index]));
};

// ---------------------------------------------------------------------------
// Small linear algebra
// ---------------------------------------------------------------------------

const solveLinearSystem = (matrix: number[][], vector: number[]): number[] | null => {
  const size = vector.length;
  if (size === 0) return [];
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (!(Math.abs(augmented[pivot][column]) > 1e-12)) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const scale = augmented[column][column];
    for (let index = column; index <= size; index++) augmented[column][index] /= scale;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (factor === 0) continue;
      for (let index = column; index <= size; index++) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map((row, index) => row[size]);
};

const invertMatrix = (matrix: number[][]): number[][] | null => {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [
    ...row,
    ...Array.from({ length: size }, (_, column) => (column === index ? 1 : 0)),
  ]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (!(Math.abs(augmented[pivot][column]) > 1e-12)) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const scale = augmented[column][column];
    for (let index = 0; index < 2 * size; index++) augmented[column][index] /= scale;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (factor === 0) continue;
      for (let index = 0; index < 2 * size; index++) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map(row => row.slice(size));
};

interface OlsResult {
  beta: number[];
  sse: number;
  se: number[];
  n: number;
  k: number;
}

const olsWithErrors = (y: number[], rows: number[][]): OlsResult | null => {
  const n = rows.length;
  const k = rows[0]?.length ?? 0;
  if (k === 0 || n <= k) return null;
  const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  rows.forEach((row, index) => {
    for (let i = 0; i < k; i++) {
      xty[i] += row[i] * y[index];
      for (let j = 0; j < k; j++) xtx[i][j] += row[i] * row[j];
    }
  });
  const scaled = xtx.map((row, index) => row.map((value, column) => value + (index === column ? 1e-10 : 0)));
  const beta = solveLinearSystem(scaled, xty);
  if (!beta) return null;
  let sse = 0;
  rows.forEach((row, index) => {
    const predicted = row.reduce((sum, value, column) => sum + value * beta[column], 0);
    sse += Math.pow(y[index] - predicted, 2);
  });
  const inverse = invertMatrix(scaled);
  const sigma2 = sse / (n - k);
  const se = beta.map((_, index) =>
    inverse ? Math.sqrt(Math.max(0, sigma2 * inverse[index][index])) : NaN
  );
  return { beta, sse, se, n, k };
};

// ---------------------------------------------------------------------------
// Conditional sum of squares
// ---------------------------------------------------------------------------

interface CssResult {
  residuals: number[];
  sse: number;
  start: number;
}

const cssResiduals = (z: number[], c: number, ar: number[], ma: number[]): CssResult => {
  const n = z.length;
  const p = ar.length;
  const q = ma.length;
  const start = Math.max(p, q);
  const residuals = new Array<number>(n).fill(0);
  let sse = 0;
  for (let t = start; t < n; t++) {
    let value = z[t] - c;
    for (let i = 1; i <= p; i++) value -= ar[i - 1] * z[t - i];
    for (let j = 1; j <= q; j++) value -= ma[j - 1] * residuals[t - j];
    residuals[t] = value;
    sse += value * value;
  }
  return { residuals, sse, start };
};

interface Unpacked {
  c: number;
  phi: number[];
  Phi: number[];
  theta: number[];
  Theta: number[];
  ar: number[];
  ma: number[];
  arPoly: number[];
  maPoly: number[];
}

const unpack = (params: number[], order: ArimaOrder): Unpacked => {
  let index = 0;
  const c = params[index++] ?? 0;
  const phi = params.slice(index, index + order.p);
  index += order.p;
  const Phi = params.slice(index, index + order.P);
  index += order.P;
  const theta = params.slice(index, index + order.q);
  index += order.q;
  const Theta = params.slice(index, index + order.Q);

  const arPoly = convolve(
    arPolynomial(phi),
    seasonalPolynomial(Phi, order.s, -1)
  );
  const maPoly = convolve(
    maPolynomial(theta),
    seasonalPolynomial(Theta, order.s, 1)
  );
  return {
    c,
    phi,
    Phi,
    theta,
    Theta,
    ar: arPoly.slice(1).map(value => -value),
    ma: maPoly.slice(1),
    arPoly,
    maPoly,
  };
};

const parameterCount = (order: ArimaOrder): number =>
  1 + order.p + order.P + order.q + order.Q;

// ---------------------------------------------------------------------------
// Nelder–Mead
// ---------------------------------------------------------------------------

interface SimplexResult {
  x: number[];
  value: number;
  converged: boolean;
  evaluations: number;
}

const nelderMead = (
  objective: (values: number[]) => number,
  start: number[],
  maxEvaluations = 900
): SimplexResult => {
  const dimension = start.length;
  if (dimension === 0) return { x: start, value: objective(start), converged: true, evaluations: 1 };

  let simplex: number[][] = [start.slice()];
  for (let index = 0; index < dimension; index++) {
    const point = start.slice();
    point[index] += 0.1 + 0.1 * Math.abs(point[index]);
    simplex.push(point);
  }
  let values = simplex.map(objective);
  let evaluations = simplex.length;
  let converged = false;

  while (evaluations < maxEvaluations) {
    const order = simplex.map((_, index) => index).sort((left, right) => values[left] - values[right]);
    simplex = order.map(index => simplex[index]);
    values = order.map(index => values[index]);

    const spread = Math.abs(values[dimension] - values[0]);
    if (spread <= 1e-9 * (1 + Math.abs(values[0]))) {
      converged = true;
      break;
    }

    const centroid = new Array<number>(dimension).fill(0);
    for (let row = 0; row < dimension; row++) {
      for (let column = 0; column < dimension; column++) {
        centroid[column] += simplex[row][column] / dimension;
      }
    }
    const worst = simplex[dimension];
    const reflected = centroid.map((value, column) => value + (value - worst[column]));
    const reflectedValue = objective(reflected);
    evaluations++;

    if (reflectedValue < values[0]) {
      const expanded = centroid.map((value, column) => value + 2 * (value - worst[column]));
      const expandedValue = objective(expanded);
      evaluations++;
      if (expandedValue < reflectedValue) {
        simplex[dimension] = expanded;
        values[dimension] = expandedValue;
      } else {
        simplex[dimension] = reflected;
        values[dimension] = reflectedValue;
      }
      continue;
    }

    if (reflectedValue < values[dimension - 1]) {
      simplex[dimension] = reflected;
      values[dimension] = reflectedValue;
      continue;
    }

    const contracted = centroid.map((value, column) => value + 0.5 * (worst[column] - value));
    const contractedValue = objective(contracted);
    evaluations++;
    if (contractedValue < values[dimension]) {
      simplex[dimension] = contracted;
      values[dimension] = contractedValue;
      continue;
    }

    for (let row = 1; row <= dimension; row++) {
      simplex[row] = simplex[row].map((value, column) => simplex[0][column] + 0.5 * (value - simplex[0][column]));
      values[row] = objective(simplex[row]);
      evaluations++;
    }
  }

  let best = 0;
  values.forEach((value, index) => {
    if (value < values[best]) best = index;
  });
  return { x: simplex[best], value: values[best], converged, evaluations };
};

// ---------------------------------------------------------------------------
// Starting values (Hannan–Rissanen)
// ---------------------------------------------------------------------------

const startValues = (z: number[], order: ArimaOrder): number[] => {
  const n = z.length;
  const count = parameterCount(order);
  const fallback = new Array<number>(count).fill(0);
  fallback[0] = jStat.mean(z);

  const seasonal = order.s >= 2 ? order.s : 0;
  const pE = order.p + order.P * seasonal;
  const qE = order.q + order.Q * seasonal;
  const longOrder = Math.min(Math.floor(n / 4), Math.max(4, pE + qE + 1));
  if (longOrder < 3 || n < longOrder + 6) return fallback;

  const longRows: number[][] = [];
  const longY: number[] = [];
  for (let t = longOrder; t < n; t++) {
    const row = [1];
    for (let i = 1; i <= longOrder; i++) row.push(z[t - i]);
    longRows.push(row);
    longY.push(z[t]);
  }
  const longFit = olsWithErrors(longY, longRows);
  if (!longFit) return fallback;

  const longResiduals = new Array<number>(n).fill(0);
  for (let t = longOrder; t < n; t++) {
    let value = z[t] - longFit.beta[0];
    for (let i = 1; i <= longOrder; i++) value -= longFit.beta[i] * z[t - i];
    longResiduals[t] = value;
  }

  const start = Math.max(pE, qE, longOrder);
  const rows: number[][] = [];
  const y: number[] = [];
  for (let t = start; t < n; t++) {
    const row = [1];
    for (let i = 1; i <= pE; i++) row.push(z[t - i]);
    for (let j = 1; j <= qE; j++) row.push(longResiduals[t - j]);
    rows.push(row);
    y.push(z[t]);
  }
  if (rows.length < pE + qE + 4) return fallback;
  const fit = olsWithErrors(y, rows);
  if (!fit) return fallback;

  const params = new Array<number>(count).fill(0);
  params[0] = fit.beta[0];
  for (let i = 0; i < order.p; i++) params[1 + i] = fit.beta[1 + i] ?? 0;
  for (let i = 0; i < order.q; i++) {
    params[1 + order.p + order.P + i] = fit.beta[1 + pE + i] ?? 0;
  }
  return params.map((value, index) =>
    index === 0 ? value : Math.max(-0.95, Math.min(0.95, value))
  );
};

// ---------------------------------------------------------------------------
// Fitting
// ---------------------------------------------------------------------------

export const arimaLabel = (order: ArimaOrder): string => {
  const seasonal = order.s >= 2 && (order.P > 0 || order.D > 0 || order.Q > 0);
  if (!seasonal) return `ARIMA(${order.p},${order.d},${order.q})`;
  return `SARIMA(${order.p},${order.d},${order.q})(${order.P},${order.D},${order.Q})[${order.s}]`;
};

const coefficientTerms = (order: ArimaOrder): { term: string; index: number }[] => {
  const terms: { term: string; index: number }[] = [
    { term: order.d > 0 || order.D > 0 ? 'Drift' : 'Costante', index: 0 },
  ];
  let index = 1;
  for (let i = 1; i <= order.p; i++) terms.push({ term: `AR(${i})`, index: index++ });
  for (let i = 1; i <= order.P; i++) terms.push({ term: `SAR(${i}) [${order.s}]`, index: index++ });
  for (let i = 1; i <= order.q; i++) terms.push({ term: `MA(${i})`, index: index++ });
  for (let i = 1; i <= order.Q; i++) terms.push({ term: `SMA(${i}) [${order.s}]`, index: index++ });
  return terms;
};

const jarqueBeraTest = (values: number[]): { stat: number; p: number } => {
  const n = values.length;
  if (n < 8) return { stat: NaN, p: NaN };
  const mu = jStat.mean(values);
  const centered = values.map(value => value - mu);
  const m2 = centered.reduce((sum, value) => sum + value * value, 0) / n;
  if (!(m2 > 0)) return { stat: NaN, p: NaN };
  const m3 = centered.reduce((sum, value) => sum + Math.pow(value, 3), 0) / n;
  const m4 = centered.reduce((sum, value) => sum + Math.pow(value, 4), 0) / n;
  const skew = m3 / Math.pow(m2, 1.5);
  const excess = m4 / (m2 * m2) - 3;
  const stat = (n / 6) * (skew * skew + (excess * excess) / 4);
  return { stat, p: chi2SF(stat, 2) };
};

export interface ArimaFitOptions {
  horizon?: number;
  level?: number;
}

export const fitArima = (
  values: number[],
  order: ArimaOrder,
  options: ArimaFitOptions = {}
): ArimaFit | null => {
  if (values.length < 8 || values.some(value => !Number.isFinite(value))) return null;

  const s = order.s >= 2 ? Math.floor(order.s) : 0;
  const d = Math.max(0, Math.min(2, Math.floor(order.d)));
  const D = s >= 2 ? Math.max(0, Math.min(1, Math.floor(order.D))) : 0;
  const p = Math.max(0, Math.floor(order.p));
  const q = Math.max(0, Math.floor(order.q));
  const P = s >= 2 ? Math.max(0, Math.floor(order.P)) : 0;
  const Q = s >= 2 ? Math.max(0, Math.floor(order.Q)) : 0;
  const ord: ArimaOrder = { p, d, q, P, D, Q, s };

  const level = options.level ?? 95;
  const horizon = Math.max(0, Math.min(60, Math.floor(options.horizon ?? 0)));

  const prepared = prepareSeries(values, d, D, s);
  const z = prepared.work;
  const pE = p + P * s;
  const qE = q + Q * s;
  const start = Math.max(pE, qE);
  const nWork = z.length;
  const nEff = nWork - start;
  const k = parameterCount(ord);
  if (nEff - k < 4 || nEff < 8) return null;

  const objective = (params: number[]): number => {
    const model = unpack(params, ord);
    if (model.ar.some(value => Math.abs(value) > 20) || model.ma.some(value => Math.abs(value) > 20)) {
      return 1e15;
    }
    const { sse } = cssResiduals(z, model.c, model.ar, model.ma);
    return Number.isFinite(sse) ? sse : 1e15;
  };

  const optimized = nelderMead(objective, startValues(z, ord));
  const params = optimized.x;
  const model = unpack(params, ord);
  const css = cssResiduals(z, model.c, model.ar, model.ma);
  if (!Number.isFinite(css.sse)) return null;

  const scale = Math.max(1, z.reduce((sum, value) => sum + value * value, 0));
  const sigma2 = Math.max(css.sse / nEff, 1e-12 * scale);
  const logLik = -0.5 * nEff * (Math.log(2 * Math.PI * sigma2) + 1);
  const kTotal = k + 1;
  const aic = -2 * logLik + 2 * kTotal;
  const aicc =
    nEff - kTotal - 1 > 0
      ? aic + (2 * kTotal * (kTotal + 1)) / (nEff - kTotal - 1)
      : Infinity;
  const bic = -2 * logLik + Math.log(nEff) * kTotal;

  // Gauss–Newton standard errors: cov = σ² (J'J)⁻¹ with J = ∂e/∂θ.
  const residualSlice = (theta: number[]): number[] => {
    const candidate = unpack(theta, ord);
    return cssResiduals(z, candidate.c, candidate.ar, candidate.ma).residuals.slice(start);
  };
  const baseResiduals = css.residuals.slice(start);
  const jacobian: number[][] = [];
  for (let column = 0; column < k; column++) {
    const step = 1e-4 * (1 + Math.abs(params[column]));
    const shifted = params.slice();
    shifted[column] += step;
    jacobian.push(
      residualSlice(shifted).map((value, index) => (value - baseResiduals[index]) / step)
    );
  }
  const jtjMatrix = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let left = 0; left < k; left++) {
    for (let right = 0; right < k; right++) {
      let sum = 0;
      for (let row = 0; row < baseResiduals.length; row++) {
        sum += jacobian[left][row] * jacobian[right][row];
      }
      jtjMatrix[left][right] = sum;
    }
  }
  const inverse = invertMatrix(jtjMatrix);
  const standardErrors = params.map((_, index) => {
    if (!inverse) return NaN;
    const value = sigma2 * inverse[index][index];
    return value > 0 ? Math.sqrt(value) : NaN;
  });

  const critical = zCrit(level);
  const coefficients: ArimaCoefficient[] = coefficientTerms(ord).map(({ term, index }) => {
    const estimate = params[index] ?? NaN;
    const se = standardErrors[index] ?? NaN;
    const zValue = se > 0 ? estimate / se : NaN;
    return {
      term,
      estimate,
      se,
      z: zValue,
      p: Number.isFinite(zValue) ? zTwoSidedP(zValue) : NaN,
      lo: Number.isFinite(se) ? estimate - critical * se : NaN,
      hi: Number.isFinite(se) ? estimate + critical * se : NaN,
    };
  });

  const arRoots = polynomialRootModuli(model.arPoly);
  const maRoots = polynomialRootModuli(model.maPoly);
  const arRoot = arRoots.length > 0 ? Math.min(...arRoots) : Infinity;
  const maRoot = maRoots.length > 0 ? Math.min(...maRoots) : Infinity;
  const stationary = !(arRoot < 1 + 1e-6);
  const invertible = !(maRoot < 1 + 1e-6);

  const residualValues = baseResiduals;
  const lbLags = Math.min(12, Math.max(1, Math.floor(nEff / 4)));
  const lb = ljungBox(residualValues, lbLags);
  const lbDf = Math.max(1, lbLags - (p + q + P + Q));
  const runs = runsTest(residualValues);
  const jb = jarqueBeraTest(residualValues);
  const residualSe = nEff - k > 0 ? Math.sqrt(css.sse / (nEff - k)) : sqrtOrNaN(css.sse / nEff);

  // ψ-weights of the full ARIMA operator, used for forecast error variances.
  let diffPolynomial = [1];
  for (let index = 0; index < d; index++) diffPolynomial = convolve(diffPolynomial, [1, -1]);
  if (D > 0 && s >= 2) {
    const seasonal = new Array<number>(s + 1).fill(0);
    seasonal[0] = 1;
    seasonal[s] = -1;
    for (let index = 0; index < D; index++) diffPolynomial = convolve(diffPolynomial, seasonal);
  }
  const fullArPoly = convolve(model.arPoly, diffPolynomial);
  const fullAr = fullArPoly.slice(1).map(value => -value);

  const psi = [1];
  for (let step = 1; step <= Math.max(1, horizon); step++) {
    let value = step - 1 < model.ma.length ? model.ma[step - 1] : 0;
    for (let i = 1; i <= Math.min(step, fullAr.length); i++) {
      value += fullAr[i - 1] * psi[step - i];
    }
    psi.push(value);
  }

  const forecastMeans: number[] = [];
  for (let step = 1; step <= horizon; step++) {
    const position = nWork + step - 1;
    let value = model.c;
    for (let i = 1; i <= model.ar.length; i++) {
      const at = position - i;
      value += model.ar[i - 1] * (at < nWork ? z[at] : forecastMeans[at - nWork]);
    }
    for (let j = 1; j <= model.ma.length; j++) {
      const at = position - j;
      value += model.ma[j - 1] * (at < nWork ? css.residuals[at] : 0);
    }
    forecastMeans.push(value);
  }
  const integrated = integrateForecast(prepared.levels, prepared.steps, forecastMeans);

  const forecast: ArimaForecastPoint[] = integrated.map((mean, index) => {
    let cumulative = 0;
    for (let j = 0; j <= index; j++) cumulative += psi[j] * psi[j];
    const se = residualSe * Math.sqrt(cumulative);
    return {
      step: values.length + index + 1,
      mean,
      se,
      lo: mean - critical * se,
      hi: mean + critical * se,
    };
  });

  return {
    order: ord,
    label: arimaLabel(ord),
    coefficients,
    constant: model.c,
    sigma2,
    residualSe,
    logLik,
    aic,
    aicc,
    bic,
    sse: css.sse,
    nWork,
    nEff,
    k,
    start,
    residuals: residualValues,
    ljungBox: { q: lb.q, df: lbDf, lags: lbLags, p: chi2SF(lb.q, lbDf) },
    jarqueBera: jb,
    runs: { runs: runs.runs, z: runs.z, p: runs.p },
    forecast,
    psi: psi.slice(0, horizon + 1),
    arRoot,
    maRoot,
    stationary,
    invertible,
    converged: optimized.converged,
  };
};

const sqrtOrNaN = (value: number): number => (value >= 0 && Number.isFinite(value) ? Math.sqrt(value) : NaN);

// ---------------------------------------------------------------------------
// Differencing choice
// ---------------------------------------------------------------------------

/** Dickey–Fuller critical values for the constant-only case (MacKinnon). */
const adfCriticalValue = (probability: number, n: number): number => {
  const table: Record<string, [number, number, number]> = {
    '0.01': [-3.43035, -6.5393, -16.786],
    '0.05': [-2.86154, -2.8903, -4.234],
    '0.10': [-2.56677, -1.5384, -2.809],
  };
  const [intercept, slope, quadratic] = table[probability.toFixed(2)];
  return intercept + slope / n + quadratic / (n * n);
};

/** Piecewise-linear approximation of the Dickey–Fuller p-value (constant case). */
const adfPValue = (statistic: number, n: number): number => {
  if (!Number.isFinite(statistic)) return NaN;
  const anchors: [number, number][] = [
    [-4.5, 0.0002],
    [adfCriticalValue(0.01, n), 0.01],
    [adfCriticalValue(0.05, n), 0.05],
    [adfCriticalValue(0.1, n), 0.1],
    [-1.94, 0.25],
    [-1.62, 0.5],
    [-1.0, 0.75],
    [0, 0.95],
    [1.5, 0.995],
  ];
  for (let index = 0; index < anchors.length - 1; index++) {
    const [leftStat, leftP] = anchors[index];
    const [rightStat, rightP] = anchors[index + 1];
    if (statistic >= leftStat && statistic <= rightStat) {
      const ratio = (statistic - leftStat) / (rightStat - leftStat);
      return leftP + ratio * (rightP - leftP);
    }
  }
  return statistic < anchors[0][0] ? 0.0001 : 0.999;
};

/** Augmented Dickey–Fuller test with a constant and AIC-selected lag length. */
export const adfTest = (
  values: number[]
): { stat: number; p: number; lags: number; cv5: number } => {
  const n = values.length;
  if (n < 12) return { stat: NaN, p: NaN, lags: 0, cv5: NaN };
  const differences = differenceSeries(values, 1, 1);
  const maxLag = Math.min(8, Math.max(1, Math.floor(Math.cbrt(n))));
  let best: { stat: number; lags: number; aic: number } | null = null;

  for (let lags = 0; lags <= maxLag; lags++) {
    const rows: number[][] = [];
    const y: number[] = [];
    for (let t = lags + 1; t < n; t++) {
      const row = [1, values[t - 1]];
      for (let i = 1; i <= lags; i++) row.push(differences[t - 1 - i]);
      rows.push(row);
      y.push(differences[t - 1]);
    }
    if (rows.length < lags + 6) continue;
    const fit = olsWithErrors(y, rows);
    if (!fit || !(fit.sse > 0) || !(fit.se[1] > 0)) continue;
    const stat = fit.beta[1] / fit.se[1];
    const aic = fit.n * Math.log(fit.sse / fit.n) + 2 * fit.k;
    if (!best || aic < best.aic) best = { stat, lags, aic };
  }

  if (!best) return { stat: NaN, p: NaN, lags: 0, cv5: NaN };
  return {
    stat: best.stat,
    p: adfPValue(best.stat, n),
    lags: best.lags,
    cv5: adfCriticalValue(0.05, n),
  };
};

const chooseDifferencing = (values: number[], s: number): ArimaSelection => {
  // With short series a second difference is rarely identified: keep the
  // automatic choice at one order of regular differencing below 40 points.
  const maxD = values.length >= 40 ? 2 : 1;
  let d = 0;
  let current = values.slice();
  let adf = adfTest(current);
  while (d < maxD && Number.isFinite(adf.p) && adf.p > 0.05 && current.length >= 16) {
    current = differenceSeries(current, 1, 1);
    d += 1;
    if (current.length < 16) break;
    adf = adfTest(current);
  }

  let D = 0;
  let seasonalRatio = NaN;
  let seasonalAcf = NaN;
  if (s >= 2 && current.length >= 2 * s + 4) {
    seasonalAcf = autocorrelation(current, s)[s];
    const differenced = differenceSeries(current, s, 1);
    const baseVariance = variance(current);
    const seasonalVariance = variance(differenced);
    seasonalRatio = baseVariance > 0 ? seasonalVariance / baseVariance : NaN;
    const band = 2.5 / Math.sqrt(current.length);
    if (Number.isFinite(seasonalAcf) && Math.abs(seasonalAcf) > band && seasonalRatio < 1) D = 1;
  }

  return { d, D, dAuto: true, DAuto: true, adf, seasonalRatio, seasonalAcf };
};

// ---------------------------------------------------------------------------
// Order search and tables
// ---------------------------------------------------------------------------

const holdoutMetrics = (actual: number[], predicted: number[]): ArimaHoldout => {
  const errors = actual.map((value, index) => value - predicted[index]);
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length);
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
  const percentages = actual
    .map((value, index) => (value !== 0 ? Math.abs(errors[index] / value) : NaN))
    .filter(value => Number.isFinite(value));
  return {
    steps: actual.length,
    rmse,
    mae,
    mape: percentages.length > 0 ? (percentages.reduce((sum, value) => sum + value, 0) / percentages.length) * 100 : NaN,
  };
};

const accuracyOf = (fit: ArimaFit): { rmse: number; mae: number; mape: number } => {
  const residuals = fit.residuals;
  const rmse = Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length);
  const mae = residuals.reduce((sum, value) => sum + Math.abs(value), 0) / residuals.length;
  return { rmse, mae, mape: NaN };
};

export const arimaAnalysis = (options: ArimaAnalysisOptions): ArimaAnalysisResult => {
  const values = options.values;
  const s = options.period && options.period >= 2 ? Math.floor(options.period) : 0;
  const level = options.level ?? 95;
  const horizon = Math.max(1, Math.min(60, Math.floor(options.horizon ?? 12)));
  const empty: ArimaAnalysisResult = { fit: null, candidates: [], selection: null, tables: [] };
  if (values.length < 12 || values.some(value => !Number.isFinite(value))) return empty;

  const suggested = chooseDifferencing(values, s);
  const dAuto = options.d === undefined || options.d === 'auto';
  const DAuto = options.D === undefined || options.D === 'auto';
  const d = Math.max(0, Math.min(2, dAuto ? suggested.d : Number(options.d)));
  const D = s >= 2 ? Math.max(0, Math.min(1, DAuto ? suggested.D : Number(options.D))) : 0;
  const selection: ArimaSelection = { ...suggested, d, D, dAuto, DAuto };

  const effectiveLength = values.length - d - D * s;
  if (effectiveLength < 10) return { ...empty, selection };

  const maxP = effectiveLength >= 30 ? 2 : 1;
  const maxQ = effectiveLength >= 30 ? 2 : 1;
  const seasonalOrders = s >= 2 && values.length >= 3 * s ? 1 : 0;

  const candidates: ArimaFit[] = [];
  let fallback: ArimaFit | null = null;
  for (let p = 0; p <= maxP; p++) {
    for (let q = 0; q <= maxQ; q++) {
      for (let P = 0; P <= seasonalOrders; P++) {
        for (let Q = 0; Q <= seasonalOrders; Q++) {
          if (p + q + P + Q > 6) continue;
          const order: ArimaOrder = { p, d, q, P, D, Q, s };
          const fit = fitArima(values, order, { horizon, level });
          if (!fit) continue;
          if (fit.stationary && fit.invertible) candidates.push(fit);
          else if (!fallback) fallback = fit;
        }
      }
    }
  }

  if (candidates.length === 0) {
    if (!fallback) return { ...empty, selection };
    candidates.push(fallback);
  }

  candidates.sort((left, right) => left.aicc - right.aicc);
  const best = candidates[0];

  // Out-of-sample check on the same holdout used by the simple benchmarks.
  const holdoutSteps = Math.max(1, Math.min(horizon, Math.floor(values.length * 0.2)));
  const train = values.slice(0, values.length - holdoutSteps);
  const test = values.slice(values.length - holdoutSteps);
  let holdout: ArimaHoldout | undefined;
  if (train.length >= 16) {
    const trainFit = fitArima(train, best.order, { horizon: holdoutSteps, level });
    if (trainFit) {
      holdout = holdoutMetrics(test, trainFit.forecast.map(point => point.mean));
    }
  }
  const fit: ArimaFit = { ...best, holdout };

  const tables = buildTables(fit, candidates, selection, values, level, horizon);
  return { fit, candidates, selection, tables };
};

const buildTables = (
  fit: ArimaFit,
  candidates: ArimaFit[],
  selection: ArimaSelection,
  values: number[],
  level: number,
  horizon: number
): TableSpec[] => {
  const tables: TableSpec[] = [];
  const order = fit.order;
  const accuracy = accuracyOf(fit);

  tables.push({
    id: 'ts-arima-model',
    title: 'Modello ARIMA / SARIMA selezionato',
    subtitle: `ordine scelto con il criterio AICc su ${candidates.length} candidati`,
    columns: [
      { key: 'metric', label: 'Voce', format: 'text' },
      { key: 'value', label: 'Valore', format: 'text' },
    ],
    rows: [
      { metric: 'Modello', value: fit.label, raw: NaN },
      {
        metric: 'Differenziazione',
        value: `d = ${order.d}${order.s >= 2 ? `, D = ${order.D} (passo ${order.s})` : ''}`,
        raw: NaN,
      },
      {
        metric: 'Scelta della differenziazione',
        value: `${selection.dAuto ? 'automatica' : 'manuale'}${order.s >= 2 ? ` · stagionale ${selection.DAuto ? 'automatica' : 'manuale'}` : ''}`,
        raw: NaN,
      },
      {
        metric: 'Test ADF sulla serie',
        value: Number.isFinite(selection.adf?.stat ?? NaN)
          ? `t = ${fmtEst(selection.adf.stat, 3)}, p ≈ ${fmtP(selection.adf.p)}, valore critico 5% = ${fmtEst(selection.adf.cv5, 3)}`
          : 'non calcolabile',
        raw: Number.isFinite(selection.adf?.p ?? NaN) ? Number(selection.adf?.p) : NaN,
      },
      {
        metric: 'Autocorrelazione stagionale',
        value:
          order.s >= 2 && Number.isFinite(selection.seasonalAcf)
            ? `ACF al lag ${order.s} = ${fmtEst(selection.seasonalAcf, 3)}, rapporto di varianza dopo differenza stagionale = ${fmtEst(selection.seasonalRatio, 3)}`
            : 'non applicabile',
        raw: Number.isFinite(selection.seasonalRatio) ? selection.seasonalRatio : NaN,
      },
      { metric: 'Parametri stimati (k)', value: String(fit.k), raw: fit.k },
      { metric: 'Osservazioni originali', value: String(values.length), raw: values.length },
      { metric: 'Osservazioni dopo differenziazione', value: String(fit.nWork), raw: fit.nWork },
      { metric: 'Osservazioni efficaci', value: String(fit.nEff), raw: fit.nEff },
      { metric: 'σ² (MLE)', value: fmtEst(fit.sigma2, 4), raw: fit.sigma2 },
      { metric: 'Errore standard residuo', value: fmtEst(fit.residualSe, 4), raw: fit.residualSe },
      { metric: 'Log-verosimiglianza (condizionale)', value: fmtEst(fit.logLik, 3), raw: fit.logLik },
      { metric: 'AIC', value: fmtEst(fit.aic, 3), raw: fit.aic },
      { metric: 'AICc', value: fmtEst(fit.aicc, 3), raw: fit.aicc },
      { metric: 'BIC', value: fmtEst(fit.bic, 3), raw: fit.bic },
      {
        metric: 'Radice AR (modulo minimo)',
        value: Number.isFinite(fit.arRoot) ? fmtEst(fit.arRoot, 4) : 'nessun termine AR',
        raw: fit.arRoot,
      },
      {
        metric: 'Radice MA (modulo minimo)',
        value: Number.isFinite(fit.maRoot) ? fmtEst(fit.maRoot, 4) : 'nessun termine MA',
        raw: fit.maRoot,
      },
      { metric: 'Stazionarietà', value: fit.stationary ? 'sì (radici AR fuori dal cerchio unitario)' : 'no', raw: NaN },
      { metric: 'Invertibilità', value: fit.invertible ? 'sì (radici MA fuori dal cerchio unitario)' : 'no', raw: NaN },
      { metric: 'Convergenza', value: fit.converged ? 'sì' : 'ottimizzazione al limite di iterazioni', raw: NaN },
    ],
    notes: [
      'La stima è a somma dei quadrati condizionale: le innovazioni precedenti l’inizio della serie sono poste a zero, quindi i primi residui contano meno.',
      `AIC = −2·logL + 2k con k = ${fit.k + 1} (parametri più varianza); AICc corregge per i campioni finiti e BIC penalizza più severamente i modelli complessi.`,
      'Le radici devono stare fuori dal cerchio unitario: altrimenti il modello non è stazionario (AR) o non è invertibile (MA) e le previsioni divergono.',
    ],
  });

  const ranked = candidates.slice(0, 10);
  const bestAicc = ranked[0]?.aicc ?? NaN;
  const weights = ranked.map(candidate =>
    Number.isFinite(candidate.aicc) && Number.isFinite(bestAicc)
      ? Math.exp(-0.5 * (candidate.aicc - bestAicc))
      : 0
  );
  const weightSum = weights.reduce((sum, value) => sum + value, 0);

  tables.push({
    id: 'ts-arima-candidates',
    title: 'Modelli candidati',
    subtitle: `ordinati per AICc · ${candidates.length} combinazioni stimate`,
    columns: [
      { key: 'model', label: 'Modello', format: 'text' },
      { key: 'k', label: 'k', format: 'int' },
      { key: 'aic', label: 'AIC', format: 'dec2' },
      { key: 'aicc', label: 'AICc', format: 'dec2' },
      { key: 'bic', label: 'BIC', format: 'dec2' },
      { key: 'delta', label: 'Δ AICc', format: 'dec2' },
      { key: 'weight', label: 'Peso', format: 'dec3' },
      { key: 'ljungP', label: 'Ljung–Box p', format: 'p' },
    ],
    rows: ranked.map((candidate, index) => ({
      model: candidate.label,
      k: candidate.k,
      aic: candidate.aic,
      aicc: candidate.aicc,
      bic: candidate.bic,
      delta: candidate.aicc - bestAicc,
      weight: weightSum > 0 ? weights[index] / weightSum : NaN,
      ljungP: candidate.ljungBox.p,
    })),
    notes: [
      'Δ AICc sotto 2 indica modelli praticamente equivalenti; il peso è la probabilità relativa del modello, non quella che sia «vero».',
      'La griglia cerca ordini fino a 2 AR/MA (1 con poche osservazioni) e un termine stagionale AR e MA quando il periodo è noto.',
      'Ljung–Box sui residui: p grande è ciò che si vuole vedere, perché significa residui non autocorrelati.',
    ],
  });

  tables.push({
    id: 'ts-arima-coefficients',
    title: 'Coefficienti stimati',
    subtitle: `errori standard da approssimazione di Gauss–Newton · IC ${level}%`,
    columns: [
      { key: 'term', label: 'Termine', format: 'text' },
      { key: 'estimate', label: 'Stima', format: 'dec4' },
      { key: 'se', label: 'Errore std.', format: 'dec4' },
      { key: 'z', label: 'z', format: 'dec3' },
      { key: 'p', label: 'p', format: 'p' },
      { key: 'lo', label: 'Limite basso', format: 'dec4' },
      { key: 'hi', label: 'Limite alto', format: 'dec4' },
    ],
    rows: fit.coefficients.map(coefficient => ({
      term: coefficient.term,
      estimate: coefficient.estimate,
      se: coefficient.se,
      z: coefficient.z,
      p: coefficient.p,
      lo: coefficient.lo,
      hi: coefficient.hi,
    })),
    notes: [
      order.d > 0 || order.D > 0
        ? 'Il termine di drift è la variazione media per passo della serie differenziata: su scala originale diventa la pendenza della previsione.'
        : 'La costante è il livello medio della serie attorno a cui oscillano i valori.',
      'I p-value sono basati sull’approssimazione normale e non tengono conto dell’incertezza nella scelta dell’ordine: vanno letti come indicativi.',
    ],
  });

  tables.push({
    id: 'ts-arima-diagnostics',
    title: 'Diagnostica dei residui',
    subtitle: `${fit.residuals.length} residui · Ljung–Box su ${fit.ljungBox.lags} lag`,
    columns: [
      { key: 'test', label: 'Controllo', format: 'text' },
      { key: 'statistic', label: 'Statistica', format: 'dec3' },
      { key: 'df', label: 'df', format: 'int' },
      { key: 'p', label: 'p', format: 'p' },
      { key: 'reading', label: 'Lettura', format: 'text' },
    ],
    rows: [
      {
        test: 'Ljung–Box (autocorrelazione)',
        statistic: fit.ljungBox.q,
        df: fit.ljungBox.df,
        p: fit.ljungBox.p,
        reading: Number.isFinite(fit.ljungBox.p)
          ? isDecided(fit.ljungBox.p, level)
            ? 'residui ancora autocorrelati'
            : 'nessuna autocorrelazione residua'
          : 'non calcolabile',
      },
      {
        test: 'Jarque–Bera (normalità)',
        statistic: fit.jarqueBera.stat,
        df: 2,
        p: fit.jarqueBera.p,
        reading: Number.isFinite(fit.jarqueBera.p)
          ? isDecided(fit.jarqueBera.p, level)
            ? 'residui non gaussiani'
            : 'residui compatibili con la gaussiana'
          : 'non calcolabile',
      },
      {
        test: 'Wald–Wolfowitz (runs)',
        statistic: fit.runs.z,
        df: NaN,
        p: fit.runs.p,
        reading: Number.isFinite(fit.runs.p)
          ? isDecided(fit.runs.p, level)
            ? 'sequenza dei segni non casuale'
            : 'segni compatibili con il caso'
          : 'non calcolabile',
      },
    ],
    notes: [
      'Un buon modello lascia residui bianchi: Ljung–Box non significativo, nessun pattern nei segni e distribuzione non troppo asimmetrica.',
      'Se Ljung–Box resta significativo, aumenta p o q oppure aggiungi il termine stagionale: il modello non ha catturato tutta la memoria della serie.',
    ],
  });

  const trainRmse = accuracy.rmse;
  tables.push({
    id: 'ts-arima-accuracy',
    title: 'Accuratezza del modello',
    subtitle: `stima sui residui e validazione sugli ultimi ${fit.holdout?.steps ?? 0} passi`,
    columns: [
      { key: 'sample', label: 'Campione', format: 'text' },
      { key: 'steps', label: 'Passi', format: 'int' },
      { key: 'rmse', label: 'RMSE', format: 'dec3' },
      { key: 'mae', label: 'MAE', format: 'dec3' },
      { key: 'mape', label: 'MAPE %', format: 'dec2' },
    ],
    rows: [
      {
        sample: 'Adattamento (errori a un passo)',
        steps: fit.nEff,
        rmse: trainRmse,
        mae: accuracy.mae,
        mape: NaN,
      },
      ...(fit.holdout
        ? [
            {
              sample: 'Validazione (errori a più passi)',
              steps: fit.holdout.steps,
              rmse: fit.holdout.rmse,
              mae: fit.holdout.mae,
              mape: fit.holdout.mape,
            },
          ]
        : []),
    ],
    notes: [
      'L’adattamento misura errori a un passo sui residui; la validazione misura errori fino a più passi sul troncamento iniziale, quindi i due valori non sono direttamente confrontabili.',
      fit.holdout
        ? 'La validazione rifitta lo stesso ordine sul troncamento iniziale e confronta le previsioni con gli ultimi valori osservati.'
        : 'Serie troppo corta per una validazione out of sample.',
      'Il MAPE non è definito in campione perché i residui hanno media zero; è riportato solo per la validazione.',
    ],
  });

  tables.push({
    id: 'ts-arima-forecast',
    title: `Previsioni ${fit.label}`,
    subtitle: `orizzonte ${horizon} passi · intervalli al ${level}%`,
    columns: [
      { key: 'step', label: 't', format: 'int' },
      { key: 'forecast', label: 'Previsione', format: 'dec3' },
      { key: 'se', label: 'Errore std.', format: 'dec3' },
      { key: 'lo', label: 'Limite basso', format: 'dec3' },
      { key: 'hi', label: 'Limite alto', format: 'dec3' },
    ],
    rows: fit.forecast.map(point => ({
      step: point.step,
      forecast: point.mean,
      se: point.se,
      lo: point.lo,
      hi: point.hi,
    })),
    notes: [
      `Gli intervalli usano i pesi ψ del modello completo: con d = ${order.d}${order.s >= 2 ? ` e D = ${order.D}` : ''} l’incertezza si accumula come in un integrato.`,
      'L’ampiezza riflette solo l’errore delle innovazioni: l’incertezza sulla stima dei parametri e sulla scelta dell’ordine non è inclusa.',
    ],
  });

  return tables;
};

/** Builders kept for the report and for direct use in the UI. */
export const arimaForecastRows = (tables: TableSpec[]): TableSpec['rows'] =>
  tables.find(spec => spec.id === 'ts-arima-forecast')?.rows ?? [];
