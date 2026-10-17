import { jStat } from './jstat';
import type { TableSpec } from './types';
import type { ReportSection, ReportSpec } from './report';
import { fmtEst, fmtP } from './format';
import { chi2SF } from './distributions';
import { describeP, isDecided, tableById } from './reportKit';

/**
 * Descriptive time-series analysis and simple forecasting.
 *
 * Covers the "Describe > Time Series" and "Forecast" blocks of Statgraphics:
 * autocorrelation, randomness and trend tests, seasonal decomposition,
 * exponential smoothing, linear trend and seasonal-naive forecasts, with a
 * holdout comparison of the three models.
 */

export interface TimeSeriesOptions {
  values: number[];
  /** Seasonal period (0 or 1 = no seasonality). */
  period: number;
  horizon: number;
  level?: number;
}

export interface AcfPoint {
  lag: number;
  acf: number;
  pacf: number;
}

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

const variance = (values: number[]): number => {
  const mu = mean(values);
  return values.reduce((sum, value) => sum + Math.pow(value - mu, 2), 0) / (values.length - 1);
};

const normalTwoSided = (z: number): number => 2 * jStat.normal.cdf(-Math.abs(z), 0, 1);

export const autocorrelation = (values: number[], maxLag: number): number[] => {
  const n = values.length;
  const mu = mean(values);
  const denominator = values.reduce((sum, value) => sum + Math.pow(value - mu, 2), 0);
  if (!(denominator > 0)) return new Array(maxLag + 1).fill(NaN);
  const result = [1];
  for (let lag = 1; lag <= maxLag; lag++) {
    let numerator = 0;
    for (let index = 0; index + lag < n; index++) {
      numerator += (values[index] - mu) * (values[index + lag] - mu);
    }
    result.push(numerator / denominator);
  }
  return result;
};

/** Partial autocorrelation via the Durbin–Levinson recursion. */
export const partialAutocorrelation = (acf: number[], maxLag: number): number[] => {
  const pacf = [1];
  const coefficients: number[][] = [];
  for (let lag = 1; lag <= maxLag; lag++) {
    const previous = coefficients[lag - 1] ?? [];
    let numerator = acf[lag];
    for (let j = 1; j < lag; j++) numerator -= (previous[j - 1] ?? 0) * acf[lag - j];
    let denominator = 1;
    for (let j = 1; j < lag; j++) denominator -= (previous[j - 1] ?? 0) * acf[j];
    const next = Math.abs(denominator) < 1e-12 ? 0 : numerator / denominator;
    const current = new Array<number>(lag);
    for (let j = 1; j < lag; j++) {
      current[j - 1] = (previous[j - 1] ?? 0) - next * (previous[lag - j - 1] ?? 0);
    }
    current[lag - 1] = next;
    coefficients[lag] = current;
    pacf.push(next);
  }
  return pacf;
};

export const acfTable = (values: number[], maxLag: number): AcfPoint[] => {
  const acf = autocorrelation(values, maxLag);
  const pacf = partialAutocorrelation(acf, maxLag);
  return Array.from({ length: maxLag + 1 }, (_, lag) => ({ lag, acf: acf[lag], pacf: pacf[lag] }));
};

export const mannKendall = (values: number[]): { s: number; tau: number; z: number; p: number } => {
  const n = values.length;
  if (n < 4) return { s: NaN, tau: NaN, z: NaN, p: NaN };
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      s += Math.sign(values[j] - values[i]);
    }
  }

  const counts = new Map<number, number>();
  values.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1));
  let tieCorrection = 0;
  counts.forEach(count => {
    if (count > 1) tieCorrection += count * (count - 1) * (2 * count + 5);
  });

  const varianceS = (n * (n - 1) * (2 * n + 5) - tieCorrection) / 18;
  const z = varianceS > 0 ? s > 0 ? (s - 1) / Math.sqrt(varianceS) : s < 0 ? (s + 1) / Math.sqrt(varianceS) : 0 : NaN;
  return {
    s,
    tau: s / (n * (n - 1) / 2),
    z,
    p: Number.isFinite(z) ? normalTwoSided(z) : NaN,
  };
};

/** Sen's slope: median of all pairwise slopes, robust to outliers. */
export const senSlope = (values: number[]): number => {
  const slopes: number[] = [];
  for (let i = 0; i < values.length - 1; i++) {
    for (let j = i + 1; j < values.length; j++) {
      slopes.push((values[j] - values[i]) / (j - i));
    }
  }
  return slopes.length > 0 ? jStat.median(slopes) : NaN;
};

/** Wald–Wolfowitz runs test around the median. */
export const runsTest = (values: number[]): { runs: number; n1: number; n2: number; z: number; p: number } => {
  const median = jStat.median(values);
  const signs = values
    .map(value => (value > median ? 1 : value < median ? 0 : null))
    .filter((value): value is 0 | 1 => value !== null);
  const n1 = signs.filter(value => value === 1).length;
  const n2 = signs.length - n1;
  if (n1 < 2 || n2 < 2) return { runs: NaN, n1, n2, z: NaN, p: NaN };

  let runs = 1;
  for (let index = 1; index < signs.length; index++) {
    if (signs[index] !== signs[index - 1]) runs += 1;
  }

  const n = n1 + n2;
  const expected = (2 * n1 * n2) / n + 1;
  const varianceRuns = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
  const z = varianceRuns > 0 ? (runs - expected + (runs > expected ? -0.5 : 0.5)) / Math.sqrt(varianceRuns) : NaN;
  return { runs, n1, n2, z, p: Number.isFinite(z) ? normalTwoSided(z) : NaN };
};

export const ljungBox = (values: number[], lags: number): { q: number; df: number; p: number } => {
  const n = values.length;
  const acf = autocorrelation(values, lags);
  let q = 0;
  for (let lag = 1; lag <= lags; lag++) {
    if (Number.isFinite(acf[lag])) q += (acf[lag] * acf[lag]) / (n - lag);
  }
  q *= n * (n + 2);
  return { q, df: lags, p: chi2SF(q, lags) };
};

/** Centred moving average; even windows use the 2xMA weighting. */
export const centeredMovingAverage = (values: number[], window: number): number[] => {
  const n = values.length;
  const result = new Array<number>(n).fill(NaN);
  if (window < 2 || window > n) return result;

  if (window % 2 === 1) {
    const half = (window - 1) / 2;
    for (let index = half; index < n - half; index++) {
      let sum = 0;
      for (let offset = -half; offset <= half; offset++) sum += values[index + offset];
      result[index] = sum / window;
    }
    return result;
  }

  // Even window (2xMA): weights 0.5, 1, ..., 1, 0.5 on the m values from
  // index - half to index + half - 1, divided by m.
  const half = window / 2;
  for (let index = half; index < n - half; index++) {
    let sum = 0.5 * values[index - half] + 0.5 * values[index + half - 1];
    for (let offset = -half + 1; offset <= half - 2; offset++) sum += values[index + offset];
    result[index] = sum / window;
  }
  return result;
};

export interface SeasonalDecomposition {
  trend: number[];
  seasonal: number[];
  remainder: number[];
  indices: number[];
  strength: number;
}

export const decomposeSeasonal = (values: number[], period: number): SeasonalDecomposition | null => {
  if (period < 2 || values.length < period * 2) return null;
  const trend = centeredMovingAverage(values, period);
  const detrended: number[][] = Array.from({ length: period }, () => []);

  values.forEach((value, index) => {
    if (Number.isFinite(trend[index])) detrended[index % period].push(value - trend[index]);
  });

  const raw = detrended.map(group => (group.length > 0 ? mean(group) : 0));
  const center = mean(raw);
  const indices = raw.map(value => value - center);

  const seasonal = values.map((_, index) => indices[index % period]);
  const remainder = values.map((value, index) =>
    Number.isFinite(trend[index]) ? value - trend[index] - seasonal[index] : NaN
  );

  const valid = remainder.map((value, index) => ({ value, index })).filter(item => Number.isFinite(item.value));
  const detrendedValid = valid.map(item => values[item.index] - trend[item.index]);
  const residualVariance = valid.length > 1 ? variance(valid.map(item => item.value)) : NaN;
  const detrendedVariance = detrendedValid.length > 1 ? variance(detrendedValid) : NaN;
  const strength =
    Number.isFinite(residualVariance) && detrendedVariance > 0 ? Math.max(0, 1 - residualVariance / detrendedVariance) : NaN;

  return { trend, seasonal, remainder, indices, strength };
};

// ---------------------------------------------------------------------------
// Forecasting
// ---------------------------------------------------------------------------

export interface ForecastModel {
  name: string;
  forecast: number[];
  rmse: number;
  mae: number;
  mape: number;
  note: string;
}

const sesFit = (values: number[]): { alpha: number; level: number; sse: number } => {
  let best = { alpha: 0.5, level: values[values.length - 1], sse: Infinity };
  for (let step = 1; step <= 19; step++) {
    const alpha = step / 20;
    let level = values[0];
    let sse = 0;
    for (let index = 1; index < values.length; index++) {
      const error = values[index] - level;
      sse += error * error;
      level += alpha * error;
    }
    if (sse < best.sse) best = { alpha, level, sse };
  }
  return best;
};

const linearFit = (values: number[]): { intercept: number; slope: number } => {
  const n = values.length;
  const xs = Array.from({ length: n }, (_, index) => index + 1);
  const meanX = mean(xs);
  const meanY = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index++) {
    numerator += (xs[index] - meanX) * (values[index] - meanY);
    denominator += Math.pow(xs[index] - meanX, 2);
  }
  const slope = denominator > 0 ? numerator / denominator : 0;
  return { intercept: meanY - slope * meanX, slope };
};

const metrics = (actual: number[], predicted: number[]): { rmse: number; mae: number; mape: number } => {
  const errors = actual.map((value, index) => value - predicted[index]);
  const mse = mean(errors.map(error => error * error));
  const mae = mean(errors.map(error => Math.abs(error)));
  const percentage = actual
    .map((value, index) => (value !== 0 ? Math.abs(errors[index] / value) : NaN))
    .filter(value => Number.isFinite(value));
  return {
    rmse: Math.sqrt(mse),
    mae,
    mape: percentage.length > 0 ? mean(percentage) * 100 : NaN,
  };
};

export const forecastModels = (values: number[], period: number, horizon: number): ForecastModel[] => {
  const n = values.length;
  const holdout = Math.max(1, Math.min(horizon, Math.floor(n * 0.2)));
  const train = values.slice(0, n - holdout);
  const test = values.slice(n - holdout);
  const models: ForecastModel[] = [];

  if (train.length >= 4) {
    const ses = sesFit(train);
    models.push({
      name: 'Exponential smoothing (SES)',
      forecast: new Array(holdout).fill(ses.level),
      ...metrics(test, new Array(holdout).fill(ses.level)),
      note: `alpha ottimale = ${fmtEst(ses.alpha, 2)}`,
    });

    const line = linearFit(train);
    const linearForecast = Array.from(
      { length: holdout },
      (_, index) => line.intercept + line.slope * (train.length + index + 1)
    );
    models.push({
      name: 'Linear trend',
      forecast: linearForecast,
      ...metrics(test, linearForecast),
      note: `pendenza = ${fmtEst(line.slope, 4)} per passo`,
    });

    if (period >= 2 && train.length > period) {
      const seasonalForecast = Array.from(
        { length: holdout },
        (_, index) => train[train.length - period + (index % period)]
      );
      models.push({
        name: 'Seasonal naive',
        forecast: seasonalForecast,
        ...metrics(test, seasonalForecast),
        note: `ripete l’ultimo ciclo di ${period} periodi`,
      });
    }
  }

  const finalForecasts = (model: ForecastModel): number[] => {
    if (model.name.startsWith('Exponential')) {
      const ses = sesFit(values);
      return new Array(horizon).fill(ses.level);
    }
    if (model.name.startsWith('Linear')) {
      const line = linearFit(values);
      return Array.from({ length: horizon }, (_, index) => line.intercept + line.slope * (n + index + 1));
    }
    if (period >= 2) {
      return Array.from({ length: horizon }, (_, index) => values[n - period + (index % period)]);
    }
    return new Array(horizon).fill(values[n - 1]);
  };

  return models
    .map(model => ({ ...model, forecast: finalForecasts(model) }))
    .sort((left, right) => left.rmse - right.rmse);
};

// ---------------------------------------------------------------------------
// Tables and report
// ---------------------------------------------------------------------------

export const timeSeriesTables = (options: TimeSeriesOptions): TableSpec[] => {
  const { values, period, horizon } = options;
  const level = options.level ?? 95;
  const n = values.length;
  if (n < 5) return [];
  if (values.some(value => !Number.isFinite(value))) return [];

  const tables: TableSpec[] = [];
  const maxLag = Math.min(12, Math.max(1, Math.floor(n / 4)));
  const acf = acfTable(values, maxLag);
  const trend = mannKendall(values);
  const runs = runsTest(values);
  const ljung = ljungBox(values, maxLag);
  const slope = senSlope(values);
  const sd = Math.sqrt(variance(values));
  const decomposition = period >= 2 ? decomposeSeasonal(values, period) : null;

  tables.push({
    id: 'ts-summary',
    title: 'Sintesi della serie',
    subtitle: `N = ${n}${period >= 2 ? ` · periodo stagionale = ${period}` : ''}`,
    columns: [
      { key: 'metric', label: 'Metrica', format: 'text' },
      { key: 'value', label: 'Valore', format: 'text' },
    ],
    rows: [
      { metric: 'Osservazioni', value: String(n) },
      { metric: 'Media', value: fmtEst(mean(values), 4) },
      { metric: 'Deviazione standard', value: fmtEst(sd, 4) },
      { metric: 'Minimo', value: fmtEst(Math.min(...values), 4) },
      { metric: 'Massimo', value: fmtEst(Math.max(...values), 4) },
      { metric: 'Primo valore', value: fmtEst(values[0], 4) },
      { metric: 'Ultimo valore', value: fmtEst(values[n - 1], 4) },
      { metric: 'Variazione totale', value: fmtEst(values[n - 1] - values[0], 4) },
      { metric: 'Pendenza di Sen', value: fmtEst(slope, 4) },
      ...(decomposition
        ? [{ metric: 'Forza della stagionalità', value: fmtEst(decomposition.strength, 3) }]
        : []),
    ],
    notes: ['La pendenza di Sen è la mediana delle pendenze tra tutte le coppie di punti: è robusta agli outlier.'],
  });

  const acfRows = acf.map(point => ({
    lag: point.lag,
    acf: point.acf,
    pacf: point.pacf,
    lo: -1.96 / Math.sqrt(n),
    hi: 1.96 / Math.sqrt(n),
  }));

  tables.push({
    id: 'ts-acf',
    title: 'Autocorrelazione e autocorrelazione parziale',
    subtitle: `banda di confidenza ±1,96/√N = ±${fmtEst(1.96 / Math.sqrt(n), 3)}`,
    columns: [
      { key: 'lag', label: 'Lag', format: 'int' },
      { key: 'acf', label: 'ACF', format: 'dec3' },
      { key: 'pacf', label: 'PACF', format: 'dec3' },
      { key: 'lo', label: 'Limite basso', format: 'dec3' },
      { key: 'hi', label: 'Limite alto', format: 'dec3' },
    ],
    rows: acfRows,
    notes: [
      'Barre oltre la banda indicano autocorrelazione non spiegata dal caso.',
      'La PACF isola la correlazione al lag k al netto dei lag intermedi: un taglio netto dopo il lag 1 suggerisce un processo AR(1).',
    ],
  });

  const mkDecision = isDecided(trend.p, level) ? (trend.s > 0 ? 'trend crescente' : 'trend decrescente') : 'nessun trend monotono';
  tables.push({
    id: 'ts-tests',
    title: 'Test di casualità e trend',
    columns: [
      { key: 'test', label: 'Test', format: 'text' },
      { key: 'statistic', label: 'Statistica', format: 'dec3' },
      { key: 'p', label: 'p', format: 'p' },
      { key: 'decision', label: 'Lettura', format: 'text' },
    ],
    rows: [
      {
        test: 'Mann–Kendall (trend)',
        statistic: trend.z,
        p: trend.p,
        decision: Number.isFinite(trend.p) ? mkDecision : 'non calcolabile',
      },
      {
        test: 'Wald–Wolfowitz (runs)',
        statistic: runs.z,
        p: runs.p,
        decision: Number.isFinite(runs.p) ? (isDecided(runs.p, level) ? 'serie non casuale' : 'compatibile con il caso') : 'non calcolabile',
      },
      {
        test: `Ljung–Box (lag 1–${maxLag})`,
        statistic: ljung.q,
        p: ljung.p,
        decision: Number.isFinite(ljung.p) ? (isDecided(ljung.p, level) ? 'autocorrelazione presente' : 'nessuna autocorrelazione rilevante') : 'non calcolabile',
      },
    ],
    notes: [
      'Mann–Kendall è non parametrico e resistente agli outlier: p piccolo indica una tendenza monotona.',
      'Il test dei runs verifica che l’ordine dei valori sia casuale, non la loro distribuzione.',
      'Ljung–Box verifica se le prime autocorrelazioni sono congiuntamente nulle.',
    ],
  });

  if (decomposition) {
    tables.push({
      id: 'ts-seasonal',
      title: 'Indici stagionali',
      subtitle: `modello additivo · periodo ${period}`,
      columns: [
        { key: 'position', label: 'Posizione nel ciclo', format: 'int' },
        { key: 'index', label: 'Indice', format: 'dec3' },
      ],
      rows: decomposition.indices.map((value, index) => ({ position: index + 1, index: value })),
      notes: [
        'Gli indici sono scostamenti medi dal trend, centrati su zero: valori positivi indicano periodi sopra la tendenza.',
        `Forza della stagionalità = ${fmtEst(decomposition.strength, 3)} (0 = nessuna, 1 = stagionalità dominante).`,
      ],
    });

    tables.push({
      id: 'ts-decomposition',
      title: 'Scomposizione',
      subtitle: 'serie = trend + stagionalità + residuo',
      columns: [
        { key: 't', label: 't', format: 'int' },
        { key: 'value', label: 'Serie', format: 'dec3' },
        { key: 'trend', label: 'Trend', format: 'dec3' },
        { key: 'seasonal', label: 'Stagionalità', format: 'dec3' },
        { key: 'remainder', label: 'Residuo', format: 'dec3' },
      ],
      rows: values.map((value, index) => ({
        t: index + 1,
        value,
        trend: decomposition.trend[index],
        seasonal: decomposition.seasonal[index],
        remainder: decomposition.remainder[index],
      })),
      notes: ['Le prime e le ultime osservazioni non hanno trend stimato: la media mobile centrata non è definita ai bordi.'],
    });
  }

  const models = forecastModels(values, period, Math.max(1, Math.min(horizon, 60)));
  if (models.length > 0) {
    tables.push({
      id: 'ts-models',
      title: 'Confronto dei modelli di previsione',
      subtitle: 'errore su un campione di validazione (ultimo 20% della serie)',
      columns: [
        { key: 'model', label: 'Modello', format: 'text' },
        { key: 'rmse', label: 'RMSE', format: 'dec3' },
        { key: 'mae', label: 'MAE', format: 'dec3' },
        { key: 'mape', label: 'MAPE %', format: 'dec2' },
        { key: 'note', label: 'Dettaglio', format: 'text' },
      ],
      rows: models.map(model => ({
        model: model.name,
        rmse: model.rmse,
        mae: model.mae,
        mape: model.mape,
        note: model.note,
      })),
      notes: [
        'RMSE e MAE sono nella stessa unità della serie; il MAPE è percentuale e non è definito se la serie contiene zeri.',
        'Questi modelli servono da riferimento: il migliore viene confrontato con l’ARIMA, che è il modello usato per le previsioni con intervalli.',
      ],
    });

    tables.push({
      id: 'ts-forecast',
      title: `Previsioni (${models[0].name})`,
      subtitle: `orizzonte ${models[0].forecast.length} passi`,
      columns: [
        { key: 'step', label: 'Passo', format: 'int' },
        { key: 'forecast', label: 'Previsione', format: 'dec3' },
      ],
      rows: models[0].forecast.map((value, index) => ({ step: n + index + 1, forecast: value })),
      notes: [
        'Le previsioni sono puntuali: non incorporano l’incertezza del modello né quella dei dati.',
        'Con orizzonti lunghi l’errore cresce: oltre un ciclo stagionale le previsioni vanno lette come indicazione di direzione.',
      ],
    });
  }

  return tables;
};

const modelQuality = (rmse: number, sd: number): string => {
  if (!Number.isFinite(rmse) || !Number.isFinite(sd) || sd <= 0) return 'non calcolabile';
  const ratio = rmse / sd;
  if (ratio < 0.3) return 'molto buona';
  if (ratio < 0.6) return 'discreta';
  if (ratio < 1) return 'modesta';
  return 'scarsa (peggio della media)';
};

export const timeSeriesReport = (tables: TableSpec[], level: number): ReportSpec => {
  const summary = tableById(tables, 'ts-summary')?.rows ?? [];
  const tests = tableById(tables, 'ts-tests')?.rows ?? [];
  const models = tableById(tables, 'ts-models')?.rows ?? [];
  const seasonal = tableById(tables, 'ts-seasonal');
  const forecast = tableById(tables, 'ts-forecast')?.rows ?? [];
  const arimaModel = tableById(tables, 'ts-arima-model')?.rows ?? [];
  const arimaField = (name: string) => arimaModel.find(row => String(row.metric) === name);
  const arimaText = (name: string): string => String(arimaField(name)?.value ?? '');
  const arimaNumber = (name: string): number => Number(arimaField(name)?.raw ?? NaN);
  const arimaCoefs = tableById(tables, 'ts-arima-coefficients')?.rows ?? [];
  const arimaDiagnostics = tableById(tables, 'ts-arima-diagnostics')?.rows ?? [];
  const arimaAccuracy = tableById(tables, 'ts-arima-accuracy')?.rows ?? [];
  const arimaForecast = tableById(tables, 'ts-arima-forecast')?.rows ?? [];
  const arimaCandidates = tableById(tables, 'ts-arima-candidates')?.rows ?? [];
  const hasArima = arimaModel.length > 0 && arimaForecast.length > 0;

  const metric = (name: string): number => Number(summary.find(row => String(row.metric) === name)?.value ?? NaN);
  const mk = tests.find(row => String(row.test).includes('Mann'));
  const runs = tests.find(row => String(row.test).includes('Wald'));
  const ljung = tests.find(row => String(row.test).includes('Ljung'));
  const best = models[0];

  const n = metric('Osservazioni');
  const sd = metric('Deviazione standard');
  const slope = metric('Pendenza di Sen');
  const total = metric('Variazione totale');

  const hasTrend = Number.isFinite(Number(mk?.p)) && isDecided(Number(mk?.p), level);
  const trendClause = hasTrend
    ? `trend ${Number(mk?.statistic) > 0 ? 'crescente' : 'decrescente'}`
    : 'nessun trend monotono';
  const trendSentence = hasTrend
    ? `c’è un ${trendClause} (Mann–Kendall p = ${fmtP(Number(mk?.p))})`
    : `non c’è evidenza di un ${trendClause} (Mann–Kendall p = ${fmtP(Number(mk?.p))})`;

  const autocorrSentence = Number.isFinite(Number(ljung?.p)) && Number(ljung?.p) < 1 - level / 100
    ? `le autocorrelazioni sono congiuntamente significative (Ljung–Box p = ${fmtP(Number(ljung?.p))}): i valori dipendono dai precedenti`
    : `le autocorrelazioni non sono congiuntamente significative (Ljung–Box p = ${fmtP(Number(ljung?.p))}): non emerge una struttura temporale forte`;

  const holdoutRow = arimaAccuracy.find(row => String(row.sample).startsWith('Validazione'));
  const holdoutRmse = Number(holdoutRow?.rmse ?? NaN);
  const benchmarkRmse = Number(best?.rmse ?? NaN);
  const benchmarkSentence =
    !Number.isFinite(holdoutRmse) || !Number.isFinite(benchmarkRmse)
      ? ''
      : holdoutRmse < benchmarkRmse * 0.95
        ? `batte il riferimento più semplice (RMSE ${fmtEst(benchmarkRmse, 3)})`
        : holdoutRmse > benchmarkRmse * 1.05
          ? `non batte il riferimento più semplice (RMSE ${fmtEst(benchmarkRmse, 3)}): la struttura aggiuntiva non ripaga`
          : `è sostanzialmente equivalente al riferimento più semplice (RMSE ${fmtEst(benchmarkRmse, 3)})`;

  const memoryTerms = arimaCoefs.filter(row =>
    /^(AR|MA|SAR|SMA)\(/.test(String(row.term))
  );
  const memoryBullets = memoryTerms.map(row => {
    const pValue = Number(row.p);
    return `${String(row.term)} = ${fmtEst(Number(row.estimate), 3)} (${describeP(pValue)}): ${
      isDecided(pValue, level)
        ? 'termine significativo, aggiunge memoria al modello'
        : 'termine non significativo, il suo contributo non si distingue dal caso'
    }.`;
  });

  const residualTest = arimaDiagnostics.find(row => String(row.test).includes('Ljung'));
  const residualP = Number(residualTest?.p ?? NaN);
  const secondDelta = Number(arimaCandidates[1]?.delta ?? NaN);
  const aicc = arimaNumber('AICc');
  const adfP = arimaNumber('Test ADF sulla serie');
  const manualDifference = arimaText('Scelta della differenziazione').startsWith('manuale');
  const adbSentence = manualDifference
    ? `La differenziazione è impostata a mano, quindi l’ordine non dipende dai test${Number.isFinite(adfP) ? ` (ADF p ≈ ${fmtP(adfP)} resta solo informativo)` : ''}.`
    : Number.isFinite(adfP)
      ? `Il test ADF sulla serie dà p ≈ ${fmtP(adfP)}: ${adfP > 0.05 ? 'la radice unitaria non è rifiutata, quindi almeno una differenziazione serve' : 'la stazionarietà non è rifiutata, quindi la serie non va differenziata'}.`
      : 'Il test ADF non è calcolabile su questa serie: la differenziazione va decisa a mano.';

  const arimaSection: ReportSection | null = hasArima
    ? {
        heading: `Modello ${arimaText('Modello')}`,
        body: [
          `La ricerca automatica sull'ordine ha scelto ${arimaText('Modello')} (AICc = ${Number.isFinite(aicc) ? fmtEst(aicc, 3) : '—'}): ${
            Number.isFinite(secondDelta) && secondDelta < 2
              ? `il secondo classificato è a Δ AICc = ${fmtEst(secondDelta, 3)}, quindi i dati non distinguono nettamente i due ordini`
              : Number.isFinite(secondDelta)
                ? `il distacco dal secondo classificato è Δ AICc = ${fmtEst(secondDelta, 3)}, quindi la scelta è netta`
                : 'non ci sono altri ordini confrontabili'
          }.`,
          `Differenziazione: ${arimaText('Differenziazione')}; scelta ${arimaText('Scelta della differenziazione').toLowerCase()}. ${adbSentence}`,
          arimaText('Stazionarietà').startsWith('sì') && arimaText('Invertibilità').startsWith('sì')
            ? 'Le radici AR e MA stanno fuori dal cerchio unitario: il modello è stazionario e invertibile, quindi le previsioni convergono invece di divergere.'
            : 'Attenzione: almeno una radice è vicina o dentro il cerchio unitario, quindi la stima è al limite della regione ammissibile e le previsioni vanno lette con prudenza.',
        ],
        bullets: [
          ...(memoryBullets.length > 0
            ? memoryBullets
            : ['Nessun termine AR o MA significativo: il modello si riduce a una media (o a un drift) più rumore.']),
          Number.isFinite(residualP)
            ? `Residui: Ljung–Box ${describeP(residualP)} → ${isDecided(residualP, level) ? 'resta autocorrelazione non spiegata, l’ordine andrebbe rivisto' : 'nessuna autocorrelazione residua, il modello ha catturato la memoria della serie'}.`
            : 'Il test di autocorrelazione sui residui non è calcolabile.',
          Number.isFinite(holdoutRmse)
            ? `Validazione fuori campione: RMSE = ${fmtEst(holdoutRmse, 3)}, MAE = ${fmtEst(Number(holdoutRow?.mae), 3)}; il modello ${benchmarkSentence}.`
            : 'Serie troppo corta per una validazione fuori campione: l’errore disponibile è quello di adattamento.',
          `Errore standard residuo sulla scala modellata: ${fmtEst(arimaNumber('Errore standard residuo'), 3)} su ${String(arimaField('Osservazioni efficaci')?.value ?? '—')} osservazioni efficaci.`,
        ],
      }
    : null;

  const firstArima = arimaForecast[0];
  const lastArima = arimaForecast[arimaForecast.length - 1];
  const widthOf = (row: typeof firstArima): number => Number(row?.hi) - Number(row?.lo);

  const forecastParagraphs: string[] = hasArima
    ? [
        `Il modello ${arimaText('Modello')} porta la previsione da ${fmtEst(Number(firstArima?.forecast), 3)} al passo ${String(firstArima?.step ?? '')} a ${fmtEst(Number(lastArima?.forecast), 3)} al passo ${String(lastArima?.step ?? '')}, su ${arimaForecast.length} passi.`,
        `Intervallo al ${level}%: ${fmtEst(Number(firstArima?.lo), 3)} – ${fmtEst(Number(firstArima?.hi), 3)} al primo passo e ${fmtEst(Number(lastArima?.lo), 3)} – ${fmtEst(Number(lastArima?.hi), 3)} all’ultimo; l’ampiezza passa da ${fmtEst(widthOf(firstArima), 3)} a ${fmtEst(widthOf(lastArima), 3)}, come ci si aspetta quando l’orizzonte cresce.`,
        Number.isFinite(holdoutRmse)
          ? `In validazione sugli ultimi ${String(holdoutRow?.steps ?? '')} valori l’RMSE è ${fmtEst(holdoutRmse, 3)} e il modello ${benchmarkSentence}.`
          : 'Le previsioni non hanno una validazione fuori campione: l’errore in campione è ottimista perché i parametri sono stati stimati sugli stessi dati.',
        'Gli intervalli includono l’accumulo di incertezza dovuto alla differenziazione, ma non l’incertezza sulla stima dei parametri né quella sulla scelta dell’ordine.',
      ]
    : best
      ? [
          `Il modello migliore in validazione è ${String(best.model)} (RMSE = ${fmtEst(Number(best.rmse), 3)}, MAE = ${fmtEst(Number(best.mae), 3)}): qualità ${modelQuality(Number(best.rmse), sd)} rispetto alla variabilità della serie.`,
          `Le prossime ${forecast.length} previsioni partono da ${fmtEst(Number(forecast[0]?.forecast), 3)} e arrivano a ${fmtEst(Number(forecast[forecast.length - 1]?.forecast), 3)}.`,
          'Sono previsioni puntuali: l’intervallo di incertezza crescerebbe con l’orizzonte e non è incluso.',
        ]
      : ['La serie è troppo corta per confrontare modelli di previsione.'];

  return {
    id: 'timeseries',
    title: 'Report di lettura',
    headline: `Serie di ${showInteger(n)} osservazioni: ${trendClause}.`,
    badge: 'Serie storica',
    tone: Number.isFinite(Number(mk?.p)) && isDecided(Number(mk?.p), level) ? 'positive' : 'neutral',
    intro: [
      'L’analisi descrittiva di una serie storica verifica se i valori sono indipendenti dal tempo: trend, autocorrelazione e stagionalità sono le tre strutture che rendono una serie diversa da un campione casuale.',
      `Qui ${trendSentence}, e ${autocorrSentence}.`,
      hasArima
        ? 'Su questa base viene stimato un modello ARIMA/SARIMA: memoria e stagionalità stimate servono a costruire previsioni con intervalli, non solo a descrivere la serie.'
        : 'La serie non permette di stimare un modello ARIMA: le previsioni restano quelle dei modelli semplici.',
    ],
    sections: [
      {
        heading: 'Trend e casualità',
        bullets: [
          `Pendenza di Sen = ${fmtEst(slope, 4)} per passo: ${Number.isFinite(slope) ? (slope > 0 ? 'crescita' : slope < 0 ? 'calo' : 'stabilità') : 'non calcolabile'} mediana, robusta agli outlier.`,
          `Variazione dal primo all’ultimo valore: ${fmtEst(total, 4)} (${Number.isFinite(sd) && sd > 0 ? `circa ${fmtEst(Math.abs(total) / sd, 2)} deviazioni standard` : 'scala non calcolabile'}).`,
          `Test dei runs: p = ${fmtP(Number(runs?.p))}${Number.isFinite(Number(runs?.p)) ? Number(runs?.p) < 1 - level / 100 ? ', la successione non è casuale' : ', compatibile con una successione casuale' : ''}.`,
        ],
      },
      {
        heading: 'Autocorrelazione',
        body: [
          'L’ACF misura quanto un valore è correlato con quelli precedenti. Se le barre restano dentro la banda ±1,96/√N, la serie non mostra memoria temporale; se escono, il passato contiene informazione sul presente.',
          `Ljung–Box: Q = ${fmtEst(Number(ljung?.statistic), 3)} con p = ${fmtP(Number(ljung?.p))}. ${autocorrSentence}.`,
        ],
      },
      {
        heading: seasonal ? 'Stagionalità' : 'Stagionalità non richiesta',
        body: seasonal
          ? [
              `La forza della stagionalità è ${fmtEst(metric('Forza della stagionalità'), 3)}: ${metric('Forza della stagionalità') > 0.5 ? 'la componente stagionale domina la variabilità attorno al trend.' : 'la componente stagionale è presente ma non domina la variabilità attorno al trend.'}`,
              'Gli indici per posizione nel ciclo dicono quali periodi stanno sopra o sotto la tendenza: sono scostamenti medi, non valori assoluti.',
            ]
          : ['Imposta un periodo stagionale (per esempio 12 per dati mensili, 4 per trimestrali) per stimare gli indici e scomporre la serie.'],
      },
      ...(arimaSection ? [arimaSection] : []),
      {
        heading: 'Previsioni',
        body: forecastParagraphs,
      },
    ],
    limitations: [
      hasArima
        ? 'La stima ARIMA è condizionale (somma dei quadrati dei residui) e non a massima verosimiglianza esatta: con serie molto corte i primi residui pesano di più.'
        : 'Non è stato possibile stimare un modello ARIMA su questa serie: le previsioni mostrate sono quelle dei modelli semplici.',
      'La ricerca degli ordini è limitata a p e q ≤ 2 (≤ 1 con meno di 30 osservazioni) e a un termine stagionale AR e MA: ordini maggiori non vengono esplorati.',
      'Gli intervalli di previsione non includono l’incertezza sulla stima dei parametri né sulla scelta dell’ordine; volatilità condizionale (GARCH) e regressori esterni non sono modellati.',
      'La scomposizione è additiva; con ampiezza stagionale proporzionale al livello serve un modello moltiplicativo.',
      'Trend, stagionalità e previsioni assumono che il futuro continui il pattern osservato: cambi di regime non sono previsti.',
      'Il MAPE non è definito quando la serie contiene zeri.',
    ],
  };
};

const showInteger = (value: number): string => (Number.isFinite(value) ? String(Math.round(value)) : '—');
