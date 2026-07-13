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
| **Descriptive** | Mean, Median, SD, Min, Max, Range, Variance, Skewness, Kurtosis, IQR, Histogram, Boxplot | Jarque-Bera & Kolmogorov-Smirnov normality tests, Q-Q Plot |
| **T-Test** | One-Sample, Independent, Paired t-test | Wilcoxon Signed-Rank, Mann-Whitney U |
| **ANOVA** | One-Way ANOVA, Post-Hoc Tukey/Bonferroni | Kruskal-Wallis H, Post-Hoc Mann-Whitney with Bonferroni |
| **Regression** | OLS (Ordinary Least Squares) - simple and multiple | Theil-Sen (median slope) |
| **Correlation** | Pearson correlation matrix | Spearman's rho, Kendall's Tau-b |
| **Chi-Square** | Pearson Chi-Square, Yates correction | Fisher's Exact Test |

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
    ├── statsHelpers.ts     # Custom statistical function implementations
    └── index.css           # Tailwind styles + dark theme
```

### Key Source Files

- **`src/App.tsx`** (~3000 lines) — The entire application UI and analysis logic, organized into Data Editor, Analysis & Output, and Settings tabs.
- **`src/statsHelpers.ts`** (~560 lines) — Hand-implemented statistical functions complementing jStat: Fisher's Exact Test, Wilcoxon Signed-Rank, Mann-Whitney U, Kruskal-Wallis H, Theil-Sen regression, Kendall's Tau-b, Jarque-Bera and Kolmogorov-Smirnov normality tests.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run clean` | Remove `dist/` directory |
| `npm run lint` | TypeScript type-check |

## Notes

- Built from [Google AI Studio](https://ai.studio/apps/bc7748c0-92a6-49a9-ade6-1d9b6749353f)
- `recharts` and `express` appear in dependencies but are not currently used
- `@google/genai` SDK is installed for potential future AI integration
- No test framework is configured
