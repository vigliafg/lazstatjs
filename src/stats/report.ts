import type { TableRow, TableSpec } from './types';
import {
  fmtCI,
  fmtEst,
  fmtP,
  interpretD,
  interpretEta,
  interpretPhi,
  interpretR,
} from './format';

/**
 * Written interpretation of a single analysis run.
 *
 * The builders read the result tables that are already shown to the user
 * instead of recomputing the statistics: the prose can therefore never
 * disagree with the numbers on screen and automatically follows the chosen
 * confidence level.
 */
export type ReportTone = 'positive' | 'neutral' | 'caution';

export interface ReportSection {
  heading: string;
  body?: string[];
  bullets?: string[];
}

export interface ReportSpec {
  id: string;
  title: string;
  headline: string;
  badge: string;
  tone: ReportTone;
  intro: string[];
  sections: ReportSection[];
  limitations: string[];
}

const P_SENTENCE =
  'Il p-value è la probabilità di osservare un risultato almeno così estremo se l’ipotesi nulla fosse vera: non è la probabilità che l’ipotesi nulla sia vera.';

const tableById = (tables: TableSpec[], id: string): TableSpec | undefined =>
  tables.find(spec => spec.id === id);

const rowsOf = (tables: TableSpec[], id: string): TableRow[] => tableById(tables, id)?.rows ?? [];

const subtitleOf = (tables: TableSpec[], id: string): string => tableById(tables, id)?.subtitle ?? '';

const rowBy = (rows: TableRow[], key: string, value: string): TableRow | undefined =>
  rows.find(row => String(row[key] ?? '') === value);

const rowLike = (rows: TableRow[], key: string, needle: string): TableRow | undefined =>
  rows.find(row => String(row[key] ?? '').toLowerCase().includes(needle.toLowerCase()));

const num = (row: TableRow | undefined, key: string): number => {
  const value = row?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
};

const text = (row: TableRow | undefined, key: string): string => {
  const value = row?.[key];
  return value === null || value === undefined ? '' : String(value);
};

const alphaOf = (level: number): number => 1 - level / 100;
const alphaText = (level: number): string => alphaOf(level).toFixed(2);
const isDecided = (p: number, level: number): boolean => Number.isFinite(p) && p < alphaOf(level);
/** Reads as "p = 0.032" or "p < 0.001" with the caller's label. */
const describeP = (value: number, label = 'p'): string =>
  !Number.isFinite(value) ? `${label} non calcolabile` : value < 0.001 ? `${label} < 0.001` : `${label} = ${fmtP(value)}`;
const show = (value: number, decimals = 3): string =>
  Number.isFinite(value) ? fmtEst(value, decimals) : '—';
const showInt = (value: number): string =>
  Number.isFinite(value) ? String(Math.round(value)) : '—';
const showCI = (lo: number, hi: number, decimals = 3): string =>
  Number.isFinite(lo) && Number.isFinite(hi) ? fmtCI(lo, hi, decimals) : '—';

const ciSentence = (level: number): string =>
  `L’intervallo di confidenza al ${level}% indica i valori plausibili per la stima: se non contiene lo zero (o il valore di riferimento) il risultato è coerente con un test significativo.`;

// ---------------------------------------------------------------------------
// Descriptive statistics
// ---------------------------------------------------------------------------
export const descriptiveReport = (tables: TableSpec[], level: number): ReportSpec => {
  const location = rowsOf(tables, 'desc-location');
  const dispersion = rowsOf(tables, 'desc-dispersion');
  const shape = rowsOf(tables, 'desc-shape');
  const bullets: string[] = [];
  let nonNormal = 0;
  let withOutliers = 0;
  let largestN = 0;

  location.forEach(loc => {
    const name = text(loc, 'variable');
    const disp = rowBy(dispersion, 'variable', name);
    const shp = rowBy(shape, 'variable', name);

    const nObs = num(loc, 'n');
    const missing = num(loc, 'missing');
    const mean = num(loc, 'mean');
    const median = num(loc, 'median');
    const lo = num(loc, 'ciLo');
    const hi = num(loc, 'ciHi');
    const sd = num(disp, 'sd');
    const cv = num(disp, 'cv');
    const outliers = num(disp, 'outliers');
    const outliersPct = num(disp, 'outliersPct');
    const skew = num(shp, 'skew');
    const jbP = num(shp, 'jbP');
    const ksP = num(shp, 'ksP');
    const k2P = num(shp, 'k2P');

    if (Number.isFinite(nObs)) largestN = Math.max(largestN, nObs);

    const pieces: string[] = [`n = ${showInt(nObs)}`];
    if (Number.isFinite(missing) && missing > 0) pieces.push(`${showInt(missing)} mancanti`);
    if (Number.isFinite(mean)) pieces.push(`media ${show(mean, 2)} (CI ${level}% ${showCI(lo, hi, 2)})`);
    if (Number.isFinite(median)) pieces.push(`mediana ${show(median, 2)}`);
    if (Number.isFinite(sd)) pieces.push(`SD ${show(sd, 2)}`);
    if (Number.isFinite(cv)) pieces.push(`CV ${show(cv, 1)}%`);
    if (Number.isFinite(outliers)) pieces.push(`${showInt(outliers)} valori anomali (${show(outliersPct, 1)}%)`);

    const tests = [jbP, ksP, k2P].filter(value => Number.isFinite(value));
    const rejected = tests.some(value => value < alphaOf(level));
    if (rejected) nonNormal += 1;
    if (Number.isFinite(outliers) && outliers > 0) withOutliers += 1;

    const asymmetry = !Number.isFinite(skew)
      ? 'asimmetria non disponibile'
      : Math.abs(skew) < 0.5
        ? `asimmetria ${show(skew, 2)}, praticamente simmetrica`
        : skew > 0
          ? `asimmetria ${show(skew, 2)}, coda a destra`
          : `asimmetria ${show(skew, 2)}, coda a sinistra`;

    const normality =
      tests.length === 0
        ? 'test di normalità non calcolabili con questo campione'
        : rejected
          ? `normalità rifiutata (JB ${describeP(jbP)}, Lilliefors ${describeP(ksP)}, K² ${describeP(k2P)})`
          : `normalità non rifiutata (JB ${describeP(jbP)}, Lilliefors ${describeP(ksP)}, K² ${describeP(k2P)})`;

    bullets.push(`${name}: ${pieces.join(' · ')}. Distribuzione: ${asymmetry}; ${normality}.`);
  });

  const k = location.length;
  const clean = nonNormal === 0 && withOutliers === 0;
  const headline =
    k === 0
      ? 'Nessuna variabile numerica valida: non c’è nulla da riassumere.'
      : clean
        ? `Quadro regolare: ${k} ${k === 1 ? 'variabile analizzata' : 'variabili analizzate'} (fino a ${largestN} osservazioni), distribuzioni compatibili con la gaussiana e nessun valore anomalo.`
        : `Da leggere con cautela: ${nonNormal} di ${k} ${k === 1 ? 'variabile si discosta' : 'variabili si discostano'} dalla gaussiana e ${withOutliers} ${withOutliers === 1 ? 'contiene' : 'contengono'} valori anomali oltre 1.5 IQR.`;

  return {
    id: 'report-descriptive',
    title: 'Report di lettura — Statistiche descrittive',
    headline,
    badge: k === 0 ? 'Dati insufficienti' : clean ? 'Dati regolari' : 'Da verificare',
    tone: k === 0 ? 'caution' : clean ? 'positive' : 'caution',
    intro: [
      'Questa analisi non verifica ipotesi: fotografa ogni variabile per capire dove sta il centro dei dati, quanto sono dispersi e che forma ha la distribuzione.',
      'Serve a scegliere i test successivi: se media e mediana coincidono e la forma è simmetrica i test parametrici sono adatti; in presenza di asimmetria o valori anomali conviene affiancarli a quelli non parametrici.',
    ],
    sections: [
      { heading: 'Risultato variabile per variabile', bullets },
      {
        heading: 'Come leggere i numeri',
        bullets: [
          'Media e mediana: la media è il baricentro e risente degli estremi, la mediana è il valore centrale e resta stabile. Se differiscono molto, la distribuzione è asimmetrica.',
          ciSentence(level),
          'SD (deviazione standard) misura la dispersione nella stessa unità dei dati; il CV (SD/media) la rende confrontabile tra variabili con scale diverse. IQR e MAD sono alternative robuste agli outlier.',
          'Valori anomali: sono le osservazioni oltre 1.5 × IQR dalle cerniere (regola di Tukey). Controlla se sono errori di inserimento o casi reali da mantenere.',
          `Test di normalità: p ≥ ${alphaText(level)} significa dati compatibili con una gaussiana, p < ${alphaText(level)} la esclude. Con molti dati anche scostamenti irrilevanti diventano significativi: guarda anche istogramma e Q-Q.`,
        ],
      },
      {
        heading: 'Cosa fare adesso',
        bullets: [
          'Due gruppi indipendenti: t-test di Welch, oppure Mann–Whitney U se la normalità è rifiutata.',
          'Misure ripetute sulle stesse righe: t-test appaiato o Wilcoxon signed-rank.',
          'Tre o più gruppi: ANOVA a una via con post-hoc, oppure Kruskal–Wallis.',
          'Relazione tra variabili: correlazione; per prevedere una variabile da altre, regressione lineare.',
        ],
      },
    ],
    limitations: [
      'Le descrittive non dimostrano relazioni causali né differenze tra gruppi: sono una fotografia del campione.',
      'Le celle vuote o non numeriche vengono escluse variabile per variabile, quindi gli N possono differire tra colonne.',
      'Con pochi dati i test di normalità hanno scarsa potenza; con molti dati sono iper-sensibili.',
    ],
  };
};

// ---------------------------------------------------------------------------
// T-test
// ---------------------------------------------------------------------------
export interface TTestReportInput {
  tables: TableSpec[];
  type: 'one' | 'ind' | 'dep';
  name1: string;
  name2: string;
  mu: number;
  level: number;
  equalVar: boolean;
  useNonParam: boolean;
}

export const ttestReport = (input: TTestReportInput): ReportSpec => {
  const { tables, type, name1, name2, mu, level, equalVar, useNonParam } = input;
  const alpha = alphaText(level);

  const main = rowsOf(tables, 'ttest-main')[0];
  const diff = num(main, 'diff');
  const se = num(main, 'se');
  const t = num(main, 't');
  const df = num(main, 'df');
  const pValue = num(main, 'p');
  const lo = num(main, 'ciLo');
  const hi = num(main, 'ciHi');
  const significant = isDecided(pValue, level);

  const effects = rowsOf(tables, 'ttest-effects');
  const d = num(rowLike(effects, 'measure', 'g'), 'estimate');
  const r = num(rowLike(effects, 'measure', 'punto-biseriale'), 'estimate');
  const r2 = num(rowLike(effects, 'measure', 'r²'), 'estimate');

  const assumptions = rowsOf(tables, 'ttest-assumptions');
  const leveneP = num(rowLike(assumptions, 'check', 'levene'), 'p');
  const brownP = num(rowLike(assumptions, 'check', 'brown'), 'p');
  const lillieforsP = num(rowLike(assumptions, 'check', 'lilliefors'), 'p');

  const nonParamTable = type === 'ind' ? 'ttest-mannwhitney' : 'ttest-wilcoxon';
  const nonParam = rowsOf(tables, nonParamTable)[0];
  const nonParamP = num(nonParam, 'p');
  const nonParamName = type === 'ind' ? 'Mann–Whitney U' : 'Wilcoxon signed-rank';

  const varianceIssue = type === 'ind' && equalVar && Number.isFinite(leveneP) && leveneP < alphaOf(level);
  const normalityIssue = Number.isFinite(lillieforsP) && lillieforsP < alphaOf(level);
  const caution = varianceIssue || normalityIssue;

  const comparison = type === 'ind'
    ? `${name1} e ${name2}`
    : type === 'dep'
      ? `${name1} − ${name2}`
      : `${name1} e il valore di riferimento ${mu}`;

  const effectPhrase = Number.isFinite(d)
    ? ` L’effetto è ${interpretD(d)} (Hedges g = ${show(d, 2)}).`
    : '';

  const headline = !Number.isFinite(pValue)
    ? 'Il test non è calcolabile con i dati disponibili.'
    : significant
      ? `Le medie di ${comparison} sono diverse: ${describeP(pValue)} (soglia α = ${alpha}).${effectPhrase}`
      : `Non emerge una differenza statisticamente significativa tra ${comparison}: ${describeP(pValue)} (soglia α = ${alpha}).${effectPhrase}`;

  const decision = significant
    ? `Poiché ${describeP(pValue)} resta sotto la soglia α = ${alpha}, l’ipotesi nulla viene rifiutata: la differenza osservata è difficile da spiegare con la sola variabilità campionaria.`
    : `Poiché ${describeP(pValue)} non raggiunge la soglia α = ${alpha}, l’ipotesi nulla non viene rifiutata: i dati non bastano per affermare che esista una differenza.`;

  const zeroInside =
    type === 'one'
      ? Number.isFinite(lo) && Number.isFinite(hi) && mu >= lo && mu <= hi
      : Number.isFinite(lo) && Number.isFinite(hi) && lo <= 0 && hi >= 0;

  const ciText =
    type === 'one'
      ? `Intervallo di confidenza al ${level}% della media: ${showCI(lo, hi, 3)}. ${zeroInside ? `Contiene ${mu}, quindi è coerente con un test non significativo.` : `Non contiene ${mu}, quindi è coerente con un test significativo.`}`
      : `Intervallo di confidenza al ${level}% della differenza: ${showCI(lo, hi, 3)}. ${zeroInside ? 'Contiene lo zero, quindi è coerente con un test non significativo.' : 'Non contiene lo zero, quindi è coerente con un test significativo.'}`;

  const intro =
    type === 'one'
      ? [
          `Confronta la media di ${name1} con il valore di riferimento μ₀ = ${mu}. L’ipotesi nulla è che la media della popolazione sia uguale a quel valore.`,
          'Il test t divide la distanza tra media osservata e valore atteso per l’errore standard: un t grande significa che la distanza è grande rispetto al rumore dei dati.',
        ]
      : type === 'ind'
        ? [
            `Confronta le medie di due gruppi indipendenti, ${name1} e ${name2}, presi da righe diverse del foglio. L’ipotesi nulla è che le due medie nella popolazione siano uguali.`,
            'Il test t divide la differenza tra le medie per l’errore standard della differenza: un t grande significa che lo scarto è grande rispetto alla variabilità dei due gruppi.',
          ]
        : [
            `Confronta due misure prese sulle stesse righe, ${name1} e ${name2}, lavorando sulle differenze riga per riga. L’ipotesi nulla è che la differenza media nella popolazione sia zero.`,
            'Ogni riga viene ridotta a una sola differenza, poi si controlla quanto quella differenza media è lontana da zero rispetto alla sua variabilità.',
          ];

  const sections: ReportSection[] = [
    {
      heading: 'Il test principale',
      bullets: [
        type === 'one'
          ? `Differenza media rispetto a μ₀: ${show(diff, 3)}.`
          : `Differenza tra le medie: ${show(diff, 3)} (${name1} − ${name2}).`,
        `Errore standard della stima: ${show(se, 3)}.`,
        `Statistica t = ${show(t, 3)} con df = ${show(df, 2)}.`,
        `${describeP(pValue, 'p-value a due code')} (soglia α = ${alpha}).`,
        decision,
        ciText,
      ],
    },
    {
      heading: 'Quanto è grande la differenza',
      bullets: [
        Number.isFinite(d)
          ? `Hedges g = ${show(d, 2)}: effetto ${interpretD(d)} secondo le soglie convenzionali (0.2 piccolo, 0.5 medio, 0.8 grande).`
          : 'Effect size non calcolabile con questo campione.',
        Number.isFinite(r)
          ? `Correlazione con l’appartenenza al gruppo: r = ${show(r, 3)}, cioè un’associazione ${interpretR(r)}.`
          : '',
        Number.isFinite(r2)
          ? `r² = ${show(r2, 3)}: circa il ${show(r2 * 100, 1)}% della variabilità è riconducibile alla differenza tra le condizioni.`
          : '',
        'Un effetto statisticamente significativo può essere piccolo: con molti dati basta una differenza minima. La significatività dice che la differenza è probabilmente reale, non che è importante.',
      ].filter(Boolean),
    },
    {
      heading: 'Assunzioni e alternative',
      bullets: [
        Number.isFinite(lillieforsP)
          ? `Normalità: Lilliefors ${describeP(lillieforsP)} → ${normalityIssue ? `rifiutata, quindi il test t va letto con cautela (soglia ${alpha})` : 'non rifiutata, assunzione ragionevole'}.`
          : 'Normalità: questa tabella non riporta il test sui due gruppi; con n ≥ 30 per gruppo il t-test è comunque robusto, altrimenti controlla le descrittive di ogni gruppo prima di fidarti del p.',
        type === 'ind'
          ? Number.isFinite(leveneP)
            ? `Uguaglianza delle varianze: Levene ${describeP(leveneP)}${Number.isFinite(brownP) ? `, Brown–Forsythe ${describeP(brownP)}` : ''} → ${varianceIssue ? 'varianze probabilmente diverse: meglio il t di Welch' : 'nessuna evidenza contro l’uguaglianza delle varianze'}.`
            : 'Uguaglianza delle varianze non verificabile con questi dati.'
          : '',
        type === 'dep'
          ? 'Nel disegno appaiato l’assunzione riguarda la normalità delle differenze, non delle due misure separatamente: l’ordine delle righe deve corrispondere alla stessa unità osservata.'
          : '',
        useNonParam && Number.isFinite(nonParamP)
          ? `${nonParamName}: ${describeP(nonParamP)} → ${isDecided(nonParamP, level) ? 'conferma la presenza di una differenza' : 'non conferma la differenza'}; confrontare i due risultati dà la misura di quanto l’esito dipenda dall’assunzione di normalità.`
          : '',
      ].filter(Boolean),
    },
    {
      heading: 'In pratica',
      body: [
        significant
          ? `La differenza tra ${comparison} è probabilmente reale. Per decidere se è rilevante, confronta l’ampiezza con quella che consideri clinicamente o praticamente importante: l’effetto misurato è ${Number.isFinite(d) ? interpretD(d) : 'non quantificabile'}.`
          : `I dati non mostrano una differenza affidabile tra ${comparison}. Questo non dimostra che le medie siano identiche: con pochi dati il test ha poca potenza e una differenza reale può restare invisibile.`,
        'Se il risultato è al limite della soglia, aumenta il campione o replica lo studio prima di prendere decisioni.',
      ],
    },
    {
      heading: 'Come leggere i numeri',
      bullets: [
        P_SENTENCE,
        ciSentence(level),
        'df (gradi di libertà) descrive quanta informazione indipendente resta nei dati: più è grande, più il test è preciso.',
        'Hedges g è la differenza espressa in deviazioni standard: rende confrontabili misure con unità diverse.',
      ],
    },
  ];

  return {
    id: 'report-ttest',
    title: 'Report di lettura — Test t',
    headline,
    badge: significant ? 'Differenza rilevata' : 'Nessuna differenza',
    tone: significant ? (caution ? 'caution' : 'positive') : caution ? 'caution' : 'neutral',
    intro,
    sections,
    limitations: [
      type === 'dep'
        ? 'Le righe vengono appaiate per posizione: se l’ordine delle osservazioni non è corretto il test perde senso.'
        : 'Il test riguarda le medie: se la distribuzione è molto asimmetrica, la mediana e i test non parametrici descrivono meglio il fenomeno.',
      'Un p-value non dice nulla sulla dimensione dell’effetto né sulla rilevanza pratica del risultato.',
      'Con più confronti ripetuti aumenta la probabilità di falsi positivi: correggi per le comparazioni multiple o pianifica un solo confronto principale.',
    ],
  };
};

// ---------------------------------------------------------------------------
// ANOVA
// ---------------------------------------------------------------------------
export interface AnovaReportInput {
  tables: TableSpec[];
  depName: string;
  grpName: string;
  level: number;
  postHoc: string;
  useNonParam: boolean;
}

export const anovaReport = (input: AnovaReportInput): ReportSpec => {
  const { tables, depName, grpName, level, postHoc, useNonParam } = input;
  const alpha = alphaText(level);

  const groups = rowsOf(tables, 'anova-groups');
  const between = rowLike(rowsOf(tables, 'anova-table'), 'source', 'between');
  const total = rowLike(rowsOf(tables, 'anova-table'), 'source', 'total');
  const f = num(between, 'f');
  const pValue = num(between, 'p');
  const dfBetween = num(between, 'df');
  const dfTotal = num(total, 'df');
  const dfWithin = dfTotal - dfBetween;
  const significant = isDecided(pValue, level);

  const effects = rowsOf(tables, 'anova-effects');
  const eta2 = num(rowBy(effects, 'measure', 'η²'), 'estimate');
  const omega2 = num(rowBy(effects, 'measure', 'ω²'), 'estimate');

  const assumptions = rowsOf(tables, 'anova-assumptions');
  const leveneP = num(rowLike(assumptions, 'check', 'levene'), 'p');
  const brownP = num(rowLike(assumptions, 'check', 'brown'), 'p');
  const sdRatio = num(rowLike(assumptions, 'check', 'rapporto sd'), 'statistic');
  const welchP = num(rowLike(assumptions, 'check', 'welch'), 'p');

  const posthocRows = rowsOf(tables, 'anova-posthoc');
  const kruskal = rowsOf(tables, 'anova-kruskal')[0];
  const kruskalP = num(kruskal, 'p');
  const kruskalEta = num(kruskal, 'etaH');

  const headline = !Number.isFinite(pValue)
    ? 'L’ANOVA non è calcolabile con i dati disponibili.'
    : significant
      ? `Le medie di ${depName} differiscono tra i gruppi di ${grpName}: F = ${show(f, 3)}, ${describeP(pValue)} (soglia α = ${alpha})${Number.isFinite(eta2) ? `, η² = ${show(eta2, 3)} (effetto ${interpretEta(eta2)})` : ''}.`
      : `Non emerge una differenza tra le medie di ${depName} nei gruppi di ${grpName}: F = ${show(f, 3)}, ${describeP(pValue)} (soglia α = ${alpha}).`;

  const groupBullets = groups.map(group => {
    const label = text(group, 'group');
    return `${label}: n = ${showInt(num(group, 'n'))}, media ${show(num(group, 'mean'), 2)} (CI ${level}% ${showCI(num(group, 'ciLo'), num(group, 'ciHi'), 2)}), mediana ${show(num(group, 'median'), 2)}, SD ${show(num(group, 'sd'), 2)}.`;
  });

  const posthocBullets = posthocRows.map(row => {
    const comparison = text(row, 'comparison');
    const pAdj = num(row, 'pAdj');
    const d = num(row, 'd');
    return `${comparison}: differenza ${show(num(row, 'diff'), 3)}, ${describeP(pAdj, 'p corretto')} → ${isDecided(pAdj, level) ? 'differenza significativa' : 'nessuna differenza affidabile'}${Number.isFinite(d) ? `; Cohen’s d = ${show(d, 2)} (${interpretD(d)})` : ''}.`;
  });

  const sections: ReportSection[] = [
    { heading: 'Medie dei gruppi', bullets: groupBullets },
    {
      heading: 'Il test principale',
      bullets: [
        `Statistica F = ${show(f, 3)} con df = (${show(dfBetween, 0)}, ${showInt(dfWithin)}).`,
        `${describeP(pValue, 'p-value')} (soglia α = ${alpha}).`,
        significant
          ? 'Almeno una media di gruppo è diversa dalle altre: l’ipotesi nulla di medie tutte uguali viene rifiutata.'
          : 'L’ipotesi nulla di medie tutte uguali non viene rifiutata: i dati non mostrano differenze affidabili tra i gruppi.',
        `Varianza spiegata dai gruppi: η² = ${show(eta2, 3)}, cioè circa il ${show(eta2 * 100, 1)}% della variabilità totale di ${depName}.`,
        Number.isFinite(omega2) ? `ω² = ${show(omega2, 3)}: stima meno distorta della quota di varianza spiegata nella popolazione.` : '',
      ].filter(Boolean),
    },
  ];

  if (posthocRows.length > 0) {
    sections.push({
      heading: `Confronti post-hoc (${postHoc})`,
      body: [
        'L’ANOVA dice solo che i gruppi non sono tutti uguali: per sapere quali coppie differiscono servono i confronti a coppie, con p già corretti per il numero di confronti.',
      ],
      bullets: posthocBullets,
    });
  }

  sections.push({
    heading: 'Assunzioni e robustezza',
    bullets: [
      Number.isFinite(leveneP)
        ? `Omoschedasticità: Levene ${describeP(leveneP)}${Number.isFinite(brownP) ? `, Brown–Forsythe ${describeP(brownP)}` : ''} → ${leveneP < alphaOf(level) ? 'varianze non omogenee, quindi l’ANOVA classica è a rischio e conviene usare Welch o Kruskal–Wallis' : 'assunzione di varianze uguali plausibile'}.`
        : 'Omoschedasticità non verificabile con questi dati.',
      Number.isFinite(sdRatio) ? `Rapporto tra SD massima e minima: ${show(sdRatio, 2)} (valori molto sopra 2 indicano gruppi con dispersione diversa).` : '',
      Number.isFinite(welchP) ? `Welch ANOVA: ${describeP(welchP)} → ${isDecided(welchP, level) ? 'conferma la differenza tra le medie anche senza assumere varianze uguali' : 'non conferma la differenza quando le varianze sono libere di differire'}.` : '',
      'I gruppi dovrebbero provenire da osservazioni indipendenti: la stessa unità non deve comparire in due gruppi.',
    ].filter(Boolean),
  });

  if (useNonParam && kruskal) {
    sections.push({
      heading: 'Alternativa non parametrica',
      bullets: [
        `Kruskal–Wallis: H = ${show(num(kruskal, 'h'), 3)} con df = ${showInt(num(kruskal, 'df'))}, ${describeP(kruskalP)} → ${isDecided(kruskalP, level) ? 'conferma che almeno un gruppo si distribuisce diversamente' : 'non conferma differenze tra i gruppi'}.`,
        Number.isFinite(kruskalEta) ? `η²_H = ${show(kruskalEta, 3)}: dimensione dell’effetto stimata sui ranghi.` : '',
        'Confronta i due esiti: se divergono, il risultato parametrico dipende dall’assunzione di normalità e va presentato con maggiore prudenza.',
      ].filter(Boolean),
    });
  }

  sections.push({
    heading: 'Come leggere i numeri',
    bullets: [
      P_SENTENCE,
      'F confronta la variabilità tra i gruppi con quella dentro i gruppi: valori vicini a 1 indicano che i gruppi non si distinguono.',
      'η² (eta quadro) è la quota di variabilità spiegata dal fattore: 0.01 piccolo, 0.06 medio, 0.14 grande.',
      'I p post-hoc sono già corretti: usali al posto dei p dei singoli t-test, che sarebbero troppo ottimisti.',
    ],
  });

  sections.push({
    heading: 'In pratica',
    body: [
      significant
        ? `Il fattore ${grpName} spiega una parte ${Number.isFinite(eta2) ? interpretEta(eta2) : 'non quantificabile'} della variabilità di ${depName}. Per capire quali gruppi si distinguono, leggi i confronti post-hoc qui sopra.`
        : `Non ci sono prove sufficienti che ${grpName} sposti ${depName}. Con gruppi piccoli l’ANOVA ha poca potenza: l’assenza di significatività non equivale all’assenza di effetto.`,
    ],
  });

  return {
    id: 'report-anova',
    title: 'Report di lettura — ANOVA a una via',
    headline,
    badge: significant ? 'Gruppi diversi' : 'Nessuna differenza',
    tone: significant ? 'caution' : 'neutral',
    intro: [
      `Verifica se la media di ${depName} cambia tra i livelli del fattore ${grpName}. L’ipotesi nulla è che tutte le medie dei gruppi siano uguali.`,
      'L’ANOVA confronta la variabilità tra i gruppi con quella interna ai gruppi: se i gruppi differiscono davvero, la prima è grande rispetto alla seconda.',
    ],
    sections,
    limitations: [
      'L’ANOVA richiede osservazioni indipendenti: misure ripetute sulla stessa unità richiedono un modello per dati appaiati.',
      'Con gruppi molto sbilanciati o varianze molto diverse il test classico può dare p inaffidabili: usa Welch ANOVA o Kruskal–Wallis.',
      'La significatività globale non dice quali gruppi differiscono: servono sempre i confronti post-hoc.',
    ],
  };
};

// ---------------------------------------------------------------------------
// Regression
// ---------------------------------------------------------------------------
export interface RegressionReportInput {
  tables: TableSpec[];
  depName: string;
  predNames: string[];
  level: number;
}

export const regressionReport = (input: RegressionReportInput): ReportSpec => {
  const { tables, depName, predNames, level } = input;
  const alpha = alphaText(level);

  const model = rowsOf(tables, 'reg-model');
  const nObs = num(rowBy(model, 'metric', 'N'), 'value');
  const r2 = num(rowBy(model, 'metric', 'R²'), 'value');
  const adjR2 = num(rowBy(model, 'metric', 'Adjusted R²'), 'value');
  const f = num(rowBy(model, 'metric', 'F'), 'value');
  const fP = num(rowBy(model, 'metric', 'p (F)'), 'value');
  const modelSignificant = isDecided(fP, level);

  const coefficients = rowsOf(tables, 'reg-coefficients');
  const predictors = coefficients.filter(row => text(row, 'predictor') !== '(Intercept)');
  const significantPredictors = predictors.filter(row => isDecided(num(row, 'p'), level));

  const diagnostics = rowsOf(tables, 'reg-diagnostics');
  const bpP = num(rowBy(diagnostics, 'metric', 'Breusch–Pagan p'), 'value');
  const residOutliers = num(rowBy(diagnostics, 'metric', 'Residui studentizzati |z| > 3'), 'value');
  const vifValues = predictors
    .map(row => num(row, 'vif'))
    .filter(value => Number.isFinite(value));
  const maxVif = vifValues.length > 0 ? Math.max(...vifValues) : NaN;

  const residualStats = rowsOf(tables, 'reg-residuals');
  const jbP = num(rowBy(residualStats, 'metric', 'Jarque–Bera p'), 'ols');
  const lillieforsP = num(rowBy(residualStats, 'metric', 'Lilliefors p'), 'ols');

  const robustRows = rowsOf(tables, 'reg-robust');
  const slopeRow = rowLike(robustRows, 'measure', 'slope');
  const robustSummary = subtitleOf(tables, 'reg-robust');

  const predictorBullets = predictors.map(row => {
    const name = text(row, 'predictor');
    const b = num(row, 'b');
    const beta = num(row, 'beta');
    const pValue = num(row, 'p');
    const lo = num(row, 'ciLo');
    const hi = num(row, 'ciHi');
    const vif = num(row, 'vif');
    const direction = Number.isFinite(b) ? (b > 0 ? 'aumenta' : b < 0 ? 'diminuisce' : 'non cambia') : 'non stimabile';
    return `${name}: B = ${show(b, 3)} (CI ${level}% ${showCI(lo, hi, 3)}), ${describeP(pValue)} → ${isDecided(pValue, level) ? 'predittore significativo' : 'nessuna evidenza di effetto'}. In media, un aumento di una unità di ${name} ${direction} ${depName} di ${show(Math.abs(b), 3)} a parità delle altre variabili${Number.isFinite(beta) ? `; β standardizzato = ${show(beta, 2)}` : ''}${Number.isFinite(vif) && vif > 5 ? `; VIF = ${show(vif, 2)} segnala collinearità` : ''}.`;
  });

  const headline = !Number.isFinite(fP)
    ? 'Il modello non è stimabile con i dati disponibili.'
    : modelSignificant
      ? `Il modello è significativo (F = ${show(f, 3)}, ${describeP(fP)}) e spiega il ${show((r2 ?? 0) * 100, 1)}% della variabilità di ${depName}.`
      : `Il modello non è significativo (F = ${show(f, 3)}, ${describeP(fP)}): i predittori non spiegano ${depName} meglio del caso.`;

  const sections: ReportSection[] = [
    {
      heading: 'Il modello nel suo insieme',
      bullets: [
        `Osservazioni usate: ${showInt(nObs)} (solo righe complete su tutte le variabili del modello).`,
        `R² = ${show(r2, 3)} → il modello spiega il ${show((r2 ?? 0) * 100, 1)}% della variabilità di ${depName}.`,
        `R² corretto = ${show(adjR2, 3)} → quota spiegata al netto del numero di predittori; se è molto più basso di R² il modello è sovra-adattato.`,
        `Test globale: F = ${show(f, 3)}, ${describeP(fP)} (α = ${alpha}) → ${modelSignificant ? 'il modello nel complesso è utile' : 'il modello nel complesso non è distinguibile dal caso'}.`,
      ],
    },
    {
      heading: 'Ogni predittore',
      bullets: predictorBullets.length > 0 ? predictorBullets : ['Nessun coefficiente disponibile.'],
    },
    {
      heading: 'Diagnostica',
      bullets: [
        Number.isFinite(bpP)
          ? `Breusch–Pagan ${describeP(bpP)} → ${bpP < alphaOf(level) ? 'eteroschedasticità dei residui: gli errori standard e i p-value possono essere inaffidabili' : 'nessuna evidenza di eteroschedasticità'}.`
          : 'Eteroschedasticità non verificabile.',
        Number.isFinite(jbP) ? `Normalità dei residui: Jarque–Bera ${describeP(jbP)}${Number.isFinite(lillieforsP) ? `, Lilliefors ${describeP(lillieforsP)}` : ''} → ${jbP < alphaOf(level) ? 'residui non gaussiani: gli intervalli di confidenza vanno letti con prudenza' : 'nessuna evidenza contro la normalità dei residui'}.` : '',
        Number.isFinite(residOutliers) && residOutliers > 0 ? `${showInt(residOutliers)} osservazioni con residuo studentizzato oltre 3 SD: verificane l’influenza sulle stime.` : 'Nessun residuo studentizzato oltre 3 SD: nessun caso fortemente anomalo rispetto al modello.',
        Number.isFinite(maxVif) ? `VIF massimo = ${show(maxVif, 2)} ${maxVif > 5 ? '→ collinearità problematica: i coefficienti dei predittori coinvolti sono instabili' : '→ collinearità sotto la soglia di attenzione (5)'}.` : '',
      ].filter(Boolean),
    },
  ];

  if (slopeRow) {
    sections.push({
      heading: 'Stima robusta Theil–Sen',
      body: [
        `Confronto tra OLS e stimatore robusto${robustSummary ? ` (${robustSummary})` : ''}: se le due pendenze sono simili, gli outlier non stanno distorcendo il risultato.`,
      ],
      bullets: [
        `Pendenza OLS = ${show(num(slopeRow, 'ols'), 3)}, pendenza Theil–Sen = ${show(num(slopeRow, 'ts'), 3)} (CI ${level}% ${showCI(num(slopeRow, 'ciLo'), num(slopeRow, 'ciHi'), 3)}).`,
        `Differenza percentuale: ${Number.isFinite(num(slopeRow, 'ols')) && num(slopeRow, 'ols') !== 0 ? show(Math.abs((num(slopeRow, 'ts') - num(slopeRow, 'ols')) / num(slopeRow, 'ols')) * 100, 1) : '—'}%.`,
      ],
    });
  }

  sections.push({
    heading: 'Come leggere i numeri',
    bullets: [
      'B è il cambiamento atteso nella variabile dipendente per una unità in più del predittore, tenendo fermi gli altri: l’unità conta, e molto.',
      `Il CI al ${level}% del coefficiente è la forbice dei valori plausibili: se contiene lo zero l’effetto non è distinguibile da nessun effetto.`,
      P_SENTENCE,
      'R² alto non significa modello corretto: guarda sempre residui, diagnostica e senso delle variabili.',
    ],
  });

  sections.push({
    heading: 'In pratica',
    body: [
      modelSignificant && significantPredictors.length > 0
        ? `I predittori con effetto affidabile sono: ${significantPredictors.map(row => text(row, 'predictor')).join(', ')}. L’associazione stimata non è una prova di causa-effetto: serve un disegno che escluda fattori confondenti.`
        : 'Nessun predittore mostra un effetto affidabile: il modello, così com’è, non è uno strumento di previsione utile su questi dati.',
      `Equazione stimata: ${depName} = ${show(num(coefficients[0], 'b'), 3)}${predictors.map(row => ` + (${show(num(row, 'b'), 3)}) × ${text(row, 'predictor')}`).join('')}.`,
    ],
  });

  return {
    id: 'report-regression',
    title: 'Report di lettura — Regressione',
    headline,
    badge: modelSignificant ? 'Modello utile' : 'Modello non utile',
    tone: modelSignificant ? (Number.isFinite(bpP) && bpP < alphaOf(level) ? 'caution' : 'positive') : 'neutral',
    intro: [
      `Stima come ${depName} cambia al variare di ${predNames.join(', ')} e quanto quella relazione spiega dei dati osservati.`,
      'Il modello cerca la retta (o l’iperpiano) che rende minima la somma degli scarti al quadrato: i coefficienti indicano l’effetto di ogni variabile tenendo ferme le altre.',
    ],
    sections,
    limitations: [
      'La regressione descrive associazioni, non cause: variabili omesse o invertite possono spiegare lo stesso pattern.',
      'Le previsioni valgono solo dentro l’intervallo dei valori osservati: fuori da quel range l’estrapolazione è arbitraria.',
      'Le righe incomplete vengono scartate per intero: se i dati mancanti non sono casuali il modello può essere distorto.',
    ],
  };
};

// ---------------------------------------------------------------------------
// Correlation
// ---------------------------------------------------------------------------
export interface CorrelationReportInput {
  tables: TableSpec[];
  method: 'pearson' | 'spearman' | 'kendall';
  level: number;
}

export const correlationReport = (input: CorrelationReportInput): ReportSpec => {
  const { tables, method, level } = input;
  const pairs = rowsOf(tables, 'corr-pairs');
  const alpha = alphaText(level);

  const coefficientKey = method === 'spearman' ? 'spearman' : method === 'kendall' ? 'kendall' : 'pearson';
  const pKey = method === 'spearman' ? 'spearmanP' : method === 'kendall' ? 'kendallP' : 'pearsonP';
  const methodLabel = method === 'spearman' ? 'Spearman ρ' : method === 'kendall' ? 'Kendall τ' : 'Pearson r';

  const described = pairs.map(pair => {
    const a = text(pair, 'a');
    const b = text(pair, 'b');
    const r = num(pair, coefficientKey);
    const pValue = num(pair, pKey);
    const pearsonR = num(pair, 'pearson');
    const pearsonP = num(pair, 'pearsonP');
    return { a, b, r, pValue, pearsonR, pearsonP };
  });

  const significant = described.filter(pair => isDecided(pair.pValue, level));
  const strongest = described.reduce<(typeof described)[number] | null>((best, pair) => {
    if (!Number.isFinite(pair.r)) return best;
    if (!best) return pair;
    return Math.abs(pair.r) > Math.abs(best.r) ? pair : best;
  }, null);

  const bullets = described.map(pair => {
    const direction = !Number.isFinite(pair.r)
      ? 'non calcolabile'
      : pair.r > 0
        ? 'positiva (al crescere di una cresce l’altra)'
        : 'negativa (al crescere di una l’altra cala)';
    const r2 = Number.isFinite(pair.r) ? pair.r * pair.r : NaN;
    return `${pair.a} × ${pair.b}: ${methodLabel} = ${show(pair.r, 3)}, ${describeP(pair.pValue)} → associazione ${isDecided(pair.pValue, level) ? `${interpretR(pair.r)} e significativa` : 'non significativa'}; relazione ${direction}; r² = ${show(r2, 3)} (${show(r2 * 100, 1)}% di varianza condivisa)${method !== 'pearson' && Number.isFinite(pair.pearsonR) ? `; Pearson r = ${show(pair.pearsonR, 3)} (${describeP(pair.pearsonP)})` : ''}.`;
  });

  const headline = !strongest || !Number.isFinite(strongest.r)
    ? 'Nessuna correlazione calcolabile con i dati disponibili.'
    : isDecided(strongest.pValue, level)
      ? `L’associazione più forte è ${strongest.a} × ${strongest.b}: ${methodLabel} = ${show(strongest.r, 3)}, ${interpretR(strongest.r)} e significativa (${describeP(strongest.pValue)}).`
      : `Nessuna associazione raggiunge la significatività: la più forte è ${strongest.a} × ${strongest.b} (${methodLabel} = ${show(strongest.r, 3)}, ${describeP(strongest.pValue)}).`;

  const sections: ReportSection[] = [
    { heading: 'Coppia per coppia', bullets },
    {
      heading: 'Quanto è forte il legame',
      bullets: [
        Number.isFinite(strongest?.r ?? NaN)
          ? `Il coefficiente va da −1 a +1: ${show(strongest!.r, 3)} corrisponde a un legame ${interpretR(strongest!.r)}; il segno indica solo la direzione.`
          : 'Coefficiente non disponibile.',
        Number.isFinite(strongest?.r ?? NaN)
          ? `r² = ${show(strongest!.r * strongest!.r, 3)}: le due variabili condividono circa il ${show(strongest!.r * strongest!.r * 100, 1)}% della variabilità, il resto dipende da altro.`
          : '',
        significant.length === 0
          ? 'Nessuna coppia supera la soglia scelta: le oscillazioni osservate sono compatibili con il caso.'
          : `${significant.length} ${significant.length === 1 ? 'coppia supera' : 'coppie superano'} la soglia di significatività: con molti confronti qualche falso positivo è atteso, quindi dai priorità alle associazioni più forti e coerenti con l’ipotesi di partenza.`,
      ].filter(Boolean),
    },
  ];

  const partial = rowsOf(tables, 'corr-partial');
  if (partial.length > 0) {
    sections.push({
      heading: 'Correlazioni parziali',
      body: [
        'La correlazione parziale misura il legame tra due variabili togliendo l’effetto delle altre: se crolla rispetto a quella semplice, il legame era in buona parte spiegato dalle variabili controllate.',
      ],
      bullets: partial.map(row => `${text(row, 'a')} × ${text(row, 'b')} controllando ${text(row, 'controls')}: r = ${show(num(row, 'r'), 3)}, ${describeP(num(row, 'p'))} → ${isDecided(num(row, 'p'), level) ? 'legame residuo significativo' : 'nessun legame residuo affidabile'}.`),
    });
  }

  sections.push({
    heading: 'Come leggere i numeri',
    bullets: [
      method === 'pearson'
        ? 'Pearson misura un legame lineare: una relazione curva forte può dare r vicino a zero.'
        : method === 'spearman'
          ? 'Spearman lavora sui ranghi: misura un legame monotono e resiste agli outlier e alle scale non lineari.'
          : 'Kendall confronta coppie concordanti e discordanti: è robusto e adatto a campioni piccoli con molti ranghi pari.',
      `p < ${alpha} indica che il coefficiente è difficilmente spiegabile dal solo caso; non dice che il legame sia forte.`,
      'N varia tra le coppie quando alcune righe hanno valori mancanti: coefficienti con N molto diverso non sono direttamente confrontabili.',
    ],
  });

  return {
    id: 'report-correlation',
    title: 'Report di lettura — Correlazione',
    headline,
    badge: significant.length > 0 ? 'Associazione presente' : 'Nessuna associazione',
    tone: significant.length > 0 ? 'positive' : 'neutral',
    intro: [
      'Misura se due variabili si muovono insieme e con quale intensità, senza ipotizzare quale delle due influenzi l’altra.',
      'Il coefficiente è compreso tra −1 e +1: lo zero indica assenza di legame, i valori estremi un legame quasi perfetto in una direzione o nell’altra.',
    ],
    sections,
    limitations: [
      'Correlazione non è causalità: una terza variabile può spiegare entrambe, oppure la direzione può essere inversa.',
      'Gli outlier e le distribuzioni molto asimmetriche possono gonfiare o azzerare il coefficiente: controlla sempre il grafico a dispersione.',
      'Una correlazione calcolata su un intervallo ristretto di valori tende a sottostimare il legame reale.',
    ],
  };
};

// ---------------------------------------------------------------------------
// Chi-square
// ---------------------------------------------------------------------------
export interface ChiSquareReportInput {
  tables: TableSpec[];
  level: number;
  row1: string;
  row2: string;
  col1: string;
  col2: string;
}

export const chiSquareReport = (input: ChiSquareReportInput): ReportSpec => {
  const { tables, level, row1, row2, col1, col2 } = input;
  const alpha = alphaText(level);

  const tests = rowsOf(tables, 'chisq-tests');
  const pearson = rowLike(tests, 'test', 'pearson');
  const g2 = rowLike(tests, 'test', 'likelihood');
  const yates = rowLike(tests, 'test', 'yates');
  const fisher = rowLike(tests, 'test', 'fisher');

  const chi2 = num(pearson, 'statistic');
  const chi2P = num(pearson, 'p');
  const fisherP = num(fisher, 'p');
  const significant = isDecided(chi2P, level);

  const effects = rowsOf(tables, 'chisq-effects');
  const phi = num(rowBy(effects, 'measure', 'φ (phi)'), 'estimate');
  const oddsRatio = num(rowBy(effects, 'measure', 'Odds Ratio'), 'estimate');
  const orLo = num(rowBy(effects, 'measure', 'Odds Ratio'), 'ciLo');
  const orHi = num(rowBy(effects, 'measure', 'Odds Ratio'), 'ciHi');
  const relativeRisk = num(rowBy(effects, 'measure', 'Relative Risk'), 'estimate');

  const assumptions = rowsOf(tables, 'chisq-assumptions');
  const minExpected = num(rowBy(assumptions, 'metric', 'Frequenza attesa minima'), 'value');
  const lowCells = num(rowBy(assumptions, 'metric', 'Celle con E < 5'), 'value');
  const total = num(rowBy(assumptions, 'metric', 'N'), 'value');

  const cells = rowsOf(tables, 'chisq-contingency');
  const strongestCell = cells.reduce<TableRow | null>((best, cell) => {
    const adjusted = num(cell, 'adjusted');
    if (!Number.isFinite(adjusted)) return best;
    if (!best) return cell;
    return Math.abs(adjusted) > Math.abs(num(best, 'adjusted')) ? cell : best;
  }, null);

  const smallSample = Number.isFinite(minExpected) && minExpected < 5;
  const headline = !Number.isFinite(chi2P)
    ? 'Il test non è calcolabile con i dati disponibili.'
    : significant
      ? `Esiste un’associazione tra ${row1}/${row2} e ${col1}/${col2}: χ² = ${show(chi2, 3)}, ${describeP(chi2P)} (soglia α = ${alpha})${Number.isFinite(phi) ? `, φ = ${show(phi, 3)} (${interpretPhi(phi)})` : ''}.`
      : `Non emerge un’associazione tra ${row1}/${row2} e ${col1}/${col2}: χ² = ${show(chi2, 3)}, ${describeP(chi2P)} (soglia α = ${alpha}).`;

  const sections: ReportSection[] = [
    {
      heading: 'Il test principale',
      bullets: [
        `Pearson χ² = ${show(chi2, 3)} con df = ${showInt(num(pearson, 'df'))}, ${describeP(chi2P)} (α = ${alpha}).`,
        Number.isFinite(num(g2, 'statistic')) ? `Rapporto di verosimiglianza G² = ${show(num(g2, 'statistic'), 3)}, ${describeP(num(g2, 'p'))}: lettura alternativa, di solito concorde.` : '',
        Number.isFinite(num(yates, 'p')) ? `Correzione di continuità di Yates: ${describeP(num(yates, 'p'))} (più prudente su tabelle 2×2).` : '',
        Number.isFinite(fisherP) ? `Fisher esatto: ${describeP(fisherP)} → ${isDecided(fisherP, level) ? 'conferma l’associazione' : 'non conferma l’associazione'}; è il riferimento quando le frequenze attese sono piccole.` : '',
        significant
          ? 'Le due variabili non sono indipendenti: la distribuzione delle risposte cambia tra le righe.'
          : 'Le differenze osservate sono compatibili con l’indipendenza tra righe e colonne.',
      ].filter(Boolean),
    },
    {
      heading: 'Dove sta l’associazione',
      bullets: [
        strongestCell
          ? `La cella che contribuisce di più è «${text(strongestCell, 'cell')}»: osservati ${showInt(num(strongestCell, 'observed'))}, attesi ${show(num(strongestCell, 'expected'), 2)}, residuo aggiustato ${show(num(strongestCell, 'adjusted'), 2)} → ${Math.abs(num(strongestCell, 'adjusted')) > 2 ? 'differenza rispetto all’atteso superiore a 2, quindi rilevante' : 'scostamento contenuto'}.`
          : 'Nessuna cella dominante.',
        `Totale osservazioni: ${showInt(total)}. Composizione per riga: ${col1} ${show(num(cells[0], 'rowPct'), 1)}% in ${row1}, ${show(num(cells[2], 'rowPct'), 1)}% in ${row2}.`,
        'Le percentuali di riga rendono confrontabili gruppi con numerosità diverse; le percentuali di colonna rispondono alla domanda inversa.',
      ],
    },
    {
      heading: 'Quanto è forte l’associazione',
      bullets: [
        Number.isFinite(phi) ? `φ = ${show(phi, 3)}: associazione ${interpretPhi(phi)} (0.1 debole, 0.3 moderata, 0.5 forte su tabelle 2×2).` : 'φ non calcolabile.',
        Number.isFinite(oddsRatio) ? `Odds ratio = ${show(oddsRatio, 3)} (CI ${level}% ${showCI(orLo, orHi, 3)}): le odds di ${col1} in ${row1} sono ${oddsRatio > 1 ? `${show(oddsRatio, 2)} volte quelle di ${row2}` : `${show(1 / oddsRatio, 2)} volte (cioè meno) di quelle di ${row2}`}.` : 'Odds ratio non calcolabile (celle a zero).',
        Number.isFinite(relativeRisk) ? `Rischio relativo = ${show(relativeRisk, 3)}: ${row1} ha un rischio di ${col1} ${relativeRisk > 1 ? 'maggiore' : 'minore'} rispetto a ${row2}.` : '',
      ].filter(Boolean),
    },
    {
      heading: 'Assunzioni',
      bullets: [
        Number.isFinite(minExpected) ? `Frequenza attesa minima = ${show(minExpected, 2)}; celle con atteso < 5: ${showInt(lowCells)} su 4. ${smallSample ? 'La regola di Cochran non è rispettata: usa Fisher esatto (o Yates) e diffida del χ² classico.' : 'La regola di Cochran è rispettata: il χ² classico è affidabile.'}` : 'Frequenze attese non disponibili.',
        'Ogni osservazione deve stare in una sola cella: conteggi ripetuti della stessa unità gonfiano artificialmente la significatività.',
      ],
    },
    {
      heading: 'Come leggere i numeri',
      bullets: [
        P_SENTENCE,
        'Il residuo aggiustato dice quanto una cella è lontana da quanto ci si aspetterebbe se le variabili fossero indipendenti: oltre ±2 è un segnale concreto.',
        `φ misura la forza dell’associazione su una scala 0–1; con tabelle più grandi di 2×2 si usa Cramér’s V.`,
      ],
    },
    {
      heading: 'In pratica',
      body: [
        significant
          ? `C’è un legame tra le due variabili, ma la forza è ${Number.isFinite(phi) ? interpretPhi(phi) : 'da quantificare'}: con molti dati anche un legame debole diventa significativo, quindi valuta l’ampiezza prima di agire.`
          : 'Non ci sono prove di un legame tra le due variabili su questi dati. Con numerosità ridotta l’assenza di significatività può riflettere mancanza di potenza più che vera indipendenza.',
      ],
    },
  ];

  return {
    id: 'report-chisquare',
    title: 'Report di lettura — Chi quadrato',
    headline,
    badge: significant ? 'Associazione presente' : 'Variabili indipendenti',
    tone: significant ? (smallSample ? 'caution' : 'positive') : 'neutral',
    intro: [
      `Verifica se due variabili categoriche sono indipendenti: le righe sono ${row1} e ${row2}, le colonne ${col1} e ${col2}.`,
      'Confronta i conteggi osservati con quelli attesi se non ci fosse alcun legame: se le differenze sono troppo grandi per il caso, l’indipendenza viene rifiutata.',
    ],
    sections,
    limitations: [
      'Il χ² richiede frequenze attese sufficienti: sotto 5 per cella il test classico è inaffidabile e va usato Fisher esatto.',
      'La significatività dipende dalla numerosità: con campioni molto grandi anche associazioni irrilevanti risultano significative.',
      'Il test è omnibus: non indica da solo quale cella o quale direzione spieghi l’associazione.',
    ],
  };
};
