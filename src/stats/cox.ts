import type { TableSpec } from './types';
import type { ReportSpec } from './report';
import { fmtEst, fmtP } from './format';
import { chi2SF, zCrit, zTwoSidedP } from './distributions';
import { describeP, isDecided, tableById } from './reportKit';

/**
 * Cox proportional hazards regression.
 *
 * Partial likelihood with Breslow's handling of tied event times, maximised by
 * Newton–Raphson with step halving. Standard errors come from the inverse
 * observed information; the proportional hazards assumption is checked with a
 * likelihood-ratio test against a model that adds covariate × log(time)
 * interactions (a time-dependent effect test).
 */

export interface CoxCovariate {
  name: string;
  values: number[];
}

export interface CoxOptions {
  time: number[];
  event: number[];
  covariates: CoxCovariate[];
  level?: number;
}

export interface CoxCoefficient {
  term: string;
  beta: number;
  se: number;
  z: number;
  p: number;
  hr: number;
  lo: number;
  hi: number;
}

export interface CoxBaselineRow {
  time: number;
  risk: number;
  events: number;
  hazard: number;
  survival: number;
}

export interface CoxPhRow {
  term: string;
  chi2: number;
  df: number;
  p: number;
}

export interface CoxFit {
  n: number;
  events: number;
  censored: number;
  k: number;
  coefficients: CoxCoefficient[];
  logLik: number;
  logLikNull: number;
  aic: number;
  lr: number;
  lrP: number;
  wald: number;
  waldP: number;
  score: number;
  scoreP: number;
  df: number;
  concordance: number;
  iterations: number;
  converged: boolean;
  separation: boolean;
  baseline: CoxBaselineRow[];
  ph: CoxPhRow[];
  phGlobal: { chi2: number; df: number; p: number };
  warnings: string[];
}

interface PreparedCox {
  times: number[];
  events: number[];
  x: number[][];
  n: number;
  k: number;
  eventTimes: number[];
  eventsAt: number[];
  eventIndices: number[][];
  riskAt: number[];
}

interface PartialLikelihood {
  logLik: number;
  score: number[];
  information: number[][];
}

type Design = (subject: number, atTime: number) => number[];

const zeros = (size: number): number[] => new Array<number>(size).fill(0);

const zeroMatrix = (size: number): number[][] =>
  Array.from({ length: size }, () => new Array<number>(size).fill(0));

const solveLinearSystem = (matrix: number[][], vector: number[]): number[] | null => {
  const size = vector.length;
  if (size === 0) return [];
  const work = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(work[row][column]) > Math.abs(work[pivot][column])) pivot = row;
    }
    if (!(Math.abs(work[pivot][column]) > 1e-12)) return null;
    [work[column], work[pivot]] = [work[pivot], work[column]];
    const scale = work[column][column];
    for (let index = column; index <= size; index++) work[column][index] /= scale;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = work[row][column];
      if (factor === 0) continue;
      for (let index = column; index <= size; index++) work[row][index] -= factor * work[column][index];
    }
  }
  return work.map((row, index) => row[size]);
};

const invertMatrix = (matrix: number[][]): number[][] | null => {
  const size = matrix.length;
  if (size === 0) return [];
  const work = matrix.map((row, index) => [
    ...row,
    ...Array.from({ length: size }, (_, column) => (column === index ? 1 : 0)),
  ]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(work[row][column]) > Math.abs(work[pivot][column])) pivot = row;
    }
    if (!(Math.abs(work[pivot][column]) > 1e-12)) return null;
    [work[column], work[pivot]] = [work[pivot], work[column]];
    const scale = work[column][column];
    for (let index = 0; index < 2 * size; index++) work[column][index] /= scale;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = work[row][column];
      if (factor === 0) continue;
      for (let index = 0; index < 2 * size; index++) work[row][index] -= factor * work[column][index];
    }
  }
  return work.map(row => row.slice(size));
};

const evaluate = (prepared: PreparedCox, beta: number[], design: Design): PartialLikelihood => {
  const k = beta.length;
  let logLik = 0;
  const score = zeros(k);
  const information = zeroMatrix(k);

  prepared.eventTimes.forEach((atTime, position) => {
    const deaths = prepared.eventsAt[position];
    const rows: number[][] = [];
    const eta: number[] = [];
    for (let subject = 0; subject < prepared.n; subject++) {
      if (prepared.times[subject] < atTime) continue;
      const row = design(subject, atTime);
      rows.push(row);
      let value = 0;
      for (let j = 0; j < k; j++) value += row[j] * beta[j];
      eta.push(value);
    }
    if (rows.length === 0) return;

    let largest = -Infinity;
    for (const value of eta) largest = Math.max(largest, value);
    const weights = eta.map(value => Math.exp(value - largest));
    const s0 = weights.reduce((sum, value) => sum + value, 0);
    if (!(s0 > 0) || !Number.isFinite(s0)) return;

    const s1 = zeros(k);
    const s2 = zeroMatrix(k);
    rows.forEach((row, index) => {
      const weight = weights[index];
      for (let a = 0; a < k; a++) {
        s1[a] += weight * row[a];
        for (let b = 0; b < k; b++) s2[a][b] += weight * row[a] * row[b];
      }
    });

    const mean = s1.map(value => value / s0);
    prepared.eventIndices[position].forEach(subject => {
      const row = design(subject, atTime);
      for (let j = 0; j < k; j++) {
        logLik += row[j] * beta[j];
        score[j] += row[j];
      }
    });
    logLik -= deaths * (largest + Math.log(s0));
    for (let a = 0; a < k; a++) {
      score[a] -= deaths * mean[a];
      for (let b = 0; b < k; b++) {
        information[a][b] += deaths * (s2[a][b] / s0 - mean[a] * mean[b]);
      }
    }
  });

  return { logLik, score, information };
};

interface PartialFit extends PartialLikelihood {
  beta: number[];
  iterations: number;
  converged: boolean;
}

const fitPartial = (
  prepared: PreparedCox,
  design: Design,
  size: number,
  initial?: number[],
  maxIterations = 30
): PartialFit => {
  let beta = initial ? initial.slice() : zeros(size);
  let current = evaluate(prepared, beta, design);
  let converged = false;
  let iterations = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    iterations = iteration;
    const delta = solveLinearSystem(current.information, current.score);
    if (!delta) break;

    let step = 1;
    let accepted = false;
    while (step > 1e-6) {
      const candidate = beta.map((value, index) => value + step * delta[index]);
      const next = evaluate(prepared, candidate, design);
      if (Number.isFinite(next.logLik) && next.logLik >= current.logLik - 1e-10) {
        beta = candidate;
        current = next;
        accepted = true;
        break;
      }
      step /= 2;
    }
    if (!accepted) break;
    const change = Math.max(...delta.map(value => Math.abs(value * step)));
    if (change < 1e-9) {
      converged = true;
      break;
    }
  }

  return { beta, ...current, iterations, converged };
};

/** Harrell's concordance index for a set of risk scores. */
export const concordanceIndex = (
  times: number[],
  events: number[],
  scores: number[]
): number => {
  let comparable = 0;
  let concordant = 0;
  for (let i = 0; i < times.length; i++) {
    if (events[i] !== 1) continue;
    for (let j = 0; j < times.length; j++) {
      if (i === j) continue;
      const usable =
        times[i] < times[j] || (times[i] === times[j] && events[j] === 0);
      if (!usable) continue;
      comparable += 1;
      if (scores[i] > scores[j]) concordant += 1;
      else if (scores[i] === scores[j]) concordant += 0.5;
    }
  }
  return comparable > 0 ? concordant / comparable : NaN;
};

export const fitCox = (options: CoxOptions): CoxFit | null => {
  const level = options.level ?? 95;
  const k = options.covariates.length;
  if (k === 0) return null;

  const total = options.time.length;
  if (options.event.length !== total) return null;
  if (options.covariates.some(covariate => covariate.values.length !== total)) return null;

  const warnings: string[] = [];
  const times: number[] = [];
  const events: number[] = [];
  const x: number[][] = [];
  for (let index = 0; index < total; index++) {
    const time = options.time[index];
    const values = options.covariates.map(covariate => covariate.values[index]);
    if (!Number.isFinite(time) || time < 0 || values.some(value => !Number.isFinite(value))) continue;
    times.push(time);
    events.push(options.event[index] === 1 ? 1 : 0);
    x.push(values);
  }

  const n = times.length;
  if (n < k + 2) return null;
  const eventCount = events.reduce((sum, value) => sum + value, 0);
  if (eventCount < k + 2) return null;

  const constant = options.covariates.filter((_, column) =>
    x.every(row => row[column] === x[0][column])
  );
  if (constant.length > 0) {
    warnings.push(`Covariate costanti ignorate: ${constant.map(item => item.name).join(', ')}`);
  }

  const order = Array.from({ length: n }, (_, index) => index).sort((left, right) => times[left] - times[right]);
  const sortedTimes = order.map(index => times[index]);
  const sortedEvents = order.map(index => events[index]);
  const sortedX = order.map(index => x[index]);

  const eventTimes = Array.from(
    new Set(sortedTimes.filter((_, index) => sortedEvents[index] === 1))
  ).sort((left, right) => left - right);
  if (eventTimes.length < 2) return null;

  const eventsAt = eventTimes.map(atTime =>
    sortedTimes.reduce((count, time, index) => count + (time === atTime && sortedEvents[index] === 1 ? 1 : 0), 0)
  );
  const eventIndices = eventTimes.map(atTime =>
    sortedTimes
      .map((time, index) => (time === atTime && sortedEvents[index] === 1 ? index : -1))
      .filter(index => index >= 0)
  );
  const riskAt = eventTimes.map(atTime => sortedTimes.filter(time => time >= atTime).length);

  const prepared: PreparedCox = {
    times: sortedTimes,
    events: sortedEvents,
    x: sortedX,
    n,
    k,
    eventTimes,
    eventsAt,
    eventIndices,
    riskAt,
  };

  const baselineDesign: Design = subject => sortedX[subject];
  const base = fitPartial(prepared, baselineDesign, k);

  const information = base.information;
  const inverse = invertMatrix(information);
  if (!inverse) return null;

  const critical = zCrit(level);
  const coefficients: CoxCoefficient[] = options.covariates.map((covariate, column) => {
    const beta = base.beta[column];
    const variance = inverse[column][column];
    const se = variance > 0 ? Math.sqrt(variance) : NaN;
    const zValue = se > 0 ? beta / se : NaN;
    const logHr = beta;
    return {
      term: covariate.name,
      beta,
      se,
      z: zValue,
      p: Number.isFinite(zValue) ? zTwoSidedP(zValue) : NaN,
      hr: Number.isFinite(beta) ? Math.exp(beta) : NaN,
      lo: Number.isFinite(se) ? Math.exp(logHr - critical * se) : NaN,
      hi: Number.isFinite(se) ? Math.exp(logHr + critical * se) : NaN,
    };
  });

  const separation = coefficients.some(
    coefficient =>
      Math.abs(coefficient.beta) > 8 ||
      !Number.isFinite(coefficient.se) ||
      coefficient.se > 8
  );
  if (separation) {
    warnings.push(
      'Stime molto grandi o errori standard enormi: possibile separazione quasi completa, con hazard ratio instabili.'
    );
  }
  if (!base.converged) {
    warnings.push('L’algoritmo non ha raggiunto la convergenza entro il numero massimo di iterazioni.');
  }

  const nullFit = evaluate(prepared, zeros(k), baselineDesign);
  const lr = Math.max(0, 2 * (base.logLik - nullFit.logLik));
  const lrP = chi2SF(lr, k);
  const wald = Math.max(0, base.beta.reduce((sum, value, row) => {
    let inner = 0;
    for (let column = 0; column < k; column++) inner += information[row][column] * base.beta[column];
    return sum + value * inner;
  }, 0));
  const waldP = chi2SF(wald, k);
  const nullScore = evaluate(prepared, zeros(k), baselineDesign).score;
  const nullInverse = invertMatrix(nullFit.information);
  let score = NaN;
  if (nullInverse) {
    score = Math.max(0, nullScore.reduce((sum, value, row) => {
      let inner = 0;
      for (let column = 0; column < k; column++) inner += nullInverse[row][column] * nullScore[column];
      return sum + value * inner;
    }, 0));
  }
  const scoreP = chi2SF(score, k);

  const riskScores = sortedX.map(row =>
    row.reduce((sum, value, column) => sum + value * base.beta[column], 0)
  );
  const concordance = concordanceIndex(sortedTimes, sortedEvents, riskScores);

  // The baseline is evaluated at the mean covariate profile: evaluating it at
  // zero overflows when covariates live far from the origin (age, scores) and
  // would report a flat hazard of zero.
  const means = Array.from({ length: k }, (_, column) =>
    sortedX.reduce((sum, row) => sum + row[column], 0) / prepared.n
  );
  const centeredEta = (subject: number): number => {
    const row = sortedX[subject];
    let value = 0;
    for (let column = 0; column < k; column++) {
      value += (row[column] - means[column]) * base.beta[column];
    }
    return value;
  };

  const baseline: CoxBaselineRow[] = [];
  let cumulative = 0;
  prepared.eventTimes.forEach((atTime, position) => {
    let s0 = 0;
    for (let subject = 0; subject < prepared.n; subject++) {
      if (prepared.times[subject] < atTime) continue;
      s0 += Math.exp(centeredEta(subject));
    }
    if (s0 > 0 && Number.isFinite(s0)) cumulative += prepared.eventsAt[position] / s0;
    baseline.push({
      time: atTime,
      risk: prepared.riskAt[position],
      events: prepared.eventsAt[position],
      hazard: cumulative,
      survival: Math.exp(-cumulative),
    });
  });

  const ph: CoxPhRow[] = [];
  let phGlobal = { chi2: NaN, df: k, p: NaN };
  if (eventTimes.every(atTime => atTime > 0) && n > 3 * k + 5) {
    const timeDesign: Design = (subject, atTime) => {
      const row = sortedX[subject];
      const logTime = Math.log(atTime);
      return [...row, ...row.map(value => value * logTime)];
    };
    const extended = fitPartial(
      prepared,
      timeDesign,
      2 * k,
      [...base.beta, ...zeros(k)],
      40
    );
    const extendedInverse = invertMatrix(extended.information);
    if (extendedInverse) {
      for (let column = 0; column < k; column++) {
        const beta = extended.beta[k + column];
        const variance = extendedInverse[k + column][k + column];
        const se = variance > 0 ? Math.sqrt(variance) : NaN;
        const zValue = se > 0 ? beta / se : NaN;
        ph.push({
          term: options.covariates[column].name,
          chi2: Number.isFinite(zValue) ? zValue * zValue : NaN,
          df: 1,
          p: Number.isFinite(zValue) ? zTwoSidedP(zValue) : NaN,
        });
      }
      const statistic = Math.max(0, 2 * (extended.logLik - base.logLik));
      phGlobal = { chi2: statistic, df: k, p: chi2SF(statistic, k) };
    }
  }

  return {
    n,
    events: eventCount,
    censored: n - eventCount,
    k,
    coefficients,
    logLik: base.logLik,
    logLikNull: nullFit.logLik,
    aic: -2 * base.logLik + 2 * k,
    lr,
    lrP,
    wald,
    waldP,
    score,
    scoreP,
    df: k,
    concordance,
    iterations: base.iterations,
    converged: base.converged,
    separation,
    baseline,
    ph,
    phGlobal,
    warnings,
  };
};

// ---------------------------------------------------------------------------
// Tables and report
// ---------------------------------------------------------------------------

const PH_SENTENCE = (p: number, level: number): string => {
  if (!Number.isFinite(p)) return 'non verificabile con questi dati';
  return isDecided(p, level)
    ? 'effetto che cambia nel tempo: l’ipotesi di rischi proporzionali è messa in discussione'
    : 'nessuna evidenza contro i rischi proporzionali';
};

export const coxTables = (fit: CoxFit, level: number): TableSpec[] => {
  const tables: TableSpec[] = [];
  const eventsPerVariable = fit.k > 0 ? fit.events / fit.k : NaN;

  tables.push({
    id: 'cox-summary',
    title: 'Sintesi del modello di Cox',
    subtitle: `${fit.n} osservazioni · ${fit.events} eventi · ${fit.k} covariariate`,
    columns: [
      { key: 'metric', label: 'Voce', format: 'text' },
      { key: 'value', label: 'Valore', format: 'text' },
    ],
    rows: [
      { metric: 'Osservazioni', value: String(fit.n), raw: fit.n },
      { metric: 'Eventi', value: String(fit.events), raw: fit.events },
      { metric: 'Censurati', value: String(fit.censored), raw: fit.censored },
      { metric: 'Covariati', value: String(fit.k), raw: fit.k },
      { metric: 'Eventi per covariata', value: fmtEst(eventsPerVariable, 1), raw: eventsPerVariable },
      { metric: 'Log-verosimiglianza', value: fmtEst(fit.logLik, 3), raw: fit.logLik },
      { metric: 'Log-verosimiglianza nulla', value: fmtEst(fit.logLikNull, 3), raw: fit.logLikNull },
      { metric: 'AIC', value: fmtEst(fit.aic, 3), raw: fit.aic },
      { metric: 'Concordanza (C di Harrell)', value: fmtEst(fit.concordance, 3), raw: fit.concordance },
      { metric: 'Iterazioni', value: String(fit.iterations), raw: fit.iterations },
      { metric: 'Convergenza', value: fit.converged ? 'sì' : 'no', raw: NaN },
      ...fit.warnings.map((warning, index) => ({
        metric: `Avviso ${index + 1}`,
        value: warning,
        raw: NaN,
      })),
    ],
    notes: [
      'La verosimiglianza parziale di Cox non richiede di specificare la forma della funzione di rischio di base.',
      'Come regola pratica servono almeno 10 eventi per covariata: sotto questa soglia le stime sono instabili.',
      'La C di Harrell misura la capacità del modello di ordinare i tempi: 0,5 = caso, 1 = ordine perfetto.',
    ],
  });

  tables.push({
    id: 'cox-tests',
    title: 'Test globali sul modello',
    subtitle: 'ipotesi nulla: tutti i coefficienti uguali a zero',
    columns: [
      { key: 'test', label: 'Test', format: 'text' },
      { key: 'statistic', label: 'Statistica', format: 'dec3' },
      { key: 'df', label: 'df', format: 'int' },
      { key: 'p', label: 'p', format: 'p' },
      { key: 'reading', label: 'Lettura', format: 'text' },
    ],
    rows: [
      {
        test: 'Rapporto di verosimiglianza',
        statistic: fit.lr,
        df: fit.df,
        p: fit.lrP,
        reading: isDecided(fit.lrP, level)
          ? 'il modello spiega i tempi meglio del nulla'
          : 'nessuna prova che le covariariate spieghino i tempi',
      },
      {
        test: 'Wald',
        statistic: fit.wald,
        df: fit.df,
        p: fit.waldP,
        reading: isDecided(fit.waldP, level)
          ? 'almeno un coefficiente è diverso da zero'
          : 'nessun coefficiente distinguibile da zero',
      },
      {
        test: 'Score (log-rank generalizzato)',
        statistic: fit.score,
        df: fit.df,
        p: fit.scoreP,
        reading: isDecided(fit.scoreP, level)
          ? 'le covariariate sono associate al rischio già senza stima completa'
          : 'nessuna associazione iniziale rilevante',
      },
    ],
    notes: [
      'Con campioni grandi i tre test convergono; con pochi eventi il rapporto di verosimiglianza è il più affidabile.',
      'Il test score valutato in β = 0 coincide, per una sola covariata dicotomica, con il log-rank.',
    ],
  });

  tables.push({
    id: 'cox-coefficients',
    title: 'Coefficienti e hazard ratio',
    subtitle: `IC ${level}% · HR per un’unità di incremento della covariata`,
    columns: [
      { key: 'term', label: 'Covariata', format: 'text' },
      { key: 'beta', label: 'B', format: 'dec4' },
      { key: 'se', label: 'Errore std.', format: 'dec4' },
      { key: 'z', label: 'z', format: 'dec3' },
      { key: 'p', label: 'p', format: 'p' },
      { key: 'hr', label: 'HR', format: 'dec3' },
      { key: 'lo', label: 'HR low', format: 'dec3' },
      { key: 'hi', label: 'HR high', format: 'dec3' },
    ],
    rows: fit.coefficients.map(coefficient => ({
      term: coefficient.term,
      beta: coefficient.beta,
      se: coefficient.se,
      z: coefficient.z,
      p: coefficient.p,
      hr: coefficient.hr,
      lo: coefficient.lo,
      hi: coefficient.hi,
    })),
    notes: [
      'B è il logaritmo dell’hazard ratio: B > 0 indica rischio maggiore quando la covariata aumenta.',
      'HR = 1 significa nessun effetto; l’intervallo che contiene 1 è coerente con l’assenza di associazione.',
      'I p-value sono test di Wald e non tengono conto dell’incertezza sugli altri coefficienti.',
    ],
  });

  tables.push({
    id: 'cox-ph',
    title: 'Verifica dei rischi proporzionali',
    subtitle: 'test di interazione con log(tempo)',
    columns: [
      { key: 'term', label: 'Termine', format: 'text' },
      { key: 'chi2', label: 'χ²', format: 'dec3' },
      { key: 'df', label: 'df', format: 'int' },
      { key: 'p', label: 'p', format: 'p' },
      { key: 'reading', label: 'Lettura', format: 'text' },
    ],
    rows:
      fit.ph.length > 0
        ? [
            ...fit.ph.map(row => ({
              term: row.term,
              chi2: row.chi2,
              df: row.df,
              p: row.p,
              reading: PH_SENTENCE(row.p, level),
            })),
            {
              term: 'Globale',
              chi2: fit.phGlobal.chi2,
              df: fit.phGlobal.df,
              p: fit.phGlobal.p,
              reading: PH_SENTENCE(fit.phGlobal.p, level),
            },
          ]
        : [
            {
              term: 'Non calcolabile',
              chi2: NaN,
              df: 0,
              p: NaN,
              reading: 'servono più eventi (o tempi tutti positivi) per stimare il modello con interazioni',
            },
          ],
    notes: [
      'Il test aggiunge un coefficiente per covariata × log(t): se quel coefficiente è diverso da zero l’effetto cambia con il tempo.',
      'p grande è ciò che si vuole vedere: indica che l’ipotesi di rischio proporzionale regge.',
      'È un test asintotico e con pochi eventi ha poca potenza: l’assenza di significatività non prova i rischi proporzionali.',
    ],
  });

  tables.push({
    id: 'cox-baseline',
    title: 'Rischio cumulato di base',
    subtitle: 'stimatore di Breslow · profilo medio delle covariariate',
    columns: [
      { key: 'time', label: 'Tempo', format: 'dec2' },
      { key: 'risk', label: 'A rischio', format: 'int' },
      { key: 'events', label: 'Eventi', format: 'int' },
      { key: 'hazard', label: 'H₀(t)', format: 'dec4' },
      { key: 'survival', label: 'S₀(t)', format: 'dec3' },
    ],
    rows: fit.baseline.map(row => ({ ...row })),
    notes: [
      'H₀(t) è il rischio cumulato valutato al profilo medio delle covariariate: un profilo ipotetico ma stabile numericamente anche con età o punteggi lontani da zero.',
      'Per un profilo x la sopravvivenza è S₀(t) elevato a exp((x − x̄)′B): la curva di base non va letta come la sopravvivenza media della coorte.',
    ],
  });

  return tables;
};

export const coxReport = (tables: TableSpec[], level: number): ReportSpec => {
  const summary = tableById(tables, 'cox-summary')?.rows ?? [];
  const coefficients = tableById(tables, 'cox-coefficients')?.rows ?? [];
  const separation = coefficients.some(row => {
    const se = Number(row.se);
    const beta = Number(row.beta);
    const hr = Number(row.hr);
    return !Number.isFinite(se) || se > 8 || Math.abs(beta) > 8 || hr < 1e-3 || hr > 1e3;
  });
  const tests = tableById(tables, 'cox-tests')?.rows ?? [];
  const phRows = tableById(tables, 'cox-ph')?.rows ?? [];

  const value = (name: string): number => Number(summary.find(row => String(row.metric) === name)?.raw ?? NaN);
  const n = value('Osservazioni');
  const events = value('Eventi');
  const concordance = value('Concordanza (C di Harrell)');
  const lrRow = tests.find(row => String(row.test).includes('verosimiglianza'));
  const lr = Number(lrRow?.statistic ?? NaN);
  const lrP = Number(lrRow?.p ?? NaN);
  const significant = isDecided(lrP, level);

  const phGlobalRow = phRows.find(row => String(row.term) === 'Globale');
  const phP = Number(phGlobalRow?.p ?? NaN);
  const phBroken = isDecided(phP, level);

  const strongest = coefficients
    .slice()
    .sort((left, right) => Math.abs(Number(right.z ?? 0)) - Math.abs(Number(left.z ?? 0)))[0];
  const strongestName = strongest ? String(strongest.term) : '';
  const strongestHr = Number(strongest?.hr ?? NaN);

  const hazardSentence = (row: (typeof coefficients)[number]): string => {
    const hr = Number(row.hr);
    const p = Number(row.p);
    const se = Number(row.se);
    if (!Number.isFinite(hr)) return `${String(row.term)}: stima non disponibile.`;
    if (
      !Number.isFinite(se) ||
      se > 8 ||
      Math.abs(Number(row.beta)) > 8 ||
      hr < 1e-3 ||
      hr > 1e3
    ) {
      return `${String(row.term)}: stima instabile (B = ${fmtEst(Number(row.beta), 3)}, errore standard = ${fmtEst(se, 3)}), coerente con separazione quasi completa: l’hazard ratio non è interpretabile.`;
    }
    const direction = hr > 1 ? 'aumenta' : hr < 1 ? 'riduce' : 'non modifica';
    return `${String(row.term)}: HR = ${fmtEst(hr, 3)} (${fmtEst(Number(row.lo), 3)} – ${fmtEst(Number(row.hi), 3)}), ${describeP(p)} → ${isDecided(p, level) ? `un aumento di una unità ${direction} il rischio istantaneo di evento` : 'nessuna associazione affidabile con il rischio'}${Number.isFinite(Number(row.beta)) ? `; B = ${fmtEst(Number(row.beta), 3)}` : ''}.`;
  };

  return {
    id: 'cox',
    title: 'Report di lettura — Regressione di Cox',
    headline: separation
      ? `Stime instabili: ${strongestName} separa quasi completamente gli eventi, quindi l’hazard ratio (B = ${fmtEst(Number(strongest?.beta), 3)}) non è interpretabile.`
      : Number.isFinite(lrP)
        ? significant
          ? `Il modello è significativo (LR χ² = ${fmtEst(lr, 3)}, ${describeP(lrP)}) e la covariata più forte è ${strongestName} (HR = ${fmtEst(strongestHr, 3)}).`
          : `Il modello non è significativo (LR χ² = ${fmtEst(lr, 3)}, ${describeP(lrP)}): le covariariate non spiegano i tempi di evento meglio del caso.`
        : 'Il modello di Cox non è stimabile con i dati disponibili.',
    badge: separation ? 'Stime instabili' : significant ? 'Effetto rilevato' : 'Nessun effetto',
    tone: separation || phBroken ? 'caution' : significant ? 'positive' : 'neutral',
    intro: [
      `La regressione di Cox mette in relazione il tempo fino all’evento con una o più covariariate, senza assumere una forma specifica per il rischio di base.${Number.isFinite(n) ? ` Qui ci sono ${Math.round(n)} osservazioni, ${Math.round(events)} eventi e ${Math.round(n - events)} censurati.` : ''}`,
      'L’hazard ratio confronta il rischio istantaneo di evento per un incremento unitario della covariata, a parità delle altre: HR = 2 significa rischio doppio in ogni istante, non durata doppia.',
    ],
    sections: [
      {
        heading: 'Il modello nel suo insieme',
        bullets: [
          `Rapporto di verosimiglianza: χ² = ${fmtEst(lr, 3)} con ${Math.round(Number(lrRow?.df ?? NaN)) || 1} gradi di libertà, ${describeP(lrP)} (soglia α = ${(1 - level / 100).toFixed(2)}).`,
          `Concordanza C = ${fmtEst(concordance, 3)}: ${Number.isFinite(concordance) ? (concordance < 0.5 ? 'peggio del caso, controlla i segni' : concordance < 0.6 ? 'discriminazione modesta' : concordance < 0.7 ? 'discriminazione discreta' : 'buona capacità di ordinare i tempi') : 'non calcolabile'}.`,
          `Eventi per covariata: ${fmtEst(value('Eventi per covariata'), 1)}. Sotto 10 le stime diventano fragili e il modello può essere sovra-adattato.`,
          `AIC = ${fmtEst(value('AIC'), 3)}: utile solo per confrontare modelli stimati sugli stessi dati.`,
        ],
      },
      {
        heading: 'Ogni covariata',
        bullets:
          coefficients.length > 0
            ? coefficients.map(hazardSentence)
            : ['Nessun coefficiente disponibile.'],
      },
      {
        heading: 'Rischi proporzionali',
        body: [
          phBroken
            ? `Il test globale dà ${describeP(phP)}: l’effetto di almeno una covariata sembra cambiare nel tempo. Il modello resta una sintesi media, ma HR unico e curve di sopravvivenza previste vanno presentati con prudenza; valuta interazioni con il tempo o modelli stratificati.`
            : `Il test globale dà ${describeP(phP)}: non emerge un cambiamento dell’effetto nel tempo, quindi l’ipotesi di rischi proporzionali è compatibile con i dati.`,
          'Il test confronta il modello con uno che aggiunge covariata × log(t): un p piccolo segnala che l’effetto non è costante.',
        ],
      },
      {
        heading: 'Come leggere i numeri',
        bullets: [
          'HR = 1: nessun effetto. HR > 1: rischio maggiore per valori più alti della covariata. HR < 1: effetto protettivo.',
          'IC dell’HR che non contiene 1 è coerente con un test di Wald significativo; l’intervallo è moltiplicativo, quindi 0,5 e 2 sono effetti simmetrici.',
          'I censurati restano a rischio finché sono osservati: Cox usa questa informazione, mentre scartarli o trattarli come eventi distorce le stime.',
          'La C di Harrell misura l’ordinamento dei tempi, non la calibrazione: un modello può ordinare bene e sbagliare le probabilità assolute.',
        ],
      },
      {
        heading: 'In pratica',
        body: [
          separation
            ? 'La stima è al limite della regione ammissibile: una covariata predice quasi perfettamente chi ha l’evento. Il coefficiente e l’hazard ratio non vanno riportati come effetto; riduci le covariariate del modello, controlla se la variabile è una conseguenza dell’esito o usa un test esatto.'
            : significant
              ? `Il profilo di rischio cambia con ${strongestName}: per ogni unità in più l’hazard ratio è ${fmtEst(strongestHr, 3)}. Riporta sempre l’IC e il numero di eventi, e verifica se l’effetto è stabile nei sottogruppi.`
              : 'Le covariariate non mostrano un’associazione affidabile con il tempo di evento. Con pochi eventi il modello ha poca potenza: l’assenza di significatività non dimostra l’assenza di effetto.',
        ],
      },
    ],
    limitations: [
      'I tempi di evento uguali sono gestiti con l’approssimazione di Breslow, che con molti pareggi può sottostimare lievemente gli errori standard.',
      'I rischi proporzionali sono un’assunzione del modello: il test riportato è asintotico e con pochi eventi ha poca potenza.',
      'La relazione tra covariata e log-rischio è assunta lineare: per effetti non lineari servono trasformazioni o spline.',
      'Non sono inclusi covariariate dipendenti dal tempo, effetti casuali, stratificazione o rischi competitivi.',
      'La sopravvivenza di base è valutata al profilo medio delle covariariate e può non corrispondere a un soggetto reale.',
    ],
  };
};
