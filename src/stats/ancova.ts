/**
 * One-way ANCOVA: one categorical factor plus one or more continuous
 * covariates, estimated by OLS with treatment (dummy) coding.
 *
 * Covariates are centered at their grand mean, so the intercept is the
 * adjusted mean of the reference group and the factor coefficients are
 * adjusted differences at the mean of every covariate. Each term is tested
 * with Type III sums of squares (full model vs model without the term), and
 * the homogeneity of regression slopes is checked with a factor × covariate
 * interaction block.
 */

import { jStat } from './jstat';
import type { TableSpec } from './types';
import type { ReportSpec } from './report';
import { fSF, holmAdjust, tCrit, twoSidedTP } from './distributions';
import { fmtEst, fmtP, interpretEta } from './format';
import { isDecided, show } from './reportKit';

type Matrix = number[][];

const transpose = (matrix: Matrix): Matrix =>
  matrix[0].map((_, column) => matrix.map((row) => row[column]));

const multiply = (a: Matrix, b: Matrix): Matrix =>
  a.map((row) => b[0].map((_, column) => row.reduce((sum, value, i) => sum + value * b[i][column], 0)));

const multiplyVector = (matrix: Matrix, vector: number[]): number[] =>
  matrix.map((row) => row.reduce((sum, value, i) => sum + value * vector[i], 0));

const quadratic = (matrix: Matrix, vector: number[]): number => {
  const product = multiplyVector(matrix, vector);
  return vector.reduce((sum, value, index) => sum + value * product[index], 0);
};

interface Fit {
  coef: number[];
  sse: number;
  df: number;
  mse: number;
  inverse: Matrix;
}

const fitOls = (X: Matrix, y: number[]): Fit | null => {
  const n = y.length;
  const p = X[0]?.length ?? 0;
  const df = n - p;
  if (p === 0 || df <= 0) return null;
  try {
    const xt = transpose(X);
    const xtx = multiply(xt, X);
    const inverse = jStat.inv(xtx) as Matrix;
    if (!inverse || inverse.length !== p || inverse.some((row) => row.some((value) => !Number.isFinite(value)))) {
      return null;
    }
    const xty = multiplyVector(xt, y);
    const coef = multiplyVector(inverse, xty);
    const fitted = multiplyVector(X, coef);
    const sse = y.reduce((sum, value, index) => sum + (value - fitted[index]) ** 2, 0);
    if (!Number.isFinite(sse)) return null;
    return { coef, sse, df, mse: sse / df, inverse };
  } catch {
    return null;
  }
};

const keepColumns = (X: Matrix, keep: number[]): Matrix => X.map((row) => keep.map((index) => row[index]));

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

export interface AncovaOptions {
  response: number[];
  factor: string[];
  covariates: number[][];
  responseName: string;
  factorName: string;
  covariateNames: string[];
  level: number;
  /** Declared level order (labels), reference level first. */
  levels?: string[];
}

interface AncovaCore {
  groups: string[];
  n: number;
  k: number;
  m: number;
  factorSS: number;
  factorDf: number;
  factorF: number;
  factorP: number;
  covariateSS: number[];
  covariateF: number[];
  covariateP: number[];
  sse: number;
  dfError: number;
  mse: number;
  sst: number;
  r2: number;
  adjR2: number;
  rmse: number;
  modelF: number;
  modelP: number;
  modelDf: number;
  adjustedMeans: number[];
  adjustedSe: number[];
  rawMeans: number[];
  rawSds: number[];
  groupNs: number[];
  coef: number[];
  coefSe: number[];
  coefT: number[];
  coefP: number[];
  slopesF: number;
  slopesDf1: number;
  slopesDf2: number;
  slopesP: number;
  posthoc: { a: string; b: string; difference: number; se: number; t: number; p: number; pHolm: number }[];
}

const build = (options: AncovaOptions): AncovaCore | null => {
  const { response, factor, covariates, factorName, covariateNames, level } = options;
  const m = covariates.length;
  if (m === 0 || response.length !== factor.length) return null;
  if (covariates.some((values) => values.length !== response.length)) return null;

  const observed = Array.from(new Set(factor.filter((value) => value.trim() !== '')));
  const declared = options.levels ?? [];
  const levels = [
    ...declared.filter((value) => observed.includes(value)),
    ...observed.filter((value) => !declared.includes(value)).sort(),
  ];
  const k = levels.length;
  if (k < 2) return null;

  const groups: string[] = [];
  const y: number[] = [];
  const covRows: number[][] = [];
  response.forEach((value, row) => {
    const level = factor[row]?.trim() ?? '';
    if (level === '' || !Number.isFinite(value)) return;
    const values = covariates.map((column) => column[row]);
    if (values.some((cell) => !Number.isFinite(cell))) return;
    groups.push(level);
    y.push(value);
    covRows.push(values);
  });

  const n = y.length;
  const p = 1 + (k - 1) + m;
  if (n <= p) return null;

  const covMeans = Array.from({ length: m }, (_, column) => mean(covRows.map((row) => row[column])));
  const centered = covRows.map((row) => row.map((value, column) => value - covMeans[column]));
  const dummy = groups.map((level) => {
    const index = levels.indexOf(level);
    return Array.from({ length: k - 1 }, (_, column) => (index === column + 1 ? 1 : 0));
  });
  const X: Matrix = y.map((_, row) => [1, ...dummy[row], ...centered[row]]);

  const full = fitOls(X, y);
  if (!full) return null;

  const factorKeep = [0, ...Array.from({ length: m }, (_, column) => k + column)];
  const reducedFactor = fitOls(keepColumns(X, factorKeep), y);
  if (!reducedFactor) return null;
  const factorSS = Math.max(0, reducedFactor.sse - full.sse);
  const factorDf = k - 1;
  const factorF = (factorSS / factorDf) / full.mse;
  const factorP = fSF(factorF, factorDf, full.df);

  const covariateSS: number[] = [];
  const covariateF: number[] = [];
  const covariateP: number[] = [];
  for (let column = 0; column < m; column += 1) {
    const keep = Array.from({ length: p }, (_, index) => index).filter((index) => index !== k + column);
    const reduced = fitOls(keepColumns(X, keep), y);
    if (!reduced) return null;
    const ss = Math.max(0, reduced.sse - full.sse);
    const f = ss / full.mse;
    covariateSS.push(ss);
    covariateF.push(f);
    covariateP.push(fSF(f, 1, full.df));
  }

  const yMean = mean(y);
  const sst = y.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const modelSS = Math.max(0, sst - full.sse);
  const modelDf = p - 1;
  const modelF = (modelSS / modelDf) / full.mse;
  const modelP = fSF(modelF, modelDf, full.df);
  const r2 = sst > 0 ? modelSS / sst : NaN;

  const crit = tCrit(level, full.df);
  const adjustedMeans: number[] = [];
  const adjustedSe: number[] = [];
  const rawMeans: number[] = [];
  const rawSds: number[] = [];
  const groupNs: number[] = [];
  levels.forEach((levelName, index) => {
    const values = y.filter((_, row) => groups[row] === levelName);
    groupNs.push(values.length);
    rawMeans.push(mean(values));
    rawSds.push(values.length > 1 ? jStat.stdev(values, true) : NaN);
    const contrast = new Array<number>(p).fill(0);
    contrast[0] = 1;
    if (index > 0) contrast[index] = 1;
    adjustedMeans.push(contrast.reduce((sum, value, column) => sum + value * full.coef[column], 0));
    adjustedSe.push(Math.sqrt(Math.max(0, quadratic(full.inverse, contrast) * full.mse)));
  });

  const coefSe = full.coef.map((_, index) => Math.sqrt(Math.max(0, full.inverse[index][index] * full.mse)));
  const coefT = full.coef.map((value, index) => value / coefSe[index]);
  const coefP = coefT.map((value) => twoSidedTP(value, full.df));

  // Homogeneity of regression slopes: add every factor × covariate product.
  let slopesF = NaN;
  let slopesDf1 = (k - 1) * m;
  let slopesDf2 = NaN;
  let slopesP = NaN;
  const interactions: Matrix = y.map((_, row) =>
    Array.from({ length: k - 1 }, (_, groupColumn) =>
      Array.from({ length: m }, (_, covColumn) => dummy[row][groupColumn] * centered[row][covColumn])
    ).flat()
  );
  const Xint: Matrix = X.map((row, index) => [...row, ...interactions[index]]);
  const interactionFit = fitOls(Xint, y);
  if (interactionFit && interactionFit.df > 0) {
    slopesDf1 = (k - 1) * m;
    slopesDf2 = interactionFit.df;
    const ss = Math.max(0, full.sse - interactionFit.sse);
    slopesF = (ss / slopesDf1) / interactionFit.mse;
    slopesP = fSF(slopesF, slopesDf1, slopesDf2);
  }

  const posthoc: AncovaCore['posthoc'] = [];
  const rawP: number[] = [];
  for (let a = 0; a < k; a += 1) {
    for (let b = a + 1; b < k; b += 1) {
      const contrast = new Array<number>(p).fill(0);
      if (a > 0) contrast[a] = 1;
      if (b > 0) contrast[b] = -1;
      const difference = contrast.reduce((sum, value, column) => sum + value * full.coef[column], 0);
      const se = Math.sqrt(Math.max(0, quadratic(full.inverse, contrast) * full.mse));
      const t = se > 0 ? difference / se : NaN;
      const pValue = twoSidedTP(t, full.df);
      posthoc.push({ a: levels[a], b: levels[b], difference, se, t, p: pValue, pHolm: NaN });
      rawP.push(pValue);
    }
  }
  const adjusted = holmAdjust(rawP);
  const byPair = new Map<string, number>();
  posthoc.forEach((pair, index) => byPair.set(`${pair.a}\u0000${pair.b}`, adjusted[index]));
  posthoc.forEach((pair) => {
    pair.pHolm = byPair.get(`${pair.a}\u0000${pair.b}`) ?? NaN;
  });

  return {
    groups: levels,
    n,
    k,
    m,
    factorSS,
    factorDf,
    factorF,
    factorP,
    covariateSS,
    covariateF,
    covariateP,
    sse: full.sse,
    dfError: full.df,
    mse: full.mse,
    sst,
    r2,
    adjR2: 1 - (1 - r2) * ((n - 1) / full.df),
    rmse: Math.sqrt(full.mse),
    modelF,
    modelP,
    modelDf,
    adjustedMeans,
    adjustedSe,
    rawMeans,
    rawSds,
    groupNs,
    coef: full.coef,
    coefSe,
    coefT,
    coefP,
    slopesF,
    slopesDf1,
    slopesDf2,
    slopesP,
    posthoc,
  };
};

export const ancovaTables = (options: AncovaOptions): TableSpec[] => {
  const result = build(options);
  const { level, factorName, covariateNames, responseName } = options;
  if (!result) return [];

  const crit = tCrit(level, result.dfError);
  const modelRows = [
    {
      source: factorName,
      ss: result.factorSS,
      df: result.factorDf,
      ms: result.factorSS / result.factorDf,
      f: result.factorF,
      p: result.factorP,
      etaP: result.factorSS / (result.factorSS + result.sse),
    },
    ...result.covariateSS.map((ss, index) => ({
      source: covariateNames[index],
      ss,
      df: 1,
      ms: ss,
      f: result.covariateF[index],
      p: result.covariateP[index],
      etaP: ss / (ss + result.sse),
    })),
    {
      source: 'Residuo',
      ss: result.sse,
      df: result.dfError,
      ms: result.mse,
      f: NaN,
      p: NaN,
      etaP: NaN,
    },
    {
      source: 'Totale',
      ss: result.sst,
      df: result.n - 1,
      ms: NaN,
      f: NaN,
      p: NaN,
      etaP: NaN,
    },
  ];

  const termNames = ['Intercetta', ...result.groups.slice(1), ...covariateNames];
  const coefficientRows = result.coef.map((value, index) => ({
    term: termNames[index] ?? `Termine ${index + 1}`,
    b: value,
    se: result.coefSe[index],
    t: result.coefT[index],
    p: result.coefP[index],
    ciLo: value - crit * result.coefSe[index],
    ciHi: value + crit * result.coefSe[index],
  }));

  const posthocRows = result.posthoc.map((pair) => ({
    contrast: `${pair.a} − ${pair.b}`,
    difference: pair.difference,
    se: pair.se,
    t: pair.t,
    p: pair.p,
    pHolm: pair.pHolm,
  }));

  return [
    {
      id: 'ancova-model',
      title: 'ANCOVA — effetti (SS tipo III)',
      subtitle: `${responseName} ~ ${factorName} + ${covariateNames.join(' + ')} · N = ${result.n}`,
      columns: [
        { key: 'source', label: 'Sorgente', format: 'text' },
        { key: 'ss', label: 'SS', format: 'dec3' },
        { key: 'df', label: 'df', format: 'dec1' },
        { key: 'ms', label: 'MS', format: 'dec3' },
        { key: 'f', label: 'F', format: 'dec3' },
        { key: 'p', label: 'p', format: 'p' },
        { key: 'etaP', label: 'η²p', format: 'dec3' },
      ],
      rows: modelRows,
      notes: [
        'SS tipo III: ogni termine è testato togliendolo dal modello completo (fattore e covariate insieme).',
        `Modello: F(${result.modelDf}, ${result.dfError}) = ${fmtEst(result.modelF, 3)}, p = ${fmtP(result.modelP)} · R² = ${fmtEst(result.r2, 3)}, R²adj = ${fmtEst(result.adjR2, 3)}, RMSE = ${fmtEst(result.rmse, 3)}.`,
      ],
    },
    {
      id: 'ancova-means',
      title: 'Medie aggiustate per gruppo',
      subtitle: `valutate alla media delle covariate · CI ${level}%`,
      columns: [
        { key: 'group', label: 'Gruppo', format: 'text' },
        { key: 'n', label: 'N', format: 'int' },
        { key: 'rawMean', label: 'Media grezza', format: 'dec3' },
        { key: 'adjusted', label: 'Media aggiustata', format: 'dec3' },
        { key: 'se', label: 'SE', format: 'dec3' },
        { key: 'ciLo', label: 'CI low', format: 'dec3' },
        { key: 'ciHi', label: 'CI high', format: 'dec3' },
      ],
      rows: result.groups.map((group, index) => ({
        group,
        n: result.groupNs[index],
        rawMean: result.rawMeans[index],
        adjusted: result.adjustedMeans[index],
        se: result.adjustedSe[index],
        ciLo: result.adjustedMeans[index] - crit * result.adjustedSe[index],
        ciHi: result.adjustedMeans[index] + crit * result.adjustedSe[index],
      })),
      notes: [
        'Media aggiustata = valore atteso del gruppo con tutte le covariate al loro valore medio.',
        'La differenza tra media grezza e aggiustata mostra quanto pesa lo sbilanciamento delle covariate tra i gruppi.',
      ],
    },
    {
      id: 'ancova-coefficients',
      title: 'Coefficienti del modello',
      subtitle: `codifica treatment · riferimento: ${result.groups[0]}`,
      columns: [
        { key: 'term', label: 'Termine', format: 'text' },
        { key: 'b', label: 'B', format: 'dec3' },
        { key: 'se', label: 'SE', format: 'dec3' },
        { key: 't', label: 't', format: 'dec3' },
        { key: 'p', label: 'p', format: 'p' },
        { key: 'ciLo', label: 'CI low', format: 'dec3' },
        { key: 'ciHi', label: 'CI high', format: 'dec3' },
      ],
      rows: coefficientRows,
      notes: [
        `L’intercetta è la media aggiustata del gruppo di riferimento (${result.groups[0]}).`,
        'I coefficienti dei gruppi sono differenze aggiustate rispetto al riferimento; quelli delle covariate sono pendenze comuni.',
      ],
    },
    {
      id: 'ancova-slopes',
      title: 'Omogeneità delle pendenze',
      columns: [
        { key: 'metric', label: 'Metrica', format: 'text' },
        { key: 'value', label: 'Valore', format: 'dec4' },
        { key: 'detail', label: 'Dettaglio', format: 'text' },
      ],
      rows: [
        { metric: 'F interazione', value: result.slopesF, detail: `${factorName} × covariate` },
        { metric: 'df numeratore', value: result.slopesDf1, detail: '(k−1) × numero di covariate' },
        { metric: 'df denominatore', value: result.slopesDf2, detail: 'residui del modello con interazioni' },
        { metric: 'p interazione', value: result.slopesP, detail: 'p > α: pendenze compatibili' },
      ],
      notes: [
        'Se l’interazione è significativa le pendenze differiscono tra i gruppi: l’ANCOVA classica non è appropriata.',
        'Il test confronta il modello completo con e senza tutti i prodotti gruppo × covariata.',
      ],
    },
    ...(posthocRows.length > 0
      ? [
          {
            id: 'ancova-posthoc',
            title: 'Confronti a coppie (medie aggiustate)',
            subtitle: 'correzione Holm',
            columns: [
              { key: 'contrast', label: 'Confronto', format: 'text' as const },
              { key: 'difference', label: 'Differenza', format: 'dec3' as const },
              { key: 'se', label: 'SE', format: 'dec3' as const },
              { key: 't', label: 't', format: 'dec3' as const },
              { key: 'p', label: 'p', format: 'p' as const },
              { key: 'pHolm', label: 'p Holm', format: 'p' as const },
            ],
            rows: posthocRows,
            notes: [
              'Differenza = media aggiustata del primo gruppo − media aggiustata del secondo.',
              `p non corretti da t con df = ${result.dfError}; la colonna Holm controlla il numero di confronti.`,
            ],
          },
        ]
      : []),
  ];
};

export const ancovaReport = (
  tables: TableSpec[],
  factorName: string,
  covariateNames: string[],
  level: number
): ReportSpec => {
  const model = tables.find((table) => table.id === 'ancova-model')?.rows ?? [];
  const means = tables.find((table) => table.id === 'ancova-means')?.rows ?? [];
  const slopes = tables.find((table) => table.id === 'ancova-slopes')?.rows ?? [];
  const posthoc = tables.find((table) => table.id === 'ancova-posthoc')?.rows ?? [];
  const factorRow = model[0] ?? {};
  const p = Number(factorRow.p ?? NaN);
  const f = Number(factorRow.f ?? NaN);
  const eta = Number(factorRow.etaP ?? NaN);
  const slopesP = Number(slopes.find((row) => row.metric === 'p interazione')?.value ?? NaN);
  const violated = Number.isFinite(slopesP) && slopesP < 1 - level / 100;
  const decided = isDecided(p, level);
  const significantPairs = posthoc.filter((row) => Number(row.pHolm) < 1 - level / 100);

  const biggest = means.reduce(
    (best, row, index) => {
      const value = Number(row.adjusted ?? NaN);
      if (!Number.isFinite(value)) return best;
      if (!best || Math.abs(value) > Math.abs(Number(best.value))) return { value, label: String(row.group), index };
      return best;
    },
    null as null | { value: number; label: string; index: number }
  );

  const covariateText = covariateNames.length === 1 ? covariateNames[0] : `${covariateNames.length} covariate`;
  const covariateRows = model.filter((row) => covariateNames.includes(String(row.source)));

  return {
    id: 'ancova',
    title: 'Report di lettura',
    headline: violated
      ? 'Le pendenze differiscono tra i gruppi: l’ANCOVA classica non è affidabile.'
      : decided
        ? `Il fattore ${factorName} ha un effetto dopo l’aggiustamento per ${covariateText} (F = ${show(f, 3)}, p = ${fmtP(p)}).`
        : `Nessun effetto del fattore ${factorName} dopo l’aggiustamento per ${covariateText} (F = ${show(f, 3)}, p = ${fmtP(p)}).`,
    badge: violated ? 'Pendenze non omogenee' : decided ? 'Effetto del fattore' : 'Nessun effetto',
    tone: violated ? 'caution' : decided ? 'positive' : 'neutral',
    intro: [
      'L’ANCOVA confronta le medie dei gruppi dopo aver rimosso la parte di variabilità spiegata da una o più covariate continue.',
      `Modello: ${factorName} + ${covariateNames.join(' + ')}. Le medie aggiustate sono valutate al valore medio delle covariate.`,
    ],
    sections: [
      {
        heading: 'La lettura dei risultati',
        body: [
          `Fattore ${factorName}: F(${factorRow.df ?? '—'}, ${model.find((row) => row.source === 'Residuo')?.df ?? '—'}) = ${show(f, 3)}, p = ${fmtP(p)}; η²p = ${show(eta, 3)} (${interpretEta(eta)}).`,
          biggest
            ? `La media aggiustata più alta è quella di ${biggest.label} (${show(Number(biggest.value), 3)}); la media grezza dello stesso gruppo era ${show(Number(means[biggest.index]?.rawMean ?? NaN), 3)}.`
            : 'Medie aggiustate non disponibili.',
          covariateRows.length > 0
            ? `Covariate: ${covariateRows
                .map((row) => `${row.source} (F = ${show(Number(row.f), 3)}, p = ${fmtP(Number(row.p))})`)
                .join('; ')}.`
            : 'Nessuna covariata nel modello.',
        ],
      },
      {
        heading: 'Assunzioni',
        body: [
          Number.isFinite(slopesP)
            ? `Omogeneità delle pendenze: F(${slopes.find((row) => row.metric === 'df numeratore')?.value ?? '—'}, ${slopes.find((row) => row.metric === 'df denominatore')?.value ?? '—'}) = ${show(Number(slopes.find((row) => row.metric === 'F interazione')?.value), 3)}, p = ${fmtP(slopesP)}. ${
                violated
                  ? 'L’ipotesi è violata: riporta il modello con interazione o analizza i gruppi separatamente.'
                  : 'Non ci sono prove che le pendenze differiscano tra i gruppi.'
              }`
            : 'Il test di omogeneità delle pendenze non è calcolabile (troppi pochi gradi di libertà).',
          'Restano richiesti indipendenza delle osservazioni, linearità della relazione con le covariate e normalità/omoschedasticità dei residui.',
        ],
      },
      {
        heading: 'Confronti tra gruppi',
        body: [
          posthoc.length === 0
            ? 'Nessun confronto a coppie disponibile.'
            : significantPairs.length > 0
              ? `Con correzione Holm risultano significativi: ${significantPairs
                  .map((row) => `${row.contrast} (Δ = ${show(Number(row.difference), 3)}, p = ${fmtP(Number(row.pHolm))})`)
                  .join('; ')}.`
              : 'Nessun confronto a coppie resta significativo dopo la correzione di Holm.',
          'Le differenze sono calcolate sulle medie aggiustate, non sulle medie grezze.',
        ],
      },
      {
        heading: 'Cautele',
        bullets: [
          'Le covariate devono essere misurate prima del trattamento e non essere influenzate dal fattore.',
          'Una covariata con forte errore di misura attenua l’aggiustamento e può ridurre la potenza.',
          'Le medie aggiustate dipendono dal valore medio delle covariate: con covariate molto sbilanciate l’estrapolazione può essere fragile.',
          'L’ANCOVA non crea gruppi equivalenti: rimuove solo la parte di differenza lineare associata alle covariate osservate.',
        ],
      },
    ],
    limitations: [
      'Un solo fattore categorico: per disegni fattoriali con covariate serve un modello più generale.',
      'Nessuna selezione automatica del modello: tutte le covariate scelte restano nel modello.',
      'SS tipo III con codifica treatment: con interazioni il significato dei termini cambia.',
    ],
  };
};
