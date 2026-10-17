import { jStat } from './jstat';
import { parseNum, pairedValues, pooledTTest, welchTTest } from './core';
import type { TableSpec } from './types';
import { calcMannWhitneyU, calcWilcoxonSignedRank } from '../statsHelpers';
import {
  bootstrapCI,
  chi2SF,
  cohensD,
  dCI,
  dStandardError,
  hedgesCorrection,
  kendallP,
  leveneTest,
  meanCI,
  pairedDStandardError,
  pooledSD,
  tCrit,
  twoSidedTP,
  lillieforsTest,
} from './distributions';
import { fmtEst, interpretD, interpretR } from './format';

export interface TTestTablesOptions {
  type: 'one' | 'ind' | 'dep';
  rows: string[][];
  i1: number;
  i2: number;
  name1: string;
  name2: string;
  mu: number;
  equalVar: boolean;
  level: number;
  useNonParam: boolean;
}

const sampleRow = (
  group: string,
  values: number[],
  level: number,
  missing: number
) => {
  const ci = meanCI(values, level);
  return {
    group,
    n: values.length,
    missing,
    mean: ci.mean,
    sd: jStat.stdev(values, true),
    se: ci.se,
    median: jStat.median(values),
    min: values.length ? jStat.min(values) : NaN,
    max: values.length ? jStat.max(values) : NaN,
    ciLo: ci.lo,
    ciHi: ci.hi,
  };
};

const jbRow = (label: string, values: number[]) => {
  const n = values.length;
  const skew = n >= 3 ? jStat.skewness(values) : NaN;
  const kurt = n >= 3 ? jStat.kurtosis(values) : NaN;
  const stat = (n / 6) * (skew * skew + (kurt * kurt) / 4);
  return {
    check: label,
    statistic: stat,
    df1: 2,
    df2: NaN,
    p: chi2SF(stat, 2),
    note: `JB su N = ${n}`,
  };
};

export const ttestTables = (options: TTestTablesOptions): TableSpec[] => {
  const { type, rows, i1, i2, name1, name2, mu, equalVar, level, useNonParam } = options;

  const a1 = rows.map(row => parseNum(row[i1])).filter(value => !isNaN(value));
  const a2 = type === 'one' ? [] : rows.map(row => parseNum(row[i2])).filter(value => !isNaN(value));
  const paired = type === 'dep' ? pairedValues(rows, i1, i2) : { a: [] as number[], b: [] as number[] };

  const tables: TableSpec[] = [];

  const sampleRows =
    type === 'one'
      ? [sampleRow(name1, a1, level, rows.length - a1.length)]
      : type === 'ind'
        ? [
            sampleRow(name1, a1, level, rows.length - a1.length),
            sampleRow(name2, a2, level, rows.length - a2.length),
          ]
        : [
            sampleRow(name1, paired.a, level, rows.length - paired.a.length),
            sampleRow(name2, paired.b, level, rows.length - paired.a.length),
          ];

  tables.push({
    id: 'ttest-sample',
    title: 'Campione e statistiche descrittive',
    subtitle: `CI ${level}%`,
    columns: [
      { key: 'group', label: 'Gruppo', format: 'text' },
      { key: 'n', label: 'N', format: 'int' },
      { key: 'missing', label: 'Missing', format: 'int' },
      { key: 'mean', label: 'Mean', format: 'dec4' },
      { key: 'sd', label: 'SD', format: 'dec4' },
      { key: 'se', label: 'SE', format: 'dec4' },
      { key: 'median', label: 'Median', format: 'dec4' },
      { key: 'min', label: 'Min', format: 'dec4' },
      { key: 'max', label: 'Max', format: 'dec4' },
      { key: 'ciLo', label: 'CI low', format: 'dec4' },
      { key: 'ciHi', label: 'CI high', format: 'dec4' },
    ],
    rows: sampleRows,
    notes:
      type === 'dep'
        ? [
            `Solo righe con entrambe le colonne numeriche: ${paired.a.length} coppie complete, ${rows.length - paired.a.length} coppie escluse.`,
            'Le statistiche descrittive dei gruppi sono calcolate sulle sole coppie complete, per coerenza con il test.',
          ]
        : ['Missing = celle vuote o non numeriche escluse dal calcolo.'],
  });

  // -------------------------------------------------------------------------
  // Main test
  // -------------------------------------------------------------------------
  if (type === 'one') {
    const n = a1.length;
    const mean = jStat.mean(a1);
    const sd = jStat.stdev(a1, true);
    const se = sd / Math.sqrt(n);
    const t = se > 0 ? (mean - mu) / se : NaN;
    const df = n - 1;
    const p = twoSidedTP(t, df);
    const crit = n > 1 ? tCrit(level, df) : NaN;
    const diff = mean - mu;
    const d = sd > 0 ? diff / sd : NaN;
    const dSe = pairedDStandardError(d, n);
    const g = d * (1 - 3 / (4 * n - 5));
    const rPoint = isFinite(t) ? t / Math.sqrt(t * t + df) : NaN;

    tables.push({
      id: 'ttest-main',
      title: 'Test t per un campione',
      subtitle: `H₀: μ = ${mu} · due code · α = ${(1 - level / 100).toFixed(2)}`,
      columns: [
        { key: 'comparison', label: 'Confronto', format: 'text' },
        { key: 'diff', label: 'Mean − μ₀', format: 'dec4' },
        { key: 'se', label: 'SE diff', format: 'dec4' },
        { key: 't', label: 't', format: 'dec3' },
        { key: 'df', label: 'df', format: 'dec2' },
        { key: 'p', label: 'p (2 code)', format: 'p' },
        { key: 'pOne', label: 'p (1 coda)', format: 'p' },
        { key: 'ciLo', label: 'CI low', format: 'dec4' },
        { key: 'ciHi', label: 'CI high', format: 'dec4' },
      ],
      rows: [
        {
          comparison: `${name1} vs μ₀`,
          diff,
          se,
          t,
          df,
          p,
          pOne: p / 2,
          ciLo: diff - crit * se,
          ciHi: diff + crit * se,
        },
      ],
      notes: [
        `CI della differenza: (M − μ₀) ± t(${level}%, df = ${df}) · SE.`,
        'p a una coda riferito alla direzione osservata (metà del p a due code).',
      ],
    });

    tables.push({
      id: 'ttest-effects',
      title: 'Effect size',
      columns: [
        { key: 'measure', label: 'Misura', format: 'text' },
        { key: 'estimate', label: 'Stima', format: 'dec3' },
        { key: 'ciLo', label: 'CI low', format: 'dec3' },
        { key: 'ciHi', label: 'CI high', format: 'dec3' },
        { key: 'note', label: 'Interpretazione', format: 'text' },
      ],
      rows: [
        { measure: "Cohen's d (one-sample)", estimate: d, ciLo: dCI(d, dSe, level).lo, ciHi: dCI(d, dSe, level).hi, note: interpretD(d) },
        { measure: 'Hedges g', estimate: g, ciLo: dCI(g, dSe, level).lo, ciHi: dCI(g, dSe, level).hi, note: interpretD(g) },
        { measure: 'r punto-biseriale', estimate: rPoint, ciLo: NaN, ciHi: NaN, note: interpretR(rPoint) },
        { measure: 'r²', estimate: rPoint * rPoint, ciLo: NaN, ciHi: NaN, note: 'quota di varianza spiegata' },
      ],
      notes: [
        "d = (M − μ₀) / SD; SE(d) ≈ √(1/N + d²/(2N)); CI normale approssimato.",
        'Hedges g applica il fattore di correzione per campioni piccoli J = 1 − 3/(4N − 5).',
      ],
    });

    const lilliefors = lillieforsTest(a1);
    tables.push({
      id: 'ttest-assumptions',
      title: 'Assunzioni',
      columns: [
        { key: 'check', label: 'Controllo', format: 'text' },
        { key: 'statistic', label: 'Statistica', format: 'dec4' },
        { key: 'df1', label: 'df1', format: 'dec2' },
        { key: 'df2', label: 'df2', format: 'dec2' },
        { key: 'p', label: 'p', format: 'p' },
        { key: 'note', label: 'Nota', format: 'text' },
      ],
      rows: [
        jbRow('Jarque–Bera', a1),
        { check: 'Lilliefors (KS)', statistic: lilliefors.d, df1: NaN, df2: NaN, p: lilliefors.p, note: 'normalità con parametri stimati' },
      ],
      notes: ['Con N piccolo i test di normalità hanno potenza limitata: valutare anche il Q-Q plot.'],
    });

    if (useNonParam && a1.filter(value => value !== mu).length >= 3) {
      const wilcox = calcWilcoxonSignedRank(a1, mu);
      const nEff = wilcox.nEffective;
      const rWilcox = nEff > 0 ? wilcox.zStat / Math.sqrt(nEff) : NaN;
      const rb = wilcox.posRankSum + wilcox.negRankSum > 0
        ? (wilcox.posRankSum - wilcox.negRankSum) / (wilcox.posRankSum + wilcox.negRankSum)
        : NaN;
      const hl = jStat.median(a1.map(v => v - mu));
      const hlCI = bootstrapCI(rnd => {
        const sample = Array.from({ length: nEff || a1.length }, () => a1[Math.floor(rnd() * a1.length)]);
        return jStat.median(sample.map(v => v - mu));
      }, level, 500);
      tables.push({
        id: 'ttest-wilcoxon',
        title: 'Wilcoxon signed-rank (non parametrico)',
        subtitle: `H₀: mediana = ${mu}`,
        columns: [
          { key: 'nEff', label: 'N effettivo', format: 'int' },
          { key: 'wPlus', label: 'W⁺', format: 'dec2' },
          { key: 'wMinus', label: 'W⁻', format: 'dec2' },
          { key: 'w', label: 'W', format: 'dec2' },
          { key: 'z', label: 'z', format: 'dec3' },
          { key: 'p', label: 'p', format: 'p' },
          { key: 'r', label: 'r = z/√N', format: 'dec3' },
          { key: 'rb', label: 'Rank-biserial', format: 'dec3' },
        ],
        rows: [
          { nEff, wPlus: wilcox.posRankSum, wMinus: wilcox.negRankSum, w: wilcox.wStat, z: wilcox.zStat, p: wilcox.pValue, r: rWilcox, rb },
        ],
        notes: [
          'Approssimazione normale con correzione di continuità e correzione per i ranghi pari; differenze nulle escluse.',
          'W riportato = min(W⁺, W⁻); r = z/√N è la dimensione dell’effetto; rank-biserial = (W⁺ − W⁻)/(W⁺ + W⁻).',
        ],
      });
      tables.push({
        id: 'ttest-hl',
        title: 'Hodges–Lehmann',
        columns: [
          { key: 'estimate', label: 'Stima', format: 'dec4' },
          { key: 'ciLo', label: 'CI low', format: 'dec4' },
          { key: 'ciHi', label: 'CI high', format: 'dec4' },
          { key: 'method', label: 'Metodo', format: 'text' },
        ],
        rows: [{ estimate: hl, ciLo: hlCI.lo, ciHi: hlCI.hi, method: 'mediana delle differenze; CI bootstrap percentile' }],
        notes: ['CI bootstrap con 500 repliche e seed fisso; può differire leggermente da software che usa il metodo esatto.'],
      });
    }
  } else if (type === 'ind') {
    const n1 = a1.length;
    const n2 = a2.length;
    const m1 = jStat.mean(a1);
    const m2 = jStat.mean(a2);
    const sd1 = jStat.stdev(a1, true);
    const sd2 = jStat.stdev(a2, true);
    const diff = m1 - m2;
    const pooled = pooledTTest(a1, a2);
    const welch = welchTTest(a1, a2);
    const used = equalVar ? pooled : welch;
    const df = used.df;
    const crit = tCrit(level, df);
    const sp = pooledSD(a1, a2);
    const d = cohensD(m1, m2, sp);
    const dSe = dStandardError(d, n1, n2);
    const g = d * hedgesCorrection(n1, n2);
    const glass = sd1 > 0 ? diff / sd1 : NaN;
    const rPoint = isFinite(used.t) ? used.t / Math.sqrt(used.t * used.t + df) : NaN;
    const dCi = dCI(d, dSe, level);

    tables.push({
      id: 'ttest-main',
      title: equalVar ? 'Test t per campioni indipendenti (varianze uguali)' : 'Test t di Welch (varianze diseguali)',
      subtitle: `H₀: μ₁ = μ₂ · due code · α = ${(1 - level / 100).toFixed(2)}`,
      columns: [
        { key: 'comparison', label: 'Confronto', format: 'text' },
        { key: 'diff', label: 'Mean diff (A − B)', format: 'dec4' },
        { key: 'se', label: 'SE diff', format: 'dec4' },
        { key: 't', label: 't', format: 'dec3' },
        { key: 'df', label: 'df', format: 'dec2' },
        { key: 'p', label: 'p (2 code)', format: 'p' },
        { key: 'pOne', label: 'p (1 coda)', format: 'p' },
        { key: 'ciLo', label: 'CI low', format: 'dec4' },
        { key: 'ciHi', label: 'CI high', format: 'dec4' },
      ],
      rows: [
        {
          comparison: `${name1} − ${name2}`,
          diff,
          se: used.se,
          t: used.t,
          df,
          p: used.p,
          pOne: used.p / 2,
          ciLo: diff - crit * used.se,
          ciHi: diff + crit * used.se,
        },
      ],
      notes: [
        equalVar
          ? `Varianza pooled: sp² = ((n₁−1)s₁² + (n₂−1)s₂²)/(n₁+n₂−2); df = ${df}.`
          : `Welch–Satterthwaite: SE = √(s₁²/n₁ + s₂²/n₂); df = ${fmtEst(df, 2)}.`,
        `CI della differenza: diff ± t(${level}%, df) · SE.`,
      ],
    });

    tables.push({
      id: 'ttest-effects',
      title: 'Effect size',
      columns: [
        { key: 'measure', label: 'Misura', format: 'text' },
        { key: 'estimate', label: 'Stima', format: 'dec3' },
        { key: 'ciLo', label: 'CI low', format: 'dec3' },
        { key: 'ciHi', label: 'CI high', format: 'dec3' },
        { key: 'note', label: 'Interpretazione', format: 'text' },
      ],
      rows: [
        { measure: "Cohen's d (pooled)", estimate: d, ciLo: dCi.lo, ciHi: dCi.hi, note: interpretD(d) },
        { measure: 'Hedges g', estimate: g, ciLo: dCI(g, dSe, level).lo, ciHi: dCI(g, dSe, level).hi, note: interpretD(g) },
        { measure: 'Glass Δ (SD gruppo A)', estimate: glass, ciLo: NaN, ciHi: NaN, note: interpretD(glass) },
        { measure: 'r punto-biseriale', estimate: rPoint, ciLo: NaN, ciHi: NaN, note: interpretR(rPoint) },
        { measure: 'r²', estimate: rPoint * rPoint, ciLo: NaN, ciHi: NaN, note: 'quota di varianza spiegata' },
      ],
      notes: [
        'd = (M₁ − M₂)/sp; SE(d) ≈ √((n₁+n₂)/(n₁n₂) + d²/(2(n₁+n₂))).',
        'Hedges g = d · J, J = 1 − 3/(4(n₁+n₂) − 9). Glass usa la SD del gruppo A come riferimento.',
      ],
    });

    const levene = leveneTest([a1, a2], 'mean');
    const brownForsythe = leveneTest([a1, a2], 'median');
    tables.push({
      id: 'ttest-assumptions',
      title: 'Assunzioni',
      columns: [
        { key: 'check', label: 'Controllo', format: 'text' },
        { key: 'statistic', label: 'Statistica', format: 'dec4' },
        { key: 'df1', label: 'df1', format: 'dec2' },
        { key: 'df2', label: 'df2', format: 'dec2' },
        { key: 'p', label: 'p', format: 'p' },
        { key: 'note', label: 'Nota', format: 'text' },
      ],
      rows: [
        { check: 'Levene (media)', statistic: levene.stat, df1: levene.df1, df2: levene.df2, p: levene.p, note: 'omoschedasticità' },
        { check: 'Brown–Forsythe (mediana)', statistic: brownForsythe.stat, df1: brownForsythe.df1, df2: brownForsythe.df2, p: brownForsythe.p, note: 'robusto agli outlier' },
        jbRow(`Jarque–Bera ${name1}`, a1),
        jbRow(`Jarque–Bera ${name2}`, a2),
      ],
      notes: [
        levene.p < 0.05
          ? 'Levene significativo: l’assunzione di varianze uguali è dubbia, preferire Welch.'
          : 'Nessuna evidenza di eteroschedasticità a questo livello.',
      ],
    });

    if (useNonParam) {
      const mw = calcMannWhitneyU(a1, a2);
      const u1 = mw.sumRank1 - (n1 * (n1 + 1)) / 2;
      const u2 = n1 * n2 - u1;
      const cles = u1 / (n1 * n2);
      const rb = 2 * cles - 1;
      const hl = jStat.median(
        a1.flatMap(x => a2.map(y => x - y))
      );
      const hlCI = bootstrapCI(rnd => {
        const sampleA = Array.from({ length: n1 }, () => a1[Math.floor(rnd() * n1)]);
        const sampleB = Array.from({ length: n2 }, () => a2[Math.floor(rnd() * n2)]);
        return jStat.median(sampleA.flatMap(x => sampleB.map(y => x - y)));
      }, level, 400);

      tables.push({
        id: 'ttest-mannwhitney',
        title: 'Mann–Whitney U (non parametrico)',
        columns: [
          { key: 'group', label: 'Gruppo', format: 'text' },
          { key: 'n', label: 'N', format: 'int' },
          { key: 'rankSum', label: 'Rank sum', format: 'dec2' },
          { key: 'meanRank', label: 'Mean rank', format: 'dec2' },
          { key: 'u', label: 'U', format: 'dec2' },
          { key: 'z', label: 'z', format: 'dec3' },
          { key: 'p', label: 'p', format: 'p' },
          { key: 'cles', label: 'CLES', format: 'dec3' },
          { key: 'rb', label: 'Rank-biserial', format: 'dec3' },
        ],
        rows: [
          { group: name1, n: n1, rankSum: mw.sumRank1, meanRank: mw.meanRank1, u: u1, z: mw.zStat, p: mw.pValue, cles, rb },
          { group: name2, n: n2, rankSum: mw.sumRank2, meanRank: mw.meanRank2, u: u2, z: NaN, p: NaN, cles: NaN, rb: NaN },
        ],
        notes: [
          'U riportato per ciascun gruppo (U₁ + U₂ = n₁·n₂); la significatività usa U = min(U₁, U₂) con approssimazione normale, correzione di continuità e correzione dei ranghi pari.',
          'CLES = U₁/(n₁n₂) = probabilità che un valore del gruppo A superi uno del gruppo B; rank-biserial = 2·CLES − 1.',
        ],
      });

      tables.push({
        id: 'ttest-hl',
        title: 'Hodges–Lehmann',
        columns: [
          { key: 'estimate', label: 'Stima (A − B)', format: 'dec4' },
          { key: 'ciLo', label: 'CI low', format: 'dec4' },
          { key: 'ciHi', label: 'CI high', format: 'dec4' },
          { key: 'method', label: 'Metodo', format: 'text' },
        ],
        rows: [{ estimate: hl, ciLo: hlCI.lo, ciHi: hlCI.hi, method: 'mediana di tutte le differenze A − B; CI bootstrap percentile' }],
        notes: ['CI bootstrap con 400 repliche e seed fisso.'],
      });
    }
  } else {
    const n = paired.a.length;
    const diffs = paired.a.map((value, index) => value - paired.b[index]);
    const meanDiff = jStat.mean(diffs);
    const sdDiff = jStat.stdev(diffs, true);
    const se = sdDiff / Math.sqrt(n);
    const t = se > 0 ? meanDiff / se : NaN;
    const df = n - 1;
    const p = twoSidedTP(t, df);
    const crit = n > 1 ? tCrit(level, df) : NaN;
    const dz = sdDiff > 0 ? meanDiff / sdDiff : NaN;
    const dzSe = pairedDStandardError(dz, n);
    const gz = dz * (1 - 3 / (4 * n - 5));
    const rPairs = n >= 3 ? jStat.corrcoeff(paired.a, paired.b) : NaN;

    tables.push({
      id: 'ttest-main',
      title: 'Test t per campioni appaiati',
      subtitle: `H₀: μ_diff = 0 · due code · α = ${(1 - level / 100).toFixed(2)}`,
      columns: [
        { key: 'comparison', label: 'Confronto', format: 'text' },
        { key: 'diff', label: 'Mean diff (A − B)', format: 'dec4' },
        { key: 'se', label: 'SE diff', format: 'dec4' },
        { key: 't', label: 't', format: 'dec3' },
        { key: 'df', label: 'df', format: 'dec2' },
        { key: 'p', label: 'p (2 code)', format: 'p' },
        { key: 'pOne', label: 'p (1 coda)', format: 'p' },
        { key: 'ciLo', label: 'CI low', format: 'dec4' },
        { key: 'ciHi', label: 'CI high', format: 'dec4' },
      ],
      rows: [
        {
          comparison: `${name1} − ${name2}`,
          diff: meanDiff,
          se,
          t,
          df,
          p,
          pOne: p / 2,
          ciLo: meanDiff - crit * se,
          ciHi: meanDiff + crit * se,
        },
      ],
      notes: [
        `Differenze calcolate riga per riga su ${n} coppie complete; le righe con una cella mancante sono escluse dall’intero test.`,
        `CI: diff ± t(${level}%, df = ${df}) · SE.`,
      ],
    });

    tables.push({
      id: 'ttest-effects',
      title: 'Effect size',
      columns: [
        { key: 'measure', label: 'Misura', format: 'text' },
        { key: 'estimate', label: 'Stima', format: 'dec3' },
        { key: 'ciLo', label: 'CI low', format: 'dec3' },
        { key: 'ciHi', label: 'CI high', format: 'dec3' },
        { key: 'note', label: 'Interpretazione', format: 'text' },
      ],
      rows: [
        { measure: "Cohen's d_z", estimate: dz, ciLo: dCI(dz, dzSe, level).lo, ciHi: dCI(dz, dzSe, level).hi, note: interpretD(dz) },
        { measure: 'Hedges g_z', estimate: gz, ciLo: dCI(gz, dzSe, level).lo, ciHi: dCI(gz, dzSe, level).hi, note: interpretD(gz) },
        { measure: 'r tra le coppie', estimate: rPairs, ciLo: NaN, ciHi: NaN, note: interpretR(rPairs) },
        { measure: 'r²', estimate: rPairs * rPairs, ciLo: NaN, ciHi: NaN, note: 'quota di varianza condivisa' },
      ],
      notes: [
        'd_z = media delle differenze / SD delle differenze; SE(d_z) ≈ √(1/n + d_z²/(2n)).',
        'La correlazione tra le coppie descrive l’accoppiamento, non l’effetto del trattamento.',
      ],
    });

    const jbDiffs = jbRow('Jarque–Bera differenze', diffs);
    const lilliefors = lillieforsTest(diffs);
    tables.push({
      id: 'ttest-assumptions',
      title: 'Assunzioni',
      columns: [
        { key: 'check', label: 'Controllo', format: 'text' },
        { key: 'statistic', label: 'Statistica', format: 'dec4' },
        { key: 'df1', label: 'df1', format: 'dec2' },
        { key: 'df2', label: 'df2', format: 'dec2' },
        { key: 'p', label: 'p', format: 'p' },
        { key: 'note', label: 'Nota', format: 'text' },
      ],
      rows: [
        jbDiffs,
        { check: 'Lilliefors differenze', statistic: lilliefors.d, df1: NaN, df2: NaN, p: lilliefors.p, note: 'normalità delle differenze' },
      ],
      notes: ['Il test t appaiato assume normalità delle differenze, non delle due variabili separatamente.'],
    });

    if (useNonParam && diffs.filter(value => value !== 0).length >= 3) {
      const wilcox = calcWilcoxonSignedRank(diffs, 0);
      const nEff = wilcox.nEffective;
      const rWilcox = nEff > 0 ? wilcox.zStat / Math.sqrt(nEff) : NaN;
      const rb = wilcox.posRankSum + wilcox.negRankSum > 0
        ? (wilcox.posRankSum - wilcox.negRankSum) / (wilcox.posRankSum + wilcox.negRankSum)
        : NaN;
      const hl = jStat.median(diffs);
      const hlCI = bootstrapCI(rnd => {
        const sample = Array.from({ length: n }, () => diffs[Math.floor(rnd() * n)]);
        return jStat.median(sample);
      }, level, 500);

      tables.push({
        id: 'ttest-wilcoxon',
        title: 'Wilcoxon signed-rank (non parametrico)',
        subtitle: 'H₀: mediana delle differenze = 0',
        columns: [
          { key: 'nEff', label: 'N effettivo', format: 'int' },
          { key: 'wPlus', label: 'W⁺', format: 'dec2' },
          { key: 'wMinus', label: 'W⁻', format: 'dec2' },
          { key: 'w', label: 'W', format: 'dec2' },
          { key: 'z', label: 'z', format: 'dec3' },
          { key: 'p', label: 'p', format: 'p' },
          { key: 'r', label: 'r = z/√N', format: 'dec3' },
          { key: 'rb', label: 'Rank-biserial', format: 'dec3' },
        ],
        rows: [
          { nEff, wPlus: wilcox.posRankSum, wMinus: wilcox.negRankSum, w: wilcox.wStat, z: wilcox.zStat, p: wilcox.pValue, r: rWilcox, rb },
        ],
        notes: ['Approssimazione normale con correzione di continuità e dei ranghi pari; differenze nulle escluse.'],
      });

      tables.push({
        id: 'ttest-hl',
        title: 'Hodges–Lehmann',
        columns: [
          { key: 'estimate', label: 'Stima', format: 'dec4' },
          { key: 'ciLo', label: 'CI low', format: 'dec4' },
          { key: 'ciHi', label: 'CI high', format: 'dec4' },
          { key: 'method', label: 'Metodo', format: 'text' },
        ],
        rows: [{ estimate: hl, ciLo: hlCI.lo, ciHi: hlCI.hi, method: 'mediana delle differenze; CI bootstrap percentile' }],
        notes: ['CI bootstrap con 500 repliche e seed fisso.'],
      });
    }
  }

  return tables;
};
