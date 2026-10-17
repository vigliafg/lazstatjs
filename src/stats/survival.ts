import type { TableSpec } from './types';
import type { ReportSpec } from './report';
import { fmtEst, fmtP } from './format';
import { chi2SF, zCrit } from './distributions';
import { isDecided, tableById } from './reportKit';

/**
 * Survival analysis: Kaplan-Meier curves with Greenwood log-log confidence
 * intervals, median survival, restricted mean survival time, life tables and
 * the log-rank test for two or more groups.
 */

export interface KMPoint {
  time: number;
  nRisk: number;
  events: number;
  censored: number;
  survival: number;
  lo: number;
  hi: number;
}

export interface KMResult {
  points: KMPoint[];
  median: number;
  medianLo: number;
  medianHi: number;
  rmst: number;
  maxTime: number;
  n: number;
  events: number;
  censored: number;
}

export interface SurvivalGroup {
  name: string;
  time: number[];
  event: number[];
}

export const kaplanMeier = (time: number[], event: number[], level = 95): KMResult => {
  const n = time.length;
  if (n === 0) {
    return { points: [], median: NaN, medianLo: NaN, medianHi: NaN, rmst: NaN, maxTime: NaN, n: 0, events: 0, censored: 0 };
  }

  const observations = time
    .map((value, index) => ({ time: value, event: event[index] === 1 ? 1 : 0 }))
    .filter(item => Number.isFinite(item.time) && item.time >= 0)
    .sort((left, right) => left.time - right.time);

  const total = observations.length;
  const eventCount = observations.filter(item => item.event === 1).length;
  const maxTime = Math.max(...observations.map(item => item.time));
  const eventTimes = Array.from(
    new Set(observations.filter(item => item.event === 1).map(item => item.time))
  ).sort((left, right) => left - right);

  const z = zCrit(level);
  const points: KMPoint[] = [];
  let survival = 1;
  let greenwood = 0;

  eventTimes.forEach(atTime => {
    const nRisk = observations.filter(item => item.time >= atTime).length;
    const events = observations.filter(item => item.time === atTime && item.event === 1).length;
    const censored = observations.filter(item => item.time === atTime && item.event === 0).length;
    if (nRisk === 0 || events === 0) return;

    survival *= 1 - events / nRisk;
    greenwood += events / (nRisk * Math.max(1, nRisk - events));

    let lo = NaN;
    let hi = NaN;
    if (survival > 0 && survival < 1 && greenwood > 0) {
      const se = Math.sqrt(greenwood) / Math.abs(Math.log(survival));
      lo = Math.pow(survival, Math.exp(z * se));
      hi = Math.pow(survival, Math.exp(-z * se));
    } else if (survival === 0) {
      lo = 0;
      hi = 0;
    }

    points.push({ time: atTime, nRisk, events, censored, survival, lo, hi });
  });

  const medianPoint = points.find(point => point.survival <= 0.5);
  const median = medianPoint ? medianPoint.time : NaN;
  // The lower band crosses 0.5 earlier than the point estimate, the upper band later.
  const lowerCandidate = points.find(point => Number.isFinite(point.lo) && point.lo <= 0.5);
  const upperCandidate = points.find(point => Number.isFinite(point.hi) && point.hi <= 0.5);
  const medianLo = lowerCandidate ? lowerCandidate.time : NaN;
  const medianHi = upperCandidate ? upperCandidate.time : NaN;

  let rmst = 0;
  let previousTime = 0;
  let previousSurvival = 1;
  points.forEach(point => {
    rmst += previousSurvival * (point.time - previousTime);
    previousTime = point.time;
    previousSurvival = point.survival;
  });
  rmst += previousSurvival * (maxTime - previousTime);

  return {
    points,
    median,
    medianLo,
    medianHi,
    rmst,
    maxTime,
    n: total,
    events: eventCount,
    censored: total - eventCount,
  };
};

const invertMatrix = (matrix: number[][]): number[][] | null => {
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

export interface LogRankResult {
  chi2: number;
  df: number;
  p: number;
  hazardRatio: number;
  hrLo: number;
  hrHi: number;
}

export const logRankTest = (groups: SurvivalGroup[], level = 95): LogRankResult => {
  const k = groups.length;
  if (k < 2) return { chi2: NaN, df: NaN, p: NaN, hazardRatio: NaN, hrLo: NaN, hrHi: NaN };

  const observations = groups.flatMap((group, groupIndex) =>
    group.time
      .map((time, index) => ({ time, event: group.event[index] === 1 ? 1 : 0, groupIndex }))
      .filter(item => Number.isFinite(item.time) && item.time >= 0)
  );

  const eventTimes = Array.from(
    new Set(observations.filter(item => item.event === 1).map(item => item.time))
  ).sort((left, right) => left - right);

  const observed = new Array<number>(k).fill(0);
  const expected = new Array<number>(k).fill(0);
  const covariance = Array.from({ length: k }, () => new Array<number>(k).fill(0));

  eventTimes.forEach(atTime => {
    const atRisk = new Array<number>(k).fill(0);
    const deaths = new Array<number>(k).fill(0);
    observations.forEach(item => {
      if (item.time >= atTime) atRisk[item.groupIndex] += 1;
      if (item.time === atTime && item.event === 1) deaths[item.groupIndex] += 1;
    });

    const n = atRisk.reduce((sum, value) => sum + value, 0);
    const d = deaths.reduce((sum, value) => sum + value, 0);
    if (n === 0 || d === 0) return;

    for (let j = 0; j < k; j++) {
      observed[j] += deaths[j];
      expected[j] += (atRisk[j] * d) / n;
    }

    const factor = (d * (n - d)) / Math.max(1, n - 1);
    for (let j = 0; j < k; j++) {
      for (let l = 0; l < k; l++) {
        const shareJ = atRisk[j] / n;
        const shareL = atRisk[l] / n;
        covariance[j][l] += factor * (j === l ? shareJ * (1 - shareJ) : -shareJ * shareL);
      }
    }
  });

  const difference = observed.map((value, index) => value - expected[index]);
  const size = k - 1;
  const subMatrix = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => covariance[i][j])
  );
  const inverse = invertMatrix(subMatrix);
  if (!inverse) return { chi2: NaN, df: size, p: NaN, hazardRatio: NaN, hrLo: NaN, hrHi: NaN };

  let chi2 = 0;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      chi2 += difference[i] * inverse[i][j] * difference[j];
    }
  }

  let hazardRatio = NaN;
  let hrLo = NaN;
  let hrHi = NaN;
  if (k === 2 && covariance[0][0] > 0) {
    hazardRatio = Math.exp(difference[0] / covariance[0][0]);
    const se = 1 / Math.sqrt(covariance[0][0]);
    const critical = zCrit(level);
    hrLo = Math.exp(Math.log(hazardRatio) - critical * se);
    hrHi = Math.exp(Math.log(hazardRatio) + critical * se);
  }

  return {
    chi2: Math.max(0, chi2),
    df: size,
    p: chi2SF(Math.max(0, chi2), size),
    hazardRatio,
    hrLo,
    hrHi,
  };
};

export interface LifeTableRow {
  start: number;
  end: number;
  atRisk: number;
  events: number;
  censored: number;
  survival: number;
}

export const lifeTable = (time: number[], event: number[], intervals?: number): LifeTableRow[] => {
  const observations = time
    .map((value, index) => ({ time: value, event: event[index] === 1 ? 1 : 0 }))
    .filter(item => Number.isFinite(item.time) && item.time >= 0);
  if (observations.length === 0) return [];

  const maxTime = Math.max(...observations.map(item => item.time));
  const k = intervals ?? Math.min(8, Math.max(2, Math.ceil(Math.sqrt(observations.length))));
  const width = maxTime / k || 1;
  const rows: LifeTableRow[] = [];
  let survival = 1;

  for (let index = 0; index < k; index++) {
    const isLast = index === k - 1;
    const start = index * width;
    const end = isLast ? maxTime : (index + 1) * width;
    const inInterval = (value: number) => value >= start && (isLast ? value <= end : value < end);
    const atRisk = observations.filter(item => item.time >= start).length;
    const events = observations.filter(item => inInterval(item.time) && item.event === 1).length;
    const censored = observations.filter(item => inInterval(item.time) && item.event === 0).length;
    const effective = atRisk - censored / 2;
    if (effective > 0) survival *= 1 - events / effective;
    rows.push({ start, end, atRisk, events, censored, survival });
  }

  return rows;
};

// ---------------------------------------------------------------------------
// Tables and report
// ---------------------------------------------------------------------------

export interface SurvivalTablesOptions {
  time: number[];
  event: number[];
  groups: string[];
  level: number;
}

export const survivalTables = (options: SurvivalTablesOptions): TableSpec[] => {
  const { level } = options;
  const rows = options.time
    .map((time, index) => ({
      time,
      event: options.event[index] === 1 ? 1 : 0,
      group: String(options.groups[index] ?? '').trim() || 'All',
    }))
    .filter(row => Number.isFinite(row.time) && row.time >= 0);

  if (rows.length < 3) return [];

  const groupNames = Array.from(new Set(rows.map(row => row.group))).sort();
  const overall = kaplanMeier(rows.map(row => row.time), rows.map(row => row.event), level);
  const tables: TableSpec[] = [];

  const summaries = groupNames.map(name => {
    const subset = rows.filter(row => row.group === name);
    const km = kaplanMeier(subset.map(row => row.time), subset.map(row => row.event), level);
    return { name, km };
  });

  tables.push({
    id: 'surv-summary',
    title: 'Sintesi di sopravvivenza',
    subtitle: `N = ${overall.n} · eventi = ${overall.events} · censurati = ${overall.censored}`,
    columns: [
      { key: 'group', label: 'Gruppo', format: 'text' },
      { key: 'n', label: 'N', format: 'int' },
      { key: 'events', label: 'Eventi', format: 'int' },
      { key: 'censored', label: 'Censurati', format: 'int' },
      { key: 'median', label: 'Mediana', format: 'dec2' },
      { key: 'medianLo', label: 'CI low', format: 'dec2' },
      { key: 'medianHi', label: 'CI high', format: 'dec2' },
      { key: 'rmst', label: 'RMST', format: 'dec2' },
    ],
    rows: summaries.map(({ name, km }) => ({
      group: name,
      n: km.n,
      events: km.events,
      censored: km.censored,
      median: km.median,
      medianLo: km.medianLo,
      medianHi: km.medianHi,
      rmst: km.rmst,
    })),
    notes: [
      'La mediana è il tempo in cui la curva scende a 0,50: se non viene raggiunta resta non calcolabile.',
      'Il CI della mediana deriva dagli intervalli log-log della curva; RMST è l’area sotto la curva fino all’ultimo tempo osservato.',
    ],
  });

  const kmRows = summaries.flatMap(({ name, km }) =>
    km.points.map(point => ({
      group: name,
      time: point.time,
      nRisk: point.nRisk,
      events: point.events,
      censored: point.censored,
      survival: point.survival,
      lo: point.lo,
      hi: point.hi,
    }))
  );

  tables.push({
    id: 'surv-km',
    title: 'Curva di Kaplan–Meier',
    subtitle: `CI ${level}% log-log · stima prodotto-limite`,
    columns: [
      { key: 'group', label: 'Gruppo', format: 'text' },
      { key: 'time', label: 'Tempo', format: 'dec2' },
      { key: 'nRisk', label: 'A rischio', format: 'int' },
      { key: 'events', label: 'Eventi', format: 'int' },
      { key: 'censored', label: 'Censurati', format: 'int' },
      { key: 'survival', label: 'S(t)', format: 'dec3' },
      { key: 'lo', label: 'CI low', format: 'dec3' },
      { key: 'hi', label: 'CI high', format: 'dec3' },
    ],
    rows: kmRows,
    notes: [
      'S(t) è la probabilità stimata di essere ancora “in vita” (senza evento) al tempo t.',
      'I censurati escono dal rischio senza far scendere la curva: è il motivo per cui serve un’analisi di sopravvivenza invece di una media.',
    ],
  });

  if (groupNames.length >= 2) {
    const groups: SurvivalGroup[] = summaries.map(({ name }) => {
      const subset = rows.filter(row => row.group === name);
      return { name, time: subset.map(row => row.time), event: subset.map(row => row.event) };
    });
    const result = logRankTest(groups, level);

    tables.push({
      id: 'surv-logrank',
      title: 'Log-rank test',
      subtitle: groups.map(group => group.name).join(' vs '),
      columns: [
        { key: 'metric', label: 'Voce', format: 'text' },
        { key: 'value', label: 'Valore', format: 'text' },
      ],
      rows: [
        { metric: 'χ²', value: fmtEst(result.chi2, 3), chiValue: result.chi2 },
        { metric: 'df', value: String(result.df) },
        { metric: 'p', value: fmtP(result.p), pValue: result.p },
        ...(Number.isFinite(result.hazardRatio)
          ? [
              {
                metric: 'Hazard ratio (Mantel–Haenszel)',
                value: fmtEst(result.hazardRatio, 3),
                hrValue: result.hazardRatio,
              },
              { metric: 'HR CI low', value: fmtEst(result.hrLo, 3) },
              { metric: 'HR CI high', value: fmtEst(result.hrHi, 3) },
            ]
          : []),
      ],
      notes: [
        'Il log-rank confronta il numero di eventi osservati in ogni gruppo con quelli attesi se le curve fossero uguali.',
        'L’hazard ratio è stimato con l’approccio Mantel–Haenszel: HR > 1 indica rischio maggiore nel primo gruppo.',
      ],
    });
  }

  const overallLife = lifeTable(rows.map(row => row.time), rows.map(row => row.event));
  if (overallLife.length > 0) {
    tables.push({
      id: 'surv-life',
      title: 'Life table (tutta la coorte)',
      subtitle: `${overallLife.length} intervalli di uguale ampiezza`,
      columns: [
        { key: 'start', label: 'Da', format: 'dec2' },
        { key: 'end', label: 'A', format: 'dec2' },
        { key: 'atRisk', label: 'A rischio', format: 'int' },
        { key: 'events', label: 'Eventi', format: 'int' },
        { key: 'censored', label: 'Censurati', format: 'int' },
        { key: 'survival', label: 'S(t)', format: 'dec3' },
      ],
      rows: overallLife.map(row => ({ ...row })),
      notes: ['Nella life table i censurati nell’intervallo contribuiscono per metà al tempo a rischio.'],
    });
  }

  return tables;
};

export const survivalReport = (tables: TableSpec[], level: number): ReportSpec => {
  const summary = tableById(tables, 'surv-summary')?.rows ?? [];
  const logRank = tableById(tables, 'surv-logrank')?.rows ?? [];
  const km = tableById(tables, 'surv-km')?.rows ?? [];

  const overall = summary[0];
  const p = Number(logRank.find(row => String(row.metric) === 'p')?.pValue ?? NaN);
  const significant = isDecided(p, level);
  const hr = Number(logRank.find(row => String(row.metric).startsWith('Hazard ratio'))?.hrValue ?? NaN);
  const median = Number(overall?.median ?? NaN);
  const rmst = Number(overall?.rmst ?? NaN);
  const events = Number(overall?.events ?? NaN);
  const n = Number(overall?.n ?? NaN);
  const censored = Number(overall?.censored ?? NaN);
  const groups = summary.map(row => String(row.group));

  const lastPoint = km[km.length - 1];
  const finalSurvival = Number(lastPoint?.survival ?? NaN);

  return {
    id: 'survival',
    title: 'Report di lettura',
    headline:
      summary.length > 1 && Number.isFinite(p)
        ? significant
          ? `Le curve dei gruppi differiscono (log-rank p = ${fmtP(p)}).`
          : `Nessuna differenza tra le curve dei gruppi (log-rank p = ${fmtP(p)}).`
        : Number.isFinite(median)
          ? `Mediana di sopravvivenza: ${fmtEst(median, 2)} (${events} eventi su ${n}).`
          : `La mediana non viene raggiunta: ${events} eventi su ${n}.`,
    badge: 'Sopravvivenza',
    tone: summary.length > 1 && significant ? 'positive' : 'neutral',
    intro: [
      'L’analisi di sopravvivenza stima quanto tempo passa prima di un evento (guarigione, guasto, abbandono) tenendo conto delle osservazioni censurate, cioè di chi non ha ancora avuto l’evento quando lo studio finisce.',
      `Qui ci sono ${n} osservazioni, ${events} eventi e ${censored} censurati: trattare i censurati come “nessun evento” o escluderli darebbe stime distorte, mentre Kaplan–Meier li mantiene nel rischio finché sono osservati.`,
    ],
    sections: [
      {
        heading: 'La curva e la mediana',
        body: [
          Number.isFinite(median)
            ? `La mediana di sopravvivenza è ${fmtEst(median, 2)}: a quel tempo la curva scende sotto 0,50.${Number.isFinite(Number(overall?.medianLo)) ? ` Intervallo ${fmtEst(Number(overall?.medianLo), 2)} – ${fmtEst(Number(overall?.medianHi), 2)}.` : ''}`
            : 'La curva non scende sotto 0,50 entro l’ultimo tempo osservato: la mediana non è raggiunta (non è “infinita”, semplicemente non stimabile con questo follow-up).',
          Number.isFinite(finalSurvival)
            ? `All’ultimo tempo osservato la sopravvivenza stimata è ${fmtEst(finalSurvival, 3)} (${fmtEst(finalSurvival * 100, 1)}%).`
            : 'La sopravvivenza finale non è calcolabile.',
          Number.isFinite(rmst)
            ? `RMST = ${fmtEst(rmst, 2)}: area media sotto la curva fino all’ultimo tempo, cioè il tempo medio trascorso senza evento entro l’orizzonte osservato.`
            : 'RMST non calcolabile.',
        ],
      },
      {
        heading: summary.length > 1 ? 'Confronto tra gruppi' : 'Confronto tra gruppi non richiesto',
        body:
          summary.length > 1
            ? [
                `Gruppi: ${groups.join(', ')}. Il log-rank dà χ² = ${String(logRank.find(row => String(row.metric) === 'χ²')?.value ?? '—')} con p = ${fmtP(p)}: ${significant ? 'le curve non sono compatibili con l’ipotesi di uguale sopravvivenza.' : 'non c’è evidenza che le curve differiscano.'}`,
                Number.isFinite(hr)
                  ? `Hazard ratio = ${fmtEst(hr, 3)} (${String(logRank.find(row => String(row.metric).startsWith('HR CI low'))?.value ?? '—')} – ${String(logRank.find(row => String(row.metric).startsWith('HR CI high'))?.value ?? '—')}): ${hr > 1 ? 'il primo gruppo ha un rischio di evento maggiore.' : 'il primo gruppo ha un rischio di evento minore.'}`
                  : 'Con più di due gruppi l’hazard ratio non è riportato: usa la regressione di Cox per un HR aggiustato.',
              ]
            : ['Seleziona una variabile di gruppo per confrontare due o più curve con il log-rank.'],
      },
      {
        heading: 'Assunzioni e cautele',
        bullets: [
          'Censura non informativa: chi esce dallo studio non deve avere un rischio diverso da chi resta.',
          'Il tempo zero deve essere definito in modo omogeneo per tutte le osservazioni.',
          'La curva diventa imprecisa nelle code, dove restano poche osservazioni a rischio: guarda la colonna “a rischio”.',
          'Il log-rank dà lo stesso peso a tutti i tempi; se il rischio cambia nel tempo (curve che si incrociano) può non vedere differenze reali.',
          'Con pochi eventi per gruppo il test ha poca potenza e l’HR è instabile.',
        ],
      },
    ],
    limitations: [
      'Il log-rank non aggiusta per covariariate: per hazard ratio aggiustati o per più di due gruppi usa la scheda Cox (PH).',
      'Non sono stimati modelli parametrici (Weibull, esponenziale) con dati censurati.',
      'Il log-rank assume rischi proporzionali: curve che si incrociano richiedono altri test.',
      'L’hazard ratio è riportato solo per due gruppi.',
      'I tempi di censura coincidenti con un evento sono trattati come eventi allo stesso tempo (nessuna correzione per i ties oltre alla gestione standard del risk set).',
    ],
  };
};
