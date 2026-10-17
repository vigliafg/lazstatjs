import { jStat } from './jstat';
import { parseNum } from './core';
import type { TableSpec } from './types';
import { calcKendallTau } from '../statsHelpers';
import {
  correlationP,
  fisherZCI,
  kendallP,
  rankValues,
  spearmanP,
  twoSidedTP,
} from './distributions';
import { stars, interpretR } from './format';

export interface CorrelationTablesOptions {
  rows: string[][];
  varIdxs: number[];
  varNames: string[];
  level: number;
  method: 'pearson' | 'spearman' | 'kendall';
  showSpearman: boolean;
  showKendall: boolean;
}

interface PairResult {
  a: number;
  b: number;
  n: number;
  pearson: number;
  pearsonP: number;
  pearsonLo: number;
  pearsonHi: number;
  r2: number;
  spearman: number;
  spearmanP: number;
  kendall: number;
  kendallP: number;
}

const pairedColumns = (rows: string[][], i: number, j: number) => {
  const xs: number[] = [];
  const ys: number[] = [];
  rows.forEach(row => {
    const x = parseNum(row[i]);
    const y = parseNum(row[j]);
    if (!isNaN(x) && !isNaN(y)) {
      xs.push(x);
      ys.push(y);
    }
  });
  return { xs, ys, n: xs.length };
};

export const correlationTables = (options: CorrelationTablesOptions): TableSpec[] => {
  const { rows, varIdxs, varNames, level, method, showSpearman, showKendall } = options;
  if (varIdxs.length < 2) return [];

  const pairMap = new Map<string, PairResult>();
  const pairs: PairResult[] = [];

  for (let i = 0; i < varIdxs.length; i++) {
    for (let j = i + 1; j < varIdxs.length; j++) {
      const { xs, ys, n } = pairedColumns(rows, varIdxs[i], varIdxs[j]);
      const pearson = n >= 3 ? jStat.corrcoeff(xs, ys) : NaN;
      const ci = fisherZCI(pearson, n, level);
      const ranksX = n >= 3 ? rankValues(xs) : [];
      const ranksY = n >= 3 ? rankValues(ys) : [];
      const spearman = n >= 3 ? jStat.corrcoeff(ranksX, ranksY) : NaN;
      const kendall = n >= 3 ? calcKendallTau(xs, ys) : NaN;
      const result: PairResult = {
        a: i,
        b: j,
        n,
        pearson,
        pearsonP: correlationP(pearson, n),
        pearsonLo: ci.lo,
        pearsonHi: ci.hi,
        r2: pearson * pearson,
        spearman,
        spearmanP: spearmanP(spearman, n),
        kendall,
        kendallP: kendallP(kendall, n),
      };
      pairs.push(result);
      pairMap.set(`${i}-${j}`, result);
      pairMap.set(`${j}-${i}`, result);
    }
  }

  const tables: TableSpec[] = [];

  const pairColumns = [
    { key: 'a', label: 'Variabile A', format: 'text' as const },
    { key: 'b', label: 'Variabile B', format: 'text' as const },
    { key: 'n', label: 'N', format: 'int' as const },
    { key: 'pearson', label: 'Pearson r', format: 'dec3' as const },
    { key: 'pearsonP', label: 'p', format: 'p' as const },
    { key: 'lo', label: 'CI low', format: 'dec3' as const },
    { key: 'hi', label: 'CI high', format: 'dec3' as const },
    { key: 'r2', label: 'r²', format: 'dec3' as const },
    ...(showSpearman
      ? [
          { key: 'spearman', label: 'Spearman ρ', format: 'dec3' as const },
          { key: 'spearmanP', label: 'p', format: 'p' as const },
        ]
      : []),
    ...(showKendall
      ? [
          { key: 'kendall', label: 'Kendall τ', format: 'dec3' as const },
          { key: 'kendallP', label: 'p', format: 'p' as const },
        ]
      : []),
  ];

  tables.push({
    id: 'corr-pairs',
    title: 'Correlazioni a coppie',
    subtitle: `Metodo primario: ${method} · CI ${level}% · eliminazione pairwise`,
    columns: pairColumns,
    rows: pairs.map(pair => ({
      a: varNames[pair.a],
      b: varNames[pair.b],
      n: pair.n,
      pearson: pair.pearson,
      pearsonP: pair.pearsonP,
      lo: pair.pearsonLo,
      hi: pair.pearsonHi,
      r2: pair.r2,
      spearman: showSpearman ? pair.spearman : undefined,
      spearmanP: showSpearman ? pair.spearmanP : undefined,
      kendall: showKendall ? pair.kendall : undefined,
      kendallP: showKendall ? pair.kendallP : undefined,
    })),
    notes: [
      'Ogni coppia usa tutte le righe con entrambi i valori validi (pairwise deletion): N può variare tra le coppie.',
      'p di Pearson e Spearman: t con df = N − 2. p di Kendall: approssimazione normale con correzione dei ranghi pari.',
      'CI di Pearson: trasformazione z di Fisher, tanh(z ± z_crit/√(N−3)).',
    ],
  });

  const matrixTable = (
    id: string,
    title: string,
    coefficient: (pair: PairResult) => number,
    pValue: (pair: PairResult) => number,
    note: string
  ): TableSpec => ({
    id,
    title,
    columns: [
      { key: 'variable', label: 'Variable', format: 'text' },
      ...varNames.map((name, index) => ({ key: `v${index}`, label: name, format: 'text' as const, align: 'right' as const })),
    ],
    rows: varNames.map((name, i) => {
      const row: { [key: string]: string } = { variable: name };
      varNames.forEach((_, j) => {
        if (i === j) {
          row[`v${j}`] = '1';
          return;
        }
        const pair = pairMap.get(`${i}-${j}`);
        if (!pair || pair.n < 3) {
          row[`v${j}`] = '—';
          return;
        }
        if (j < i) {
          const value = coefficient(pair);
          row[`v${j}`] = `${isFinite(value) ? value.toFixed(3) : '—'}${stars(pValue(pair))}`;
        } else {
          row[`v${j}`] = `n=${pair.n}`;
        }
      });
      return row;
    }),
    notes: [
      note,
      'Triangolo inferiore: coefficiente con stelle di significatività (* p<.05, ** p<.01, *** p<.001). Triangolo superiore: N della coppia.',
    ],
  });

  const matrices: TableSpec[] = [];
  if (method === 'spearman' && showSpearman) {
    matrices.push(matrixTable('corr-matrix-spearman', 'Matrice di correlazione di Spearman (ρ)', p => p.spearman, p => p.spearmanP, 'Rho di Spearman sui ranghi.'));
  }
  matrices.push(matrixTable('corr-matrix-pearson', 'Matrice di correlazione di Pearson (r)', p => p.pearson, p => p.pearsonP, 'Coefficiente lineare di Pearson.'));
  if (method !== 'spearman' && showSpearman) {
    matrices.push(matrixTable('corr-matrix-spearman', 'Matrice di correlazione di Spearman (ρ)', p => p.spearman, p => p.spearmanP, 'Rho di Spearman sui ranghi.'));
  }
  if (showKendall) {
    matrices.push(matrixTable('corr-matrix-kendall', "Matrice di correlazione di Kendall (τ-b)", p => p.kendall, p => p.kendallP, 'Tau-b di Kendall con correzione dei ranghi pari.'));
  }
  tables.push(...matrices);

  tables.push({
    id: 'corr-descriptives',
    title: 'Descrittive delle variabili',
    columns: [
      { key: 'variable', label: 'Variable', format: 'text' },
      { key: 'n', label: 'N', format: 'int' },
      { key: 'mean', label: 'Mean', format: 'dec4' },
      { key: 'sd', label: 'SD', format: 'dec4' },
      { key: 'median', label: 'Median', format: 'dec4' },
      { key: 'min', label: 'Min', format: 'dec4' },
      { key: 'max', label: 'Max', format: 'dec4' },
    ],
    rows: varIdxs.map((index, position) => {
      const values = rows.map(row => parseNum(row[index])).filter(value => !isNaN(value));
      return {
        variable: varNames[position],
        n: values.length,
        mean: jStat.mean(values),
        sd: jStat.stdev(values, true),
        median: jStat.median(values),
        min: values.length ? jStat.min(values) : NaN,
        max: values.length ? jStat.max(values) : NaN,
      };
    }),
  });

  // -------------------------------------------------------------------------
  // Partial correlations (controlling for the other selected variables)
  // -------------------------------------------------------------------------
  if (varIdxs.length >= 3) {
    const completeRows = rows.filter(row =>
      varIdxs.every(index => !isNaN(parseNum(row[index])))
    );
    const n = completeRows.length;
    const q = varIdxs.length;

    if (n > q + 2) {
      const data = varIdxs.map(index => completeRows.map(row => parseNum(row[index])));
      const corr: number[][] = data.map((left, i) =>
        data.map((right, j) => (i === j ? 1 : jStat.corrcoeff(left, right)))
      );

      try {
        const inverse = jStat.inv(corr);
        const rowsOut: { [key: string]: any }[] = [];
        for (let i = 0; i < q; i++) {
          for (let j = i + 1; j < q; j++) {
            const denominator = Math.sqrt(inverse[i][i] * inverse[j][j]);
            const partial = denominator > 0 ? -inverse[i][j] / denominator : NaN;
            const df = n - (q - 2) - 2;
            const t = isFinite(partial) && Math.abs(partial) < 1
              ? partial * Math.sqrt(df / (1 - partial * partial))
              : NaN;
            const p = twoSidedTP(t, df);
            const ci = fisherZCI(partial, n - (q - 2), level);
            rowsOut.push({
              a: varNames[i],
              b: varNames[j],
              r: partial,
              df,
              p,
              lo: ci.lo,
              hi: ci.hi,
              controls: varNames.filter((_, index) => index !== i && index !== j).join(', '),
            });
          }
        }

        tables.push({
          id: 'corr-partial',
          title: 'Correlazioni parziali',
          subtitle: `controllando per le altre ${q - 2} variabili · CI ${level}%`,
          columns: [
            { key: 'a', label: 'Variabile A', format: 'text' },
            { key: 'b', label: 'Variabile B', format: 'text' },
            { key: 'controls', label: 'Controllate', format: 'text' },
            { key: 'r', label: 'r parziale', format: 'dec3' },
            { key: 'df', label: 'df', format: 'int' },
            { key: 'p', label: 'p', format: 'p' },
            { key: 'lo', label: 'CI low', format: 'dec3' },
            { key: 'hi', label: 'CI high', format: 'dec3' },
          ],
          rows: rowsOut,
          notes: [
            'Calcolate su casi completi per tutte le variabili selezionate (listwise deletion), per garantire una matrice invertibile.',
            'r parziale da inversa della matrice di correlazione: r_ij·rest = −P_ij/√(P_ii·P_jj); p con t e df = N − q (q = numero di variabili selezionate).',
          ],
        });
      } catch {
        // Singular matrix: skip the partial table rather than print invalid values.
      }
    }
  }

  return tables;
};
