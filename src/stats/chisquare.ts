import type { TableSpec } from './types';
import { calcFisherExact } from '../statsHelpers';
import { bootstrapCI, chi2SF, zCrit } from './distributions';
import { interpretPhi } from './format';

export interface ChiSquareTablesOptions {
  o11: number;
  o12: number;
  o21: number;
  o22: number;
  row1: string;
  row2: string;
  col1: string;
  col2: string;
  level: number;
  runFisher: boolean;
}

export const chiSquareTables = (options: ChiSquareTablesOptions): TableSpec[] => {
  const { o11, o12, o21, o22, row1, row2, col1, col2, level, runFisher } = options;
  const r1 = o11 + o12;
  const r2 = o21 + o22;
  const c1 = o11 + o21;
  const c2 = o12 + o22;
  const n = r1 + r2;
  if (n === 0) return [];

  const e11 = (r1 * c1) / n;
  const e12 = (r1 * c2) / n;
  const e21 = (r2 * c1) / n;
  const e22 = (r2 * c2) / n;
  if ([e11, e12, e21, e22].some(value => value <= 0)) return [];

  const contribution = (observed: number, expected: number) =>
    Math.pow(observed - expected, 2) / expected;

  const chi2 =
    contribution(o11, e11) +
    contribution(o12, e12) +
    contribution(o21, e21) +
    contribution(o22, e22);

  const yatesTerm = (observed: number, expected: number) =>
    Math.pow(Math.max(0, Math.abs(observed - expected) - 0.5), 2) / expected;
  const chi2Yates =
    yatesTerm(o11, e11) + yatesTerm(o12, e12) + yatesTerm(o21, e21) + yatesTerm(o22, e22);

  const g2 = 2 * [o11, o12, o21, o22].reduce(
    (sum, observed, index) => {
      const expected = [e11, e12, e21, e22][index];
      return sum + (observed > 0 ? observed * Math.log(observed / expected) : 0);
    },
    0
  );

  const pPearson = chi2SF(chi2, 1);
  const pYates = chi2SF(chi2Yates, 1);
  const pG2 = chi2SF(g2, 1);
  const pFisher = runFisher ? calcFisherExact(o11, o12, o21, o22) : NaN;

  const phi = Math.sqrt(chi2 / n);
  const cramersV = Math.sqrt(chi2 / (n * Math.min(1, 1)));
  const rowProp1 = r1 / n;
  const rowProp2 = r2 / n;
  const colProp1 = c1 / n;
  const colProp2 = c2 / n;

  const cell = (label: string, observed: number, expected: number, rowTotal: number, colTotal: number, rowProp: number, colProp: number) => {
    const standardized = (observed - expected) / Math.sqrt(expected);
    const adjusted = (observed - expected) /
      Math.sqrt(expected * (1 - rowProp) * (1 - colProp));
    return {
      cell: label,
      observed,
      expected,
      rowPct: (observed / rowTotal) * 100,
      colPct: (observed / colTotal) * 100,
      totalPct: (observed / n) * 100,
      standardized,
      adjusted,
      contribution: contribution(observed, expected),
    };
  };

  const tables: TableSpec[] = [];

  tables.push({
    id: 'chisq-contingency',
    title: 'Tabella di contingenza e residui',
    subtitle: `${row1}/${row2} × ${col1}/${col2}`,
    columns: [
      { key: 'cell', label: 'Cella', format: 'text' },
      { key: 'observed', label: 'Osservato', format: 'int' },
      { key: 'expected', label: 'Atteso', format: 'dec3' },
      { key: 'rowPct', label: 'Row %', format: 'dec1' },
      { key: 'colPct', label: 'Column %', format: 'dec1' },
      { key: 'totalPct', label: 'Total %', format: 'dec1' },
      { key: 'standardized', label: 'Residuo std.', format: 'dec3' },
      { key: 'adjusted', label: 'Residuo aggiustato', format: 'dec3' },
      { key: 'contribution', label: 'Contributo χ²', format: 'dec3' },
    ],
    rows: [
      cell(`${row1} · ${col1}`, o11, e11, r1, c1, rowProp1, colProp1),
      cell(`${row1} · ${col2}`, o12, e12, r1, c2, rowProp1, colProp2),
      cell(`${row2} · ${col1}`, o21, e21, r2, c1, rowProp2, colProp1),
      cell(`${row2} · ${col2}`, o22, e22, r2, c2, rowProp2, colProp2),
    ],
    notes: [
      `Totali: righe ${r1} / ${r2}, colonne ${c1} / ${c2}, N = ${n}.`,
      'Residuo standardizzato = (O − E)/√E; aggiustato = (O − E)/√(E·(1−row%)(1−col%)). Il contributo è (O − E)²/E.',
    ],
  });

  tables.push({
    id: 'chisq-tests',
    title: 'Test di indipendenza',
    subtitle: `α = ${(1 - level / 100).toFixed(2)}`,
    columns: [
      { key: 'test', label: 'Test', format: 'text' },
      { key: 'statistic', label: 'Statistica', format: 'dec4' },
      { key: 'df', label: 'df', format: 'int' },
      { key: 'p', label: 'p', format: 'p' },
    ],
    rows: [
      { test: 'Pearson χ²', statistic: chi2, df: 1, p: pPearson },
      { test: 'Likelihood ratio G²', statistic: g2, df: 1, p: pG2 },
      { test: 'Yates continuity correction', statistic: chi2Yates, df: 1, p: pYates },
      ...(runFisher ? [{ test: "Fisher's exact (two-sided)", statistic: NaN, df: NaN, p: pFisher }] : []),
    ],
    notes: [
      'Per tabelle 2×2 χ² e G² hanno df = 1; con frequenze attese piccole (< 5) preferire il test esatto di Fisher.',
    ],
  });

  const logOR = (o11 > 0 && o12 > 0 && o21 > 0 && o22 > 0)
    ? Math.log((o11 * o22) / (o12 * o21))
    : NaN;
  const seLogOR = (o11 > 0 && o12 > 0 && o21 > 0 && o22 > 0)
    ? Math.sqrt(1 / o11 + 1 / o12 + 1 / o21 + 1 / o22)
    : NaN;
  const crit = zCrit(level);
  const oddsRatio = isFinite(logOR) ? Math.exp(logOR) : NaN;
  const orLo = isFinite(logOR) ? Math.exp(logOR - crit * seLogOR) : NaN;
  const orHi = isFinite(logOR) ? Math.exp(logOR + crit * seLogOR) : NaN;

  const risk1 = r1 > 0 ? o11 / r1 : NaN;
  const risk2 = r2 > 0 ? o21 / r2 : NaN;
  const relativeRisk = risk2 > 0 ? risk1 / risk2 : NaN;
  const seLogRR = (o11 > 0 && o21 > 0 && r1 > 0 && r2 > 0)
    ? Math.sqrt(1 / o11 - 1 / r1 + 1 / o21 - 1 / r2)
    : NaN;
  const rrLo = isFinite(relativeRisk) && isFinite(seLogRR)
    ? Math.exp(Math.log(relativeRisk) - crit * seLogRR)
    : NaN;
  const rrHi = isFinite(relativeRisk) && isFinite(seLogRR)
    ? Math.exp(Math.log(relativeRisk) + crit * seLogRR)
    : NaN;

  const riskDiff = risk1 - risk2;
  const seRD = Math.sqrt(
    (risk1 * (1 - risk1)) / r1 + (risk2 * (1 - risk2)) / r2
  );

  const minExpected = Math.min(e11, e12, e21, e22);
  const lowCells = [e11, e12, e21, e22].filter(value => value < 5).length;

  const population: number[] = [];
  [o11, o12, o21, o22].forEach((count, cellIndex) => {
    for (let i = 0; i < count; i++) population.push(cellIndex);
  });
  const phiCI = bootstrapCI(rnd => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) counts[population[Math.floor(rnd() * population.length)]]++;
    const cr1 = counts[0] + counts[1];
    const cr2 = counts[2] + counts[3];
    const cc1 = counts[0] + counts[2];
    const cc2 = counts[1] + counts[3];
    const expected = [cr1 * cc1 / n, cr1 * cc2 / n, cr2 * cc1 / n, cr2 * cc2 / n];
    if (expected.some(value => value <= 0)) return NaN;
    const bootChi2 = counts.reduce(
      (sum, observed, index) => sum + Math.pow(observed - expected[index], 2) / expected[index],
      0
    );
    return Math.sqrt(bootChi2 / n);
  }, level, 500);

  tables.push({
    id: 'chisq-effects',
    title: 'Effect size e misure di associazione',
    subtitle: `CI ${level}%`,
    columns: [
      { key: 'measure', label: 'Misura', format: 'text' },
      { key: 'estimate', label: 'Stima', format: 'dec4' },
      { key: 'ciLo', label: 'CI low', format: 'dec4' },
      { key: 'ciHi', label: 'CI high', format: 'dec4' },
      { key: 'note', label: 'Interpretazione', format: 'text' },
    ],
    rows: [
      { measure: 'φ (phi)', estimate: phi, ciLo: phiCI.lo, ciHi: phiCI.hi, note: interpretPhi(phi) },
      { measure: "Cramér's V", estimate: cramersV, ciLo: phiCI.lo, ciHi: phiCI.hi, note: interpretPhi(cramersV) },
      { measure: 'Odds Ratio', estimate: oddsRatio, ciLo: orLo, ciHi: orHi, note: oddsRatio > 1 ? 'associazione positiva' : oddsRatio < 1 ? 'associazione negativa' : 'nulla' },
      { measure: 'Relative Risk', estimate: relativeRisk, ciLo: rrLo, ciHi: rrHi, note: 'rischio riga 1 / rischio riga 2' },
      { measure: 'Risk Difference', estimate: riskDiff, ciLo: riskDiff - crit * seRD, ciHi: riskDiff + crit * seRD, note: 'differenza assoluta dei rischi' },
    ],
    notes: [
      'Per una tabella 2×2 φ e Cramér’s V coincidono numericamente; sono riportati separatamente perché la formula generale di V usa min(r−1, c−1).',
      'OR: CI di Woolf su log(OR). RR: CI di Katz su log(RR). RD: CI di Wald. Con celle vuote le stime OR/RR non sono definite.',
      'CI di φ/V: bootstrap percentile (500 repliche, seed fisso) ricampionando le osservazioni dalla tabella.',
    ],
  });

  tables.push({
    id: 'chisq-assumptions',
    title: 'Assunzioni',
    columns: [
      { key: 'metric', label: 'Controllo', format: 'text' },
      { key: 'value', label: 'Valore', format: 'dec3' },
      { key: 'note', label: 'Nota', format: 'text' },
    ],
    rows: [
      { metric: 'Frequenza attesa minima', value: minExpected, note: 'Cochran: tutte ≥ 5 desiderabile' },
      { metric: 'Celle con E < 5', value: lowCells, note: `${((lowCells / 4) * 100).toFixed(0)}% delle celle` },
      { metric: 'N', value: n, note: 'numerosità totale' },
    ],
    notes: [
      minExpected < 5
        ? 'Attenzione: una o più frequenze attese sono < 5. Yates o Fisher sono preferibili; per tabelle più grandi serve il test esatto o il bootstrap.'
        : 'Le frequenze attese soddisfano la regola di Cochran.',
    ],
  });

  return tables;
};
