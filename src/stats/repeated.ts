/**
 * Non-parametric tests for repeated measures / matched designs that were
 * missing from the suite: Friedman with Nemenyi post-hoc, McNemar, Cochran Q
 * and the Jonckheere–Terpstra trend test.
 */

import { jStat } from './jstat';
import type { TableSpec } from './types';
import type { ReportSpec } from './report';
import { chi2SF } from './distributions';
import { fmtEst, fmtP } from './format';
import { isDecided, show } from './reportKit';

const normalCdf = (z: number): number => jStat.normal.cdf(z, 0, 1);

const alphaOf = (level: number): number => 1 - level / 100;

const twoSidedNormalP = (z: number): number => 2 * normalCdf(-Math.abs(z));

const binomialTwoSided = (x: number, n: number): number => {
  if (n <= 0) return NaN;
  const lower = jStat.binomial.cdf(Math.min(x, n - x), n, 0.5);
  return Math.min(1, 2 * lower);
};

/**
 * CDF of the studentized range for infinite df (the reference distribution of
 * the Nemenyi test): P(Q ≤ q) = k ∫ φ(z)[Φ(z) − Φ(z−q)]^(k−1) dz.
 * Simpson integration is enough for the 2–10 treatments used here and lets us
 * compute exact critical values instead of hard-coding a table.
 */
export const studentizedRangeCdf = (q: number, k: number): number => {
  if (!(q > 0) || k < 2) return q > 0 ? 1 : 0;
  const phi = (z: number) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const integrand = (z: number) => {
    const width = Math.max(0, normalCdf(z) - normalCdf(z - q));
    return phi(z) * Math.pow(width, k - 1);
  };
  const a = -12;
  const b = 12 + q;
  const steps = 3000;
  const h = (b - a) / steps;
  let sum = integrand(a) + integrand(b);
  for (let i = 1; i < steps; i += 1) {
    sum += (i % 2 === 1 ? 4 : 2) * integrand(a + i * h);
  }
  return Math.min(1, Math.max(0, (k * sum * h) / 3));
};

/** Quantile of the studentized range (infinite df) by bisection. */
export const studentizedRangeQuantile = (level: number, k: number): number => {
  const target = Math.min(0.999999, Math.max(0.5, level / 100));
  let lo = 0;
  let hi = 25;
  for (let i = 0; i < 70; i += 1) {
    const mid = (lo + hi) / 2;
    if (studentizedRangeCdf(mid, k) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

const rankWithTies = (values: number[]): number[] => {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const rank = (i + j + 2) / 2;
    for (let k = i; k <= j; k += 1) ranks[order[k].index] = rank;
    i = j + 1;
  }
  return ranks;
};

export interface FriedmanResult {
  n: number;
  k: number;
  chi2: number;
  df: number;
  p: number;
  w: number;
  rankSums: number[];
  meanRanks: number[];
  tieCorrection: number;
}

export const friedmanTest = (blocks: number[][]): FriedmanResult | null => {
  if (blocks.length < 2) return null;
  const k = blocks[0].length;
  if (k < 3 || blocks.some((block) => block.length !== k)) return null;
  if (blocks.some((block) => block.some((value) => !Number.isFinite(value)))) return null;

  const n = blocks.length;
  const rankSums = new Array<number>(k).fill(0);
  let tieSum = 0;
  blocks.forEach((block) => {
    const ranks = rankWithTies(block);
    ranks.forEach((rank, index) => {
      rankSums[index] += rank;
    });
    const counts = new Map<number, number>();
    block.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    counts.forEach((count) => {
      if (count > 1) tieSum += count * count * count - count;
    });
  });

  const raw = (12 / (n * k * (k + 1))) * rankSums.reduce((sum, value) => sum + value * value, 0) - 3 * n * (k + 1);
  const correction = 1 - tieSum / (n * (k * k * k - k));
  if (!(correction > 0)) return null;
  const chi2 = raw / correction;
  const df = k - 1;
  return {
    n,
    k,
    chi2,
    df,
    p: chi2SF(chi2, df),
    w: chi2 / (n * df),
    rankSums,
    meanRanks: rankSums.map((sum) => sum / n),
    tieCorrection: correction,
  };
};

export interface NemenyiPair {
  a: number;
  b: number;
  diff: number;
  q: number;
  p: number;
  significant: boolean;
}

export interface NemenyiResult {
  se: number;
  qCritical: number;
  criticalDifference: number;
  pairs: NemenyiPair[];
}

export const nemenyiPosthoc = (test: FriedmanResult, level: number): NemenyiResult => {
  const se = Math.sqrt((test.k * (test.k + 1)) / (6 * test.n));
  const qCritical = studentizedRangeQuantile(level, test.k) / Math.SQRT2;
  const criticalDifference = qCritical * se;
  const pairs: NemenyiPair[] = [];
  for (let i = 0; i < test.k; i += 1) {
    for (let j = i + 1; j < test.k; j += 1) {
      const diff = Math.abs(test.meanRanks[i] - test.meanRanks[j]);
      const q = diff / se;
      const p = 1 - studentizedRangeCdf(q * Math.SQRT2, test.k);
      pairs.push({ a: i, b: j, diff, q, p, significant: p < alphaOf(level) });
    }
  }
  return { se, qCritical, criticalDifference, pairs };
};

export const friedmanTables = (
  test: FriedmanResult,
  nemenyi: NemenyiResult,
  names: string[],
  level: number
): TableSpec[] => [
  {
    id: 'friedman-test',
    title: 'Test di Friedman',
    subtitle: `${test.k} misure ripetute · ${test.n} blocchi`,
    columns: [
      { key: 'metric', label: 'Metrica', format: 'text' },
      { key: 'value', label: 'Valore', format: 'dec4' },
      { key: 'detail', label: 'Dettaglio', format: 'text' },
    ],
    rows: [
      { metric: 'χ² di Friedman', value: test.chi2, detail: `df = ${test.df}` },
      { metric: 'p', value: test.p, detail: 'approssimazione χ²' },
      { metric: 'W di Kendall', value: test.w, detail: '0 = nessuna concordanza, 1 = concordanza perfetta' },
      { metric: 'Correzione per i ranghi uguali', value: test.tieCorrection, detail: 'fattore applicato alla statistica' },
    ],
    notes: [
      'H₀: le k misure provengono dalla stessa distribuzione (nessuna differenza tra trattamenti).',
      'Blocchi incompleti o valori non numerici vengono esclusi prima del test.',
    ],
  },
  {
    id: 'friedman-ranks',
    title: 'Ranghi medi per trattamento',
    columns: [
      { key: 'treatment', label: 'Trattamento', format: 'text' },
      { key: 'meanRank', label: 'Rango medio', format: 'dec3' },
      { key: 'rankSum', label: 'Somma ranghi', format: 'dec3' },
    ],
    rows: names.map((name, index) => ({
      treatment: name,
      meanRank: test.meanRanks[index],
      rankSum: test.rankSums[index],
    })),
    notes: ['Ranghi medi più bassi indicano valori più bassi nel confronto within-subject.'],
  },
  {
    id: 'friedman-nemenyi',
    title: 'Post-hoc Nemenyi',
    subtitle: `CI ${level}% · differenza critica ${fmtEst(nemenyi.criticalDifference, 3)}`,
    columns: [
      { key: 'pair', label: 'Confronto', format: 'text' },
      { key: 'diff', label: 'Δ ranghi medi', format: 'dec3' },
      { key: 'q', label: 'q', format: 'dec3' },
      { key: 'p', label: 'p', format: 'p' },
      { key: 'significant', label: 'Significativo', format: 'text' },
    ],
    rows: nemenyi.pairs.map((pair) => ({
      pair: `${names[pair.a]} vs ${names[pair.b]}`,
      diff: pair.diff,
      q: pair.q,
      p: pair.p,
      significant: pair.significant ? 'sì' : 'no',
    })),
    notes: [
      `SE = ${fmtEst(nemenyi.se, 3)} · q critico = ${fmtEst(nemenyi.qCritical, 3)} (studentized range, df ∞).`,
      'Nemenyi confronta tutte le coppie controllando il family-wise error; con molti trattamenti è conservativo.',
    ],
  },
];

export const friedmanReport = (
  tables: TableSpec[],
  names: string[],
  level: number
): ReportSpec => {
  const test = tables.find((table) => table.id === 'friedman-test')?.rows ?? [];
  const nemenyi = tables.find((table) => table.id === 'friedman-nemenyi')?.rows ?? [];
  const p = Number(test.find((row) => row.metric === 'p')?.value ?? NaN);
  const w = Number(test.find((row) => row.metric === 'W di Kendall')?.value ?? NaN);
  const significantPairs = nemenyi.filter((row) => row.significant === 'sì');
  const effect =
    w < 0.1 ? 'trascurabile' : w < 0.3 ? 'piccola' : w < 0.5 ? 'moderata' : 'grande';

  return {
    id: 'friedman',
    title: 'Report di lettura',
    headline: Number.isFinite(p) && p < alphaOf(level)
      ? `Le ${names.length} misure ripetute differiscono (p = ${fmtP(p)}).`
      : `Non emergono differenze tra le misure ripetute (p = ${fmtP(p)}).`,
    badge: Number.isFinite(p) && p < alphaOf(level) ? 'Differenza rilevata' : 'Nessuna differenza',
    tone: Number.isFinite(p) && p < alphaOf(level) ? 'positive' : 'neutral',
    intro: [
      'Il test di Friedman è l’alternativa non parametrica all’ANOVA a misure ripetute: confronta k condizioni misurate sulle stesse unità usando i ranghi dentro ogni blocco (una riga = una unità).',
      'Non richiede normalità né varianze uguali; richiede invece blocchi completi e misure almeno ordinali.',
    ],
    sections: [
      {
        heading: 'La lettura dei risultati',
        body: [
          `χ² di Friedman = ${test.find((row) => row.metric === 'χ² di Friedman')?.value ?? '—'} con ${test.find((row) => row.detail)?.detail ?? '—'}: ${Number.isFinite(p) && p < alphaOf(level) ? 'rifiuta l’ipotesi che tutte le condizioni siano equivalenti.' : 'non rifiuta l’ipotesi di equivalenza.'}`,
          `W di Kendall = ${fmtEst(w, 3)}: concordanza ${effect} tra le condizioni.`,
          `Il post-hoc Nemenyi segnala ${significantPairs.length === 0 ? 'nessun confronto significativo' : `${significantPairs.length} confront${significantPairs.length === 1 ? 'o' : 'i'} significativ${significantPairs.length === 1 ? 'o' : 'i'}`} al livello ${level}%: ${significantPairs.length ? significantPairs.map((row) => row.pair).join(', ') : 'nessuno'}.`,
        ],
      },
      {
        heading: 'Assunzioni e cautele',
        bullets: [
          'Ogni riga deve contenere tutte le k misure: le righe incomplete vengono scartate.',
          'Il test usa i ranghi within-block: differenze sistematiche di livello tra blocchi non pesano.',
          'Con pochi blocchi la potenza è bassa; con molti trattamenti Nemenyi diventa conservativo.',
        ],
      },
    ],
    limitations: [
      'Il post-hoc Nemenyi assume blocchi bilanciati e usa l’approssimazione del range studentizzato con df infinito.',
      'Non sono gestiti disegni misti (between + within) né covariate.',
    ],
  };
};

export interface McNemarResult {
  a: number;
  b: number;
  c: number;
  d: number;
  n: number;
  exactP: number;
  chi2Yates: number;
  pYates: number;
  oddsRatio: number;
}

export const mcnemarTest = (pairs: [number, number][]): McNemarResult | null => {
  if (pairs.length < 2) return null;
  if (pairs.some(([x, y]) => ![0, 1].includes(x) || ![0, 1].includes(y))) return null;
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;
  pairs.forEach(([x, y]) => {
    if (x === 1 && y === 1) a += 1;
    else if (x === 1 && y === 0) b += 1;
    else if (x === 0 && y === 1) c += 1;
    else d += 1;
  });
  const discordant = b + c;
  const chi2Yates = discordant > 0 ? Math.pow(Math.abs(b - c) - 1, 2) / discordant : NaN;
  return {
    a,
    b,
    c,
    d,
    n: pairs.length,
    exactP: binomialTwoSided(Math.min(b, c), discordant),
    chi2Yates,
    pYates: chi2SF(chi2Yates, 1),
    oddsRatio: c > 0 ? b / c : b > 0 ? Infinity : NaN,
  };
};

export const mcnemarTables = (
  result: McNemarResult,
  names: [string, string],
  level: number
): TableSpec[] => [
  {
    id: 'mcnemar-counts',
    title: 'Tabella dei cambiamenti',
    subtitle: `${names[0]} vs ${names[1]}`,
    columns: [
      { key: 'cell', label: 'Combinazione', format: 'text' },
      { key: 'count', label: 'N', format: 'int' },
    ],
    rows: [
      { cell: `Entrambi 1 (${names[0]}=1, ${names[1]}=1)`, count: result.a },
      { cell: `Solo ${names[0]} = 1`, count: result.b },
      { cell: `Solo ${names[1]} = 1`, count: result.c },
      { cell: 'Entrambi 0', count: result.d },
    ],
    notes: ['Solo le coppie discordanti (b e c) contribuiscono al test.'],
  },
  {
    id: 'mcnemar-test',
    title: 'Test di McNemar',
    subtitle: `coppie discordanti = ${result.b + result.c} · CI ${level}%`,
    columns: [
      { key: 'metric', label: 'Metrica', format: 'text' },
      { key: 'value', label: 'Valore', format: 'dec4' },
      { key: 'detail', label: 'Dettaglio', format: 'text' },
    ],
    rows: [
      { metric: 'b (1 → 0)', value: result.b, detail: names[0] + ' positivo, ' + names[1] + ' negativo' },
      { metric: 'c (0 → 1)', value: result.c, detail: names[0] + ' negativo, ' + names[1] + ' positivo' },
      { metric: 'p esatto (binomiale)', value: result.exactP, detail: 'b+c prove con p = 0,5' },
      { metric: 'χ² con correzione di Yates', value: result.chi2Yates, detail: 'approssimazione χ² (1 df)' },
      { metric: 'p asintotico', value: result.pYates, detail: 'usare l’esatto con pochi discordanti' },
      { metric: 'Odds ratio (b/c)', value: result.oddsRatio, detail: '> 1 favorisce ' + names[0] },
    ],
    notes: ['Con b+c < 25 l’approssimazione χ² è inaffidabile: fare riferimento al p esatto.'],
  },
];

export const mcnemarReport = (
  tables: TableSpec[],
  names: [string, string],
  level: number
): ReportSpec => {
  const rows = tables.find((table) => table.id === 'mcnemar-test')?.rows ?? [];
  const p = Number(rows.find((row) => row.metric === 'p esatto (binomiale)')?.value ?? NaN);
  const b = Number(rows.find((row) => String(row.metric).startsWith('b'))?.value ?? NaN);
  const c = Number(rows.find((row) => String(row.metric).startsWith('c '))?.value ?? NaN);
  const decided = isDecided(p, level);

  return {
    id: 'mcnemar',
    title: 'Report di lettura',
    headline: decided
      ? `Le due misure cambiano in modo asimmetrico (p esatto = ${fmtP(p)}): ${b > c ? names[0] : names[1]} risulta più spesso positiva.`
      : `Nessuna asimmetria nei cambiamenti tra ${names[0]} e ${names[1]} (p esatto = ${fmtP(p)}).`,
    badge: decided ? 'Cambiamento asimmetrico' : 'Nessuna asimmetria',
    tone: decided ? 'positive' : 'neutral',
    intro: [
      'McNemar confronta due misure binarie rilevate sulle stesse unità e si concentra sulle coppie che cambiano (discordanti), ignorando quelle concordanti.',
      'È il test giusto per un disegno before/after su esito sì/no, non per due gruppi indipendenti.',
    ],
    sections: [
      {
        heading: 'La lettura dei risultati',
        body: [
          `Le coppie discordanti sono b = ${show(b, 0)} (${names[0]} = 1, ${names[1]} = 0) e c = ${show(c, 0)} (${names[1]} = 1, ${names[0]} = 0).`,
          `Il p esatto è ${fmtP(p)}: ${decided ? 'rifiuta l’ipotesi che i due esiti abbiano la stessa probabilità di cambiamento.' : 'non rifiuta l’ipotesi di simmetria dei cambiamenti.'}`,
          `L’odds ratio b/c = ${show(Number(rows.find((row) => String(row.metric).startsWith('Odds'))?.value ?? NaN), 3)}: valori sopra 1 indicano che il passaggio 1 → 0 è più frequente del contrario.`,
        ],
      },
      {
        heading: 'Assunzioni e cautele',
        bullets: [
          'Le due misure devono riferirsi alle stesse unità e allo stesso intervallo di tempo.',
          'Le coppie concordanti non entrano nel test: la numerosità che conta è b + c.',
          'Con pochi discordanti usare il p esatto; l’approssimazione χ² è solo indicativa.',
        ],
      },
    ],
    limitations: [
      'Non gestisce covariati né più di due occasioni (per tre o più usare Cochran Q).',
      'L’odds ratio b/c può essere infinito quando c = 0.',
    ],
  };
};

export interface CochranResult {
  n: number;
  k: number;
  q: number;
  df: number;
  p: number;
  successes: number[];
  totals: number[];
}

export const cochranQ = (blocks: number[][]): CochranResult | null => {
  if (blocks.length < 2) return null;
  const k = blocks[0].length;
  if (k < 3 || blocks.some((block) => block.length !== k)) return null;
  if (blocks.some((block) => block.some((value) => value !== 0 && value !== 1))) return null;

  const n = blocks.length;
  const totals = blocks.map((block) => block.reduce((sum, value) => sum + value, 0));
  const successes = new Array<number>(k).fill(0);
  blocks.forEach((block) => {
    block.forEach((value, index) => {
      successes[index] += value;
    });
  });
  const grand = successes.reduce((sum, value) => sum + value, 0);
  const denominator = k * totals.reduce((sum, value) => sum + value, 0) - totals.reduce((sum, value) => sum + value * value, 0);
  if (!(denominator > 0)) return null;
  const numerator = (k - 1) * (k * successes.reduce((sum, value) => sum + value * value, 0) - grand * grand);
  const q = numerator / denominator;
  return {
    n,
    k,
    q,
    df: k - 1,
    p: chi2SF(q, k - 1),
    successes,
    totals,
  };
};

export const cochranTables = (
  result: CochranResult,
  names: string[],
  level: number
): TableSpec[] => [
  {
    id: 'cochran-test',
    title: 'Test Q di Cochran',
    subtitle: `${result.k} condizioni binarie · ${result.n} blocchi · CI ${level}%`,
    columns: [
      { key: 'metric', label: 'Metrica', format: 'text' },
      { key: 'value', label: 'Valore', format: 'dec4' },
      { key: 'detail', label: 'Dettaglio', format: 'text' },
    ],
    rows: [
      { metric: 'Q di Cochran', value: result.q, detail: `df = ${result.df}` },
      { metric: 'p', value: result.p, detail: 'approssimazione χ²' },
    ],
    notes: [
      'H₀: la probabilità di successo è la stessa nelle k condizioni ripetute.',
      'Le righe con valori mancanti o diversi da 0/1 vengono escluse.',
    ],
  },
  {
    id: 'cochran-counts',
    title: 'Successi per condizione',
    columns: [
      { key: 'condition', label: 'Condizione', format: 'text' },
      { key: 'successes', label: 'Successi', format: 'int' },
      { key: 'proportion', label: 'Proporzione', format: 'dec3' },
    ],
    rows: names.map((name, index) => ({
      condition: name,
      successes: result.successes[index],
      proportion: result.successes[index] / result.n,
    })),
    notes: ['Proporzioni descrittive: il test Q valuta se le differenze sono compatibili con il caso.'],
  },
];

export const cochranReport = (
  tables: TableSpec[],
  names: string[],
  level: number
): ReportSpec => {
  const rows = tables.find((table) => table.id === 'cochran-test')?.rows ?? [];
  const p = Number(rows.find((row) => row.metric === 'p')?.value ?? NaN);
  const q = Number(rows.find((row) => String(row.metric).startsWith('Q'))?.value ?? NaN);
  const counts = tables.find((table) => table.id === 'cochran-counts')?.rows ?? [];
  const best = counts.reduce(
    (current, row) => (Number(row.successes) > Number(current.successes) ? row : current),
    counts[0]
  );
  const subtitle = tables.find((table) => table.id === 'cochran-test')?.subtitle ?? '';
  const blocks = subtitle.match(/(\d+) blocchi/)?.[1] ?? '—';
  const decided = isDecided(p, level);

  return {
    id: 'cochran',
    title: 'Report di lettura',
    headline: decided
      ? `Le condizioni binarie differiscono (Q = ${show(q, 3)}, p = ${fmtP(p)}).`
      : `Nessuna differenza tra le condizioni binarie (Q = ${show(q, 3)}, p = ${fmtP(p)}).`,
    badge: decided ? 'Differenza rilevata' : 'Nessuna differenza',
    tone: decided ? 'positive' : 'neutral',
    intro: [
      'Cochran Q è l’estensione di McNemar a tre o più condizioni binarie misurate sulle stesse unità: verifica se la probabilità di successo cambia tra le condizioni.',
    ],
    sections: [
      {
        heading: 'La lettura dei risultati',
        body: [
          `Q = ${show(q, 3)} con ${rows.find((row) => String(row.detail).startsWith('df'))?.detail ?? '—'} e p = ${fmtP(p)}.`,
          `${decided ? 'Il test rifiuta l’ipotesi che tutte le condizioni abbiano la stessa probabilità di successo.' : 'Il test non rifiuta l’ipotesi di uguale probabilità di successo.'}`,
          `La condizione con più successi è ${String(best?.condition ?? '—')} (${show(Number(best?.successes ?? NaN), 0)} su ${blocks}).`,
        ],
      },
      {
        heading: 'Assunzioni e cautele',
        bullets: [
          'Le k misure devono essere binarie (0/1) e rilevate sulle stesse unità.',
          'Le righe incomplete vengono scartate: riporta quanti blocchi restano.',
          'Con poche unità l’approssimazione χ² è ottimistica; valuta test esatti o simulazioni.',
          'Se Q è significativo, individua le coppie con McNemar correggendo per i confronti multipli.',
        ],
      },
    ],
    limitations: [
      'Non produce un post-hoc corretto automaticamente: per le coppie usare McNemar con aggiustamento.',
      'Non gestisce disegni con misure mancanti parziali (listwise deletion).',
    ],
  };
};

export interface JonckheereResult {
  n: number;
  k: number;
  groupSizes: number[];
  u: number;
  expected: number;
  variance: number;
  z: number;
  p: number;
  effect: number;
}

export const jonckheereTerpstra = (groups: number[][]): JonckheereResult | null => {
  const k = groups.length;
  if (k < 2) return null;
  const clean = groups.map((group) => group.filter((value) => Number.isFinite(value)));
  if (clean.some((group) => group.length === 0)) return null;
  const n = clean.reduce((sum, group) => sum + group.length, 0);
  if (n < 3) return null;

  let u = 0;
  for (let i = 0; i < k; i += 1) {
    for (let j = i + 1; j < k; j += 1) {
      clean[i].forEach((a) => {
        clean[j].forEach((b) => {
          if (a < b) u += 1;
          else if (a === b) u += 0.5;
        });
      });
    }
  }

  const sumsq = clean.reduce((sum, group) => sum + group.length * group.length, 0);
  const expected = (n * n - sumsq) / 4;
  const variance = (n * n * (2 * n + 3) - clean.reduce((sum, group) => sum + group.length * group.length * (2 * group.length + 3), 0)) / 72;
  if (!(variance > 0)) return null;
  const z = (u - expected) / Math.sqrt(variance);
  return {
    n,
    k,
    groupSizes: clean.map((group) => group.length),
    u,
    expected,
    variance,
    z,
    p: twoSidedNormalP(z),
    effect: z / Math.sqrt(n),
  };
};

export const jonckheereTables = (
  result: JonckheereResult,
  groups: number[][],
  names: string[],
  level: number
): TableSpec[] => [
  {
    id: 'jonckheere-test',
    title: 'Test di Jonckheere–Terpstra',
    subtitle: `${result.k} gruppi ordinati · N = ${result.n} · CI ${level}%`,
    columns: [
      { key: 'metric', label: 'Metrica', format: 'text' },
      { key: 'value', label: 'Valore', format: 'dec4' },
      { key: 'detail', label: 'Dettaglio', format: 'text' },
    ],
    rows: [
      { metric: 'U di Jonckheere–Terpstra', value: result.u, detail: 'somma delle coppie ordinate tra gruppi' },
      { metric: 'E[U]', value: result.expected, detail: 'valore atteso sotto H₀' },
      { metric: 'z', value: result.z, detail: 'approssimazione normale' },
      { metric: 'p (due code)', value: result.p, detail: 'trend monotonico in una direzione' },
      { metric: 'r = z/√N', value: result.effect, detail: 'dimensione dell’effetto' },
    ],
    notes: [
      'H₀: nessuna tendenza monotonica tra i gruppi ordinati; H₁: i valori crescono (o decrescono) con l’ordine dei gruppi.',
      'I gruppi devono essere inseriti in ordine crescente: l’ordine delle colonne definisce l’ipotesi alternativa.',
    ],
  },
  {
    id: 'jonckheere-groups',
    title: 'Descrittive per gruppo',
    columns: [
      { key: 'group', label: 'Gruppo', format: 'text' },
      { key: 'n', label: 'N', format: 'int' },
      { key: 'median', label: 'Mediana', format: 'dec3' },
      { key: 'mean', label: 'Media', format: 'dec3' },
    ],
    rows: groups.map((group, index) => ({
      group: names[index],
      n: result.groupSizes[index],
      median: jStat.median(group),
      mean: jStat.mean(group),
    })),
  },
];

export const jonckheereReport = (
  tables: TableSpec[],
  names: string[],
  level: number
): ReportSpec => {
  const rows = tables.find((table) => table.id === 'jonckheere-test')?.rows ?? [];
  const p = Number(rows.find((row) => row.metric === 'p (due code)')?.value ?? NaN);
  const z = Number(rows.find((row) => row.metric === 'z')?.value ?? NaN);
  const effect = Number(rows.find((row) => row.metric === 'r = z/√N')?.value ?? NaN);
  const decided = isDecided(p, level);
  const direction = z > 0 ? 'crescente' : 'decrescente';

  return {
    id: 'jonckheere',
    title: 'Report di lettura',
    headline: decided
      ? `Trend ${direction} lungo l’ordine dei gruppi (z = ${show(z, 3)}, p = ${fmtP(p)}).`
      : `Nessuna tendenza monotonica lungo l’ordine dei gruppi (z = ${show(z, 3)}, p = ${fmtP(p)}).`,
    badge: decided ? `Trend ${direction}` : 'Nessun trend',
    tone: decided ? 'positive' : 'neutral',
    intro: [
      'Il test di Jonckheere–Terpstra verifica un’ipotesi di trend tra gruppi ordinati, usando l’ordine delle colonne selezionate: è più potente di Kruskal–Wallis quando l’alternativa è monotònica.',
      `L’ordine inserito è ${names.join(' < ')}.`,
    ],
    sections: [
      {
        heading: 'La lettura dei risultati',
        body: [
          `U = ${rows.find((row) => String(row.metric).startsWith('U'))?.value ?? '—'} contro un atteso di ${rows.find((row) => row.metric === 'E[U]')?.value ?? '—'} sotto H₀.`,
          `${decided ? `I valori tendono a ${direction === 'crescente' ? 'crescere' : 'decrescere'} passando da ${names[0]} a ${names[names.length - 1]}.` : 'La successione dei gruppi non mostra un andamento monotònico convincente.'}`,
          `Dimensione dell’effetto r = ${show(effect, 3)} (0,1 piccolo, 0,3 medio, 0,5 grande).`,
        ],
      },
      {
        heading: 'Assunzioni e cautele',
        bullets: [
          'I gruppi devono essere ordinati prima di eseguire il test: l’ordine non può essere scelto guardando i risultati.',
          'Le osservazioni devono essere indipendenti tra loro e almeno ordinali.',
          'Il test rileva un trend, non quale coppia differisca: per i confronti puntuali servono post-hoc dedicati.',
        ],
      },
    ],
    limitations: [
      'Approssimazione normale: con gruppi molto piccoli il p può essere impreciso.',
      'Non gestisce blocchi o misure ripetute: per quelle usare Friedman.',
    ],
  };
};
