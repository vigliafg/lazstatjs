import { jStat } from './jstat';
import { fSF, leveneTest, lillieforsTest } from './distributions';
import type { TableSpec } from './types';
import type { ReportSpec } from './report';
import { fmtEst, fmtP } from './format';
import { isDecided, tableById } from './reportKit';

/**
 * Two-way factorial ANOVA (A x B, optional interaction).
 *
 * The sums of squares are sequential (Type I) in the order A, B, A×B. In a
 * balanced design they coincide with the Type III sums of squares that
 * Statgraphics reports; with unequal cell sizes the order matters, and the
 * table says so.
 */

export interface FactorialTablesOptions {
  response: number[];
  factorA: string[];
  factorB: string[];
  responseName: string;
  aName: string;
  bName: string;
  level: number;
  interaction: boolean;
}

export interface FactorialCell {
  a: string;
  b: string;
  n: number;
  mean: number;
  sd: number;
}

const NUMERIC_TOLERANCE = 1e-10;

const compareLevels = (left: string, right: string): number => {
  const a = Number(left);
  const b = Number(right);
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  return left.localeCompare(right);
};

const uniqueLevels = (labels: string[]): string[] =>
  Array.from(new Set(labels)).sort(compareLevels);

const zeros = (rows: number, cols: number): number[][] =>
  Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

const invert = (matrix: number[][]): number[][] | null => {
  const size = matrix.length;
  const work = matrix.map((row, index) => [
    ...row,
    ...Array.from({ length: size }, (_, j) => (i => (i === index ? 1 : 0))(j)),
  ]);

  for (let column = 0; column < size; column++) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(work[row][column]) > Math.abs(work[pivotRow][column])) pivotRow = row;
    }
    if (Math.abs(work[pivotRow][column]) < NUMERIC_TOLERANCE) return null;
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

interface ModelFit {
  sse: number;
  rank: number;
}

const fitModel = (columns: number[][], y: number[]): ModelFit | null => {
  if (columns.length === 0) return { sse: 0, rank: 0 };
  const n = y.length;
  const p = columns[0].length;
  const xtx = zeros(p, p);
  const xty = new Array<number>(p).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      xty[j] += columns[i][j] * y[i];
      for (let k = 0; k <= j; k++) xtx[j][k] += columns[i][j] * columns[i][k];
    }
  }
  for (let j = 0; j < p; j++) {
    for (let k = 0; k < j; k++) xtx[k][j] = xtx[j][k];
  }

  const inverse = invert(xtx);
  if (!inverse) return null;

  let sse = 0;
  for (let i = 0; i < n; i++) {
    let fitted = 0;
    for (let j = 0; j < p; j++) {
      let beta = 0;
      for (let k = 0; k < p; k++) beta += inverse[j][k] * xty[k];
      fitted += columns[i][j] * beta;
    }
    sse += Math.pow(y[i] - fitted, 2);
  }

  return { sse, rank: p };
};

const dummy = (value: string, levels: string[]): number[] =>
  levels.slice(1).map(level => (value === level ? 1 : 0));

export const factorialCells = (options: FactorialTablesOptions): FactorialCell[] => {
  const groups = new Map<string, number[]>();
  options.response.forEach((value, index) => {
    const key = `${options.factorA[index]}\u0000${options.factorB[index]}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(value);
    groups.set(key, bucket);
  });

  return Array.from(groups.entries()).map(([key, values]) => {
    const [a, b] = key.split('\u0000');
    return {
      a,
      b,
      n: values.length,
      mean: jStat.mean(values),
      sd: values.length > 1 ? jStat.stdev(values, true) : NaN,
    };
  }).sort((left, right) => compareLevels(left.a, right.a) || compareLevels(left.b, right.b));
};

export const factorialTables = (options: FactorialTablesOptions): TableSpec[] => {
  const { level, interaction, responseName, aName, bName } = options;

  const rows = options.response
    .map((value, index) => ({
      value,
      a: String(options.factorA[index] ?? '').trim(),
      b: String(options.factorB[index] ?? '').trim(),
    }))
    .filter(row => Number.isFinite(row.value) && row.a !== '' && row.b !== '');

  if (rows.length < 4) return [];

  const aLevels = uniqueLevels(rows.map(row => row.a));
  const bLevels = uniqueLevels(rows.map(row => row.b));
  if (aLevels.length < 2 || bLevels.length < 2) return [];

  const y = rows.map(row => row.value);
  const n = y.length;
  const grandMean = jStat.mean(y);
  const totalSS = y.reduce((sum, value) => sum + Math.pow(value - grandMean, 2), 0);

  const cells = factorialCells(options);
  if (interaction && cells.length !== aLevels.length * bLevels.length) return [];
  if (cells.some(cell => cell.n === 0)) return [];

  const one = rows.map(() => [1]);
  const aDummies = rows.map(row => dummy(row.a, aLevels));
  const bDummies = rows.map(row => dummy(row.b, bLevels));
  const interactionColumns = rows.map((row, index) =>
    aDummies[index].flatMap(aValue => bDummies[index].map(bValue => aValue * bValue))
  );

  const withColumns = (extra: number[][]): number[][] =>
    rows.map((_, index) => [...one[index], ...extra[index]]);

  const columnsA = aDummies;
  const columnsAB = aDummies.map((values, index) => [...values, ...bDummies[index]]);
  const columnsFull = interaction
    ? aDummies.map((values, index) => [...values, ...bDummies[index], ...interactionColumns[index]])
    : columnsAB;

  const fitIntercept = fitModel(one, y);
  const fitA = fitModel(withColumns(columnsA), y);
  const fitAB = fitModel(withColumns(columnsAB), y);
  const fitFull = fitModel(withColumns(columnsFull), y);
  if (!fitIntercept || !fitA || !fitAB || !fitFull) return [];

  const dfA = aLevels.length - 1;
  const dfB = bLevels.length - 1;
  const dfAB = interaction ? dfA * dfB : 0;
  const dfError = n - fitFull.rank;

  const ssA = fitIntercept.sse - fitA.sse;
  const ssB = fitA.sse - fitAB.sse;
  const ssAB = interaction ? fitAB.sse - fitFull.sse : NaN;
  const ssError = fitFull.sse;
  const totalSequential = ssA + ssB + (interaction ? ssAB : 0) + ssError;

  const mse = dfError > 0 ? ssError / dfError : NaN;

  const terms: { source: string; ss: number; df: number }[] = [
    { source: aName, ss: ssA, df: dfA },
    { source: bName, ss: ssB, df: dfB },
  ];
  if (interaction) terms.push({ source: `${aName} × ${bName}`, ss: ssAB, df: dfAB });
  terms.push({ source: 'Residuals', ss: ssError, df: dfError });
  terms.push({ source: 'Total', ss: totalSS, df: n - 1 });

  const omega = (ss: number, df: number): number => {
    if (!(mse > 0) || df <= 0) return NaN;
    const value = (ss - df * mse) / (ss + (n - df) * mse);
    return Math.max(0, Math.min(1, value));
  };

  const tables: TableSpec[] = [];

  tables.push({
    id: 'fac-anova',
    title: 'ANOVA a due fattori',
    subtitle: `${aName} x ${bName}${interaction ? ' · con interazione' : ' · solo effetti principali'} · N = ${n}`,
    columns: [
      { key: 'source', label: 'Sorgente', format: 'text' },
      { key: 'ss', label: 'SS', format: 'dec3' },
      { key: 'df', label: 'df', format: 'int' },
      { key: 'ms', label: 'MS', format: 'dec3' },
      { key: 'f', label: 'F', format: 'dec3' },
      { key: 'p', label: 'p', format: 'p' },
      { key: 'eta2p', label: 'η² parziale', format: 'dec3' },
      { key: 'omega2', label: 'ω²', format: 'dec3' },
    ],
    rows: terms.map(term => {
      const isResidual = term.source === 'Residuals';
      const isTotal = term.source === 'Total';
      const ms = term.df > 0 ? term.ss / term.df : NaN;
      return {
        source: term.source,
        ss: term.ss,
        df: term.df,
        ms,
        f: isResidual || isTotal ? NaN : mse > 0 ? ms / mse : NaN,
        p: isResidual || isTotal ? NaN : fSF(mse > 0 ? ms / mse : NaN, term.df, dfError),
        eta2p: isResidual || isTotal ? NaN : ms > 0 && Number.isFinite(mse) ? term.ss / (term.ss + ssError) : NaN,
        omega2: isResidual || isTotal ? NaN : omega(term.ss, term.df),
      };
    }),
    notes: [
      'Le somme dei quadrati sono sequenziali (Type I) nell’ordine indicato: in un disegno bilanciato coincidono con le Type III.',
      `F = MS_effetto / MS_residui, con df residui = ${dfError} (N − numero di celle).`,
      'η² parziale = SS_effetto / (SS_effetto + SS_residui): quota di variabilità non spiegata dal resto del modello.',
      `Il modello spiega ${fmtEst(totalSequential - ssError, 3)} delle ${fmtEst(totalSS, 3)} unità di SS totale; il resto sono i residui.`,
    ],
  });

  const cellRows = cells.map(cell => ({
    a: cell.a,
    b: cell.b,
    n: cell.n,
    mean: cell.mean,
    sd: cell.sd,
  }));

  tables.push({
    id: 'fac-cells',
    title: 'Medie per cella',
    subtitle: `${cells.length} combinazioni · ${cells.every(cell => cell.n === cells[0].n) ? 'disegno bilanciato' : 'disegno non bilanciato'}`,
    columns: [
      { key: 'a', label: aName, format: 'text' },
      { key: 'b', label: bName, format: 'text' },
      { key: 'n', label: 'N', format: 'int' },
      { key: 'mean', label: 'Media', format: 'dec3' },
      { key: 'sd', label: 'SD', format: 'dec3' },
    ],
    rows: cellRows,
    notes: [
      'Sono le medie che alimentano il grafico dell’interazione: se le linee non sono parallele, l’effetto di un fattore cambia a seconda del livello dell’altro.',
    ],
  });

  const marginal = (levels: string[], factor: 'a' | 'b') =>
    levels.map(label => {
      const values = rows.filter(row => row[factor] === label).map(row => row.value);
      return {
        level: label,
        n: values.length,
        mean: jStat.mean(values),
        sd: values.length > 1 ? jStat.stdev(values, true) : NaN,
      };
    });

  tables.push({
    id: 'fac-marginal-a',
    title: `Medie marginali · ${aName}`,
    columns: [
      { key: 'level', label: aName, format: 'text' },
      { key: 'n', label: 'N', format: 'int' },
      { key: 'mean', label: 'Media', format: 'dec3' },
      { key: 'sd', label: 'SD', format: 'dec3' },
    ],
    rows: marginal(aLevels, 'a'),
  });

  tables.push({
    id: 'fac-marginal-b',
    title: `Medie marginali · ${bName}`,
    columns: [
      { key: 'level', label: bName, format: 'text' },
      { key: 'n', label: 'N', format: 'int' },
      { key: 'mean', label: 'Media', format: 'dec3' },
      { key: 'sd', label: 'SD', format: 'dec3' },
    ],
    rows: marginal(bLevels, 'b'),
  });

  // Diagnostics: Levene across cells, normality of residuals would need the
  // residuals themselves, so the cell-level Levene plus R² are reported here.
  const cellGroups = cells.map(cell =>
    rows.filter(row => row.a === cell.a && row.b === cell.b).map(row => row.value)
  );
  const levene = leveneTest(cellGroups, 'mean');

  const residuals: number[] = [];
  const cellMeans = new Map<string, number>();
  cells.forEach(cell => cellMeans.set(`${cell.a}\u0000${cell.b}`, cell.mean));
  rows.forEach(row => residuals.push(row.value - (cellMeans.get(`${row.a}\u0000${row.b}`) ?? grandMean)));
  const lilliefors = lillieforsTest(residuals, 500);

  const r2 = totalSS > 0 ? 1 - ssError / totalSS : NaN;
  const adjustedR2 = 1 - (1 - r2) * ((n - 1) / dfError);

  tables.push({
    id: 'fac-diagnostics',
    title: 'Diagnostica del modello',
    columns: [
      { key: 'metric', label: 'Metrica', format: 'text' },
      { key: 'value', label: 'Valore', format: 'dec4' },
      { key: 'note', label: 'Lettura', format: 'text' },
    ],
    rows: [
      { metric: 'R²', value: r2, note: 'quota di variabilità spiegata dal modello' },
      { metric: 'R² aggiustato', value: adjustedR2, note: 'penalizza il numero di parametri' },
      { metric: 'RMSE', value: Math.sqrt(mse), note: 'deviazione standard dei residui' },
      {
        metric: 'Levene (celle)',
        value: levene.p,
        note: `F = ${fmtEst(levene.stat, 3)}, df = ${levene.df1}, ${levene.df2}: ${levene.p < 0.05 ? 'varianze non omogenee' : 'varianze compatibili'}`,
      },
      {
        metric: 'Lilliefors (residui)',
        value: lilliefors.p,
        note: lilliefors.p < 0.05 ? 'residui non normali: valuta la trasformazione' : 'residui compatibili con la normalità',
      },
      {
        metric: 'Celle con N = 1',
        value: cells.filter(cell => cell.n === 1).length,
        note: 'una cella con una sola osservazione non permette di stimare la variabilità interna',
      },
    ],
    notes: [
      'Con una cella per combinazione il disegno non è stimabile: servono repliche.',
      `Livello di confidenza scelto: ${level}% (usato nel report).`,
    ],
  });

  return tables;
};

/** Plain-language reading of the two-way ANOVA. */
export const factorialReport = (tables: TableSpec[], level: number): ReportSpec => {
  const anova = tableById(tables, 'fac-anova');
  const rows = anova?.rows ?? [];
  const interactionRow = rows.find(row => String(row.source).includes('×'));
  const effects = rows.filter(row => String(row.source) !== 'Residuals' && String(row.source) !== 'Total');
  const significant = effects.filter(row => isDecided(Number(row.p), level));
  const diagnostics = tableById(tables, 'fac-diagnostics')?.rows ?? [];
  const diag = (name: string) => diagnostics.find(row => String(row.metric) === name);
  const interactionSignificant = interactionRow ? isDecided(Number(interactionRow.p), level) : false;

  const describe = (row: (typeof rows)[number]): string =>
    `${String(row.source)}: F(${Number(row.df)}, ${Number(rows.find(r => String(r.source) === 'Residuals')?.df ?? 0)}) = ${fmtEst(Number(row.f), 3)}, ${Number(row.p) < 0.001 ? 'p < 0.001' : `p = ${fmtP(Number(row.p))}`}, η² parziale = ${fmtEst(Number(row.eta2p), 3)}`;

  const headline = !anova
    ? 'Dati insufficienti per stimare il modello.'
    : interactionSignificant
      ? `L’interazione ${String(interactionRow?.source)} è significativa: l’effetto di un fattore dipende dal livello dell’altro.`
      : significant.length > 0
        ? `${significant.length} effetto/i ${significant.length === 1 ? 'è significativo' : 'sono significativi'} al livello ${(1 - level / 100).toFixed(2)}.`
        : `Nessun effetto raggiunge la significatività al livello ${(1 - level / 100).toFixed(2)}.`;

  return {
    id: 'factorial',
    title: 'Report di lettura',
    headline,
    badge: interactionSignificant ? 'Interazione presente' : significant.length > 0 ? 'Effetti significativi' : 'Nessun effetto',
    tone: interactionSignificant ? 'caution' : significant.length > 0 ? 'positive' : 'neutral',
    intro: [
      'L’ANOVA a due fattori separa la variabilità della risposta in tre pezzi: quanto dipende dal primo fattore, quanto dal secondo e quanto dalla loro combinazione.',
      'L’ipotesi nulla di ogni riga è “nessun effetto”: se il p scende sotto la soglia, quel termine spiega più variabilità di quanto il caso saprebbe produrre.',
    ],
    sections: [
      {
        heading: 'La lettura dei risultati',
        body: [
          interactionSignificant
            ? `L’interazione è significativa (${fmtP(Number(interactionRow?.p))}): gli effetti principali non vanno letti da soli, perché l’effetto di ciascun fattore cambia a seconda del livello dell’altro. Guarda le medie per cella e il grafico: le linee non parallele sono la firma dell’interazione.`
            : 'L’interazione non è significativa: gli effetti dei due fattori possono essere letti separatamente, come se agissero in modo additivo.',
          ...effects.map(row => describe(row)),
        ],
      },
      {
        heading: 'Quanto pesa ogni effetto',
        body: [
          'η² parziale dice quale quota della variabilità residua (dopo gli altri termini) spiega quel termine: 0,01 è piccolo, 0,06 medio, 0,14 grande secondo i riferimenti di Cohen. ω² corregge il bias verso l’alto e può essere più piccolo, soprattutto con pochi df.',
        ],
        bullets: effects.map(row => `${String(row.source)}: η² parziale = ${fmtEst(Number(row.eta2p), 3)}, ω² = ${fmtEst(Number(row.omega2), 3)}`),
      },
      {
        heading: 'Assunzioni e diagnostica',
        bullets: [
          `R² = ${fmtEst(Number(diag('R²')?.value), 3)}: il modello spiega questa quota della variabilità totale.`,
          `Levene sulle celle: p = ${fmtP(Number(diag('Levene (celle)')?.value))}. Se è sotto 0,05 le varianze non sono omogenee e l’F può essere distorto, soprattutto con gruppi di dimensione diversa.`,
          `Lilliefors sui residui: p = ${fmtP(Number(diag('Lilliefors (residui)')?.value))}. Con residui non normali valuta una trasformazione (log, radice) o un’analisi per ranghi.`,
          'Osservazioni indipendenti: nessuna struttura di misure ripetute o di blocchi è modellata qui.',
        ],
      },
      {
        heading: 'Cosa non dice il test',
        body: [
          'Una F significativa dice che almeno una media differisce, non quale coppia: per quello servono i confronti post-hoc. E nessuna F stabilisce la direzione causale degli effetti.',
        ],
      },
    ],
    limitations: [
      'Le SS sequenziali dipendono dall’ordine dei termini quando il disegno non è bilanciato; in quel caso un software che riporta Type III può dare numeri diversi.',
      'Il modello è additivo a due fattori: non gestisce blocchi, covariate, misure ripetute o tre fattori.',
      'Con celle singole la variabilità interna non è stimabile e il test non è calcolabile.',
    ],
  };
};
