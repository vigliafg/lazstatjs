import type { TableSpec } from './types';
import { chi2SF, mulberry32 } from './distributions';
import { calcFisherExact } from '../statsHelpers';
import { fmtEst, fmtP } from './format';
import type { ReportSpec } from './report';
import {
  describeP,
  isDecided,
  show,
  showInt,
  tableById,
} from './reportKit';

/**
 * Contingency tables of any size (R x C).
 *
 * The 2x2 table builder in `chisquare.ts` stays as it is (it also reports
 * odds ratios and risk differences); this module generalises the test side so
 * that 2x3, 3x3, 4x2 ... tables stop being unsupported.
 */
export interface ContingencyOptions {
  observed: number[][];
  rowLabels: string[];
  colLabels: string[];
  level: number;
  /** Fisher's exact test, only available for 2x2 tables. */
  exact?: boolean;
  /** Monte Carlo p-value for tables where the Cochran rule fails. */
  monteCarlo?: boolean;
  simulations?: number;
  seed?: number;
}

export interface ContingencyTotals {
  rows: number;
  cols: number;
  df: number;
  n: number;
  chi2: number;
  g2: number;
  p: number;
  minExpected: number;
  lowCells: number;
  cramersV: number;
}

const EPS = 1e-12;

const isRectangular = (observed: number[][]): boolean => {
  if (observed.length < 2) return false;
  const width = observed[0]?.length ?? 0;
  if (width < 2) return false;
  if (!observed.every(row => row.length === width)) return false;
  return observed.every(row => row.every(value => Number.isFinite(value) && value >= 0));
};

/**
 * Simulates the chi-square statistic with both margins fixed: the column
 * slots are shuffled and dealt to the rows, so every simulated table has the
 * same row and column totals as the observed one.
 */
export const simulateFixedMarginChi2 = (
  observed: number[][],
  simulations: number,
  seed = 20240517
): number[] => {
  const rowTotals = observed.map(row => row.reduce((sum, value) => sum + value, 0));
  const colCount = observed[0].length;
  const colTotals = Array.from({ length: colCount }, (_, j) =>
    observed.reduce((sum, row) => sum + row[j], 0)
  );
  const n = rowTotals.reduce((sum, value) => sum + value, 0);
  const random = mulberry32(seed);
  const results: number[] = [];

  for (let s = 0; s < simulations; s++) {
    const slots: number[] = [];
    colTotals.forEach((count, j) => {
      for (let k = 0; k < count; k++) slots.push(j);
    });
    // Fisher-Yates shuffle
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const table = observed.map(row => row.map(() => 0));
    let cursor = 0;
    rowTotals.forEach((rowTotal, i) => {
      for (let k = 0; k < rowTotal; k++) {
        const col = slots[cursor];
        if (col === undefined) break;
        table[i][col] += 1;
        cursor += 1;
      }
    });
    let statistic = 0;
    for (let i = 0; i < table.length; i++) {
      const rowTotal = rowTotals[i];
      for (let j = 0; j < colCount; j++) {
        const expected = (rowTotal * colTotals[j]) / n;
        if (expected > 0) {
          statistic += Math.pow(table[i][j] - expected, 2) / expected;
        }
      }
    }
    results.push(statistic);
  }
  return results;
};

export const contingencyTables = (options: ContingencyOptions): TableSpec[] => {
  const { observed, rowLabels, colLabels, level, exact = true, monteCarlo = true } = options;
  const simulations = options.simulations ?? 10000;

  if (!isRectangular(observed)) return [];

  const rowCount = observed.length;
  const colCount = observed[0].length;
  const rowTotals = observed.map(row => row.reduce((sum, value) => sum + value, 0));
  const colTotals = Array.from({ length: colCount }, (_, j) =>
    observed.reduce((sum, row) => sum + row[j], 0)
  );
  const n = rowTotals.reduce((sum, value) => sum + value, 0);
  if (n <= 0) return [];
  if (rowTotals.some(total => total <= 0) || colTotals.some(total => total <= 0)) return [];

  const expected = observed.map((row, i) =>
    row.map((_, j) => (rowTotals[i] * colTotals[j]) / n)
  );

  const contribution = (value: number, expectancy: number) =>
    expectancy > 0 ? Math.pow(value - expectancy, 2) / expectancy : 0;

  const chi2 = observed.reduce(
    (sum, row, i) => sum + row.reduce((inner, value, j) => inner + contribution(value, expected[i][j]), 0),
    0
  );

  const g2 = 2 * observed.reduce(
    (sum, row, i) =>
      sum + row.reduce(
        (inner, value, j) =>
          value > 0 && expected[i][j] > 0 ? inner + value * Math.log(value / expected[i][j]) : inner,
        0
      ),
    0
  );

  const df = (rowCount - 1) * (colCount - 1);
  const pPearson = chi2SF(chi2, df);
  const pG2 = chi2SF(g2, df);

  const yates = rowCount === 2 && colCount === 2;
  let chi2Yates = NaN;
  let pYates = NaN;
  if (yates) {
    chi2Yates = observed.reduce(
      (sum, row, i) =>
        sum + row.reduce(
          (inner, value, j) =>
            inner + Math.pow(Math.max(0, Math.abs(value - expected[i][j]) - 0.5), 2) / expected[i][j],
          0
        ),
      0
    );
    pYates = chi2SF(chi2Yates, 1);
  }

  const flat = observed.flat();
  const minExpected = Math.min(...expected.flat());
  const lowCells = expected.flat().filter(value => value < 5).length;
  const cochranFails = lowCells > 0;

  // Monte Carlo p-value with fixed margins (only when the asymptotic test is shaky)
  let pMonteCarlo = NaN;
  if (monteCarlo && cochranFails) {
    const simulated = simulateFixedMarginChi2(observed, simulations, options.seed);
    const atLeast = simulated.filter(value => value >= chi2 - EPS).length;
    pMonteCarlo = (1 + atLeast) / (simulated.length + 1);
  }

  const pFisher = yates && exact ? calcFisherExact(flat[0], flat[1], flat[2], flat[3]) : NaN;

  const cramersV = n > 0 ? Math.sqrt(chi2 / (n * Math.min(rowCount - 1, colCount - 1))) : NaN;
  const phi = yates ? Math.sqrt(chi2 / n) : NaN;
  const contingencyCoefficient = Math.sqrt(chi2 / (chi2 + n));

  const observedRows = observed.map((row, i) => {
    const entry: Record<string, number | string> = {
      label: rowLabels[i] ?? `Row ${i + 1}`,
      total: rowTotals[i],
    };
    row.forEach((value, j) => {
      entry[`c${j}`] = value;
    });
    return entry;
  });

  const expectedRows = expected.map((row, i) => {
    const entry: Record<string, number | string> = {
      label: rowLabels[i] ?? `Row ${i + 1}`,
      total: rowTotals[i],
    };
    row.forEach((value, j) => {
      entry[`c${j}`] = value;
    });
    return entry;
  });

  const residualRows: Record<string, number | string>[] = [];
  observed.forEach((row, i) => {
    row.forEach((value, j) => {
      const expectancy = expected[i][j];
      const std = expectancy > 0 ? (value - expectancy) / Math.sqrt(expectancy) : NaN;
      const rowShare = rowTotals[i] / n;
      const colShare = colTotals[j] / n;
      const denom = Math.sqrt(Math.max(EPS, (1 - rowShare) * (1 - colShare)));
      residualRows.push({
        cell: `${rowLabels[i] ?? `Row ${i + 1}`} · ${colLabels[j] ?? `Col ${j + 1}`}`,
        observed: value,
        expected: expectancy,
        residual: std,
        adjusted: denom > 0 ? std / denom : NaN,
        contribution: contribution(value, expectancy),
      });
    });
  });

  const tables: TableSpec[] = [];

  tables.push({
    id: 'cont-observed',
    title: 'Tabella di contingenza (frequenze osservate)',
    subtitle: `${rowCount} × ${colCount} · N = ${n}`,
    columns: [
      { key: 'label', label: 'Riga', format: 'text' },
      ...colLabels.map((label, j) => ({ key: `c${j}`, label, format: 'int' as const })),
      { key: 'total', label: 'Totale', format: 'int' },
    ],
    rows: observedRows,
    notes: ['Ogni cella contiene il numero di osservazioni con quella combinazione di categorie.'],
  });

  tables.push({
    id: 'cont-expected',
    title: 'Frequenze attese sotto indipendenza',
    subtitle: 'E = (totale riga × totale colonna) / N',
    columns: [
      { key: 'label', label: 'Riga', format: 'text' },
      ...colLabels.map((label, j) => ({ key: `c${j}`, label, format: 'dec2' as const })),
      { key: 'total', label: 'Totale', format: 'int' },
    ],
    rows: expectedRows,
    notes: [
      'Le attese sono le frequenze che si vedrebbero se le due variabili fossero indipendenti.',
      cochranFails
        ? `${lowCells} cella/e su ${rowCount * colCount} hanno attesa < 5: l'approssimazione χ² è fragile (regola di Cochran).`
        : 'Tutte le attese sono ≥ 5: l’approssimazione χ² è adeguata.',
    ],
  });

  tables.push({
    id: 'cont-residuals',
    title: 'Residui e contributi al χ²',
    subtitle: 'Residuo standardizzato = (O − E)/√E',
    columns: [
      { key: 'cell', label: 'Cella', format: 'text' },
      { key: 'observed', label: 'O', format: 'int' },
      { key: 'expected', label: 'E', format: 'dec2' },
      { key: 'residual', label: 'Residuo std.', format: 'dec2' },
      { key: 'adjusted', label: 'Residuo aggiustato', format: 'dec2' },
      { key: 'contribution', label: 'Contributo χ²', format: 'dec3' },
    ],
    rows: residualRows,
    notes: [
      'Un residuo aggiustato oltre ±2 segnala la cella che si discosta di più dall’indipendenza.',
      'Il contributo è quanto quella cella pesa nel χ² totale: le prime posizioni spiegano l’associazione.',
    ],
  });

  const testRows: Record<string, number | string>[] = [
    { test: 'Pearson χ²', statistic: chi2, df, p: pPearson },
    { test: 'Likelihood ratio G²', statistic: g2, df, p: pG2 },
  ];
  if (yates) testRows.push({ test: 'Yates (correzione di continuità)', statistic: chi2Yates, df: 1, p: pYates });
  if (yates && Number.isFinite(pFisher)) {
    testRows.push({ test: "Fisher's exact (two-sided)", statistic: NaN, df: NaN, p: pFisher });
  }
  if (Number.isFinite(pMonteCarlo)) {
    testRows.push({
      test: `Monte Carlo (${simulations.toLocaleString('it-IT')} tavole, margini fissi)`,
      statistic: chi2,
      df,
      p: pMonteCarlo,
    });
  }

  tables.push({
    id: 'cont-tests',
    title: 'Test di indipendenza',
    subtitle: `α = ${(1 - level / 100).toFixed(2)}`,
    columns: [
      { key: 'test', label: 'Test', format: 'text' },
      { key: 'statistic', label: 'Statistica', format: 'dec4' },
      { key: 'df', label: 'df', format: 'int' },
      { key: 'p', label: 'p', format: 'p' },
    ],
    rows: testRows,
    notes: [
      `df = (righe − 1)(colonne − 1) = ${df}.`,
      'χ² e G² condividono le stesse assunzioni: osservazioni indipendenti, categorie esaustive, attese sufficientemente grandi.',
      'Il test dice che esiste un’associazione, non quanto sia forte né in quale direzione: per quello servono residui e misure di associazione.',
    ],
  });

  const associationRows: Record<string, string | number>[] = [
    { measure: 'Cramér’s V', value: cramersV, note: '0 = nessuna associazione, 1 = associazione perfetta' },
    {
      measure: 'Coefficiente di contingenza C',
      value: contingencyCoefficient,
      note: 'Dipende dal numero di categorie: confrontabile solo tra tabelle di stessa forma',
    },
  ];
  if (yates) {
    associationRows.unshift({
      measure: 'φ (phi)',
      value: phi,
      note: 'Per tabelle 2×2 coincide con la correlazione tra le due variabili binarie',
    });
  }

  tables.push({
    id: 'cont-association',
    title: 'Ampiezza dell’associazione',
    columns: [
      { key: 'measure', label: 'Misura', format: 'text' },
      { key: 'value', label: 'Valore', format: 'dec3' },
      { key: 'note', label: 'Lettura', format: 'text' },
    ],
    rows: associationRows,
    notes: ['Il p-value dipende da N; queste misure no, ed è per questo che vanno riportate insieme.'],
  });

  return tables;
};

const associationWord = (value: number): string => {
  if (!Number.isFinite(value)) return 'non calcolabile';
  if (value < 0.1) return 'trascurabile';
  if (value < 0.3) return 'debole';
  if (value < 0.5) return 'moderata';
  return 'forte';
};

/** Plain-language reading of a contingency table. */
export const contingencyReport = (tables: TableSpec[], level: number): ReportSpec => {
  const tests = tableById(tables, 'cont-tests')?.rows ?? [];
  const pearson = tests[0];
  const association = tableById(tables, 'cont-association')?.rows ?? [];
  const residuals = tableById(tables, 'cont-residuals')?.rows ?? [];
  const observed = tableById(tables, 'cont-observed');
  const n = Number(observed?.subtitle?.match(/N = (\d+)/)?.[1] ?? NaN);

  const chi2 = Number(pearson?.statistic ?? NaN);
  const df = Number(pearson?.df ?? NaN);
  const p = Number(pearson?.p ?? NaN);
  const significant = isDecided(p, level);
  const cramers = Number(association.find(row => String(row.measure).includes('Cramér'))?.value ?? NaN);
  const strength = associationWord(cramers);
  const lowCells = Number(
    tableById(tables, 'cont-expected')?.notes?.find(note => note.includes('attesa < 5'))?.match(/^(\d+)/)?.[1] ?? NaN
  );
  const exactRow = tests.find(row => String(row.test).includes('Fisher'));
  const monteCarloRow = tests.find(row => String(row.test).includes('Monte Carlo'));

  const drivers = residuals
    .filter(row => Number.isFinite(Number(row.adjusted)) && Math.abs(Number(row.adjusted)) >= 2)
    .sort((a, b) => Math.abs(Number(b.adjusted)) - Math.abs(Number(a.adjusted)))
    .slice(0, 4)
    .map(row => {
      const direction = Number(row.adjusted) > 0 ? 'più osservazioni' : 'meno osservazioni';
      return `${String(row.cell)}: ${direction} del previsto (residuo aggiustato ${fmtEst(Number(row.adjusted), 2)})`;
    });

  const headline = !Number.isFinite(p)
    ? 'Tabelle troppo piccole o con celle vuote: il test non è calcolabile.'
    : significant
      ? `Le due variabili non sono indipendenti (χ² = ${fmtEst(chi2, 3)}, df = ${df}, p = ${fmtP(p)}).`
      : `Nessuna evidenza di associazione (χ² = ${fmtEst(chi2, 3)}, df = ${df}, p = ${fmtP(p)}).`;

  return {
    id: 'contingency',
    title: 'Report di lettura',
    headline,
    badge: significant ? 'Associazione significativa' : 'Nessuna associazione rilevata',
    tone: significant ? 'positive' : 'neutral',
    intro: [
      'Il test del χ² confronta le frequenze che osservi con quelle che ti aspetteresti se le due variabili categoriche fossero completamente indipendenti.',
      'L’ipotesi nulla è “indipendenza”: nessuna relazione tra riga e colonna. Un p piccolo significa che le differenze tra osservato e atteso sono troppo grandi per essere solo rumore campionario.',
    ],
    sections: [
      {
        heading: 'La lettura dei risultati',
        body: [
          `La tabella ha N = ${showInt(n)} osservazioni e ${df} gradi di libertà. Il χ² di Pearson vale ${show(chi2, 3)}: ${describeP(p)}${Number.isFinite(p) ? significant ? `, sotto la soglia α = ${(1 - level / 100).toFixed(2)}: l’ipotesi di indipendenza viene rifiutata.` : `, sopra la soglia α = ${(1 - level / 100).toFixed(2)}: l’ipotesi di indipendenza non viene rifiutata.` : '.'}`,
          Number.isFinite(Number(exactRow?.p))
            ? `Con celle piccole il test esatto di Fisher dà p = ${fmtP(Number(exactRow?.p))}: è il valore da preferire in una tabella 2×2 con attese basse.`
            : '',
          Number.isFinite(Number(monteCarloRow?.p))
            ? `Poiché ${Number.isFinite(lowCells) ? lowCells : 'alcune'} celle hanno attesa sotto 5, ho aggiunto un p Monte Carlo con margini fissi (${fmtP(Number(monteCarloRow?.p))}): non dipende dall’approssimazione asintotica.`
            : '',
        ].filter(Boolean),
      },
      {
        heading: 'Dove sta l’associazione',
        body: [
          'Il χ² dice che qualcosa c’è, non dove. I residui aggiustati rispondono a questa domanda: valori oltre ±2 indicano le celle che si discostano dall’indipendenza più di quanto il caso spieghi.',
        ],
        bullets: drivers.length > 0 ? drivers : ['Nessuna cella supera la soglia di ±2: l’associazione è diffusa, non concentrata in una combinazione specifica.'],
      },
      {
        heading: 'Quanto è forte',
        body: [
          Number.isFinite(cramers)
            ? `Cramér’s V = ${show(cramers, 3)}: un’associazione ${strength} (0 = indipendenza, 1 = legame deterministico). Il p-value può essere piccolissimo anche per associazioni debolissime se N è grande: la forza va letta qui, non nel p.`
            : 'La misura di associazione non è calcolabile con questi dati.',
        ],
      },
      {
        heading: 'Assunzioni da controllare',
        bullets: [
          'Osservazioni indipendenti: ogni riga del dataset deve essere una unità diversa, non una misura ripetuta.',
          'Categorie esaustive e mutuamente esclusive: ogni osservazione cade in una sola cella.',
          'Regola di Cochran: nessuna attesa < 1 e non più del 20% delle celle con attesa < 5; se cade, usa Fisher (2×2) o il p Monte Carlo.',
          'Il test non dice nulla sulla direzione causale: associazione non è causa.',
        ],
      },
    ],
    limitations: [
      'Tabelle molto grandi con molte categorie rare rendono il χ² instabile anche con N elevato.',
      'Con dati raggruppati per convenienza (non campionati) il p-value non ha il significato nominale.',
    ],
  };
};
