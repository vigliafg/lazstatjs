import { jStat } from './jstat';
import { parseNum } from './core';
import type { TableSpec } from './types';
import { calcTheilSen } from '../statsHelpers';
import {
  bootstrapCI,
  chi2SF,
  fSF,
  lillieforsTest,
  tCrit,
  twoSidedTP,
  zCrit,
} from './distributions';
import { interpretR } from './format';
import { eigenSymmetric } from './linalg';

export interface RegressionTablesOptions {
  rows: string[][];
  depIdx: number;
  indepIdxs: number[];
  depName: string;
  predNames: string[];
  level: number;
}

type Matrix = number[][];

const transpose = (matrix: Matrix): Matrix =>
  matrix[0].map((_, column) => matrix.map(row => row[column]));

const multiply = (a: Matrix, b: Matrix): Matrix =>
  a.map(row => b[0].map((_, column) => row.reduce((sum, value, i) => sum + value * b[i][column], 0)));

const multiplyVector = (matrix: Matrix, vector: number[]): number[] =>
  matrix.map(row => row.reduce((sum, value, i) => sum + value * vector[i], 0));

const dot = (a: number[], b: number[]): number =>
  a.reduce((sum, value, i) => sum + value * b[i], 0);

interface OlsFit {
  coef: number[];
  fitted: number[];
  residuals: number[];
  sse: number;
  sst: number;
  ssr: number;
  r2: number;
  adjR2: number;
  df: number;
  mse: number;
  se: number[];
  tStats: number[];
  pValues: number[];
  cov: Matrix;
  xtxInv: Matrix;
  n: number;
  k: number;
}

const fitOls = (Y: number[], X: Matrix): OlsFit | null => {
  const n = Y.length;
  const p = X[0].length;
  const k = p - 1;
  const df = n - k - 1;
  if (df <= 0) return null;

  try {
    const xt = transpose(X);
    const xtx = multiply(xt, X);
    const xtxInv = jStat.inv(xtx);
    const xty = multiplyVector(xt, Y);
    const coef = multiplyVector(xtxInv, xty);
    const fitted = multiplyVector(X, coef);
    const residuals = Y.map((value, i) => value - fitted[i]);
    const sse = residuals.reduce((sum, value) => sum + value * value, 0);
    const meanY = jStat.mean(Y);
    const sst = Y.reduce((sum, value) => sum + Math.pow(value - meanY, 2), 0);
    const ssr = sst - sse;
    const r2 = sst > 0 ? Math.min(1, Math.max(0, ssr / sst)) : NaN;
    const mse = sse / df;
    const se = coef.map((_, i) => Math.sqrt(mse * xtxInv[i][i]));
    const tStats = coef.map((value, i) => value / se[i]);
    const pValues = tStats.map(t => twoSidedTP(t, df));
    const cov = xtxInv.map(row => row.map(value => value * mse));
    return {
      coef,
      fitted,
      residuals,
      sse,
      sst,
      ssr,
      r2,
      adjR2: 1 - (1 - r2) * ((n - 1) / df),
      df,
      mse,
      se,
      tStats,
      pValues,
      cov,
      xtxInv,
      n,
      k,
    };
  } catch {
    return null;
  }
};

const rSquaredAux = (y: number[], x: number[]): number => {
  const n = y.length;
  const X = x.map(value => [1, value]);
  const fit = fitOls(y, X);
  return fit && isFinite(fit.r2) ? fit.r2 : NaN;
};

export const regressionTables = (options: RegressionTablesOptions): TableSpec[] => {
  const { rows, depIdx, indepIdxs, depName, predNames, level } = options;

  const validRows = rows.filter(row => {
    if (isNaN(parseNum(row[depIdx]))) return false;
    return indepIdxs.every(index => !isNaN(parseNum(row[index])));
  });

  const k = indepIdxs.length;
  if (k === 0 || validRows.length <= k + 1) return [];

  const Y = validRows.map(row => parseNum(row[depIdx]));
  const predictors = indepIdxs.map(index => validRows.map(row => parseNum(row[index])));
  const X: Matrix = validRows.map((_, rowIndex) => [1, ...predictors.map(values => values[rowIndex])]);

  const fit = fitOls(Y, X);
  if (!fit) return [];

  const n = fit.n;
  const crit = tCrit(level, fit.df);
  const sdY = jStat.stdev(Y, true);

  const vifValues = predictors.map((values, index) => {
    if (k === 1) return 1;
    const others = predictors.filter((_, otherIndex) => otherIndex !== index);
    const auxX: Matrix = values.map((_, rowIndex) => [1, ...others.map(other => other[rowIndex])]);
    try {
      const aux = fitOls(values, auxX);
      if (!aux || !(aux.r2 < 1)) return NaN;
      return 1 / (1 - aux.r2);
    } catch {
      return NaN;
    }
  });

  const aic = n * Math.log(fit.sse / n) + 2 * (k + 1);
  const bic = n * Math.log(fit.sse / n) + Math.log(n) * (k + 1);
  const dw = fit.residuals.reduce((sum, value, index) => {
    if (index === 0) return 0;
    return sum + Math.pow(value - fit.residuals[index - 1], 2);
  }, 0) / fit.residuals.reduce((sum, value) => sum + value * value, 0);

  // Breusch-Pagan: regress squared residuals on the predictors.
  const squaredResiduals = fit.residuals.map(value => value * value);
  let bpStat = NaN;
  let bpP = NaN;
  try {
    const bpFit = fitOls(squaredResiduals, X);
    if (bpFit) {
      bpStat = n * bpFit.r2;
      bpP = chi2SF(bpStat, k);
    }
  } catch {
    // leave NaN
  }

  // Leverage and Cook's distance.
  const leverage = X.map(row => dot(row, multiplyVector(fit.xtxInv, row)));
  const cooks = fit.residuals.map((residual, i) => {
    const h = leverage[i];
    if (!(h < 1) || fit.mse <= 0) return NaN;
    return (residual * residual) / ((k + 1) * fit.mse) * (h / Math.pow(1 - h, 2));
  });
  const maxCook = Math.max(...cooks.map(value => (isFinite(value) ? value : 0)));
  const cookOutliers = cooks.filter(value => value > 1).length;
  const maxLeverage = Math.max(...leverage.map(value => (isFinite(value) ? value : 0)));

  // White test: squared residuals on the linear terms, their squares and the
  // pairwise cross-products. n·R² is asymptotically χ² with one df per
  // auxiliary regressor (intercept excluded).
  const whiteColumns: number[][] = [];
  predictors.forEach(values => whiteColumns.push(values));
  predictors.forEach(values => whiteColumns.push(values.map(value => value * value)));
  for (let i = 0; i < predictors.length; i += 1) {
    for (let j = i + 1; j < predictors.length; j += 1) {
      whiteColumns.push(predictors[i].map((value, row) => value * predictors[j][row]));
    }
  }
  let whiteStat = NaN;
  let whiteP = NaN;
  let whiteDf = NaN;
  if (whiteColumns.length + 1 < n) {
    const whiteX: Matrix = validRows.map((_, row) => [1, ...whiteColumns.map(column => column[row])]);
    const whiteFit = fitOls(squaredResiduals, whiteX);
    if (whiteFit && whiteFit.r2 >= 0) {
      whiteDf = whiteX[0].length - 1;
      whiteStat = n * whiteFit.r2;
      whiteP = chi2SF(whiteStat, whiteDf);
    }
  }

  // Ramsey RESET (RESET2): add the squared fitted values and test the gain in
  // fit with an F test against the original model.
  let resetF = NaN;
  let resetP = NaN;
  try {
    const resetX: Matrix = X.map((row, i) => [...row, fit.fitted[i] * fit.fitted[i]]);
    const resetFit = fitOls(Y, resetX);
    if (resetFit && resetFit.mse > 0 && resetFit.sse <= fit.sse) {
      resetF = (fit.sse - resetFit.sse) / resetFit.mse;
      resetP = fSF(resetF, 1, resetFit.df);
    }
  } catch {
    // leave NaN
  }

  // DFBETAS: standardized change in each coefficient when observation i is
  // dropped, using the Sherman–Morrison update for b(i) and its covariance.
  let dfbetasMax = NaN;
  let dfbetasCount = 0;
  if (fit.df > 1) {
    const threshold = 2 / Math.sqrt(n);
    let max = 0;
    let count = 0;
    let computed = false;
    for (let i = 0; i < n; i += 1) {
      const h = leverage[i];
      if (!(h < 1)) continue;
      const denom = 1 - h;
      const residual = fit.residuals[i];
      const u = multiplyVector(fit.xtxInv, X[i]);
      const mseI = (fit.sse - (residual * residual) / denom) / (fit.df - 1);
      if (!(mseI >= 0)) continue;
      for (let j = 0; j < fit.coef.length; j += 1) {
        const seI = Math.sqrt(mseI * (fit.xtxInv[j][j] + (u[j] * u[j]) / denom));
        if (!(seI > 0)) continue;
        const dfbeta = (u[j] * residual) / denom / seI;
        computed = true;
        if (Number.isFinite(dfbeta)) {
          max = Math.max(max, Math.abs(dfbeta));
          if (Math.abs(dfbeta) > threshold) count += 1;
        }
      }
    }
    if (computed) {
      dfbetasMax = max;
      dfbetasCount = count;
    }
  }

  // Belsley condition index: singular values of the unit-scaled design.
  let conditionIndex = NaN;
  let conditionCount = 0;
  try {
    const width = X[0].length;
    const norms = Array.from({ length: width }, (_, j) =>
      Math.sqrt(X.reduce((sum, row) => sum + row[j] * row[j], 0))
    );
    const scaled = X.map(row => row.map((value, j) => (norms[j] > 0 ? value / norms[j] : 0)));
    const ztz: Matrix = Array.from({ length: width }, (_, i) =>
      Array.from({ length: width }, (_, j) =>
        scaled.reduce((sum, row) => sum + row[i] * row[j], 0)
      )
    );
    const eigen = eigenSymmetric(ztz);
    if (eigen.values.length > 0 && eigen.values[0] > 0) {
      const indices = eigen.values.map(value =>
        Math.sqrt(eigen.values[0] / Math.max(value, 1e-12))
      );
      conditionIndex = Math.max(...indices);
      conditionCount = indices.filter(value => value > 30).length;
    }
  } catch {
    // leave NaN
  }

  const standardizedResiduals = fit.residuals.map((residual, i) =>
    fit.mse > 0 && leverage[i] < 1 ? residual / (Math.sqrt(fit.mse) * Math.sqrt(1 - leverage[i])) : NaN
  );
  const residualOutliers = standardizedResiduals.filter(value => Math.abs(value) > 3).length;

  const theilSen =
    k === 1
      ? (() => {
          const result = calcTheilSen(predictors[0], Y);
          const ci = bootstrapCI(rnd => {
            const sampleX: number[] = [];
            const sampleY: number[] = [];
            for (let i = 0; i < n; i++) {
              const index = Math.floor(rnd() * n);
              sampleX.push(predictors[0][index]);
              sampleY.push(Y[index]);
            }
            return calcTheilSen(sampleX, sampleY).slope;
          }, level, 600);
          return { slope: result.slope, intercept: result.intercept, lo: ci.lo, hi: ci.hi };
        })()
      : null;

  const tsResiduals =
    theilSen && isFinite(theilSen.slope)
      ? Y.map((value, i) => value - (theilSen.intercept + theilSen.slope * predictors[0][i]))
      : null;

  const residualSummary = (values: number[], label: string) => {
    const jb = (() => {
      if (values.length < 3) return NaN;
      const skew = jStat.skewness(values);
      const kurt = jStat.kurtosis(values);
      return chi2SF((values.length / 6) * (skew * skew + (kurt * kurt) / 4), 2);
    })();
    const lilliefors = lillieforsTest(values);
    const mean = jStat.mean(values);
    const standardDeviation = jStat.stdev(values, true);
    return {
      label,
      n: values.length,
      mean,
      median: jStat.median(values),
      sd: standardDeviation,
      min: jStat.min(values),
      max: jStat.max(values),
      skew: jStat.skewness(values),
      kurt: jStat.kurtosis(values),
      jbP: jb,
      lillieforsP: lilliefors.p,
      outliers: standardDeviation > 0
        ? values.filter(value => Math.abs((value - mean) / standardDeviation) > 3).length
        : 0,
    };
  };

  const olsSummary = residualSummary(fit.residuals, 'OLS');
  const tsSummary = tsResiduals ? residualSummary(tsResiduals, 'Theil-Sen') : null;

  const tables: TableSpec[] = [];

  tables.push({
    id: 'reg-model',
    title: 'Sintesi del modello',
    subtitle: `${depName} ~ ${predNames.join(' + ')}`,
    columns: [
      { key: 'metric', label: 'Metrica', format: 'text' },
      { key: 'value', label: 'Valore', format: 'dec4' },
      { key: 'detail', label: 'Dettaglio', format: 'text' },
    ],
    rows: [
      { metric: 'N', value: n, detail: `osservazioni complete (k = ${k} predittori)` },
      { metric: 'R', value: Math.sqrt(Math.max(0, fit.r2)), detail: interpretR(Math.sqrt(Math.max(0, fit.r2))) },
      { metric: 'R²', value: fit.r2, detail: 'quota di varianza spiegata' },
      { metric: 'Adjusted R²', value: fit.adjR2, detail: 'corretto per numero di predittori' },
      { metric: 'SE of estimate', value: Math.sqrt(fit.mse), detail: `√(SSE / ${fit.df})` },
      { metric: 'F', value: (fit.ssr / k) / fit.mse, detail: `F(${k}, ${fit.df})` },
      { metric: 'p (F)', value: fSF((fit.ssr / k) / fit.mse, k, fit.df), detail: 'test globale del modello' },
      { metric: 'AIC', value: aic, detail: 'n·ln(SSE/n) + 2(k+1)' },
      { metric: 'BIC', value: bic, detail: 'n·ln(SSE/n) + ln(n)(k+1)' },
      { metric: 'Durbin–Watson', value: dw, detail: '≈2 assenza di autocorrelazione; ordine righe' },
    ],
    notes: ['R² e F assumono un modello con intercetta. AIC/BIC sono definiti a meno di una costante additiva.'],
  });

  tables.push({
    id: 'reg-anova',
    title: 'ANOVA del modello',
    columns: [
      { key: 'source', label: 'Source', format: 'text' },
      { key: 'ss', label: 'SS', format: 'dec4' },
      { key: 'df', label: 'df', format: 'int' },
      { key: 'ms', label: 'MS', format: 'dec4' },
      { key: 'f', label: 'F', format: 'dec3' },
      { key: 'p', label: 'p', format: 'p' },
    ],
    rows: [
      { source: 'Regression', ss: fit.ssr, df: k, ms: fit.ssr / k, f: (fit.ssr / k) / fit.mse, p: fSF((fit.ssr / k) / fit.mse, k, fit.df) },
      { source: 'Residual', ss: fit.sse, df: fit.df, ms: fit.mse, f: NaN, p: NaN },
      { source: 'Total', ss: fit.sst, df: n - 1, ms: NaN, f: NaN, p: NaN },
    ],
  });

  tables.push({
    id: 'reg-coefficients',
    title: 'Coefficienti',
    subtitle: `CI ${level}% · stima OLS`,
    columns: [
      { key: 'predictor', label: 'Predictor', format: 'text' },
      { key: 'b', label: 'B', format: 'dec4' },
      { key: 'se', label: 'SE', format: 'dec4' },
      { key: 'beta', label: 'β std.', format: 'dec3' },
      { key: 't', label: 't', format: 'dec3' },
      { key: 'p', label: 'p', format: 'p' },
      { key: 'ciLo', label: 'CI low', format: 'dec4' },
      { key: 'ciHi', label: 'CI high', format: 'dec4' },
      { key: 'tol', label: 'Tolerance', format: 'dec3' },
      { key: 'vif', label: 'VIF', format: 'dec2' },
    ],
    rows: [
      {
        predictor: '(Intercept)',
        b: fit.coef[0],
        se: fit.se[0],
        beta: NaN,
        t: fit.tStats[0],
        p: fit.pValues[0],
        ciLo: fit.coef[0] - crit * fit.se[0],
        ciHi: fit.coef[0] + crit * fit.se[0],
        tol: NaN,
        vif: NaN,
      },
      ...predNames.map((name, index) => {
        const j = index + 1;
        const sdX = jStat.stdev(predictors[index], true);
        const beta = sdY > 0 && jStat.stdev(predictors[index], true) > 0
          ? fit.coef[j] * (sdX / sdY)
          : NaN;
        return {
          predictor: name,
          b: fit.coef[j],
          se: fit.se[j],
          beta,
          t: fit.tStats[j],
          p: fit.pValues[j],
          ciLo: fit.coef[j] - crit * fit.se[j],
          ciHi: fit.coef[j] + crit * fit.se[j],
          tol: isFinite(vifValues[index]) ? 1 / vifValues[index] : NaN,
          vif: vifValues[index],
        };
      }),
    ],
    notes: [
      `CI: B ± t(${level}%, df = ${fit.df})·SE. β std. = B·SD(x)/SD(y).`,
      'VIF = 1/(1−R²_aux) da regressione del predittore sugli altri; valori > 5 indicano collinearità problematica.',
    ],
  });

  tables.push({
    id: 'reg-diagnostics',
    title: 'Diagnostica del modello',
    columns: [
      { key: 'metric', label: 'Metrica', format: 'text' },
      { key: 'value', label: 'Valore', format: 'dec4' },
      { key: 'note', label: 'Nota', format: 'text' },
    ],
    rows: [
      { metric: 'Leverage massimo', value: maxLeverage, note: 'h_ii = x_iᵀ(XᵀX)⁻¹x_i' },
      { metric: "Cook's D massimo", value: maxCook, note: 'valori > 1 indicano osservazioni influenti' },
      { metric: "Cook's D > 1", value: cookOutliers, note: 'numero di osservazioni' },
      { metric: 'Breusch–Pagan LM', value: bpStat, note: 'eteroschedasticità dei residui' },
      { metric: 'Breusch–Pagan p', value: bpP, note: `χ² con ${k} df` },
      { metric: 'White LM', value: whiteStat, note: 'quadrati e prodotti incrociati dei predittori' },
      { metric: 'White p', value: whiteP, note: `χ² con ${whiteDf} df` },
      { metric: 'RESET F (ŷ²)', value: resetF, note: 'non linearità da potenze dei valori adattati' },
      { metric: 'RESET p', value: resetP, note: 'F con 1 e df del modello aumentato' },
      { metric: '|DFBETAS| massimo', value: dfbetasMax, note: 'influenza su singolo coefficiente' },
      { metric: 'DFBETAS oltre 2/√n', value: dfbetasCount, note: `soglia ${(2 / Math.sqrt(n)).toFixed(3)}` },
      { metric: 'Condition index massimo', value: conditionIndex, note: 'X scalato a norma unitaria; > 30 collinearità' },
      { metric: 'Condition index > 30', value: conditionCount, note: 'numero di dimensioni coinvolte' },
      { metric: 'Residui studentizzati |z| > 3', value: residualOutliers, note: 'outlier sui residui studentizzati' },
    ],
    notes: [
      'Breusch–Pagan richiede l’ipotesi di normalità dei residui; con N piccolo ha potenza limitata.',
      'White usa n·R² della regressione ausiliaria (quadrati e prodotti incrociati); RESET2 aggiunge ŷ². DFBETAS misura il cambio standardizzato di un coefficiente eliminando un’osservazione.',
      'Condition index di Belsley calcolato sugli autovalori di XᵀX dopo scala a norma unitaria: valori > 30 suggeriscono collinearità, > 100 sono gravi.',
    ],
  });

  const residualRows = [
    { metric: 'N', ols: olsSummary.n, ts: tsSummary?.n },
    { metric: 'Mean', ols: olsSummary.mean, ts: tsSummary?.mean },
    { metric: 'Median', ols: olsSummary.median, ts: tsSummary?.median },
    { metric: 'SD', ols: olsSummary.sd, ts: tsSummary?.sd },
    { metric: 'Min', ols: olsSummary.min, ts: tsSummary?.min },
    { metric: 'Max', ols: olsSummary.max, ts: tsSummary?.max },
    { metric: 'Skewness', ols: olsSummary.skew, ts: tsSummary?.skew },
    { metric: 'Excess kurtosis', ols: olsSummary.kurt, ts: tsSummary?.kurt },
    { metric: 'Jarque–Bera p', ols: olsSummary.jbP, ts: tsSummary?.jbP },
    { metric: 'Lilliefors p', ols: olsSummary.lillieforsP, ts: tsSummary?.lillieforsP },
    { metric: 'Residui oltre 3 SD', ols: olsSummary.outliers, ts: tsSummary?.outliers },
  ];

  tables.push({
    id: 'reg-residuals',
    title: 'Diagnostica dei residui',
    subtitle: 'OLS vs Theil–Sen',
    columns: [
      { key: 'metric', label: 'Metrica', format: 'text' },
      { key: 'ols', label: 'Residui OLS', format: 'dec4' },
      ...(tsSummary ? [{ key: 'ts', label: 'Residui Theil–Sen', format: 'dec4' as const }] : []),
    ],
    rows: residualRows,
    notes: ['I residui Theil–Sen sono disponibili per la regressione semplice; con più predittori il TS è univariato e non definisce un modello congiunto.'],
  });

  if (k === 1 && theilSen) {
    tables.push({
      id: 'reg-robust',
      title: 'Stimatore robusto Theil–Sen',
      columns: [
        { key: 'measure', label: 'Parametro', format: 'text' },
        { key: 'ols', label: 'OLS', format: 'dec4' },
        { key: 'ts', label: 'Theil–Sen', format: 'dec4' },
        { key: 'ciLo', label: 'TS CI low', format: 'dec4' },
        { key: 'ciHi', label: 'TS CI high', format: 'dec4' },
      ],
      rows: [
        { measure: 'Slope', ols: fit.coef[1], ts: theilSen.slope, ciLo: theilSen.lo, ciHi: theilSen.hi },
        { measure: 'Intercept', ols: fit.coef[0], ts: theilSen.intercept, ciLo: NaN, ciHi: NaN },
      ],
      notes: ['Theil–Sen: mediana delle pendenze tra tutte le coppie di punti; CI bootstrap percentile (600 repliche, seed fisso).'],
    });
  } else if (k > 1) {
    tables.push({
      id: 'reg-robust',
      title: 'Stimatori robusti univariati',
      columns: [
        { key: 'predictor', label: 'Predictor', format: 'text' },
        { key: 'ols', label: 'OLS B', format: 'dec4' },
        { key: 'ts', label: 'Theil–Sen slope', format: 'dec4' },
      ],
      rows: predNames.map((name, index) => ({
        predictor: name,
        ols: fit.coef[index + 1],
        ts: calcTheilSen(predictors[index], Y).slope,
      })),
      notes: ['Con più predittori il Theil–Sen è calcolato separatamente per ciascun predittore e non controlla gli altri: usarlo solo come diagnostica descrittiva.'],
    });
  }

  return tables;
};
