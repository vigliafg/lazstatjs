# LazStats JS

A comprehensive browser-based statistical analysis tool with real-time plotting and descriptive statistics. Built with React 19, TypeScript, and Vite.

## Overview

LazStats JS provides a spreadsheet-like data editor and a full suite of parametric and non-parametric statistical analyses, all running entirely in the browser. It features an interactive dark-themed UI with real-time charting via Victory.

## Features

### Data Editor
- Interactive spreadsheet grid with typed columns (num, int, dec, str, alp, chr, bol, dat)
- Per-cell regex validation
- Row/column count displayed in status bar

### Statistical Analyses

| Analysis | Parametric | Non-Parametric |
|---|---|---|
| **Descriptive** | N/missing, sum, mean with CI, SE, median with distribution-free CI, trimmed mean, SD, variance, CV, quartiles, IQR, MAD, outliers, skewness/kurtosis with SE and z, quantiles | Jarque-Bera, Lilliefors-corrected KS, D'Agostino-Pearson, Q-Q Plot |
| **T-Test** | One-Sample, Independent (pooled or Welch), Paired; mean difference with CI, Cohen's d, Hedges g, Glass Δ, point-biserial r, Levene/Brown-Forsythe | Wilcoxon Signed-Rank, Mann-Whitney U, rank effect sizes, CLES, Hodges-Lehmann with bootstrap CI |
| **ANOVA** | One-Way ANOVA, group descriptives, η²/ω²/ε²/f, Levene, Welch ANOVA, post-hoc Tukey-Kramer (approx.), Bonferroni, Holm, Games-Howell | Kruskal-Wallis H, η²_H, Dunn with Holm/Bonferroni |
| **Regression** | OLS simple/multiple: model F, ANOVA table, coefficient CIs, standardized β, VIF/tolerance, AIC/BIC, Durbin-Watson, Breusch-Pagan, Cook's D, residual diagnostics | Theil-Sen slope with bootstrap CI and residual comparison |
| **Correlation** | Pearson pairwise table with N, p, Fisher-z CI, r²; matrices with significance; partial correlations | Spearman's rho, Kendall's Tau-b with p-values |
| **Chi-Square** | Pearson χ², likelihood-ratio G², Yates, standardized/adjusted residuals, cell contributions, φ, Cramér's V, odds ratio, relative risk, risk difference with CIs | Fisher's Exact Test |

### Visualization
- Bar charts, boxplots, scatter plots, line charts, histograms
- Cumulative output console with tabbed results

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
    ├── statsHelpers.ts     # Legacy custom statistical functions
    ├── stats/              # Testable statistical modules (descriptive, ttest, anova, regression, correlation, chisquare)
    ├── components/         # Reusable ResultTable renderer
    └── index.css           # Tailwind styles + dark theme
```

### Key Source Files

- **`src/App.tsx`** (~2600 lines) — Application UI, chart wiring and analysis orchestration.
- **`src/stats/`** — Pure statistic builders returning typed `TableSpec` objects. Every builder has reference tests against SciPy/NumPy values (mean CIs, Levene, Welch ANOVA, effect sizes, regression, correlations, odds ratios).
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
