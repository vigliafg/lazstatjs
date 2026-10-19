/**
 * Multivariate basics: principal component analysis (correlation or
 * covariance matrix) and Cronbach's alpha reliability.
 *
 * PCA uses the Jacobi eigensolver already used by the regression diagnostics,
 * so there is no new numerical dependency. Bartlett's test of sphericity and
 * the Kaiser–Meyer–Olkin index are reported next to the components because
 * they say whether a PCA of the correlation matrix is worth reading at all.
 */

import { jStat } from './jstat';
import type { TableSpec } from './types';
import type { ReportSpec } from './report';
import { chi2SF } from './distributions';
import { eigenSymmetric } from './linalg';
import { fmtP, interpretR } from './format';
import { isDecided, show } from './reportKit';

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

const variance = (values: number[], center: number): number =>
  values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1);

const correlation = (a: number[], b: number[]): number => {
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a, ma);
  const vb = variance(b, mb);
  if (!(va > 0) || !(vb > 0)) return NaN;
  const cov = a.reduce((sum, value, index) => sum + (value - ma) * (b[index] - mb), 0) / (a.length - 1);
  return cov / Math.sqrt(va * vb);
};

const fmtPctValue = (value: number, decimals = 1): string => `${value.toFixed(decimals)}%`;

export interface PcaResult {
  n: number;
  variables: string[];
  standardize: boolean;
  eigenvalues: number[];
  variancePct: number[];
  cumulativePct: number[];
  /** loadings[i][j] = loading of variable i on component j. */
  loadings: number[][];
  communalities: number[];
  retained: number;
  /** scores[i][j] = score of case i on component j (first two are plotted). */
  scores: number[][];
  bartlettChi2: number;
  bartlettDf: number;
  bartlettP: number;
  kmo: number;
  kmoItems: number[];
  determinant: number;
}

const completeRows = (data: number[][]): number[][] =>
  data.filter((row) => row.every((value) => Number.isFinite(value)));

export const principalComponents = (
  data: number[][],
  variables: string[],
  standardize: boolean
): PcaResult | null => {
  const rows = completeRows(data);
  const p = variables.length;
  if (p < 2 || rows.length < 3 || rows.some((row) => row.length !== p)) return null;

  const n = rows.length;
  const means = variables.map((_, column) => mean(rows.map((row) => row[column])));
  const sds = variables.map((_, column) => jStat.stdev(rows.map((row) => row[column]), true));
  if (standardize && sds.some((sd) => !(sd > 0))) return null;

  // Work on the centered (and optionally standardized) data; the matrix that
  // is decomposed is the correlation matrix when standardize is true.
  const working = rows.map((row) => row.map((value, column) => (value - means[column]) / (standardize ? sds[column] : 1)));
  const matrix = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  for (let i = 0; i < p; i += 1) {
    for (let j = i; j < p; j += 1) {
      let sum = 0;
      for (let r = 0; r < n; r += 1) sum += working[r][i] * working[r][j];
      const value = sum / (n - 1);
      matrix[i][j] = value;
      matrix[j][i] = value;
    }
  }

  const eigen = eigenSymmetric(matrix);
  const total = eigen.values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!(total > 0)) return null;
  const eigenvalues = eigen.values.map((value) => (value > 0 ? value : 0));
  const variancePct = eigenvalues.map((value) => (value / total) * 100);
  const cumulativePct: number[] = [];
  variancePct.reduce((sum, value) => {
    const next = sum + value;
    cumulativePct.push(next);
    return next;
  }, 0);

  const average = total / p;
  const retained = Math.max(
    1,
    Math.min(p, eigenvalues.filter((value) => (standardize ? value > 1 : value > average)).length)
  );
  const loadings = variables.map((_, column) =>
    eigenvalues.map((value, component) => eigen.vectors[column][component] * Math.sqrt(value))
  );
  const communalities = loadings.map((row) =>
    row.slice(0, retained).reduce((sum, value) => sum + value * value, 0)
  );
  const scores = working.map((row) =>
    eigenvalues.map((_, component) => row.reduce((sum, value, column) => sum + value * eigen.vectors[column][component], 0))
  );

  // Bartlett's test of sphericity: -[n−1−(2p+5)/6]·ln|R|.
  let determinant = 1;
  eigenvalues.forEach((value) => {
    determinant *= value;
  });
  const df = (p * (p - 1)) / 2;
  const bartlettChi2 =
    standardize && determinant > 0
      ? -(n - 1 - (2 * p + 5) / 6) * Math.log(determinant)
      : NaN;
  const bartlettP = Number.isFinite(bartlettChi2) ? chi2SF(bartlettChi2, df) : NaN;

  // KMO from the inverse correlation matrix. A singular R (or a failed
  // inversion) leaves the index undefined instead of returning garbage.
  let kmo = NaN;
  const kmoItems = variables.map(() => NaN);
  if (standardize) {
    try {
      const inverse = jStat.inv(matrix) as number[][];
      const partial = (i: number, j: number): number =>
        -inverse[i][j] / Math.sqrt(inverse[i][i] * inverse[j][j]);
      let sumR = 0;
      let sumP = 0;
      const itemR = variables.map((_, i) =>
        variables.reduce((sum, __, j) => (i === j ? sum : sum + matrix[i][j] ** 2), 0)
      );
      const itemP = variables.map((_, i) =>
        variables.reduce((sum, __, j) => (i === j ? sum : sum + partial(i, j) ** 2), 0)
      );
      for (let i = 0; i < p; i += 1) {
        for (let j = i + 1; j < p; j += 1) {
          sumR += matrix[i][j] ** 2;
          sumP += partial(i, j) ** 2;
        }
      }
      if (sumR + sumP > 0) kmo = sumR / (sumR + sumP);
      itemR.forEach((r, index) => {
        const denominator = r + itemP[index];
        if (denominator > 0) kmoItems[index] = r / denominator;
      });
    } catch {
      // leave NaN: the report states that KMO is not computable.
    }
  }

  return {
    n,
    variables,
    standardize,
    eigenvalues,
    variancePct,
    cumulativePct,
    loadings,
    communalities,
    retained,
    scores,
    bartlettChi2,
    bartlettDf: df,
    bartlettP,
    kmo,
    kmoItems,
    determinant,
  };
};

const kmoLabel = (value: number): string => {
  if (!Number.isFinite(value)) return 'non calcolabile';
  if (value >= 0.9) return 'eccellente';
  if (value >= 0.8) return 'buono';
  if (value >= 0.7) return 'discreto';
  if (value >= 0.6) return 'mediocre';
  if (value >= 0.5) return 'scarso';
  return 'inaccettabile';
};

export const pcaTables = (result: PcaResult): TableSpec[] => {
  const loadingsColumns = Array.from({ length: result.retained }, (_, index) => ({
    key: `pc${index + 1}`,
    label: `PC${index + 1}`,
    format: 'dec3' as const,
  }));
  return [
    {
      id: 'pca-eigen',
      title: 'Autovalori e varianza spiegata',
      subtitle: `${result.n} casi completi · ${result.variables.length} variabili · ${result.retained} componenti ritenuti`,
      columns: [
        { key: 'component', label: 'Componente', format: 'text' },
        { key: 'eigenvalue', label: 'Autovalore', format: 'dec3' },
        { key: 'variance', label: '% varianza', format: 'dec1' },
        { key: 'cumulative', label: '% cumulata', format: 'dec1' },
        { key: 'retained', label: 'Ritenuto', format: 'text' },
      ],
      rows: result.eigenvalues.map((value, index) => ({
        component: `PC${index + 1}`,
        eigenvalue: value,
        variance: result.variancePct[index],
        cumulative: result.cumulativePct[index],
        retained: index < result.retained ? 'sì' : 'no',
      })),
      notes: [
        result.standardize
          ? 'Criterio di Kaiser: si ritengono i componenti con autovalore > 1 (matrice di correlazione).'
          : 'Criterio della media: si ritengono i componenti con autovalore > media degli autovalori (matrice di covarianza).',
      ],
    },
    {
      id: 'pca-loadings',
      title: 'Saturazioni e comunalità',
      subtitle: result.standardize ? 'PCA su matrice di correlazione' : 'PCA su matrice di covarianza',
      columns: [
        { key: 'variable', label: 'Variabile', format: 'text' },
        ...loadingsColumns,
        { key: 'communality', label: 'Comunalità', format: 'dec3' },
        { key: 'kmo', label: 'KMO item', format: 'dec3' },
      ],
      rows: result.variables.map((variable, index) => ({
        variable,
        ...Object.fromEntries(
          loadingsColumns.map((column, component) => [column.key, result.loadings[index][component]])
        ),
        communality: result.communalities[index],
        kmo: result.kmoItems[index],
      })),
      notes: [
        'Saturazione = autovettore × √autovalore. La comunalità è la quota di varianza spiegata dai componenti ritenuti.',
        'Con |saturazione| ≥ 0.40 la variabile è di solito considerata associata al componente.',
      ],
    },
    {
      id: 'pca-adequacy',
      title: 'Adeguatezza del campione',
      columns: [
        { key: 'metric', label: 'Metrica', format: 'text' },
        { key: 'value', label: 'Valore', format: 'dec4' },
        { key: 'detail', label: 'Dettaglio', format: 'text' },
      ],
      rows: [
        { metric: 'KMO', value: result.kmo, detail: kmoLabel(result.kmo) },
        { metric: 'Bartlett χ²', value: result.bartlettChi2, detail: result.standardize ? `df = ${result.bartlettDf}` : 'solo con matrice di correlazione' },
        { metric: 'Bartlett p', value: result.bartlettP, detail: Number.isFinite(result.bartlettP) ? (result.bartlettP < 0.05 ? 'struttura non sferica' : 'nessuna struttura lineare rilevata') : 'non calcolabile' },
        { metric: 'Determinante R', value: result.determinant, detail: 'valori prossimi a 0 indicano collinearità' },
        { metric: 'N casi', value: result.n, detail: 'casi completi sulle variabili selezionate' },
      ],
      notes: [
        'KMO ≥ 0.70 è in genere considerato adeguato per la PCA.',
        'Bartlett significativo indica che la matrice di correlazione non è un’identità: è una condizione necessaria, non sufficiente.',
      ],
    },
  ];
};

export const pcaReport = (tables: TableSpec[], result: PcaResult, level: number): ReportSpec => {
  const eigen = tables.find((table) => table.id === 'pca-eigen')?.rows ?? [];
  const loadings = tables.find((table) => table.id === 'pca-loadings')?.rows ?? [];
  const adequacy = tables.find((table) => table.id === 'pca-adequacy')?.rows ?? [];
  const explained = result.cumulativePct[result.retained - 1] ?? NaN;
  const bartlettP = result.bartlettP;
  const kmoOk = Number.isFinite(result.kmo) && result.kmo >= 0.7;
  const bartlettOk = isDecided(bartlettP, level);

  const strongest = result.variables
    .map((variable, index) => {
      let best = 0;
      for (let component = 1; component < result.retained; component += 1) {
        if (Math.abs(result.loadings[index][component]) > Math.abs(result.loadings[index][best])) best = component;
      }
      return { variable, component: best, loading: result.loadings[index][best] };
    })
    .sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading))
    .slice(0, 5);

  const leading = strongest
    .filter((item) => Math.abs(item.loading) >= 0.4)
    .map((item) => `${item.variable} (PC${item.component + 1}: ${show(item.loading, 3)})`);

  return {
    id: 'pca',
    title: 'Report di lettura',
    headline: `I ${result.retained} componenti ritenuti spiegano il ${fmtPctValue(explained)} della varianza totale.`,
    badge: kmoOk ? 'Struttura leggibile' : 'Campione debole',
    tone: kmoOk ? 'positive' : 'caution',
    intro: [
      'La PCA riduce un insieme di variabili correlate a pochi componenti non correlati, ordinati per varianza spiegata.',
      `Analisi su ${result.variables.length} variabili e ${result.n} casi completi${result.standardize ? ', matrice di correlazione (variabili standardizzate)' : ', matrice di covarianza (unità originali)'}.`,
    ],
    sections: [
      {
        heading: 'La lettura dei risultati',
        body: [
          `Il primo componente spiega il ${fmtPctValue(result.variancePct[0])}; i primi ${result.retained} arrivano al ${fmtPctValue(explained)}.`,
          leading.length > 0
            ? `Le saturazioni più alte sono: ${leading.join(', ')}.`
            : 'Nessuna variabile raggiunge |saturazione| ≥ 0.40 sui componenti ritenuti: la struttura è debole o il numero di componenti è insufficiente.',
          `Comunalità medie: ${show(mean(result.communalities), 3)} (quota di varianza di ogni variabile ripresa dai componenti ritenuti).`,
        ],
      },
      {
        heading: 'Adeguatezza del campione',
        body: [
          `KMO = ${show(result.kmo, 3)} (${kmoLabel(result.kmo)}): ${
            kmoOk
              ? 'la matrice è adatta alla riduzione dimensionale.'
              : 'la correlazione parziale è alta rispetto a quella semplice: i componenti possono essere instabili.'
          }`,
          `Bartlett χ²(${result.bartlettDf}) = ${show(result.bartlettChi2, 3)}, p = ${fmtP(bartlettP)}: ${
            bartlettOk
              ? 'la matrice di correlazione non è sferica, quindi esiste struttura da estrarre.'
              : 'non si rifiuta la sfericità: la PCA potrebbe non aggiungere molto rispetto alle variabili originali.'
          }`,
        ],
      },
      {
        heading: 'Assunzioni e cautele',
        bullets: [
          'La PCA descrive la varianza, non un modello causale: i componenti sono combinazioni lineari, non variabili latenti validate.',
          'Non è applicata alcuna rotazione: i componenti sono quelli della soluzione ortogonale iniziale.',
          'Campioni piccoli e outlier possono cambiare le saturazioni; controlla il rapporto casi/variabili (almeno 5–10 casi per variabile).',
          'Variabili su scale molto diverse richiedono la matrice di correlazione; con unità omogenee la covarianza conserva le differenze di scala.',
        ],
      },
    ],
    limitations: [
      'La PCA non gestisce valori mancanti: i casi incompleti sono esclusi.',
      'KMO e Bartlett richiedono la matrice di correlazione; con la covarianza non sono riportati.',
      'Saturazioni e punteggi sono calcolati sui dati osservati: non c’è inferenza né intervallo di confidenza.',
    ],
  };
};

export interface AlphaItemStat {
  item: string;
  mean: number;
  sd: number;
  itemTotal: number;
  alphaIfDeleted: number;
}

export interface AlphaResult {
  n: number;
  k: number;
  alpha: number;
  standardizedAlpha: number;
  meanInterItem: number;
  items: AlphaItemStat[];
  correlations: number[][];
  totalMean: number;
  totalSd: number;
}

export const cronbachAlpha = (data: number[][], items: string[]): AlphaResult | null => {
  const rows = completeRows(data);
  const k = items.length;
  if (k < 2 || rows.length < 2 || rows.some((row) => row.length !== k)) return null;

  const n = rows.length;
  const columns = items.map((_, index) => rows.map((row) => row[index]));
  const means = columns.map((values) => mean(values));
  const sds = columns.map((values, index) => jStat.stdev(values, true));
  const itemVariances = columns.map((values, index) => variance(values, means[index]));
  const totals = rows.map((row) => row.reduce((sum, value) => sum + value, 0));
  const totalMean = mean(totals);
  const totalVariance = variance(totals, totalMean);
  if (!(totalVariance > 0)) return null;

  const alpha = (k / (k - 1)) * (1 - itemVariances.reduce((sum, value) => sum + value, 0) / totalVariance);

  const correlations = items.map((_, i) => items.map((__, j) => (i === j ? 1 : correlation(columns[i], columns[j]))));
  let pairSum = 0;
  let pairs = 0;
  for (let i = 0; i < k; i += 1) {
    for (let j = i + 1; j < k; j += 1) {
      if (Number.isFinite(correlations[i][j])) {
        pairSum += correlations[i][j];
        pairs += 1;
      }
    }
  }
  const meanInterItem = pairs > 0 ? pairSum / pairs : NaN;
  const standardizedAlpha = Number.isFinite(meanInterItem)
    ? (k * meanInterItem) / (1 + (k - 1) * meanInterItem)
    : NaN;

  const stats: AlphaItemStat[] = items.map((item, index) => {
    const rest = rows.map((row) => row.reduce((sum, value, column) => (column === index ? sum : sum + value), 0));
    const restVariance = variance(rest, mean(rest));
    const restItemVariances = itemVariances.filter((__, column) => column !== index);
    const alphaIfDeleted =
      k > 2 && restVariance > 0
        ? ((k - 1) / (k - 2)) * (1 - restItemVariances.reduce((sum, value) => sum + value, 0) / restVariance)
        : NaN;
    return {
      item,
      mean: means[index],
      sd: sds[index],
      itemTotal: correlation(columns[index], rest),
      alphaIfDeleted,
    };
  });

  return {
    n,
    k,
    alpha,
    standardizedAlpha,
    meanInterItem,
    items: stats,
    correlations,
    totalMean,
    totalSd: Math.sqrt(totalVariance),
  };
};

const alphaLabel = (alpha: number): string => {
  if (!Number.isFinite(alpha)) return 'non calcolabile';
  if (alpha >= 0.9) return 'eccellente';
  if (alpha >= 0.8) return 'buona';
  if (alpha >= 0.7) return 'accettabile';
  if (alpha >= 0.6) return 'dubbia';
  return 'bassa';
};

export const alphaTables = (result: AlphaResult): TableSpec[] => [
  {
    id: 'alpha-summary',
    title: 'Affidabilità della scala',
    subtitle: `${result.k} item · ${result.n} casi completi`,
    columns: [
      { key: 'metric', label: 'Metrica', format: 'text' },
      { key: 'value', label: 'Valore', format: 'dec4' },
      { key: 'detail', label: 'Dettaglio', format: 'text' },
    ],
    rows: [
      { metric: 'Cronbach α', value: result.alpha, detail: alphaLabel(result.alpha) },
      { metric: 'α standardizzato', value: result.standardizedAlpha, detail: 'sulle correlazioni inter-item' },
      { metric: 'r media inter-item', value: result.meanInterItem, detail: interpretR(result.meanInterItem) },
      { metric: 'Media totale', value: result.totalMean, detail: 'somma dei punteggi / casi' },
      { metric: 'SD totale', value: result.totalSd, detail: 'deviazione standard della somma' },
    ],
    notes: [
      'α = k/(k−1) · [1 − Σσ²item / σ²totale].',
      'α non misura l’unidimensionalità: una scala può avere α alto pur con più fattori.',
    ],
  },
  {
    id: 'alpha-items',
    title: 'Diagnostica per item',
    columns: [
      { key: 'item', label: 'Item', format: 'text' },
      { key: 'mean', label: 'Media', format: 'dec3' },
      { key: 'sd', label: 'SD', format: 'dec3' },
      { key: 'itemTotal', label: 'r item-totale', format: 'dec3' },
      { key: 'alphaIfDeleted', label: 'α se eliminato', format: 'dec4' },
    ],
    rows: result.items.map((item) => ({
      item: item.item,
      mean: item.mean,
      sd: item.sd,
      itemTotal: item.itemTotal,
      alphaIfDeleted: item.alphaIfDeleted,
    })),
    notes: [
      'r item-totale = correlazione dell’item con la somma degli altri item (corretta).',
      'Un α-se-eliminato maggiore dell’α totale segnala un item che riduce la coerenza interna.',
    ],
  },
  {
    id: 'alpha-matrix',
    title: 'Correlazioni inter-item',
    columns: [
      { key: 'item', label: 'Item', format: 'text' },
      ...result.items.map((item) => ({ key: item.item, label: item.item, format: 'dec3' as const })),
    ],
    rows: result.items.map((item, index) => ({
      item: item.item,
      ...Object.fromEntries(
        result.items.map((other, column) => [other.item, result.correlations[index][column]])
      ),
    })),
    notes: ['Correlazioni di Pearson sui casi completi; la diagonale è 1.'],
  },
];

export const alphaReport = (tables: TableSpec[], result: AlphaResult): ReportSpec => {
  const items = tables.find((table) => table.id === 'alpha-items')?.rows ?? [];
  const weak = result.items.filter((item) => Number.isFinite(item.itemTotal) && item.itemTotal < 0.3);
  const removable = result.items.filter(
    (item) => Number.isFinite(item.alphaIfDeleted) && item.alphaIfDeleted > result.alpha + 0.005
  );
  const adequate = Number.isFinite(result.alpha) && result.alpha >= 0.7;

  return {
    id: 'alpha',
    title: 'Report di lettura',
    headline: `Cronbach α = ${show(result.alpha, 3)} su ${result.k} item: affidabilità ${alphaLabel(result.alpha)}.`,
    badge: adequate ? 'Scala coerente' : 'Coerenza bassa',
    tone: adequate ? 'positive' : 'caution',
    intro: [
      'L’α di Cronbach stima la coerenza interna: quanto gli item di una scala misurano la stessa cosa in modo consistente.',
      `Calcolato su ${result.n} casi completi e ${result.k} item; α standardizzato = ${show(result.standardizedAlpha, 3)}.`,
    ],
    sections: [
      {
        heading: 'La lettura dei risultati',
        body: [
          `α = ${show(result.alpha, 3)} (${alphaLabel(result.alpha)}). La correlazione media tra item è ${show(result.meanInterItem, 3)} (${interpretR(result.meanInterItem)}).`,
          adequate
            ? 'La scala supera la soglia convenzionale di 0.70: la somma degli item è sufficientemente coerente per essere usata come punteggio.'
            : 'La scala è sotto la soglia convenzionale di 0.70: la somma degli item contiene molta varianza specifica di ciascun item.',
        ],
      },
      {
        heading: 'Diagnostica per item',
        body: [
          items.length === 0
            ? 'Nessun item disponibile.'
            : `${items.length} item esaminati; ${result.items.filter((item) => Number.isFinite(item.itemTotal) && item.itemTotal >= 0.3).length} hanno una correlazione item-totale ≥ 0.30.`,
          removable.length > 0
            ? `Eliminando ${removable.map((item) => item.item).join(', ')} l’α aumenterebbe (fino a ${show(Math.max(...removable.map((item) => item.alphaIfDeleted)), 3)}).`
            : 'Nessun item, se eliminato, aumenta l’α in modo sostanziale.',
          weak.length > 0
            ? `Item con r item-totale < 0.30: ${weak.map((item) => item.item).join(', ')}.`
            : 'Tutti gli item correlano almeno 0.30 con il resto della scala.',
        ],
      },
      {
        heading: 'Assunzioni e cautele',
        bullets: [
          'α assume item con la stessa direzione: item reverse-scored devono essere ricodificati prima dell’analisi.',
          'α cresce meccanicamente con il numero di item: confronta scale con lo stesso numero di item.',
          'Un α alto non dimostra che la scala sia unidimensionale; per questo serve un’analisi fattoriale (es. PCA).',
          'I casi incompleti sono esclusi: se le omissioni non sono casuali, l’α può essere distorto.',
        ],
      },
    ],
    limitations: [
      'È riportato l’α di Cronbach; ω di McDonald non è calcolato.',
      'Non sono inclusi intervalli di confidenza bootstrapped per α.',
    ],
  };
};
