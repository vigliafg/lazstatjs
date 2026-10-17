import { jStat } from './jstat';
import type { TableSpec } from './types';
import type { ReportSpec } from './report';
import { fmtEst, fmtP } from './format';
import { zCrit } from './distributions';
import { isDecided, tableById } from './reportKit';

/**
 * Binary logistic regression fitted by iteratively reweighted least squares.
 * Reports odds ratios with Wald confidence intervals, the likelihood-ratio
 * test against the null model, and the usual classification statistics.
 */

export interface LogisticPredictor {
  name: string;
  values: number[];
}

export interface LogisticModel {
  names: string[];
  beta: number[];
  se: number[];
  n: number;
  events: number;
  logLik: number;
  logLikNull: number;
  lr: number;
  df: number;
  p: number;
  mcfadden: number;
  coxSnell: number;
  nagelkerke: number;
  aic: number;
  bic: number;
  fitted: number[];
  auc: number;
  accuracy: number;
  sensitivity: number;
  specificity: number;
  separation: boolean;
}

const EPS = 1e-10;

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value));

const invert = (matrix: number[][]): number[][] | null => {
  const size = matrix.length;
  const work = matrix.map((row, index) => [
    ...row,
    ...Array.from({ length: size }, (_, j) => (j === index ? 1 : 0)),
  ]);

  for (let column = 0; column < size; column++) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(work[row][column]) > Math.abs(work[pivotRow][column])) pivotRow = row;
    }
    if (Math.abs(work[pivotRow][column]) < 1e-12) return null;
    [work[column], work[pivotRow]] = [work[pivotRow], work[column]];

    const pivot = work[column][column];
    for (let j = 0; j < 2 * size; j++) work[column][j] /= pivot;

    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = work[row][column];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * size; j++) work[row][j] -= factor * work[column][j];
    }
  }

  return work.map(row => row.slice(size));
};

const devianceOf = (beta: number[], X: number[][], y: number[]): number => {
  let deviance = 0;
  for (let i = 0; i < y.length; i++) {
    const eta = X[i].reduce((sum, value, j) => sum + value * beta[j], 0);
    const p = Math.min(1 - 1e-12, Math.max(1e-12, sigmoid(eta)));
    deviance -= 2 * (y[i] === 1 ? Math.log(p) : Math.log(1 - p));
  }
  return deviance;
};

export const fitLogistic = (
  y: number[],
  predictors: LogisticPredictor[],
  level = 95,
  cutoff = 0.5
): LogisticModel | null => {
  const n = y.length;
  if (n < 3 || predictors.length === 0) return null;
  if (predictors.some(predictor => predictor.values.length !== n)) return null;

  const events = y.filter(value => value === 1).length;
  const nonEvents = n - events;
  if (events === 0 || nonEvents === 0) return null;

  const X = y.map((_, i) => [1, ...predictors.map(predictor => predictor.values[i])]);
  const k = X[0].length;
  if (n <= k) return null;

  let beta = new Array<number>(k).fill(0);
  beta[0] = Math.log(events / nonEvents);
  let deviance = devianceOf(beta, X, y);

  for (let iteration = 0; iteration < 100; iteration++) {
    const xtwx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    const xtwz = new Array<number>(k).fill(0);

    for (let i = 0; i < n; i++) {
      const eta = X[i].reduce((sum, value, j) => sum + value * beta[j], 0);
      const p = sigmoid(eta);
      const weight = Math.max(EPS, p * (1 - p));
      const z = eta + (y[i] - p) / weight;
      for (let j = 0; j < k; j++) {
        xtwz[j] += X[i][j] * weight * z;
        for (let l = 0; l <= j; l++) xtwx[j][l] += X[i][j] * weight * X[i][l];
      }
    }
    for (let j = 0; j < k; j++) {
      for (let l = 0; l < j; l++) xtwx[l][j] = xtwx[j][l];
    }

    const inverse = invert(xtwx);
    if (!inverse) return null;

    const candidate = Array.from({ length: k }, (_, j) =>
      xtwz.reduce((sum, value, l) => sum + inverse[j][l] * value, 0)
    );

    // Step halving keeps the deviance monotone, which matters near separation.
    let step = 1;
    let next = candidate;
    let nextDeviance = devianceOf(next, X, y);
    while (nextDeviance > deviance + 1e-12 && step > 1e-6) {
      step /= 2;
      next = beta.map((value, j) => value + step * (candidate[j] - value));
      nextDeviance = devianceOf(next, X, y);
    }

    const change = Math.abs(deviance - nextDeviance);
    beta = next;
    deviance = nextDeviance;
    if (change < 1e-10) break;
  }

  const fitted = X.map(row => sigmoid(row.reduce((sum, value, j) => sum + value * beta[j], 0)));
  const logLik = fitted.reduce(
    (sum, p, i) => sum + (y[i] === 1 ? Math.log(Math.max(EPS, p)) : Math.log(Math.max(EPS, 1 - p))),
    0
  );
  const nullP = events / n;
  const logLikNull = events * Math.log(nullP) + nonEvents * Math.log(1 - nullP);

  // Standard errors from the inverse of the information matrix at convergence.
  const xtwx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  X.forEach((row, i) => {
    const weight = Math.max(EPS, fitted[i] * (1 - fitted[i]));
    for (let j = 0; j < k; j++) {
      for (let l = 0; l <= j; l++) xtwx[j][l] += row[j] * weight * row[l];
    }
  });
  for (let j = 0; j < k; j++) {
    for (let l = 0; l < j; l++) xtwx[l][j] = xtwx[j][l];
  }
  const covariance = invert(xtwx);
  if (!covariance) return null;
  const se = Array.from({ length: k }, (_, j) => Math.sqrt(Math.max(0, covariance[j][j])));

  const lr = 2 * (logLik - logLikNull);
  const df = k - 1;
  const p = 1 - jStat.chisquare.cdf(Math.max(0, lr), df);

  const positives = y
    .map((value, index) => ({ value, fitted: fitted[index] }))
    .filter(item => item.value === 1)
    .map(item => item.fitted);
  const negatives = y
    .map((value, index) => ({ value, fitted: fitted[index] }))
    .filter(item => item.value === 0)
    .map(item => item.fitted);
  let aucPairs = 0;
  positives.forEach(pos => {
    negatives.forEach(neg => {
      aucPairs += pos > neg ? 1 : pos === neg ? 0.5 : 0;
    });
  });
  const auc = positives.length > 0 && negatives.length > 0 ? aucPairs / (positives.length * negatives.length) : NaN;

  let truePositive = 0;
  let trueNegative = 0;
  y.forEach((value, index) => {
    const predicted = fitted[index] >= cutoff ? 1 : 0;
    if (value === 1 && predicted === 1) truePositive += 1;
    if (value === 0 && predicted === 0) trueNegative += 1;
  });

  const mcfadden = 1 - logLik / logLikNull;
  const coxSnell = 1 - Math.exp((2 / n) * (logLikNull - logLik));
  const nagelkerke = coxSnell / (1 - Math.exp((2 / n) * logLikNull));

  return {
    names: ['(Intercept)', ...predictors.map(predictor => predictor.name)],
    beta,
    se,
    n,
    events,
    logLik,
    logLikNull,
    lr,
    df,
    p,
    mcfadden,
    coxSnell,
    nagelkerke,
    aic: 2 * k - 2 * logLik,
    bic: k * Math.log(n) - 2 * logLik,
    fitted,
    auc,
    accuracy: (truePositive + trueNegative) / n,
    sensitivity: events > 0 ? truePositive / events : NaN,
    specificity: nonEvents > 0 ? trueNegative / nonEvents : NaN,
    separation: beta.some(value => Math.abs(value) > 20),
  };
};

export const logisticTables = (
  model: LogisticModel,
  level: number,
  cutoff: number
): TableSpec[] => {
  const critical = zCrit(level);
  const tables: TableSpec[] = [];

  tables.push({
    id: 'logit-fit',
    title: 'Modello logistico',
    subtitle: `stima di massima verosimiglianza · N = ${model.n}`,
    columns: [
      { key: 'metric', label: 'Metrica', format: 'text' },
      { key: 'value', label: 'Valore', format: 'text' },
    ],
    rows: [
      { metric: 'Osservazioni', value: String(model.n) },
      { metric: 'Eventi (Y = 1)', value: String(model.events) },
      { metric: 'Eventi per parametro', value: fmtEst(model.events / (model.names.length - 1), 1) },
      { metric: 'Log-verosimiglianza', value: fmtEst(model.logLik, 3) },
      { metric: 'Log-verosimiglianza nulla', value: fmtEst(model.logLikNull, 3) },
      { metric: 'LR χ² (vs modello nullo)', value: fmtEst(model.lr, 3) },
      { metric: 'df', value: String(model.df) },
      { metric: 'p del modello', value: fmtP(model.p) },
      { metric: 'McFadden R²', value: fmtEst(model.mcfadden, 3) },
      { metric: 'Cox–Snell R²', value: fmtEst(model.coxSnell, 3) },
      { metric: 'Nagelkerke R²', value: fmtEst(model.nagelkerke, 3) },
      { metric: 'AIC', value: fmtEst(model.aic, 2) },
      { metric: 'BIC', value: fmtEst(model.bic, 2) },
    ],
    notes: [
      'Il test LR confronta il modello con quello che contiene solo l’intercetta: p piccolo = almeno un predittore aggiunge informazione.',
      'Le pseudo-R² non hanno il significato dell’R² lineare: valori intorno a 0,2–0,4 indicano già un buon adattamento.',
    ],
  });

  tables.push({
    id: 'logit-coefficients',
    title: 'Coefficienti e odds ratio',
    subtitle: `CI ${level}%`,
    columns: [
      { key: 'predictor', label: 'Predittore', format: 'text' },
      { key: 'b', label: 'B', format: 'dec4' },
      { key: 'se', label: 'SE', format: 'dec4' },
      { key: 'z', label: 'Wald z', format: 'dec3' },
      { key: 'p', label: 'p', format: 'p' },
      { key: 'or', label: 'OR', format: 'dec3' },
      { key: 'orLo', label: 'OR CI low', format: 'dec3' },
      { key: 'orHi', label: 'OR CI high', format: 'dec3' },
    ],
    rows: model.names.map((name, index) => {
      const isIntercept = index === 0;
      return {
        predictor: name,
        b: model.beta[index],
        se: model.se[index],
        z: model.se[index] > 0 ? model.beta[index] / model.se[index] : NaN,
        p: model.se[index] > 0 ? 2 * jStat.normal.cdf(-Math.abs(model.beta[index] / model.se[index]), 0, 1) : NaN,
        or: isIntercept ? NaN : Math.exp(model.beta[index]),
        orLo: isIntercept ? NaN : Math.exp(model.beta[index] - critical * model.se[index]),
        orHi: isIntercept ? NaN : Math.exp(model.beta[index] + critical * model.se[index]),
      };
    }),
    notes: [
      'OR > 1 aumenta le probabilità dell’esito per un’unità in più del predittore; OR < 1 le riduce. OR = 1 non ha effetto.',
      'L’intervallo dell’OR è calcolato su scala logaritmica: exp(B ± z·SE). Se contiene 1, l’effetto non è significativo.',
      'Il p è di Wald (z = B/SE): con campioni piccoli o effetti forti può essere meno affidabile del test LR.',
    ],
  });

  tables.push({
    id: 'logit-classification',
    title: 'Classificazione',
    subtitle: `soglia p ≥ ${fmtEst(cutoff, 2)} → Y = 1`,
    columns: [
      { key: 'metric', label: 'Metrica', format: 'text' },
      { key: 'value', label: 'Valore', format: 'text' },
    ],
    rows: [
      { metric: 'Accuratezza', value: `${fmtEst(model.accuracy * 100, 1)}%` },
      { metric: 'Sensibilità', value: `${fmtEst(model.sensitivity * 100, 1)}%` },
      { metric: 'Specificità', value: `${fmtEst(model.specificity * 100, 1)}%` },
      { metric: 'AUC', value: fmtEst(model.auc, 3) },
    ],
    notes: [
      'L’AUC non dipende dalla soglia: 0,5 è il caso, 0,7 accettabile, 0,8 buono, 0,9 eccellente.',
      'La soglia 0,5 è arbitraria: se il costo di un falso negativo è alto, abbassala e guarda come cambiano sensibilità e specificità.',
    ],
  });

  if (model.separation) {
    tables.push({
      id: 'logit-warning',
      title: 'Attenzione: separazione',
      columns: [{ key: 'note', label: 'Diagnostica', format: 'text' }],
      rows: [{ note: 'Almeno un coefficiente è molto grande: i dati separano quasi perfettamente gli esiti e le stime/SE non sono affidabili.' }],
      notes: ['Raccogli più casi, riduci i predittori o usa una regressione penalizzata (Firth).'],
    });
  }

  return tables;
};

export const logisticReport = (tables: TableSpec[], level: number): ReportSpec => {
  const fitRows = tableById(tables, 'logit-fit')?.rows ?? [];
  const coefficientRows = tableById(tables, 'logit-coefficients')?.rows ?? [];
  const classification = tableById(tables, 'logit-classification')?.rows ?? [];
  const warning = tableById(tables, 'logit-warning');
  const modelP = Number(fitRows.find(row => String(row.metric) === 'p del modello')?.value ?? NaN);
  const pseudo = Number(fitRows.find(row => String(row.metric).startsWith('McFadden'))?.value ?? NaN);
  const auc = Number(classification.find(row => String(row.metric) === 'AUC')?.value ?? NaN);
  const accuracy = String(classification.find(row => String(row.metric) === 'Accuratezza')?.value ?? '');
  const predictors = coefficientRows.filter(row => String(row.predictor) !== '(Intercept)');
  const significant = predictors.filter(row => isDecided(Number(row.p), level));

  const describeOr = (row: (typeof predictors)[number]): string => {
    const or = Number(row.or);
    const direction = or > 1 ? 'aumenta' : 'riduce';
    return `${String(row.predictor)}: OR = ${fmtEst(or, 3)} (CI ${String(row.orLo)} – ${String(row.orHi)}), p = ${fmtP(Number(row.p))}: un’unità in più ${direction} le probabilità dell’esito di circa ${fmtEst(Math.abs(or - 1) * 100, 0)}%.`;
  };

  return {
    id: 'logistic',
    title: 'Report di lettura',
    headline: warning
      ? 'I dati separano quasi perfettamente gli esiti: le stime non sono affidabili.'
      : Number.isFinite(modelP) && modelP < 1 - level / 100
        ? `Il modello è significativo (LR p = ${fmtP(modelP)}) e ${significant.length === 1 ? '1 predittore pesa' : `${significant.length} predittori pesano`} sul risultato.`
        : `Il modello non è significativo (LR p = ${fmtP(modelP)}).`,
    badge: warning ? 'Separazione' : significant.length > 0 ? 'Modello informativo' : 'Modello debole',
    tone: warning ? 'caution' : significant.length > 0 ? 'positive' : 'neutral',
    intro: [
      'La regressione logistica modella la probabilità di un esito binario (sì/no) in funzione di uno o più predittori, invece di modellare direttamente il valore medio come fa la regressione lineare.',
      'L’ipotesi nulla del test LR è “nessun predittore aggiunge informazione rispetto alla sola intercetta”; ogni coefficiente risponde invece alla domanda “questo predittore pesa, al netto degli altri?”.',
    ],
    sections: [
      {
        heading: 'La lettura dei risultati',
        body: [
          `Il modello contiene ${predictors.length} predittore/i su ${fitRows.find(row => String(row.metric) === 'Osservazioni')?.value ?? '—'} osservazioni e ${fitRows.find(row => String(row.metric).startsWith('Eventi (Y = 1)'))?.value ?? '—'} eventi.`,
          `Il test LR vale ${fitRows.find(row => String(row.metric).startsWith('LR'))?.value ?? '—'} con ${fitRows.find(row => String(row.metric) === 'df')?.value ?? '—'} gradi di libertà: ${Number.isFinite(modelP) ? modelP < 1 - level / 100 ? 'rifiuta l’ipotesi che nessun predittore conti.' : 'non rifiuta l’ipotesi che nessun predittore conti.' : 'non calcolabile.'}`,
          ...predictors.map(item => describeOr(item)),
        ],
      },
      {
        heading: 'Come leggere gli odds ratio',
        body: [
          'L’odds ratio non è un rischio relativo: OR = 2 significa che gli odds raddoppiano, non che la probabilità raddoppia. Con esiti frequenti la differenza tra le due letture è grande, con esiti rari è piccola.',
          `Gli OR sono stimati al netto degli altri predittori e con un CI al ${level}%: un intervallo che contiene 1 corrisponde a un effetto non significativo.`,
        ],
      },
      {
        heading: 'Quanto discrimina il modello',
        body: [
          `AUC = ${fmtEst(auc, 3)}: probabilità che un caso con esito positivo riceva un punteggio più alto di un caso negativo. Accuratezza alla soglia scelta: ${accuracy}.`,
          `McFadden R² = ${fmtEst(pseudo, 3)}: valori sopra 0,2 indicano un modello con potere esplicativo reale, ma non vanno confrontati con l’R² della regressione lineare.`,
        ],
      },
      {
        heading: 'Assunzioni e cautele',
        bullets: [
          'Gli esiti devono essere indipendenti tra loro (una riga = una unità).',
          'La relazione tra predittore e logit della probabilità è lineare: con predittori continui controlla la forma o usa trasformazioni.',
          'Servono eventi sufficienti: meno di 10 eventi per parametro rende le stime instabili (regola pratica EPV).',
          'La separazione (outcome predetto perfettamente) gonfia i coefficienti e invalida i test.',
          'L’accuratezza dipende dalla soglia: riportala sempre insieme a sensibilità e specificità.',
        ],
      },
    ],
    limitations: [
      'Non sono inclusi modelli con effetti casuali, interazioni, regressione penalizzata o aggiustamento per dati sbilanciati.',
      'La bontà di adattamento è riassunta da pseudo-R² e AUC: non sostituiscono un controllo dei residui per la forma della relazione.',
    ],
  };
};

/** Probability curve for a single-predictor model (for the chart). */
export const logisticCurve = (
  model: LogisticModel,
  predictorValues: number[],
  points = 40
): { x: number; y: number }[] => {
  const min = Math.min(...predictorValues);
  const max = Math.max(...predictorValues);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [];
  const step = (max - min) / (points - 1);
  return Array.from({ length: points }, (_, index) => {
    const x = min + step * index;
    const eta = model.beta[0] + model.beta[1] * x;
    return { x, y: sigmoid(eta) * 100 };
  });
};
