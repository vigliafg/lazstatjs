import { jStat } from './jstat';
import type { TableSpec } from './types';
import type { ReportSpec } from './report';
import { fmtEst, fmtP } from './format';
import { tableById } from './reportKit';

/**
 * Maximum-likelihood fitting of the distributions Statgraphics offers in its
 * "Distribution fitting" procedure (normal, lognormal, exponential, gamma,
 * Weibull), ranked by AIC. The probability plot uses the fitted quantiles.
 */

export type DistributionName = 'normal' | 'lognormal' | 'exponential' | 'gamma' | 'weibull';

export const DISTRIBUTION_LABEL: Record<DistributionName, string> = {
  normal: 'Normale',
  lognormal: 'Lognormale',
  exponential: 'Esponenziale',
  gamma: 'Gamma',
  weibull: 'Weibull',
};

export interface DistributionFit {
  name: DistributionName;
  params: Record<string, number>;
  logLik: number;
  k: number;
  aic: number;
  bic: number;
  ks: number;
  ksP: number;
  ad: number;
  n: number;
}

// ---------------------------------------------------------------------------
// Special functions
// ---------------------------------------------------------------------------

const logGamma = (x: number): number => {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let sum = 0.99999999999980993;
  for (let i = 0; i < coefficients.length; i++) sum += coefficients[i] / (z + i + 1);
  const t = z + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
};

const digamma = (x: number): number => {
  let result = 0;
  let value = x;
  while (value < 6) {
    result -= 1 / value;
    value += 1;
  }
  const f = 1 / (value * value);
  return (
    result +
    Math.log(value) -
    0.5 / value -
    f * (1 / 12 - f * (1 / 120 - f * (1 / 252 - f * (1 / 240 - f / 132))))
  );
};

const trigamma = (x: number): number => {
  let result = 0;
  let value = x;
  while (value < 6) {
    result += 1 / (value * value);
    value += 1;
  }
  const f = 1 / (value * value);
  return result + 1 / value + f / 2 + f / value / 6 - (f * f) / (30 * value) + (f * f * f) / (42 * value);
};

// ---------------------------------------------------------------------------
// CDF / quantile
// ---------------------------------------------------------------------------

const clamp = (value: number): number => Math.min(1 - 1e-12, Math.max(1e-12, value));

export const distributionCdf = (fit: DistributionFit, x: number): number => {
  switch (fit.name) {
    case 'normal':
      return clamp(jStat.normal.cdf(x, fit.params.mu, fit.params.sigma));
    case 'lognormal':
      if (x <= 0) return 0;
      return clamp(jStat.normal.cdf(Math.log(x), fit.params.mu, fit.params.sigma));
    case 'exponential':
      if (x < 0) return 0;
      return clamp(1 - Math.exp(-fit.params.rate * x));
    case 'gamma':
      if (x <= 0) return 0;
      return clamp(jStat.gamma.cdf(x, fit.params.shape, fit.params.scale));
    case 'weibull':
      if (x <= 0) return 0;
      return clamp(1 - Math.exp(-Math.pow(x / fit.params.scale, fit.params.shape)));
    default:
      return NaN;
  }
};

export const distributionQuantile = (fit: DistributionFit, p: number): number => {
  switch (fit.name) {
    case 'normal':
      return jStat.normal.inv(p, fit.params.mu, fit.params.sigma);
    case 'lognormal':
      return Math.exp(jStat.normal.inv(p, fit.params.mu, fit.params.sigma));
    case 'exponential':
      return -Math.log(1 - p) / fit.params.rate;
    case 'gamma':
      return jStat.gamma.inv(p, fit.params.shape, fit.params.scale);
    case 'weibull':
      return fit.params.scale * Math.pow(-Math.log(1 - p), 1 / fit.params.shape);
    default:
      return NaN;
  }
};

// ---------------------------------------------------------------------------
// Fitting
// ---------------------------------------------------------------------------

const fitNormal = (values: number[]): DistributionFit => {
  const n = values.length;
  const mu = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mu, 2), 0) / n;
  const sigma = Math.sqrt(variance);
  const logLik =
    -0.5 * n * Math.log(2 * Math.PI) - n * Math.log(sigma) -
    values.reduce((sum, value) => sum + Math.pow(value - mu, 2), 0) / (2 * variance);
  return { name: 'normal', params: { mu, sigma }, logLik, k: 2, aic: 0, bic: 0, ks: 0, ksP: 0, ad: 0, n };
};

const fitLognormal = (values: number[]): DistributionFit | null => {
  if (values.some(value => value <= 0)) return null;
  const logs = values.map(Math.log);
  const n = logs.length;
  const mu = logs.reduce((sum, value) => sum + value, 0) / n;
  const variance = logs.reduce((sum, value) => sum + Math.pow(value - mu, 2), 0) / n;
  const sigma = Math.sqrt(variance);
  const logLik =
    -0.5 * n * Math.log(2 * Math.PI) - n * Math.log(sigma) -
    logs.reduce((sum, value) => sum + Math.pow(value - mu, 2), 0) / (2 * variance) -
    logs.reduce((sum, value) => sum + value, 0);
  return { name: 'lognormal', params: { mu, sigma }, logLik, k: 2, aic: 0, bic: 0, ks: 0, ksP: 0, ad: 0, n };
};

const fitExponential = (values: number[]): DistributionFit | null => {
  if (values.some(value => value <= 0)) return null;
  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const rate = 1 / mean;
  const logLik = n * Math.log(rate) - rate * values.reduce((sum, value) => sum + value, 0);
  return { name: 'exponential', params: { rate }, logLik, k: 1, aic: 0, bic: 0, ks: 0, ksP: 0, ad: 0, n };
};

const fitGamma = (values: number[]): DistributionFit | null => {
  if (values.some(value => value <= 0)) return null;
  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (n - 1);
  if (!(mean > 0) || !(variance > 0)) return null;

  const logMean = Math.log(mean);
  const meanLog = values.reduce((sum, value) => sum + Math.log(value), 0) / n;
  const target = logMean - meanLog;

  let shape = (mean * mean) / variance;
  for (let iteration = 0; iteration < 100; iteration++) {
    const value = Math.log(shape) - digamma(shape) - target;
    const derivative = 1 / shape - trigamma(shape);
    if (!isFinite(value) || !isFinite(derivative) || derivative === 0) break;
    const next = shape - value / derivative;
    if (next <= 0) {
      shape = shape / 2;
      continue;
    }
    if (Math.abs(next - shape) < 1e-10) {
      shape = next;
      break;
    }
    shape = next;
  }

  const scale = mean / shape;
  const sumLogs = values.reduce((sum, value) => sum + Math.log(value), 0);
  const sumValues = values.reduce((sum, value) => sum + value, 0);
  const logLik =
    (shape - 1) * sumLogs - sumValues / scale - n * logGamma(shape) - n * shape * Math.log(scale);

  return { name: 'gamma', params: { shape, scale }, logLik, k: 2, aic: 0, bic: 0, ks: 0, ksP: 0, ad: 0, n };
};

const fitWeibull = (values: number[]): DistributionFit | null => {
  if (values.some(value => value <= 0)) return null;
  const n = values.length;
  const logs = values.map(Math.log);
  const meanLog = logs.reduce((sum, value) => sum + value, 0) / n;
  const sdLog = Math.sqrt(logs.reduce((sum, value) => sum + Math.pow(value - meanLog, 2), 0) / (n - 1));
  if (!(sdLog > 0)) return null;

  let shape = 1.2 / sdLog;
  const sumPow = (k: number) => values.reduce((sum, value) => sum + Math.pow(value, k), 0);
  const sumPowLog = (k: number) => values.reduce((sum, value) => sum + Math.pow(value, k) * Math.log(value), 0);

  for (let iteration = 0; iteration < 200; iteration++) {
    const s0 = sumPow(shape);
    const s1 = sumPowLog(shape);
    const s2 = values.reduce(
      (sum, value) => sum + Math.pow(value, shape) * Math.pow(Math.log(value), 2),
      0
    );
    const g = s1 / s0 - 1 / shape - meanLog;
    const gp = (s2 * s0 - s1 * s1) / (s0 * s0) + 1 / (shape * shape);
    if (!isFinite(g) || !isFinite(gp) || gp === 0) break;
    let next = shape - g / gp;
    if (next <= 0.02 || next > 60) next = Math.max(0.05, Math.min(60, shape / 2));
    if (Math.abs(next - shape) < 1e-10) {
      shape = next;
      break;
    }
    shape = next;
  }

  const scale = Math.pow(sumPow(shape) / n, 1 / shape);
  const sumLogs = logs.reduce((sum, value) => sum + value, 0);
  const sumPowScaled = values.reduce((sum, value) => sum + Math.pow(value / scale, shape), 0);
  const logLik =
    n * Math.log(shape) - n * shape * Math.log(scale) +
    (shape - 1) * sumLogs - sumPowScaled;

  return { name: 'weibull', params: { shape, scale }, logLik, k: 2, aic: 0, bic: 0, ks: 0, ksP: 0, ad: 0, n };
};

const kolmogorovP = (d: number, n: number): number => {
  const lambda = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * d;
  let sum = 0;
  for (let k = 1; k <= 100; k++) {
    const term = 2 * Math.pow(-1, k - 1) * Math.exp(-2 * k * k * lambda * lambda);
    sum += term;
    if (Math.abs(term) < 1e-12) break;
  }
  return Math.min(1, Math.max(0, sum));
};

export const fitDistributions = (
  values: number[],
  selected: DistributionName[] = ['normal', 'lognormal', 'exponential', 'gamma', 'weibull']
): DistributionFit[] => {
  const clean = values.filter(value => Number.isFinite(value));
  if (clean.length < 3) return [];
  const sorted = [...clean].sort((a, b) => a - b);
  const n = sorted.length;

  const fits: DistributionFit[] = [];
  for (const name of selected) {
    let fit: DistributionFit | null = null;
    if (name === 'normal') fit = fitNormal(sorted);
    if (name === 'lognormal') fit = fitLognormal(sorted);
    if (name === 'exponential') fit = fitExponential(sorted);
    if (name === 'gamma') fit = fitGamma(sorted);
    if (name === 'weibull') fit = fitWeibull(sorted);
    if (!fit || !isFinite(fit.logLik)) continue;

    fit.aic = 2 * fit.k - 2 * fit.logLik;
    fit.bic = fit.k * Math.log(n) - 2 * fit.logLik;

    let ks = 0;
    for (let i = 0; i < n; i++) {
      const cdf = distributionCdf(fit, sorted[i]);
      if (!isFinite(cdf)) continue;
      ks = Math.max(ks, Math.abs((i + 1) / n - cdf), Math.abs(cdf - i / n));
    }
    fit.ks = ks;
    fit.ksP = kolmogorovP(ks, n);

    let ad = 0;
    for (let i = 0; i < n; i++) {
      const lower = distributionCdf(fit, sorted[i]);
      const upper = distributionCdf(fit, sorted[n - 1 - i]);
      ad += ((2 * (i + 1) - 1) / n) * (Math.log(lower) + Math.log(1 - Math.min(upper, 1 - 1e-12)));
    }
    fit.ad = -n - ad;

    fits.push(fit);
  }

  return fits.sort((a, b) => a.aic - b.aic);
};

/** Data for a probability plot: observed quantiles against fitted quantiles. */
export const probabilityPlotData = (
  fit: DistributionFit,
  values: number[]
): { x: number; y: number }[] => {
  const sorted = [...values].filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  const n = sorted.length;
  return sorted.map((value, index) => {
    const p = (index + 1 - 0.375) / (n + 0.25);
    return { x: distributionQuantile(fit, p), y: value };
  });
};

// ---------------------------------------------------------------------------
// Tables and report
// ---------------------------------------------------------------------------

const paramText = (fit: DistributionFit): string =>
  Object.entries(fit.params)
    .map(([key, value]) => `${key} = ${fmtEst(value, 4)}`)
    .join(' · ');

export const distributionFitTables = (
  values: number[],
  selected: DistributionName[],
  level: number
): TableSpec[] => {
  const fits = fitDistributions(values, selected);
  if (fits.length === 0) return [];

  const tables: TableSpec[] = [];

  tables.push({
    id: 'fit-parameters',
    title: 'Distribuzioni stimate',
    subtitle: `ordinamento per AIC · N = ${fits[0].n}`,
    columns: [
      { key: 'distribution', label: 'Distribuzione', format: 'text' },
      { key: 'parameters', label: 'Parametri (MLE)', format: 'text' },
      { key: 'logLik', label: 'Log-verosimiglianza', format: 'dec3' },
      { key: 'k', label: 'Parametri', format: 'int' },
      { key: 'aic', label: 'AIC', format: 'dec2' },
      { key: 'bic', label: 'BIC', format: 'dec2' },
    ],
    rows: fits.map(fit => ({
      distribution: DISTRIBUTION_LABEL[fit.name],
      parameters: paramText(fit),
      logLik: fit.logLik,
      k: fit.k,
      aic: fit.aic,
      bic: fit.bic,
    })),
    notes: [
      'Le stime sono di massima verosimiglianza (MLE): scelgono i parametri che rendono i dati osservati più probabili.',
      'AIC = 2k − 2·logL: più basso è, meglio la distribuzione spiega i dati tenendo conto del numero di parametri.',
      'Confronta solo le righe con la stessa AIC (stesso dataset): le differenze sotto 2 sono trascurabili, sopra 10 sono nette.',
    ],
  });

  tables.push({
    id: 'fit-gof',
    title: 'Bontà di adattamento',
    subtitle: 'KS = Kolmogorov–Smirnov · AD = Anderson–Darling',
    columns: [
      { key: 'distribution', label: 'Distribuzione', format: 'text' },
      { key: 'ks', label: 'KS D', format: 'dec4' },
      { key: 'ksP', label: 'p KS (indicativo)', format: 'p' },
      { key: 'ad', label: 'AD A²', format: 'dec3' },
    ],
    rows: fits.map(fit => ({
      distribution: DISTRIBUTION_LABEL[fit.name],
      ks: fit.ks,
      ksP: fit.ksP,
      ad: fit.ad,
    })),
    notes: [
      'Il p del KS è asintotico e non corretto per i parametri stimati: tende a essere ottimistico, usalo come indicazione.',
      'KS misura la distanza massima tra la cumulata empirica e quella teorica; AD dà più peso alle code.',
    ],
  });

  const best = fits[0];
  const percentiles = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99];
  tables.push({
    id: 'fit-percentiles',
    title: `Percentili della distribuzione migliore (${DISTRIBUTION_LABEL[best.name]})`,
    subtitle: `CI ${level}% non applicabile ai percentili stimati`,
    columns: [
      { key: 'p', label: 'Percentile', format: 'text' },
      { key: 'value', label: 'Valore stimato', format: 'dec4' },
    ],
    rows: percentiles.map(p => ({
      p: `P${Math.round(p * 100)}`,
      value: distributionQuantile(best, p),
    })),
    notes: [
      'I percentili sono quelli della distribuzione stimata, non i percentili osservati.',
      'Con N piccolo le code sono le più incerte: evita di leggere P1 o P99 come limiti affidabili.',
    ],
  });

  return tables;
};

const strengthOfEvidence = (deltaAic: number): string => {
  if (!Number.isFinite(deltaAic)) return 'non calcolabile';
  if (deltaAic < 2) return 'praticamente equivalente';
  if (deltaAic < 6) return 'moderatamente migliore';
  return 'chiaramente migliore';
};

export const distributionFitReport = (tables: TableSpec[], level: number): ReportSpec => {
  const parameters = tableById(tables, 'fit-parameters')?.rows ?? [];
  if (parameters.length === 0) {
    return {
      id: 'distfit',
      title: 'Report di lettura',
      headline: 'Nessuna distribuzione stimabile con questi dati.',
      badge: 'Fit non disponibile',
      tone: 'caution',
      intro: ['Servono almeno tre valori e, per le distribuzioni a supporto positivo, tutti i valori maggiori di zero.'],
      sections: [],
      limitations: [],
    };
  }

  const best = parameters[0];
  const second = parameters[1];
  const bestName = String(best.distribution);
  const delta = second ? Number(second.aic) - Number(best.aic) : NaN;
  const ksRow = (tableById(tables, 'fit-gof')?.rows ?? []).find(
    row => String(row.distribution) === bestName
  );
  const percentileRows = tableById(tables, 'fit-percentiles')?.rows ?? [];
  const median = percentileRows.find(row => String(row.p) === 'P50');
  const p95 = percentileRows.find(row => String(row.p) === 'P95');

  return {
    id: 'distfit',
    title: 'Report di lettura',
    headline: `La distribuzione che descrive meglio i dati è la ${bestName.toLowerCase()} (AIC = ${fmtEst(Number(best.aic), 1)}).`,
    badge: 'Distribuzione stimata',
    tone: 'neutral',
    intro: [
      'Il fitting cerca la distribuzione teorica che rende più plausibile il campione osservato, e serve per descrivere la variabile, stimare percentili e alimentare carte di controllo o analisi di affidabilità.',
      `La scelta qui è guidata dall’AIC, che premia l’adattamento e penalizza i parametri in più. La ${bestName.toLowerCase()} ha AIC = ${fmtEst(Number(best.aic), 1)}${
        second ? `, ${strengthOfEvidence(delta)} della seconda (${String(second.distribution)}, ΔAIC = ${fmtEst(delta, 1)})` : ''
      }.`,
    ],
    sections: [
      {
        heading: 'I parametri stimati',
        bullets: [
          `Parametri: ${String(best.parameters)}. Sono stime di massima verosimiglianza, non medie campionarie.`,
          `Log-verosimiglianza = ${fmtEst(Number(best.logLik), 2)}: valore assoluto poco interpretabile, utile solo per confrontare modelli.`,
          Number.isFinite(Number(ksRow?.ks))
            ? `KS D = ${fmtEst(Number(ksRow?.ks), 4)} (p indicativo ${fmtP(Number(ksRow?.ksP))}): ${Number(ksRow?.ksP) < 0.05 ? 'la distribuzione non è un buon adattamento ai dati' : 'non c’è evidenza contraria all’adattamento'}.`
            : 'La bontà di adattamento non è calcolabile.',
        ],
      },
      {
        heading: 'Cosa ci fai con questa distribuzione',
        bullets: [
          median ? `Mediana stimata: ${fmtEst(Number(median.value), 3)}.` : '',
          p95 ? `95° percentile stimato: ${fmtEst(Number(p95.value), 3)} (il 5% delle osservazioni dovrebbe superarlo).` : '',
          'Puoi usarla per definire limiti di specifica, stimare la probabilità di superare una soglia o generare dati simulati coerenti.',
        ].filter(Boolean),
      },
      {
        heading: 'Come leggere il confronto',
        body: [
          'L’AIC non dice che la distribuzione scelta sia “vera”: dice che è la meno peggiore tra quelle provate. Se le prime due sono a meno di 2 punti, i dati non distinguono tra loro e la scelta va fatta con criteri esterni (supporto, comportamento delle code, semplicità).',
        ],
      },
      {
        heading: 'Assunzioni e cautele',
        bullets: [
          'Le osservazioni devono essere indipendenti e provenire dalla stessa popolazione.',
          'Le distribuzioni a supporto positivo (lognormale, esponenziale, gamma, Weibull) richiedono valori > 0; i valori nulli o negativi le escludono.',
          'Con N piccolo le stime delle code sono instabili: i percentili estremi vanno riportati con prudenza.',
          'Un buon AIC non compensa un disegno di campionamento distorto.',
        ],
      },
    ],
    limitations: [
      'Il p-value del test KS è calcolato con la formula asintotica e non corregge per i parametri stimati: è indicativo, non definitivo.',
      'Non sono inclusi modelli con dati censurati (Weibull su dati di sopravvivenza troncati).',
      `Il livello di confidenza scelto (${level}%) non si applica ai percentili stimati da una distribuzione fittata.`,
    ],
  };
};
