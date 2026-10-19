# LazStats JS

A comprehensive browser-based statistical analysis tool with real-time plotting and descriptive statistics. Built with React 19, TypeScript, and Vite.

## Overview

LazStats JS provides a spreadsheet-like data editor and a full suite of parametric and non-parametric statistical analyses, all running entirely in the browser. It features an interactive dark-themed UI with real-time charting via Victory.

## Features

### Data Editor
- Interactive spreadsheet grid with typed columns (num, int, dec, cat, str, id, bol, dat, dtm, tim, alp, chr)
- **Editable column names**: double-click a header, use the pencil shown on hover, or the column menu's *Rename column*; names are trimmed and kept unique (`Score`, `Score_2`)
- **Type dropdown under each header**: `num` numeric auto-detect, `int` integer, `dec` decimal, `cat` categorical, `str` free text, `id` identifier, `bol` boolean, `dat` date, `dtm` date-time, `tim` time, `alp` alphabetic, `chr` single character
- **Group levels editor** (toolbar under the type selector, `src/grid/LevelsEditor.tsx`): code + label, display order, reference level for model-based analyses and the count of rows per code; cells become dropdowns of the declared levels, while the stored value stays the code. "Read data" imports the values already present. It appears for `cat` columns and for every column offered as a grouping variable (integer codes with 2–12 levels, `bol`, small text/date columns), and the same modal is reachable with **Modifica livelli** next to the group selector in the Wizard, ANOVA, ANCOVA, Factorial ANOVA, Survival and Non-parametric RM panels, so labels and reference can be edited without leaving the analysis
- Per-cell regex validation
- **CSV import/export** with quoted fields, comma or semicolon delimiters, decimal-comma normalisation and automatic column-type inference
- Row/column count displayed in status bar
- **Freeze first column** (plus row numbers) while scrolling wide sheets; the header row is always sticky
- **View-only row filter** with type-aware operators (contains, =, ≠, >, ≥, <, ≤, empty/non-empty) and a live `visible / total` count — analyses still use every row
- **Sort ascending/descending per column** from the column context menu (undoable)
- **Find & replace** with regex, case sensitivity and single-column scope; whitespace trim, duplicates/empty-row cleanup and mean/median/mode imputation live in the Clean panel

### Help
- **In-app HELP tab** (next to Settings) with eight inner tabs: Overview, Data Editor, Data prep, Groups & levels, Analyses, Output & reports, Recipes and Shortcuts & settings
- Every block is written as a numbered sequence of the buttons and selectors the user actually sees, with a worked example, tables for reference and highlighted tips
- The Analyses tab documents all nineteen panels (steps + example each); the Recipes tab walks through twelve end-to-end questions
- Content lives in `src/help/helpContent.ts` as plain data and is guarded by `src/help/helpContent.test.ts` (structure, coverage of every analysis panel, presence of the main tool labels)

### Project persistence
- **Silent autosave** of the grid, CI level, analysis parameters, IO preferences and the output console to `localStorage` (debounced), restored automatically on the next visit
- **Save/Open `.lzs` projects**: a versioned JSON file with the dataset, settings, parameters and results; invalid, corrupted or newer-version files are rejected with a readable message
- **Output console persistence**: every run also stores a static HTML snapshot (tables, Victory charts as inline SVG and the written report) capped at 20 blocks / 1.5 MB. Restored blocks are sanitised before injection and are read-only snapshots — Copy, Charts PNG, Report HTML and Results XLSX keep working, while per-table TSV buttons and chart tooltips exist only on live runs. Panel-internal parameters still restart from the grid defaults

### Statistical Analyses

| Analysis | Parametric | Non-Parametric |
|---|---|---|
| **Descriptive** | N/missing, sum, mean with CI, SE, median with distribution-free CI, trimmed mean, SD, variance, CV, quartiles, IQR, MAD, outliers, skewness/kurtosis with SE and z, quantiles | Jarque-Bera, Lilliefors-corrected KS, D'Agostino-Pearson, Q-Q Plot |
| **T-Test** | One-Sample, Independent (pooled or Welch), Paired; mean difference with CI, Cohen's d, Hedges g, Glass Δ, point-biserial r, Levene/Brown-Forsythe | Wilcoxon Signed-Rank, Mann-Whitney U, rank effect sizes, CLES, Hodges-Lehmann with bootstrap CI |
| **ANOVA** | One-Way ANOVA, group descriptives, η²/ω²/ε²/f, Levene, Welch ANOVA, post-hoc Tukey-Kramer (approx.), Bonferroni, Holm, Games-Howell | Kruskal-Wallis H, η²_H, Dunn with Holm/Bonferroni |
| **Regression** | OLS simple/multiple: model F, ANOVA table, coefficient CIs, standardized β, VIF/tolerance, AIC/BIC, Durbin-Watson, Breusch-Pagan, **White**, **RESET2**, **DFBETAS**, **Belsley condition index**, Cook's D, residual diagnostics | Theil-Sen slope with bootstrap CI and residual comparison |
| **Correlation** | Pearson pairwise table with N, p, Fisher-z CI, r²; matrices with significance; partial correlations | Spearman's rho, Kendall's Tau-b with p-values |
| **Chi-Square** | Pearson χ², likelihood-ratio G², Yates, standardized/adjusted residuals, cell contributions, φ, Cramér's V, odds ratio, relative risk, risk difference with CIs | Fisher's Exact Test |
| **Contingency (R×C)** | Pearson χ², likelihood-ratio G², any table size, expected counts, standardized/adjusted residuals, cell contributions, Cramér's V, contingency coefficient | Yates (2×2), Fisher's Exact (2×2), Monte Carlo p-value with fixed margins when expected counts are small |
| **Non-parametric RM** | — | Friedman with Kendall's W and **Nemenyi** post-hoc (studentized-range critical values), **McNemar** exact + Yates, **Cochran Q**, **Jonckheere–Terpstra** trend test with effect size |
| **Repeated ANOVA** | One-way within-subject: SS decomposition, partial and generalized η², **Mauchly** sphericity test with second-order correction, **Greenhouse–Geisser** and **Huynh–Feldt** ε and corrected p-values, descriptive means with CI | — |
| **Factorial ANOVA** | Two-way ANOVA with optional A×B interaction, sequential SS/Type I (= Type III when balanced), partial η², ω², cell and marginal means, interaction plot, R²/RMSE | Ranks-based alternatives are not provided for the two-way design |
| **Logistic Regression** | Binary outcome, IRLS estimation, odds ratios with Wald CIs, LR test, McFadden/Cox–Snell/Nagelkerke R², AIC/BIC, classification table, sensitivity/specificity, AUC, probability curve, separation warning | — |
| **Distribution Fit** | MLE fitting of Normal, Lognormal, Exponential, Gamma and Weibull, AIC/BIC ranking, KS and Anderson–Darling, percentiles, probability plot | — |
| **Sample Size / Power** | Two independent means, one mean, paired means, two proportions, correlation and one-way ANOVA; power curve, precision-based n, noncentral-F power for ANOVA | — |
| **Time Series** | ACF/PACF with confidence band, Mann–Kendall trend, Wald–Wolfowitz runs test, Ljung–Box, centred moving average, additive seasonal decomposition, SES / linear trend / seasonal-naive benchmarks on a holdout, and **ARIMA / SARIMA** (automatic order search by AICc, ADF-based differencing, multiplicative seasonal terms, ψ-weight forecast intervals, residual diagnostics) | — |
| **Survival (KM)** | Kaplan–Meier with Greenwood log-log CIs, median survival with CI, restricted mean survival time, life table, log-rank test with Mantel–Haenszel hazard ratio | — |
| **Cox (PH)** | Proportional hazards regression: partial likelihood with Breslow ties, Newton–Raphson with step halving, hazard ratios with CIs, LR/Wald/score tests, Harrell's C, Breslow baseline hazard, time-interaction test for proportional hazards, forest plot | Automatic dummy coding of small categorical covariates |
| **Statistical Wizard** | Guided choice of the analysis: profiles every column, runs the assumption checks that matter (normality, Levene, paired differences) and points to the right panel with the exact columns to select | Alternative test when the assumptions fail |

The group modal also **recodes values**: open it from the grid header or from any group selector and switch to *Recode values* to rename codes, merge two codes into one group, or clear them, with a preview of the affected cells before applying.

Group pickers are type-aware: `cat`, `bol` and small `str`/date/alpha columns are offered, integer codes with 2–12 levels are accepted, while `id` and continuous `num`/`dec` columns are excluded. Tables, charts and reports show the declared labels, and ANCOVA uses the selected reference level (treatment coding).

### Results
- **Per-table TSV copy** directly from the table header, with the same formatting shown on screen
- **Charts PNG**: every chart in the output console is rasterised at 2× on a dark background and downloaded as its own file
- **Printable HTML report**: a self-contained document (tables, inline SVG charts and the written reports) with print styles, ready for *Print → Save as PDF*
- **Per-run removal** in the output console, next to the existing global *Clear*
- Restored runs keep their tables, charts and reports after a reload; the console header shows the stored snapshots exactly as they were produced

### Visualization
- Bar charts, boxplots, scatter plots, line charts, histograms
- Probability plots, interaction plots, power curves, ACF bars, forecast lines and intervals, Kaplan–Meier step curves, hazard-ratio forest plots
- Cumulative output console with tabbed results

### Written reports
- Every run of an analysis closes with a **Report di lettura** card: plain-language headline of the outcome, what the test actually does, the reading of each result (difference, effect size, assumptions, non-parametric counterpart), a glossary of the statistics shown and the caveats that apply
- The text is generated from the computed tables, so it always matches the numbers on screen and follows the selected confidence level (90/95/99%)

## Tech Stack

- **Framework:** React 19, TypeScript
- **Build:** Vite 6
- **Styling:** Tailwind CSS 4, dark theme
- **Charts:** Victory 37
- **Statistics:** jStat, custom implementations in `statsHelpers.ts`
- **Icons:** Lucide React
- **Animations:** Motion (Framer Motion)

## Getting Started

### Prerequisites
- Node.js 18+

### Setup

```bash
npm install
```

Create a `.env.local` file with your Gemini API key (optional, for future AI features):

```
GEMINI_API_KEY="your_key_here"
```

### Development

```bash
npm run dev
```

Opens at `http://localhost:3000`.

### Build

```bash
npm run build
```

Outputs to `dist/`.

### Type Check

```bash
npm run lint
```

## Project Structure

```
lazstatjs/
├── index.html              # Entry HTML
├── package.json
├── tsconfig.json
├── vite.config.ts          # Vite config with Tailwind + React + env injection
├── metadata.json           # Google AI Studio metadata
├── .env.example
└── src/
    ├── main.tsx            # React entry point
    ├── App.tsx             # Main application component (monolithic)
    ├── csv.ts              # CSV parsing, serialisation and type inference
    ├── statsHelpers.ts     # Legacy custom statistical functions
    ├── stats/              # Testable statistical modules (descriptive, ttest, anova, factorial,
    │                       #   regression, logistic, correlation, chisquare, contingency,
    │                       #   repeated, repeatedAnova, ancova, multivariate, distfit,
    │                       #   samplesize, timeseries, arima, survival, cox, wizard, report)
    ├── analyses/           # Parameter panels + charts for the newer analyses
    ├── io/                 # Smart IO (detect/readers/writers, xlsx, import wizard, export dialog),
    │                       #   table TSV copy, chart PNG export, printable HTML report,
    │                       #   .lzs project schema + autosave storage, output snapshots
    ├── help/               # In-app HELP tab content (plain data) and its renderer
    ├── components/         # Reusable ResultTable and AnalysisReport renderers
    └── index.css           # Tailwind styles + dark theme
```

### Key Source Files

- **`src/App.tsx`** (~3650 lines) — Application UI, chart wiring and analysis orchestration.
- **`src/stats/`** — Pure statistic builders returning typed `TableSpec` objects. Every builder has reference tests against SciPy/NumPy values (mean CIs, Levene, Welch ANOVA, effect sizes, regression, correlations, odds ratios).
- **`src/stats/report.ts`** — Builds the plain-language `ReportSpec` for each analysis by reading the already computed tables (headline, effect size, assumptions, glossary, limits). Because it never recomputes statistics, the prose cannot disagree with the numbers and follows the selected CI level. The newer modules (`contingency`, `factorial`, `logistic`, `distfit`, `samplesize`) keep their report builder next to the computation.
- **`src/analyses/`** — Self-contained tabs for Contingency (R×C), Sample Size / Power, Distribution Fit, Factorial ANOVA, Logistic Regression, Time Series, Survival, Cox and the Wizard: they own their parameters, run through an imperative `run()` handle and append tables, charts and the written report to the output console. The Wizard does not re-implement tests: it opens the real panel with `onOpenAnalysis`.
- **`src/components/AnalysisReport.tsx`** — Renders that report as a card closing every run of an analysis, after all tables and charts.
- **`src/help/helpContent.ts`** — The whole in-app guide as plain data (tabs, sections, blocks, steps, examples, tables, tips) so the wording can be reviewed and tested without a DOM; `src/help/HelpPanel.tsx` renders it with a tab bar and numbered steps.
- **`src/grid/types.ts`** — Column types plus the categorical-level model (`levels`, `reference`), group-column detection and the label substitution used by the analyses.
- **`src/grid/LevelsEditor.tsx`** — Reusable group modal with a trigger button and two modes: *Levels* (code, label, order, reference, per-code row count, "Read data", add/remove) and *Recode values* (rename, merge, clear the group codes with a live preview). Shared by the data-grid header and the analysis group selectors, so one Apply is one undo step wherever it is opened.
- **`recodeColumnValues`** in `src/grid/ops.ts` — Pure recoding of one column: cells are matched against their original value (so `1→2` / `2→1` swaps work), declared levels follow the mapping keeping their labels, merged codes keep the first label, the reference follows its code or is dropped, and the column becomes `cat` when the new codes no longer satisfy its type.
- **`src/io/outputs.ts`** — Static snapshots of the output console: title extraction, count/character caps, validation on load and a DOMParser-based sanitiser for restored HTML.
- **`src/statsHelpers.ts`** — Legacy hand-implemented tests: Fisher's Exact Test, Wilcoxon Signed-Rank, Mann-Whitney U, Kruskal-Wallis H, Theil-Sen regression, Kendall's Tau-b, Jarque-Bera and Kolmogorov-Smirnov normality tests.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run clean` | Remove `dist/` directory |
| `npm run lint` | TypeScript type-check |
| `npm test` | Run the statistics reference tests with `node:test` + `tsx` |

## Notes

- Built from [Google AI Studio](https://ai.studio/apps/bc7748c0-92a6-49a9-ade6-1d9b6749353f)
- `recharts` and `express` appear in dependencies but are not currently used
- `@google/genai` SDK is installed for potential future AI integration
- CI level (90/95/99%) is selectable in the analysis toolbar and applies to every table.
- Projects (`.lzs`) and the silent autosave cover data, settings and analysis parameters. The output console is intentionally excluded: results are recomputed by running the analysis again on the restored grid.
- The newer analyses follow the same contract as the original ones: a pure builder returning typed `TableSpec` objects, a written report generated from those tables, and reference tests (`node:test`) for the numerical results.
- Known limitations are stated inside each report: sequential SS for unbalanced factorial designs, asymptotic KS p-values for fitted distributions, Wald tests and separation warnings for logistic regression, additive-only seasonal decomposition, conditional (CSS) ARIMA estimation with a bounded order search, Breslow ties and asymptotic proportional-hazards checks for Cox, screening-only assumptions in the Wizard.
- The Cox model uses a time-interaction likelihood-ratio test for proportional hazards; the baseline cumulative hazard is the Breslow estimator and the concordance index is Harrell's C.
- ARIMA models are estimated by conditional least squares with Gauss–Newton standard errors and Nelder–Mead optimisation; the search covers p, q ≤ 2 (≤ 1 for short series) plus one seasonal AR and MA term, and the differencing order comes from an augmented Dickey–Fuller test (or from the manual controls). Forecast intervals use the ψ-weights of the full ARIMA operator but ignore parameter and order uncertainty.
