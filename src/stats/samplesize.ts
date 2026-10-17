import { jStat } from './jstat';
import { fSF } from './distributions';
import { logFactorial } from '../statsHelpers';
import type { TableSpec } from './types';
import type { ReportSpec } from './report';
import { alphaOf, showInt, tableById } from './reportKit';
import { fmtEst } from './format';

export type SampleSizeDesign =
  | 'twoMeans'
  | 'oneMean'
  | 'paired'
  | 'twoProportions'
  | 'correlation'
  | 'anova';

export interface SampleSizeOptions {
  design: SampleSizeDesign;
  alpha: number;
  power: number;
  tails: 1 | 2;
  /** Difference to detect (means / paired differences). */
  delta?: number;
  /** Standard deviation (or SD of the differences for paired designs). */
  sd?: number;
  p1?: number;
  p2?: number;
  r?: number;
  groups?: number;
  f?: number;
  /** Optional precision request: half-width of the confidence interval. */
  margin?: number;
}

export interface SampleSizeResult {
  design: SampleSizeDesign;
  nPerGroup: number;
  total: number;
  achievedPower: number;
  critical: number;
  effectSize: number;
  method: string;
}

const zAlpha = (alpha: number, tails: 1 | 2): number =>
  jStat.normal.inv(1 - alpha / (tails === 2 ? 2 : 1), 0, 1);

const zPower = (power: number): number => jStat.normal.inv(power, 0, 1);

const normalPower = (ncp: number, critical: number): number =>
  1 - jStat.normal.cdf(critical - ncp, 0, 1);

/** Two independent means (or two groups), iterative t correction. */
export const sampleSizeTwoMeans = (
  delta: number,
  sd: number,
  alpha = 0.05,
  power = 0.8,
  tails: 1 | 2 = 2
): SampleSizeResult => {
  const effectSize = sd > 0 ? Math.abs(delta) / sd : NaN;
  const zA = zAlpha(alpha, tails);
  const zB = zPower(power);
  if (!isFinite(effectSize) || effectSize <= 0) {
    return { design: 'twoMeans', nPerGroup: NaN, total: NaN, achievedPower: NaN, critical: NaN, effectSize, method: '' };
  }

  let n = Math.max(2, Math.ceil(2 * Math.pow((zA + zB) / effectSize, 2)));
  for (let iteration = 0; iteration < 50; iteration++) {
    const df = 2 * n - 2;
    const tA = jStat.studentt.inv(1 - alpha / (tails === 2 ? 2 : 1), df);
    const next = Math.max(2, Math.ceil(2 * Math.pow((tA + zB) / effectSize, 2)));
    if (next === n) break;
    n = next;
  }

  const critical = jStat.studentt.inv(1 - alpha / (tails === 2 ? 2 : 1), 2 * n - 2);
  const achievedPower = normalPower(effectSize * Math.sqrt(n / 2), critical);

  return {
    design: 'twoMeans',
    nPerGroup: n,
    total: 2 * n,
    achievedPower,
    critical,
    effectSize,
    method: 't a due campioni, correzione iterativa dei df',
  };
};

/** One-sample mean (or paired differences). */
export const sampleSizeOneMean = (
  delta: number,
  sd: number,
  alpha = 0.05,
  power = 0.8,
  tails: 1 | 2 = 2,
  design: 'oneMean' | 'paired' = 'oneMean'
): SampleSizeResult => {
  const effectSize = sd > 0 ? Math.abs(delta) / sd : NaN;
  const zA = zAlpha(alpha, tails);
  const zB = zPower(power);
  if (!isFinite(effectSize) || effectSize <= 0) {
    return { design, nPerGroup: NaN, total: NaN, achievedPower: NaN, critical: NaN, effectSize, method: '' };
  }

  let n = Math.max(2, Math.ceil(Math.pow((zA + zB) / effectSize, 2)));
  for (let iteration = 0; iteration < 50; iteration++) {
    const tA = jStat.studentt.inv(1 - alpha / (tails === 2 ? 2 : 1), n - 1);
    const next = Math.max(2, Math.ceil(Math.pow((tA + zB) / effectSize, 2)));
    if (next === n) break;
    n = next;
  }

  const critical = jStat.studentt.inv(1 - alpha / (tails === 2 ? 2 : 1), n - 1);
  const achievedPower = normalPower(effectSize * Math.sqrt(n), critical);

  return {
    design,
    nPerGroup: n,
    total: n,
    achievedPower,
    critical,
    effectSize,
    method: 't a un campione, correzione iterativa dei df',
  };
};

/** Two independent proportions, pooled variance (normal approximation). */
export const sampleSizeTwoProportions = (
  p1: number,
  p2: number,
  alpha = 0.05,
  power = 0.8,
  tails: 1 | 2 = 2
): SampleSizeResult => {
  const zA = zAlpha(alpha, tails);
  const zB = zPower(power);
  const delta = Math.abs(p1 - p2);
  const pooled = (p1 + p2) / 2;
  const effectSize = delta;
  if (delta <= 0 || pooled <= 0 || pooled >= 1) {
    return { design: 'twoProportions', nPerGroup: NaN, total: NaN, achievedPower: NaN, critical: NaN, effectSize, method: '' };
  }

  const n = Math.ceil(
    Math.pow(
      zA * Math.sqrt(2 * pooled * (1 - pooled)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)),
      2
    ) / (delta * delta)
  );

  const seNull = Math.sqrt(2 * pooled * (1 - pooled) / n);
  const seAlt = Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / n);
  const achievedPower = normalPower(delta / seAlt, (zA * seNull) / seAlt);

  return {
    design: 'twoProportions',
    nPerGroup: n,
    total: 2 * n,
    achievedPower,
    critical: zA,
    effectSize,
    method: 'proporzioni, varianza pooled (approssimazione normale)',
  };
};

/** Correlation via Fisher z. */
export const sampleSizeCorrelation = (
  r: number,
  alpha = 0.05,
  power = 0.8,
  tails: 1 | 2 = 2
): SampleSizeResult => {
  const zA = zAlpha(alpha, tails);
  const zB = zPower(power);
  const effectSize = Math.abs(r);
  if (effectSize <= 0 || effectSize >= 1) {
    return { design: 'correlation', nPerGroup: NaN, total: NaN, achievedPower: NaN, critical: NaN, effectSize, method: '' };
  }

  const zr = Math.atanh(effectSize);
  const n = Math.ceil(Math.pow((zA + zB) / zr, 2) + 3);
  const ncp = zr * Math.sqrt(n - 3);
  const achievedPower = normalPower(ncp, zA);

  return {
    design: 'correlation',
    nPerGroup: n,
    total: n,
    achievedPower,
    critical: zA,
    effectSize,
    method: 'correlazione, trasformazione z di Fisher',
  };
};

/**
 * Poisson-weighted sum over the mixture index, starting at the mode so the
 * weights do not underflow for large noncentrality parameters.
 */
const poissonMixture = (lambda: number, term: (j: number) => number): number => {
  if (lambda === 0) return term(0);
  const half = lambda / 2;
  const mode = Math.floor(half);
  const maxJ = Math.max(mode + Math.ceil(10 * Math.sqrt(half + 1)) + 60, 100);
  const weight = Math.exp(-half + mode * Math.log(half) - logFactorial(mode));
  let total = 0;

  let current = weight;
  for (let j = mode; j >= 0; j--) {
    total += current * term(j);
    if (j === 0) break;
    current = current * (j / half);
  }

  current = (weight * half) / (mode + 1);
  for (let j = mode + 1; j <= maxJ && current > 0; j++) {
    total += current * term(j);
    current = (current * half) / (j + 1);
  }

  return Math.max(0, Math.min(1, total));
};

/**
 * Survival function of the noncentral F.
 *
 * The noncentral chi-square is χ²(df1 + 2J) with J ~ Poisson(lambda / 2); the
 * numerator keeps df1 in its scaling, so each term is a central F tail with
 * df1 + 2J and the critical value rescaled by df1 / (df1 + 2J).
 */
export const noncentralFSF = (x: number, df1: number, df2: number, lambda: number): number => {
  if (!isFinite(x) || df1 <= 0 || df2 <= 0 || lambda < 0) return NaN;
  return poissonMixture(lambda, j => {
    const numeratorDf = df1 + 2 * j;
    return fSF((x * df1) / numeratorDf, numeratorDf, df2);
  });
};

/** One-way ANOVA, k groups, Cohen's f. N is solved by increasing total N. */
export const sampleSizeAnova = (
  groups: number,
  f: number,
  alpha = 0.05,
  power = 0.8
): SampleSizeResult => {
  const k = Math.max(2, Math.round(groups));
  const df1 = k - 1;
  const effectSize = Math.abs(f);
  if (!isFinite(effectSize) || effectSize <= 0) {
    return { design: 'anova', nPerGroup: NaN, total: NaN, achievedPower: NaN, critical: NaN, effectSize, method: '' };
  }

  let total = k * 2;
  let achieved = 0;
  const maxTotal = 200000;

  while (total < maxTotal) {
    const df2 = total - k;
    const critical = jStat.centralF.inv(1 - alpha, df1, df2);
    achieved = noncentralFSF(critical, df1, df2, total * effectSize * effectSize);
    if (achieved >= power) break;
    total += 1;
  }

  const nPerGroup = Math.ceil(total / k);
  const finalTotal = nPerGroup * k;
  const finalDf2 = finalTotal - k;
  const finalCritical = jStat.centralF.inv(1 - alpha, df1, finalDf2);
  return {
    design: 'anova',
    nPerGroup,
    total: finalTotal,
    achievedPower: noncentralFSF(finalCritical, df1, finalDf2, finalTotal * effectSize * effectSize),
    critical: finalCritical,
    effectSize,
    method: 'ANOVA a una via, F non centrale esatta',
  };
};

/** Sample size for a target confidence-interval half-width. */
export const sampleSizePrecision = (
  sd: number,
  margin: number,
  level = 95,
  groups = 1
): number => {
  if (!(sd > 0) || !(margin > 0)) return NaN;
  const z = zAlpha(alphaOf(level), 2);
  return Math.max(2, Math.ceil(groups * Math.pow((z * sd) / margin, 2)));
};

const powerAt = (options: SampleSizeOptions, nPerGroup: number): number => {
  const alpha = options.alpha;
  switch (options.design) {
    case 'twoMeans': {
      const es = Math.abs(options.delta ?? 0) / (options.sd ?? 0);
      const df = 2 * nPerGroup - 2;
      return normalPower(es * Math.sqrt(nPerGroup / 2), jStat.studentt.inv(1 - alpha / 2, df));
    }
    case 'oneMean':
    case 'paired': {
      const es = Math.abs(options.delta ?? 0) / (options.sd ?? 0);
      return normalPower(es * Math.sqrt(nPerGroup), jStat.studentt.inv(1 - alpha / 2, nPerGroup - 1));
    }
    case 'twoProportions': {
      const p1 = options.p1 ?? 0;
      const p2 = options.p2 ?? 0;
      const delta = Math.abs(p1 - p2);
      const pooled = (p1 + p2) / 2;
      const seNull = Math.sqrt((2 * pooled * (1 - pooled)) / nPerGroup);
      const seAlt = Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / nPerGroup);
      return normalPower(delta / seAlt, (zAlpha(alpha, 2) * seNull) / seAlt);
    }
    case 'correlation': {
      const zr = Math.atanh(Math.abs(options.r ?? 0));
      return normalPower(zr * Math.sqrt(Math.max(1, nPerGroup - 3)), zAlpha(alpha, 2));
    }
    case 'anova': {
      const k = Math.max(2, Math.round(options.groups ?? 3));
      const df1 = k - 1;
      const total = nPerGroup * k;
      const df2 = total - k;
      const critical = jStat.centralF.inv(1 - alpha, df1, df2);
      return noncentralFSF(critical, df1, df2, total * Math.pow(options.f ?? 0, 2));
    }
    default:
      return NaN;
  }
};

/** Main entry point used by the planner tab: validates, solves and tabulates. */
export const sampleSizeTables = (options: SampleSizeOptions): { tables: TableSpec[]; result: SampleSizeResult } => {
  let result: SampleSizeResult;

  switch (options.design) {
    case 'twoMeans':
      result = sampleSizeTwoMeans(options.delta ?? 0, options.sd ?? 0, options.alpha, options.power, options.tails);
      break;
    case 'oneMean':
    case 'paired':
      result = sampleSizeOneMean(
        options.delta ?? 0,
        options.sd ?? 0,
        options.alpha,
        options.power,
        options.tails,
        options.design
      );
      break;
    case 'twoProportions':
      result = sampleSizeTwoProportions(options.p1 ?? 0, options.p2 ?? 0, options.alpha, options.power, options.tails);
      break;
    case 'correlation':
      result = sampleSizeCorrelation(options.r ?? 0, options.alpha, options.power, options.tails);
      break;
    case 'anova':
      result = sampleSizeAnova(options.groups ?? 3, options.f ?? 0.25, options.alpha, options.power);
      break;
    default:
      result = sampleSizeTwoMeans(0, 0);
  }

  if (!Number.isFinite(result.nPerGroup)) return { tables: [], result };

  const precision = options.margin && options.margin > 0 && options.sd
    ? sampleSizePrecision(options.sd, options.margin, 100 * (1 - options.alpha), options.design === 'twoMeans' ? 2 : 1)
    : NaN;

  const steps = Math.min(30, Math.max(8, Math.ceil(result.nPerGroup / 2)));
  const perStep = Math.max(1, Math.ceil((result.nPerGroup * 1.5) / steps));
  const curve: { n: number; power: number }[] = [];
  for (let n = Math.max(2, perStep); n <= result.nPerGroup * 2; n += perStep) {
    curve.push({ n, power: powerAt(options, n) });
  }
  if (curve.length > 0 && curve[curve.length - 1].n < result.nPerGroup) {
    curve.push({ n: result.nPerGroup, power: powerAt(options, result.nPerGroup) });
  }

  const designLabel: Record<SampleSizeDesign, string> = {
    twoMeans: 'Due medie indipendenti',
    oneMean: 'Una media',
    paired: 'Due medie appaiate',
    twoProportions: 'Due proporzioni',
    correlation: 'Correlazione',
    anova: 'ANOVA a una via',
  };

  const inputRows = [
    { parameter: 'Disegno', value: designLabel[options.design] },
    { parameter: 'α', value: options.alpha.toFixed(3) },
    { parameter: 'Potenza target', value: `${fmtEst(options.power * 100, 1)}%` },
    { parameter: 'Code', value: options.tails === 2 ? 'due' : 'una' },
  ];
  if (options.design === 'twoMeans' || options.design === 'oneMean' || options.design === 'paired') {
    inputRows.push({ parameter: 'Differenza da rilevare', value: fmtEst(options.delta ?? NaN, 4) });
    inputRows.push({ parameter: 'SD (dei differenziali se appaiato)', value: fmtEst(options.sd ?? NaN, 4) });
  }
  if (options.design === 'twoProportions') {
    inputRows.push({ parameter: 'Proporzione gruppo 1', value: fmtEst(options.p1 ?? NaN, 4) });
    inputRows.push({ parameter: 'Proporzione gruppo 2', value: fmtEst(options.p2 ?? NaN, 4) });
  }
  if (options.design === 'correlation') {
    inputRows.push({ parameter: 'r da rilevare', value: fmtEst(options.r ?? NaN, 4) });
  }
  if (options.design === 'anova') {
    inputRows.push({ parameter: 'Numero di gruppi', value: showInt(options.groups ?? NaN) });
    inputRows.push({ parameter: "Cohen's f", value: fmtEst(options.f ?? NaN, 4) });
  }

  const tables: TableSpec[] = [];

  tables.push({
    id: 'ss-input',
    title: 'Parametri del piano',
    columns: [
      { key: 'parameter', label: 'Parametro', format: 'text' },
      { key: 'value', label: 'Valore', format: 'text' },
    ],
    rows: inputRows,
  });

  tables.push({
    id: 'ss-result',
    title: 'Numerosità richiesta',
    subtitle: result.method,
    columns: [
      { key: 'metric', label: 'Voce', format: 'text' },
      { key: 'value', label: 'Valore', format: 'text' },
    ],
    rows: [
      { metric: 'n per gruppo', value: showInt(result.nPerGroup) },
      { metric: 'N totale', value: showInt(result.total) },
      { metric: 'Effect size', value: fmtEst(result.effectSize, 4) },
      { metric: 'Potenza raggiunta', value: `${fmtEst(result.achievedPower * 100, 1)}%` },
      ...(Number.isFinite(precision)
        ? [{ metric: 'n per un margine di errore richiesto', value: showInt(precision) }]
        : []),
    ],
    notes: [
      'Il calcolo è iterativo: la numerosità viene aumentata finché la potenza raggiunge quella richiesta.',
      'La potenza riportata è quella approssimata del disegno, non il target: arrotondando a n intero può superarlo di poco.',
    ],
  });

  tables.push({
    id: 'ss-curve',
    title: 'Potenza al variare di n',
    subtitle: 'per gruppo',
    columns: [
      { key: 'n', label: 'n', format: 'int' },
      { key: 'power', label: 'Potenza', format: 'pct' },
    ],
    rows: curve.map(point => ({ n: point.n, power: Number((point.power * 100).toFixed(1)) })),
    notes: ['La curva si appiattisce: oltre il punto calcolato ogni osservazione in più compra sempre meno potenza.'],
  });

  return { tables, result };
};

/** Plain-language reading of the planning table. */
export const sampleSizeReport = (tables: TableSpec[], level: number): ReportSpec => {
  const resultRows = tableById(tables, 'ss-result')?.rows ?? [];
  const nRow = resultRows.find(row => String(row.metric) === 'n per gruppo');
  const totalRow = resultRows.find(row => String(row.metric) === 'N totale');
  const powerRow = resultRows.find(row => String(row.metric).startsWith('Potenza raggiunta'));
  const esRow = resultRows.find(row => String(row.metric) === 'Effect size');
  const inputRows = tableById(tables, 'ss-input')?.rows ?? [];
  const design = String(inputRows[0]?.value ?? '');
  const alpha = String(inputRows.find(row => String(row.parameter) === 'α')?.value ?? '');
  const power = String(inputRows.find(row => String(row.parameter) === 'Potenza target')?.value ?? '');

  const n = String(nRow?.value ?? '—');
  const total = String(totalRow?.value ?? '—');
  const achieved = String(powerRow?.value ?? '—');

  return {
    id: 'samplesize',
    title: 'Report di lettura',
    headline: `Piano ${design.toLowerCase()}: servono ${n} osservazioni per gruppo (N = ${total}) per una potenza dell’${power}.`,
    badge: 'Piano di campionamento',
    tone: 'neutral',
    intro: [
      'Questo foglio non analizza dati: calcola quante osservazioni servono perché un test abbia una buona probabilità di trovare l’effetto che ti interessa.',
      `La potenza è la probabilità di rifiutare l’ipotesi nulla quando è falsa. Hai chiesto ${power}; con ${n} osservazioni per gruppo il calcolo ne garantisce ${achieved}. L’α scelto è ${alpha}: la probabilità di un falso positivo.`,
    ],
    sections: [
      {
        heading: 'Come si legge il risultato',
        bullets: [
          `n per gruppo = ${n}: è il numero minimo di osservazioni valide in ciascun gruppo, non il numero di righe da inserire (le mancanti vanno sostituite).`,
          `N totale = ${total}: include tutti i gruppi del disegno.`,
          `Effect size = ${String(esRow?.value ?? '—')}: è la differenza espressa in unità di variabilità (o la dimensione dell’effetto del disegno). Più è piccolo, più osservazioni servono.`,
          'La curva di potenza mostra quanto si guadagna aumentando n: se il punto richiesto è già sulla parte piatta, aumentare il campione serve a poco.',
        ],
      },
      {
        heading: 'Da dove viene il numero',
        body: [
          'La numerosità si ottiene imponendo che, sotto l’ipotesi alternativa, la statistica superi il valore critico con probabilità pari alla potenza scelta. Per i test t il calcolo viene iterato perché il valore critico dipende dai gradi di libertà, che dipendono da n.',
          'La formula assume un effetto noto e una variabilità nota: se l’effect size viene da uno studio pilota, la numerosità è esso stesso una stima e va trattata con margine.',
        ],
      },
      {
        heading: 'Cosa controllare prima di usarlo',
        bullets: [
          'Il disegno deve essere quello giusto: due gruppi indipendenti, appaiati o una sola media non sono intercambiabili.',
          'Se prevedi abbandoni, aumenta n dividendo per (1 − tasso di abbandono).',
          'Con più confronti o più esiti la potenza per singolo test non basta: correggi α o pianifica l’esito primario.',
          'Per differenze molto piccole la numerosità esplode: valuta se l’effetto è clinicamente rilevante prima di inseguirlo.',
        ],
      },
    ],
    limitations: [
      'Le formule per i test t usano l’approssimazione normale per la potenza: il valore è accurato entro circa un’unità rispetto al calcolo esatto non centrale.',
      'Per l’ANOVA la potenza usa la F non centrale esatta: il numero può differire di un’unità da software che arrotondano diversamente le iterazioni.',
    ],
  };
};
