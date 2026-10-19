/**
 * One-way repeated-measures ANOVA with Mauchly's sphericity test and the
 * Greenhouse–Geisser / Huynh–Feldt corrected F tests. The chi-square
 * approximation for Mauchly follows R (mauchly.test) and pingouin, including
 * the second-order correction term; epsilon values come from the covariance
 * matrix of orthonormal Helmert contrasts.
 */

import { jStat } from './jstat';
import type { TableSpec } from './types';
import type { ReportSpec } from './report';
import { chi2SF, fSF, tCrit } from './distributions';
import { fmtEst, fmtP } from './format';
import { isDecided, show } from './reportKit';
import { eigenSymmetric } from './linalg';

export interface RmAnovaResult {
  n: number;
  k: number;
  means: number[];
  sds: number[];
  ssConditions: number;
  ssSubjects: number;
  ssError: number;
  ssTotal: number;
  dfConditions: number;
  dfError: number;
  msConditions: number;
  msError: number;
  f: number;
  p: number;
  partialEta2: number;
  generalizedEta2: number;
  mauchlyW: number;
  mauchlyChi2: number;
  mauchlyDf: number;
  mauchlyP: number;
  ggEpsilon: number;
  hfEpsilon: number;
  pGG: number;
  pHF: number;
}

const alphaOf = (level: number): number => 1 - level / 100;

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

const covariance = (blocks: number[][], k: number, means: number[], n: number): number[][] => {
  const matrix = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < k; i += 1) {
    for (let j = i; j < k; j += 1) {
      let sum = 0;
      blocks.forEach((block) => {
        sum += (block[i] - means[i]) * (block[j] - means[j]);
      });
      const value = sum / (n - 1);
      matrix[i][j] = value;
      matrix[j][i] = value;
    }
  }
  return matrix;
};

/** Orthonormal Helmert contrasts (k × k−1), orthogonal to the grand mean. */
const helmertContrasts = (k: number): number[][] =>
  Array.from({ length: k }, (_, row) =>
    Array.from({ length: k - 1 }, (_, column) => {
      const j = column + 1;
      const scale = Math.sqrt(j * (j + 1));
      if (row < j) return 1 / scale;
      if (row === j) return -j / scale;
      return 0;
    })
  );

const contrastCovariance = (S: number[][], C: number[][]): number[][] => {
  const k = S.length;
  const d = C[0].length;
  const sc = S.map((row) =>
    Array.from({ length: d }, (_, j) => row.reduce((sum, value, i) => sum + value * C[i][j], 0))
  );
  return Array.from({ length: d }, (_, a) =>
    Array.from({ length: d }, (_, b) =>
      C.reduce((sum, row, i) => sum + row[a] * sc[i][b], 0)
    )
  );
};

export const repeatedMeasuresAnova = (blocks: number[][]): RmAnovaResult | null => {
  if (blocks.length < 2) return null;
  const k = blocks[0].length;
  if (k < 3 || blocks.some((block) => block.length !== k)) return null;
  if (blocks.some((block) => block.some((value) => !Number.isFinite(value)))) return null;

  const n = blocks.length;
  const means = Array.from({ length: k }, (_, column) => mean(blocks.map((block) => block[column])));
  const grand = mean(blocks.flat());
  const subjectMeans = blocks.map((block) => mean(block));

  let ssTotal = 0;
  blocks.forEach((block) => {
    block.forEach((value) => {
      ssTotal += (value - grand) * (value - grand);
    });
  });
  const ssSubjects = k * subjectMeans.reduce((sum, value) => sum + (value - grand) ** 2, 0);
  const ssConditions = n * means.reduce((sum, value) => sum + (value - grand) ** 2, 0);
  const ssError = Math.max(0, ssTotal - ssSubjects - ssConditions);

  const dfConditions = k - 1;
  const dfError = (n - 1) * (k - 1);
  if (!(dfError > 0)) return null;
  const msConditions = ssConditions / dfConditions;
  const msError = ssError / dfError;
  const f = msError > 0 ? msConditions / msError : NaN;
  const p = fSF(f, dfConditions, dfError);

  const S = covariance(blocks, k, means, n);
  const C = helmertContrasts(k);
  const M = contrastCovariance(S, C);
  const eigen = eigenSymmetric(M);
  const values = eigen.values;
  const d = k - 1;
  const trace = values.reduce((sum, value) => sum + value, 0);

  let mauchlyW = NaN;
  let mauchlyChi2 = NaN;
  let mauchlyP = NaN;
  const mauchlyDf = (d * (d + 1)) / 2 - 1;
  if (values.some((value) => value <= 0) || !(trace > 0)) {
    mauchlyW = 0;
    mauchlyP = 0;
  } else {
    const logDet = values.reduce((sum, value) => sum + Math.log(value), 0);
    mauchlyW = Math.exp(logDet - d * Math.log(trace / d));
    const dfResid = n - 1;
    const correction = 1 - (2 * d * d + d + 2) / (6 * d * dfResid);
    mauchlyChi2 = -dfResid * correction * Math.log(mauchlyW);
    const w2 =
      ((d + 2) * (d - 1) * (d - 2) * (2 * d ** 3 + 6 * d ** 2 + 3 * k + 2)) /
      (288 * (dfResid * d * correction) ** 2);
    const p1 = chi2SF(mauchlyChi2, mauchlyDf);
    const p2 = chi2SF(mauchlyChi2, mauchlyDf + 4);
    mauchlyP = Math.min(1, Math.max(0, p1 + w2 * (p2 - p1)));
  }

  const sumSquares = values.reduce((sum, value) => sum + value * value, 0);
  const ggEpsilon = sumSquares > 0 ? Math.min(1, (trace * trace) / (d * sumSquares)) : 1;
  const lowerBound = 1 / d;
  const hfRaw = (n * d * ggEpsilon - 2) / (d * (n - 1 - d * ggEpsilon));
  const hfEpsilon = Math.max(lowerBound, Math.min(1, hfRaw));
  const pGG = fSF(f, Math.max(1, ggEpsilon * dfConditions), Math.max(1, ggEpsilon * dfError));
  const pHF = fSF(f, Math.max(1, hfEpsilon * dfConditions), Math.max(1, hfEpsilon * dfError));

  return {
    n,
    k,
    means,
    sds: Array.from({ length: k }, (_, column) =>
      jStat.stdev(blocks.map((block) => block[column]), true)
    ),
    ssConditions,
    ssSubjects,
    ssError,
    ssTotal,
    dfConditions,
    dfError,
    msConditions,
    msError,
    f,
    p,
    partialEta2: ssConditions / (ssConditions + ssError),
    generalizedEta2: ssConditions / ssTotal,
    mauchlyW,
    mauchlyChi2,
    mauchlyDf,
    mauchlyP,
    ggEpsilon,
    hfEpsilon,
    pGG,
    pHF,
  };
};

export const repeatedAnovaTables = (
  result: RmAnovaResult,
  names: string[],
  level: number
): TableSpec[] => {
  const sphericityMet = Number.isFinite(result.mauchlyP) && result.mauchlyP > alphaOf(level);
  const correctedDf1 = result.ggEpsilon * result.dfConditions;
  const correctedDf2 = result.ggEpsilon * result.dfError;
  const crit = tCrit(level, result.n - 1);
  return [
    {
      id: 'rm-anova',
      title: 'ANOVA a misure ripetute',
      subtitle: `${result.n} soggetti · ${result.k} condizioni · CI ${level}%`,
      columns: [
        { key: 'source', label: 'Sorgente', format: 'text' },
        { key: 'ss', label: 'SS', format: 'dec4' },
        { key: 'df', label: 'df', format: 'dec2' },
        { key: 'ms', label: 'MS', format: 'dec4' },
        { key: 'f', label: 'F', format: 'dec3' },
        { key: 'p', label: 'p', format: 'p' },
        { key: 'etaP', label: 'η²p', format: 'dec3' },
      ],
      rows: [
        {
          source: 'Condizioni (within)',
          ss: result.ssConditions,
          df: result.dfConditions,
          ms: result.msConditions,
          f: result.f,
          p: result.p,
          etaP: result.partialEta2,
        },
        {
          source: 'Soggetti',
          ss: result.ssSubjects,
          df: result.n - 1,
          ms: result.ssSubjects / (result.n - 1),
          f: NaN,
          p: NaN,
          etaP: NaN,
        },
        {
          source: 'Errore (Condizioni × Soggetti)',
          ss: result.ssError,
          df: result.dfError,
          ms: result.msError,
          f: NaN,
          p: NaN,
          etaP: NaN,
        },
        {
          source: 'Totale',
          ss: result.ssTotal,
          df: result.n * result.k - 1,
          ms: NaN,
          f: NaN,
          p: NaN,
          etaP: NaN,
        },
      ],
      notes: [
        'F = MS_condizioni / MS_errore, con df = (k−1) e (n−1)(k−1).',
        `η²p = ${fmtEst(result.partialEta2, 3)} · η²G = ${fmtEst(result.generalizedEta2, 3)}.`,
      ],
    },
    {
      id: 'rm-sphericity',
      title: 'Sfericità e correzioni',
      subtitle: sphericityMet ? 'sfericità non rifiutata' : 'sfericità violata: usare la correzione',
      columns: [
        { key: 'metric', label: 'Metrica', format: 'text' },
        { key: 'value', label: 'Valore', format: 'dec4' },
        { key: 'detail', label: 'Dettaglio', format: 'text' },
      ],
      rows: [
        { metric: 'Mauchly W', value: result.mauchlyW, detail: '1 = sfericità perfetta' },
        { metric: 'Mauchly χ²', value: result.mauchlyChi2, detail: `df = ${result.mauchlyDf}` },
        { metric: 'Mauchly p', value: result.mauchlyP, detail: sphericityMet ? 'nessuna violazione' : 'violazione' },
        { metric: 'ε Greenhouse–Geisser', value: result.ggEpsilon, detail: 'limite inferiore = 1/(k−1)' },
        { metric: 'ε Huynh–Feldt', value: result.hfEpsilon, detail: 'più liberale di GG' },
        { metric: 'F (df non corretti)', value: result.f, detail: `${result.dfConditions}, ${result.dfError}` },
        { metric: 'p non corretto', value: result.p, detail: 'valido solo con sfericità' },
        { metric: 'p GG', value: result.pGG, detail: `df = ${fmtEst(correctedDf1, 2)}, ${fmtEst(correctedDf2, 2)}` },
        { metric: 'p HF', value: result.pHF, detail: 'df corretti con ε HF' },
        { metric: 'η² generalizzato', value: result.generalizedEta2, detail: 'SS condizioni / SS totale' },
      ],
      notes: [
        'Mauchly richiede normalità multivariata; con n piccolo il test ha potenza bassa.',
        'Se Mauchly è significativo, riportare il p corretto GG (conservativo) o HF.',
      ],
    },
    {
      id: 'rm-descriptives',
      title: 'Descrittive per condizione',
      columns: [
        { key: 'condition', label: 'Condizione', format: 'text' },
        { key: 'n', label: 'N', format: 'int' },
        { key: 'mean', label: 'Media', format: 'dec3' },
        { key: 'sd', label: 'SD', format: 'dec3' },
        { key: 'ciLo', label: 'CI low', format: 'dec3' },
        { key: 'ciHi', label: 'CI high', format: 'dec3' },
      ],
      rows: names.map((name, index) => {
        const half = crit * (result.sds[index] / Math.sqrt(result.n));
        return {
          condition: name,
          n: result.n,
          mean: result.means[index],
          sd: result.sds[index],
          ciLo: result.means[index] - half,
          ciHi: result.means[index] + half,
        };
      }),
      notes: [`CI = media ± t(${level}%, df = ${result.n - 1})·SE.`],
    },
  ];
};

export const repeatedAnovaReport = (
  tables: TableSpec[],
  names: string[],
  level: number
): ReportSpec => {
  const aov = tables.find((table) => table.id === 'rm-anova')?.rows ?? [];
  const sphericity = tables.find((table) => table.id === 'rm-sphericity')?.rows ?? [];
  const p = Number(aov[0]?.p ?? NaN);
  const f = Number(aov[0]?.f ?? NaN);
  const etaP = Number(aov[0]?.etaP ?? NaN);
  const mauchlyP = Number(sphericity.find((row) => row.metric === 'Mauchly p')?.value ?? NaN);
  const gg = Number(sphericity.find((row) => String(row.metric).startsWith('ε Greenhouse'))?.value ?? NaN);
  const pGG = Number(sphericity.find((row) => row.metric === 'p GG')?.value ?? NaN);
  const pHF = Number(sphericity.find((row) => row.metric === 'p HF')?.value ?? NaN);
  const violated = Number.isFinite(mauchlyP) && mauchlyP < alphaOf(level);
  // When sphericity fails, the decision must follow the corrected p-value.
  const decidedP = violated && Number.isFinite(pGG) ? pGG : p;
  const decided = isDecided(decidedP, level);
  const effect = etaP < 0.01 ? 'trascurabile' : etaP < 0.06 ? 'piccola' : etaP < 0.14 ? 'media' : 'grande';

  return {
    id: 'rm-anova',
    title: 'Report di lettura',
    headline: decided
      ? `Le condizioni differiscono (F = ${show(f, 3)}, p = ${fmtP(decidedP)}${violated ? ' corretto GG' : ''}).`
      : `Nessuna differenza tra le condizioni (F = ${show(f, 3)}, p = ${fmtP(decidedP)}${violated ? ' corretto GG' : ''}).`,
    badge: violated ? 'Sfericità violata' : decided ? 'Differenza rilevata' : 'Nessuna differenza',
    tone: violated ? 'caution' : decided ? 'positive' : 'neutral',
    intro: [
      'L’ANOVA a misure ripetute confronta k condizioni misurate sulle stesse unità, separando la variabilità tra condizioni da quella tra soggetti.',
      `Le condizioni confrontate sono ${names.join(', ')}.`,
    ],
    sections: [
      {
        heading: 'La lettura dei risultati',
        body: [
          `F(${aov[0]?.df ?? '—'}, ${aov[2]?.df ?? '—'}) = ${show(f, 3)}, p${violated ? ' corretto GG' : ''} = ${fmtP(decidedP)}: ${decided ? 'rifiuta l’ipotesi che le medie delle condizioni siano uguali.' : 'non rifiuta l’ipotesi di uguali medie.'}`,
          `η²p = ${show(etaP, 3)}: effetto ${effect}. η²G = ${show(Number(sphericity.find((row) => row.metric === 'η² generalizzato')?.value ?? NaN), 3)}.`,
        ],
      },
      {
        heading: 'Sfericità',
        body: [
          violated
            ? `Mauchly p = ${fmtP(mauchlyP)}: l’assunzione di sfericità è violata. Usa il p corretto Greenhouse–Geisser (${fmtP(pGG)}, ε = ${show(gg, 3)}) o Huynh–Feldt (${fmtP(pHF)}).`
            : `Mauchly p = ${fmtP(mauchlyP)}: non ci sono prove di violazione; il p non corretto è utilizzabile.`,
        ],
      },
      {
        heading: 'Assunzioni e cautele',
        bullets: [
          'Le righe incomplete vengono escluse: ogni soggetto deve avere tutte le k misure.',
          'La sfericità riguarda le differenze tra tutte le coppie di condizioni, non le varianze delle singole condizioni.',
          'Con pochi soggetti Mauchly è poco potente: considera comunque le correzioni se ε è basso.',
          'L’ANOVA within non dice quali condizioni differiscano: servono confronti post-hoc.',
        ],
      },
    ],
    limitations: [
      'Non sono inclusi disegni misti, più fattori within o covariate.',
      'Le correzioni GG/HF modificano i gradi di libertà ma non le medie: gli effetti descrittivi restano invariati.',
    ],
  };
};
