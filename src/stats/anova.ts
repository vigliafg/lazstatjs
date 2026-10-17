import { jStat } from './jstat';
import { parseNum } from './core';
import type { TableSpec } from './types';
import { calcKruskalWallis } from '../statsHelpers';
import {
  bonferroniAdjust,
  chi2SF,
  dunnTest,
  fSF,
  holmAdjust,
  leveneTest,
  meanCI,
  tCrit,
  twoSidedTP,
  welchAnova,
} from './distributions';
import { interpretD, interpretEta } from './format';

export type PostHocMethod = 'none' | 'tukey' | 'bonferroni' | 'holm' | 'gameshowell';

export interface AnovaTablesOptions {
  rows: string[][];
  depIdx: number;
  grpIdx: number;
  depName: string;
  grpName: string;
  posthoc: PostHocMethod;
  kwPosthoc: 'none' | 'bonferroni' | 'holm';
  level: number;
  useNonParam: boolean;
}

const jbFor = (values: number[]) => {
  const n = values.length;
  if (n < 3) return { stat: NaN, p: NaN };
  const skew = jStat.skewness(values);
  const kurt = jStat.kurtosis(values);
  const stat = (n / 6) * (skew * skew + (kurt * kurt) / 4);
  return { stat, p: chi2SF(stat, 2) };
};

export const anovaTables = (options: AnovaTablesOptions): TableSpec[] => {
  const { rows, depIdx, grpIdx, depName, grpName, posthoc, kwPosthoc, level, useNonParam } = options;

  const groups: { [key: string]: number[] } = {};
  rows.forEach(row => {
    const value = parseNum(row[depIdx]);
    const group = row[grpIdx];
    if (!isNaN(value) && group !== '' && group !== undefined) {
      if (!groups[group]) groups[group] = [];
      groups[group].push(value);
    }
  });

  const keys = Object.keys(groups);
  if (keys.length < 2) return [];

  const allData = Object.values(groups).flat();
  const nTotal = allData.length;
  const k = keys.length;
  const grandMean = jStat.mean(allData);

  let ssBetween = 0;
  let ssWithin = 0;
  keys.forEach(key => {
    const values = groups[key];
    const mean = jStat.mean(values);
    ssBetween += values.length * Math.pow(mean - grandMean, 2);
    values.forEach(value => {
      ssWithin += Math.pow(value - mean, 2);
    });
  });

  const dfBetween = k - 1;
  const dfWithin = nTotal - k;
  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;
  const f = msWithin > 0 ? msBetween / msWithin : NaN;
  const p = fSF(f, dfBetween, dfWithin);
  const ssTotal = ssBetween + ssWithin;

  const eta2 = ssTotal > 0 ? ssBetween / ssTotal : NaN;
  const omega2 = ssTotal + msWithin > 0 ? (ssBetween - (k - 1) * msWithin) / (ssTotal + msWithin) : NaN;
  const epsilon2 = ssTotal > 0 ? (ssBetween - (k - 1) * msWithin) / ssTotal : NaN;
  const cohenF = eta2 >= 0 && eta2 < 1 ? Math.sqrt(eta2 / (1 - eta2)) : NaN;

  const tables: TableSpec[] = [];

  // -------------------------------------------------------------------------
  // Group descriptives
  // -------------------------------------------------------------------------
  tables.push({
    id: 'anova-groups',
    title: 'Descrittive per gruppo',
    subtitle: `${depName} per ${grpName} · CI ${level}%`,
    columns: [
      { key: 'group', label: 'Gruppo', format: 'text' },
      { key: 'n', label: 'N', format: 'int' },
      { key: 'mean', label: 'Mean', format: 'dec4' },
      { key: 'sd', label: 'SD', format: 'dec4' },
      { key: 'se', label: 'SE', format: 'dec4' },
      { key: 'median', label: 'Median', format: 'dec4' },
      { key: 'min', label: 'Min', format: 'dec4' },
      { key: 'max', label: 'Max', format: 'dec4' },
      { key: 'ciLo', label: 'CI low', format: 'dec4' },
      { key: 'ciHi', label: 'CI high', format: 'dec4' },
    ],
    rows: keys.map(key => {
      const values = groups[key];
      const ci = meanCI(values, level);
      return {
        group: key,
        n: values.length,
        mean: ci.mean,
        sd: jStat.stdev(values, true),
        se: ci.se,
        median: jStat.median(values),
        min: jStat.min(values),
        max: jStat.max(values),
        ciLo: ci.lo,
        ciHi: ci.hi,
      };
    }),
    notes: ['CI della media entro gruppo: t di Student con df = n_gruppo − 1.'],
  });

  // -------------------------------------------------------------------------
  // ANOVA table
  // -------------------------------------------------------------------------
  tables.push({
    id: 'anova-table',
    title: 'ANOVA a una via',
    subtitle: `H₀: tutte le medie uguali · α = ${(1 - level / 100).toFixed(2)}`,
    columns: [
      { key: 'source', label: 'Source', format: 'text' },
      { key: 'ss', label: 'SS', format: 'dec4' },
      { key: 'df', label: 'df', format: 'int' },
      { key: 'ms', label: 'MS', format: 'dec4' },
      { key: 'f', label: 'F', format: 'dec3' },
      { key: 'p', label: 'p', format: 'p' },
    ],
    rows: [
      { source: 'Between (gruppi)', ss: ssBetween, df: dfBetween, ms: msBetween, f, p },
      { source: 'Within (errore)', ss: ssWithin, df: dfWithin, ms: msWithin, f: NaN, p: NaN },
      { source: 'Total', ss: ssTotal, df: nTotal - 1, ms: NaN, f: NaN, p: NaN },
    ],
    notes: [`F = MS_between / MS_within; p da F(${dfBetween}, ${dfWithin}).`],
  });

  tables.push({
    id: 'anova-effects',
    title: 'Effect size',
    columns: [
      { key: 'measure', label: 'Misura', format: 'text' },
      { key: 'estimate', label: 'Stima', format: 'dec4' },
      { key: 'note', label: 'Interpretazione', format: 'text' },
    ],
    rows: [
      { measure: 'η²', estimate: eta2, note: interpretEta(eta2) },
      { measure: 'partial η²', estimate: eta2, note: interpretEta(eta2) },
      { measure: 'ω²', estimate: omega2, note: interpretEta(omega2) },
      { measure: 'ε²', estimate: epsilon2, note: interpretEta(epsilon2) },
      { measure: "Cohen's f", estimate: cohenF, note: cohenF < 0.25 ? 'piccolo' : cohenF < 0.4 ? 'medio' : 'grande' },
    ],
    notes: [
      'η² = SS_between / SS_total; ω² = (SS_between − (k−1)·MS_within)/(SS_total + MS_within); ε² = (SS_between − (k−1)·MS_within)/SS_total.',
      'In un ANOVA a una via partial η² coincide con η².',
    ],
  });

  // -------------------------------------------------------------------------
  // Assumptions
  // -------------------------------------------------------------------------
  const levene = leveneTest(keys.map(key => groups[key]), 'mean');
  const brownForsythe = leveneTest(keys.map(key => groups[key]), 'median');
  const welch = welchAnova(keys.map(key => groups[key]));
  const groupSds = keys.map(key => jStat.stdev(groups[key], true)).filter(value => isFinite(value));
  const minSd = groupSds.length ? Math.min(...groupSds) : NaN;
  const sdRatio = minSd > 0 ? Math.max(...groupSds) / minSd : NaN;
  const assumptionRows: { [key: string]: any }[] = [
    { check: 'Levene (media)', statistic: levene.stat, df1: levene.df1, df2: levene.df2, p: levene.p, note: 'omoschedasticità' },
    { check: 'Brown–Forsythe (mediana)', statistic: brownForsythe.stat, df1: brownForsythe.df1, df2: brownForsythe.df2, p: brownForsythe.p, note: 'robusto agli outlier' },
    { check: 'Rapporto SD max/min', statistic: sdRatio, df1: NaN, df2: NaN, p: NaN, note: 'omogeneità descrittiva delle SD' },
    { check: 'Welch ANOVA', statistic: welch.stat, df1: welch.df1, df2: welch.df2, p: welch.p, note: 'alternativa con varianze diseguali' },
  ];
  keys.forEach(key => {
    const jb = jbFor(groups[key]);
    assumptionRows.push({
      check: `Jarque–Bera ${key}`,
      statistic: jb.stat,
      df1: 2,
      df2: NaN,
      p: jb.p,
      note: `normalità residui del gruppo (N = ${groups[key].length})`,
    });
  });

  tables.push({
    id: 'anova-assumptions',
    title: 'Assunzioni',
    columns: [
      { key: 'check', label: 'Controllo', format: 'text' },
      { key: 'statistic', label: 'Statistica', format: 'dec4' },
      { key: 'df1', label: 'df1', format: 'dec2' },
      { key: 'df2', label: 'df2', format: 'dec2' },
      { key: 'p', label: 'p', format: 'p' },
      { key: 'note', label: 'Nota', format: 'text' },
    ],
    rows: assumptionRows,
    notes: [
      levene.p < 0.05
        ? 'Levene significativo: varianze non omogenee. Riportare anche la Welch ANOVA e/o Kruskal-Wallis.'
        : 'Nessuna evidenza di eteroschedasticità.',
      'Il rapporto max(SD)/min(SD) è un ulteriore controllo descrittivo della omogeneità.',
    ],
  });

  // -------------------------------------------------------------------------
  // Post-hoc
  // -------------------------------------------------------------------------
  if (posthoc !== 'none' && k >= 2 && dfWithin > 0) {
    const pairs: {
      a: string;
      b: string;
      diff: number;
      se: number;
      df: number;
      t: number;
      pRaw: number;
      pAdj: number;
      ciLo: number;
      ciHi: number;
      d: number;
    }[] = [];

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];
        const na = groups[a].length;
        const nb = groups[b].length;
        const diff = jStat.mean(groups[a]) - jStat.mean(groups[b]);

        if (posthoc === 'gameshowell') {
          const va = jStat.variance(groups[a], true);
          const vb = jStat.variance(groups[b], true);
          const se = Math.sqrt(va / na + vb / nb);
          const df = Math.pow(va / na + vb / nb, 2) /
            (Math.pow(va / na, 2) / (na - 1) + Math.pow(vb / nb, 2) / (nb - 1));
          const t = se > 0 ? diff / se : NaN;
          pairs.push({ a, b, diff, se, df, t, pRaw: twoSidedTP(t, df), pAdj: NaN, ciLo: NaN, ciHi: NaN, d: NaN });
        } else {
          const se = Math.sqrt(msWithin * (1 / na + 1 / nb));
          const t = se > 0 ? diff / se : NaN;
          pairs.push({ a, b, diff, se, df: dfWithin, t, pRaw: twoSidedTP(t, dfWithin), pAdj: NaN, ciLo: NaN, ciHi: NaN, d: msWithin > 0 ? diff / Math.sqrt(msWithin) : NaN });
        }
      }
    }

    const raw = pairs.map(pair => pair.pRaw);
    let adjusted: number[] = raw;
    if (posthoc === 'holm') adjusted = holmAdjust(raw);
    else if (posthoc === 'bonferroni') adjusted = bonferroniAdjust(raw);
    else adjusted = raw.map(value => Math.min(1, value * raw.length));

    pairs.forEach((pair, index) => {
      pair.pAdj = adjusted[index];
      const crit = tCrit(level, pair.df);
      pair.ciLo = pair.diff - crit * pair.se;
      pair.ciHi = pair.diff + crit * pair.se;
    });

    const labels: { [key in Exclude<PostHocMethod, 'none'>]: string } = {
      tukey: 'Tukey–Kramer (approssimazione Bonferroni)',
      bonferroni: 'Bonferroni',
      holm: 'Holm',
      gameshowell: 'Games–Howell (Welch pairwise)',
    };

    tables.push({
      id: 'anova-posthoc',
      title: 'Post-hoc',
      subtitle: labels[posthoc],
      columns: [
        { key: 'comparison', label: 'Confronto', format: 'text' },
        { key: 'diff', label: 'Mean diff', format: 'dec4' },
        { key: 'se', label: 'SE', format: 'dec4' },
        { key: 't', label: 't', format: 'dec3' },
        { key: 'df', label: 'df', format: 'dec2' },
        { key: 'pRaw', label: 'p non corretto', format: 'p' },
        { key: 'pAdj', label: 'p corretto', format: 'p' },
        { key: 'ciLo', label: 'CI low', format: 'dec4' },
        { key: 'ciHi', label: 'CI high', format: 'dec4' },
        { key: 'd', label: "Cohen's d", format: 'dec3' },
      ],
      rows: pairs.map(pair => ({
        comparison: `${pair.a} vs ${pair.b}`,
        diff: pair.diff,
        se: pair.se,
        t: pair.t,
        df: pair.df,
        pRaw: pair.pRaw,
        pAdj: pair.pAdj,
        ciLo: pair.ciLo,
        ciHi: pair.ciHi,
        d: pair.d,
      })),
      notes: [
        'Tukey–Kramer qui usa l’approssimazione t con aggiustamento Bonferroni: riportato esplicitamente per non spacciarla per il range studentizzato esatto.',
        'I CI sono individuali (non simultanei) al livello scelto; per Holm/Bonferroni il p è corretto, il CI no.',
        'Cohen’s d per confronto usa la SD within pooled (√MS_within).',
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Kruskal-Wallis
  // -------------------------------------------------------------------------
  if (useNonParam) {
    const kw = calcKruskalWallis(groups);
    const etaH = nTotal > k ? Math.max(0, (kw.hStat - k + 1) / (nTotal - k)) : NaN;

    tables.push({
      id: 'anova-kruskal',
      title: 'Kruskal–Wallis H (non parametrico)',
      columns: [
        { key: 'h', label: 'H', format: 'dec3' },
        { key: 'df', label: 'df', format: 'int' },
        { key: 'p', label: 'p', format: 'p' },
        { key: 'etaH', label: 'η²_H', format: 'dec3' },
      ],
      rows: [{ h: kw.hStat, df: kw.df, p: kw.pValue, etaH }],
      notes: ['H corretto per i ranghi pari; η²_H = (H − k + 1)/(N − k) è una dimensione dell’effetto.'],
    });

    tables.push({
      id: 'anova-kruskal-ranks',
      title: 'Ranghi per gruppo',
      columns: [
        { key: 'group', label: 'Gruppo', format: 'text' },
        { key: 'n', label: 'N', format: 'int' },
        { key: 'rankSum', label: 'Rank sum', format: 'dec2' },
        { key: 'meanRank', label: 'Mean rank', format: 'dec2' },
      ],
      rows: keys.map(key => ({
        group: key,
        n: kw.groupNs[key],
        rankSum: kw.groupRankSums[key],
        meanRank: kw.groupMeanRanks[key],
      })),
    });

    if (kwPosthoc !== 'none' && k > 2) {
      const dunn = dunnTest(groups, kwPosthoc);
      tables.push({
        id: 'anova-dunn',
        title: 'Post-hoc Dunn',
        subtitle: kwPosthoc === 'holm' ? 'correzione Holm' : 'correzione Bonferroni',
        columns: [
          { key: 'comparison', label: 'Confronto', format: 'text' },
          { key: 'z', label: 'z', format: 'dec3' },
          { key: 'p', label: 'p non corretto', format: 'p' },
          { key: 'pAdj', label: 'p corretto', format: 'p' },
        ],
        rows: dunn.map(result => ({
          comparison: `${result.a} vs ${result.b}`,
          z: result.z,
          p: result.p,
          pAdj: result.pAdj,
        })),
        notes: ['Dunn usa la varianza dei ranghi con correzione per i pari; p corretto con Holm o Bonferroni.'],
      });
    }
  }

  return tables;
};
