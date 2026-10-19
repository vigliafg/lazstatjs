import React, { useState, useEffect, useCallback, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { 
  BarChart3, 
  Settings, 
  Database, 
  FileText, 
  Download, 
  Upload, 
  Plus, 
  Trash2, 
  Play, 
  CheckCircle2, 
  AlertCircle,
  ChevronDown,
  HelpCircle,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jStat } from './stats/jstat';
import { ResultTables } from './components/ResultTable';
import { AnalysisReport } from './components/AnalysisReport';
import { descriptiveTables } from './stats/descriptive';
import { ttestTables } from './stats/ttest';
import { anovaTables } from './stats/anova';
import { regressionTables } from './stats/regression';
import { correlationTables } from './stats/correlation';
import { chiSquareTables } from './stats/chisquare';
import { ContingencyAnalysis, type ContingencyHandle } from './analyses/ContingencyAnalysis';
import { SampleSizeAnalysis, type SampleSizeHandle } from './analyses/SampleSizeAnalysis';
import { DistributionFitAnalysis, type DistributionFitHandle } from './analyses/DistributionFitAnalysis';
import { FactorialAnovaAnalysis, type FactorialAnovaHandle } from './analyses/FactorialAnovaAnalysis';
import { LogisticAnalysis, type LogisticHandle } from './analyses/LogisticAnalysis';
import { TimeSeriesAnalysis, type TimeSeriesHandle } from './analyses/TimeSeriesAnalysis';
import { SurvivalAnalysis, type SurvivalHandle } from './analyses/SurvivalAnalysis';
import { CoxAnalysis, type CoxHandle } from './analyses/CoxAnalysis';
import { WizardAnalysis, type WizardHandle } from './analyses/WizardAnalysis';
import {
  NonParamRepeatedAnalysis,
  type NonParamRepeatedHandle,
} from './analyses/NonParamRepeatedAnalysis';
import { RepeatedAnovaAnalysis, type RepeatedAnovaHandle } from './analyses/RepeatedAnovaAnalysis';
import { MultivariateAnalysis, type MultivariateHandle } from './analyses/MultivariateAnalysis';
import { AncovaAnalysis, type AncovaHandle } from './analyses/AncovaAnalysis';
import {
  anovaReport,
  chiSquareReport,
  correlationReport,
  descriptiveReport,
  regressionReport,
  ttestReport,
  type ReportSpec,
} from './stats/report';
import { lillieforsTest } from './stats/distributions';
import { 
  VictoryChart, 
  VictoryBar, 
  VictoryScatter, 
  VictoryLine, 
  VictoryAxis, 
  VictoryTooltip, 
  VictoryVoronoiContainer,  VictoryBoxPlot,
  VictoryTheme,
  VictoryLabel,
  VictoryGroup
} from 'victory';import {
  calcFisherExact, 
  calcWilcoxonSignedRank, 
  calcMannWhitneyU, 
  calcKruskalWallis, 
  calcTheilSen, 
  calcKendallTau,
  calcNormalityTests,
  NormalityResult
} from './statsHelpers';
import { buildHistogram, pairedValues, parseNum, pooledTTest, welchTTest } from './stats/core';
import type { CategoryLevel, ColType, GridData } from './grid/types';
import {
  findInvalid as gridFindInvalid,
  invalidByColumn as gridInvalidByColumn,
  coerceGrid as gridCoerce,
} from './grid/ops';
import {
  nonEmptyRowCount,
  countInvalidCells,
  analysisRows,
  groupColumnIndexes,
  isGroupColumn,
} from './grid/types';
import { useGridHistory } from './grid/useGridHistory';
import { LevelsEditor } from './grid/LevelsEditor';
import { HelpPanel } from './help/HelpPanel';
import {
  setCell as gridSetCell,
  addColumnEnd as gridAddColumn,
  addRowEnd as gridAddRow,
  setColType as gridSetColType,
  clearGrid as gridClear,
  newGrid as makeNewGrid,
  renameColumn as gridRenameColumn,
  insertColumnAt as gridInsertColumn,
  duplicateColumn as gridDuplicateColumn,
  moveColumn as gridMoveColumn,
  deleteColumn as gridDeleteColumn,
  insertRowAt as gridInsertRow,
  deleteRow as gridDeleteRow,
  pasteTsvAt as gridPasteTsv,
  parseTsv as parseTsvBlock,
  rangeToTsv as gridRangeToTsv,
  clearRange as gridClearRange,
  fillDownRange as gridFillDown,
  sortByColumn as gridSortByColumn,
  setColumnLevels as gridSetColumnLevels,
  recodeColumnValues as gridRecodeColumnValues,
  filterRowIndexes as gridFilterIndexes,
  type RowFilter,
  type RowFilterOp,
} from './grid/ops';
import { DataGrid } from './grid/DataGrid';
import { CleanPanel } from './grid/CleanPanel';
import { TransformPanel } from './grid/TransformPanel';
import { ImportWizard, type ImportMode } from './io/ImportWizard';
import { ExportDialog } from './io/ExportDialog';
import type { ImportTable } from './io/readers';
import { looksLikeJson } from './io/detect';
import { readDelimitedTable, readJsonTable } from './io/readers';
import { downloadBytes, downloadExportFile, downloadText } from './io/writers';
import {
  buildResultsWorkbookFromElement,
  readXlsxSheets,
  XLSX_MIME,
  type XlsxSheet,
} from './io/xlsx';
import { loadPrefs, savePrefs } from './io/prefs';
import {
  DEFAULT_PARAMS,
  DEFAULT_SETTINGS,
  createProjectSnapshot,
  loadAutosaveProject,
  parseProject,
  saveAutosaveText,
  serializeProject,
  type AnovaParams,
  type ChiSqParams,
  type CorrParams,
  type ProjectSnapshot,
  type RegParams,
  type TTestParams,
} from './io/project';
import { copyText } from './io/clipboard';
import {
  capStoredOutputs,
  extractOutputTitle,
  sanitizeOutputHtml,
  type StoredOutput,
} from './io/outputs';
import { exportChartsAsPng } from './io/chartExport';
import { buildReportFromElement } from './io/reportExport';

// --- Types ---
interface AnalysisConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
}

/** A console block: live React nodes plus the HTML snapshot stored in the project. */
interface OutputEntry extends StoredOutput {
  node?: React.ReactNode;
}

/** Restored blocks are static: sanitise once, then inject the stored markup. */
const restoredOutputs = (stored: StoredOutput[] | undefined): OutputEntry[] =>
  (stored ?? [])
    .map((entry) => ({ ...entry, html: sanitizeOutputHtml(entry.html) }))
    .filter((entry) => entry.html.length > 0);

// --- Constants ---
const PALETTE = ['#4f9cf9', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#38bdf8', '#fb923c', '#e879f9'];

const ANALYSIS_TABS = [
  { id: 'wizard', label: 'Wizard' },
  { id: 'descriptive', label: 'Descriptive' },
  { id: 'ttest', label: 'T-Test' },
  { id: 'anova', label: 'ANOVA' },
  { id: 'regression', label: 'Regression' },
  { id: 'correlation', label: 'Correlation' },
  { id: 'multivariate', label: 'Multivariate' },
  { id: 'chisquare', label: 'Chi-Square (χ²)' },
  { id: 'contingency', label: 'Contingency (R×C)' },
  { id: 'nonparamrm', label: 'Non-parametric RM' },
  { id: 'repeatedanova', label: 'Repeated ANOVA' },
  { id: 'samplesize', label: 'Sample Size / Power' },
  { id: 'distfit', label: 'Distribution Fit' },
  { id: 'factorial', label: 'Factorial ANOVA' },
  { id: 'ancova', label: 'ANCOVA' },
  { id: 'logistic', label: 'Logistic Regression' },
  { id: 'timeseries', label: 'Time Series' },
  { id: 'survival', label: 'Survival (KM)' },
  { id: 'cox', label: 'Cox (PH)' },
];

// --- Helper Functions ---
const fmt = (x: number, d = 4) => {
  if (isNaN(x) || !isFinite(x)) return '—';
  return parseFloat(x.toFixed(d)).toString();
};

const fmtP = (p: number) => {
  if (isNaN(p) || !isFinite(p)) return '—';
  if (p < 0.001) return '< 0.001';
  return p.toFixed(4);
};

const createDefaultGrid = (): GridData => ({
  cols: [
    { name: 'Score_Pre', type: 'num' },
    { name: 'Score_Post', type: 'num' },
    { name: 'Group', type: 'int' },
    { name: 'Age', type: 'int' }
  ],
  rows: Array.from({ length: 20 }, (_, i) => {
    if (i < 10) return [(50 + i * 2).toString(), (60 + i * 2.5).toString(), '1', (20 + (i % 3)).toString()];
    if (i < 20) return [(45 + (i - 10) * 3).toString(), (55 + (i - 10) * 2).toString(), '2', (21 + (i % 2)).toString()];
    return ['', '', '', ''];
  })
});

export default function App() {
  // Restore the last silent autosave before any state is initialised, so the
  // first render already shows the user's grid and parameters.
  const [boot] = useState<ProjectSnapshot | null>(() => loadAutosaveProject());
  const [activeTab, setActiveTab] = useState<'data' | 'analysis' | 'settings' | 'help'>(
    boot?.settings.activeTab ?? DEFAULT_SETTINGS.activeTab
  );
  const [activeAnalysis, setActiveAnalysis] = useState<string>(() =>
    boot && ANALYSIS_TABS.some((tab) => tab.id === boot.settings.activeAnalysis)
      ? boot.settings.activeAnalysis
      : DEFAULT_SETTINGS.activeAnalysis
  );
  const gridHistory = useGridHistory(boot?.grid ?? createDefaultGrid());
  const grid = gridHistory.grid;
  const setGrid = gridHistory.commit;
  const undoGrid = gridHistory.undo;
  const redoGrid = gridHistory.redo;
  const canUndoGrid = gridHistory.canUndo;
  const canRedoGrid = gridHistory.canRedo;
  const resetGridHistory = gridHistory.setWithoutHistory;
  const [focusCell, setFocusCell] = useState<{ r: number; c: number; stamp: number } | null>(null);
  const [selRange, setSelRange] = useState<{ r0: number; c0: number; r1: number; c1: number } | null>(null);
  const [showClean, setShowClean] = useState(false);
  const [showTransform, setShowTransform] = useState(false);
  const [freezeFirstCol, setFreezeFirstCol] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterCol, setFilterCol] = useState(0);
  const [filterOp, setFilterOp] = useState<RowFilterOp>('contains');
  const [filterValue, setFilterValue] = useState('');
  // Keep a validation run live: recompute counts/jump targets as the user
  // fixes cells instead of showing stale indexes.
  useEffect(() => {
    if (!validation.ran) return;
    setValidation({ ran: true, issues: gridFindInvalid(grid) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);
  // Selection bar holds raw indexes: clamp them after delete/merge/paste so
  // Fill/Copy/Clear never address rows/cols that no longer exist.
  // Column indexes in the filter bar go stale after delete/merge.
  useEffect(() => {
    const max = Math.max(0, grid.cols.length - 1);
    if (filterCol > max) setFilterCol(max);
  }, [grid.cols.length, filterCol]);

  useEffect(() => {
    if (!selRange) return;
    const maxR = Math.max(0, grid.rows.length - 1);
    const maxC = Math.max(0, grid.cols.length - 1);
    const clamp = (v: number, m: number) => Math.max(0, Math.min(m, v));
    const next = {
      r0: clamp(selRange.r0, maxR),
      c0: clamp(selRange.c0, maxC),
      r1: clamp(selRange.r1, maxR),
      c1: clamp(selRange.c1, maxC),
    };
    if (next.r0 !== selRange.r0 || next.c0 !== selRange.c0 || next.r1 !== selRange.r1 || next.c1 !== selRange.c1) {
      setSelRange(next);
    }
  }, [grid.rows.length, grid.cols.length, selRange]);
  const [validation, setValidation] = useState<{ ran: boolean; issues: { r: number; c: number; value: string; colName: string }[] }>({
    ran: false,
    issues: [],
  });
  const [outputs, setOutputs] = useState<OutputEntry[]>(() => restoredOutputs(boot?.outputs));
  const runSeq = useRef(0);
  const [toasts, setToasts] = useState<{ id: number; title: string; msg: string; type: 'ok' | 'warn' | 'error' }[]>([]);
  useEffect(() => {
    // Scroll only the output container: scrollIntoView() also scrolls the
    // document/ancestors in some browsers, hiding the main tabs and controls.
    const el = document.getElementById('output-content');
    if (el) el.scrollTop = el.scrollHeight;
  }, [outputs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoGrid();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redoGrid();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoGrid, redoGrid]);

  // Each run pushes a single block: the written report is part of that block,
  // so it always closes the run after every table and chart. The block is also
  // rendered once to static markup so the console survives reloads and .lzs
  // files; live runs keep their interactive React nodes in this session.
  const pushOutput = (node: React.ReactNode, report: ReportSpec | null) => {
    const block = (
      <>
        {node}
        {report && <AnalysisReport spec={report} />}
      </>
    );
    let html = '';
    try {
      html = renderToStaticMarkup(block);
    } catch (error) {
      // A failed snapshot must never lose the run that is on screen.
      console.error('Could not snapshot the output block', error);
    }
    const entry: OutputEntry = {
      id: `run-${Date.now()}-${runSeq.current++}`,
      title: html ? extractOutputTitle(html) : 'Analysis output',
      createdAt: new Date().toISOString(),
      html,
      node: block,
    };
    setOutputs(prev => capStoredOutputs([...prev, entry]));
  };

  const showToast = (title: string, msg: string, type: 'ok' | 'warn' | 'error' = 'ok') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const addColumn = () => {
    setGrid((prev) => gridAddColumn(prev));
  };

  const addRow = () => {
    setGrid((prev) => gridAddRow(prev));
  };

  const updateCell = (r: number, c: number, val: string) => {
    setGrid((prev) => gridSetCell(prev, r, c, val), { coalesce: true, kind: `cell-${r}-${c}` });
  };

  const updateColType = (c: number, type: ColType) => {
    setGrid((prev) => gridSetColType(prev, c, type));
  };

  // Shared by the grid header and every analysis group selector, so levels can
  // be edited from the panel where the user is already choosing groups.
  const updateColumnLevels = (c: number, levels: CategoryLevel[], reference?: string) => {
    setGrid((prev) => gridSetColumnLevels(prev, c, levels, reference));
    setValidation((v) => ({ ...v, ran: false }));
  };

  // Rename / merge / clear the group codes of one column; cells, levels,
  // reference and (when needed) the column type move together in one undo step.
  const updateColumnRecode = (c: number, mapping: Record<string, string>) => {
    const result = gridRecodeColumnValues(grid, c, mapping);
    if (result.grid === grid) return;
    setGrid(result.grid);
    setValidation((v) => ({ ...v, ran: false }));
    showToast(
      'Recode',
      `${result.changed} cells recoded${
        result.merged > 0 ? `, ${result.merged} group${result.merged === 1 ? '' : 's'} merged` : ''
      }${
        result.cleared > 0 ? `, ${result.cleared} cells cleared` : ''
      }${result.typeChangedTo ? ` · column type → ${result.typeChangedTo}` : ''}`,
      'ok'
    );
  };

  const csvInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    text?: string;
    sheets?: XlsxSheet[];
  } | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [ioPrefs, setIoPrefs] = useState(() => boot?.prefs ?? loadPrefs());

  const applyImportTable = (table: ImportTable, mode: ImportMode) => {
    if (mode === 'overwrite') {
      resetGridHistory({
        cols: table.names.map((name, i) => ({ name, type: table.types[i] ?? 'str' })),
        rows: table.rows.map((row) => [...row]),
      } as GridData);
      showToast('Import', `${table.rows.length} rows and ${table.names.length} columns imported`, 'ok');
    } else if (mode === 'append-rows') {
      // Compute inside the updater: the wizard may have been open while
      // the grid changed, so the render-closure `grid` can be stale.
      setGrid((prev) => {
        const width = prev.cols.length;
        const mapped = table.rows.map((row) => {
          // Align by position when widths match, else by name overlap.
          if (table.names.length === width) return row.slice(0, width).concat(new Array(Math.max(0, width - row.length)).fill(''));
          return prev.cols.map((c) => {
            const idx = table.names.findIndex((n) => n.toLowerCase() === c.name.toLowerCase());
            return idx >= 0 ? row[idx] ?? '' : '';
          });
        });
        return { cols: prev.cols, rows: [...prev.rows, ...mapped] };
      });
      showToast('Import', `${table.rows.length} rows appended`, 'ok');
    } else {
      // Merge columns: add missing names, fill matched columns row-wise.
      setGrid((prev) => {
        const existing = new Map<string, number>(
          prev.cols.map((c, i) => [c.name.toLowerCase(), i] as [string, number])
        );
        const colMap: number[] = [];
        const cols = [...prev.cols];
        table.names.forEach((n, ti) => {
          const at = existing.get(n.toLowerCase());
          if (at !== undefined) {
            colMap[ti] = at;
          } else {
            colMap[ti] = cols.length;
            cols.push({ name: n, type: table.types[ti] ?? 'str' });
          }
        });
        const rows = prev.rows.map((r, ri) => {
          const copy = [...r];
          while (copy.length < cols.length) copy.push('');
          // Fill only rows covered by the source; never cycle (cycling
          // would duplicate source rows over unrelated grid data).
          if (ri >= table.rows.length) return copy;
          const src = table.rows[ri] ?? [];
          table.names.forEach((_, ti) => {
            const dest = colMap[ti];
            const val = src[ti] ?? '';
            if (val !== '') copy[dest] = val;
          });
          return copy;
        });
        // Extra source rows beyond grid length extend the grid.
        for (let ri = prev.rows.length; ri < table.rows.length; ri += 1) {
          const fresh = new Array(cols.length).fill('');
          table.names.forEach((_, ti) => {
            fresh[colMap[ti]] = table.rows[ri][ti] ?? '';
          });
          rows.push(fresh);
        }
        return { cols, rows };
      });
      showToast('Import', `${table.names.length} columns merged`, 'ok');
    }
    setPendingImport(null);
    setValidation({ ran: false, issues: [] });
    setActiveTab('data');
  };

  const importCsv = async (file: File) => {
    try {
      const lower = file.name.toLowerCase();
      // Excel workbooks are binary: parse every sheet, then reuse the wizard
      // and the CSV type-inference pipeline on the chosen sheet.
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm')) {
        if (file.size > 25_000_000) throw new Error('The workbook is too large (max 25 MB)');
        const sheets = readXlsxSheets(await file.arrayBuffer());
        setPendingImport({ fileName: file.name, sheets });
        return;
      }
      const text = await file.text();
      if (!text.trim()) {
        showToast('Import', 'The file is empty', 'warn');
        return;
      }
      // Fast path: small plain CSV goes straight in; anything ambiguous
      // (JSON, semicolons, pipes, tabs) opens the wizard.
      const prefs = loadPrefs();
      const json = looksLikeJson(text) || file.name.toLowerCase().endsWith('.json');
      const tricky = json || /[;\t|]/.test(text.slice(0, 2000));
      if (!tricky && text.length < 200000) {
        const prefDelim = prefs.delimiter === 'tab' || prefs.delimiter === '\t'
          ? '\t'
          : ([';', '|', ','].includes(prefs.delimiter) ? prefs.delimiter : ',');
        const table = readDelimitedTable(text, {
          delimiter: prefDelim,
          hasHeader: prefs.hasHeader,
          decimalComma: prefs.decimalSeparator === ',',
        });
        applyImportTable(table, 'overwrite');
        return;
      }
      setPendingImport({ fileName: file.name, text: text.slice(0, 2000000) });
    } catch (error) {
      console.error(error);
      showToast('Import', error instanceof Error ? error.message : 'Could not read the file', 'error');
    }
  };

  const exportCsv = () => {
    setShowExport(true);
  };

  const [descVars, setDescVars] = useState<number[]>(
    boot?.params.descVars ?? DEFAULT_PARAMS.descVars
  );
  const [ciLevel, setCiLevel] = useState(boot?.settings.ciLevel ?? DEFAULT_SETTINGS.ciLevel);
  const [ttestParams, setTTestParams] = useState<TTestParams>(
    boot?.params.ttest ?? DEFAULT_PARAMS.ttest
  );

  const [anovaParams, setAnovaParams] = useState<AnovaParams>(
    boot?.params.anova ?? DEFAULT_PARAMS.anova
  );

  const [regParams, setRegParams] = useState<RegParams>(
    boot?.params.reg ?? DEFAULT_PARAMS.reg
  );

  const [corrParams, setCorrParams] = useState<CorrParams>(
    boot?.params.corr ?? DEFAULT_PARAMS.corr
  );

  const [chisqParams, setChisqParams] = useState<ChiSqParams>(
    boot?.params.chisq ?? DEFAULT_PARAMS.chisq
  );

  // --- Project persistence (.lzs + silent autosave) ---
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [lastAutosave, setLastAutosave] = useState<string | null>(() =>
    boot ? new Date(boot.savedAt).toLocaleTimeString() : null
  );
  const autosaveWarned = useRef(false);
  // Canonical serialization of what is already stored: avoids redundant
  // writes on mount/StrictMode re-runs and keeps mounts from clobbering a
  // newer tab with identical content.
  const lastSavedProject = useRef<string | null>(boot ? serializeProject(boot) : null);

  const filterNeedsValue = filterOp !== 'empty' && filterOp !== 'notEmpty';
  const activeRowFilter: RowFilter | null =
    showFilter && grid.cols.length > 0 && (!filterNeedsValue || filterValue.trim() !== '')
      ? { col: Math.min(filterCol, grid.cols.length - 1), op: filterOp, value: filterValue }
      : null;
  const visibleRowCount = activeRowFilter
    ? gridFilterIndexes(grid, activeRowFilter).length
    : grid.rows.length;

  const buildProject = (): ProjectSnapshot =>
    createProjectSnapshot({
      grid,
      prefs: ioPrefs,
      settings: { ciLevel, activeAnalysis, activeTab },
      params: {
        descVars,
        ttest: ttestParams,
        anova: anovaParams,
        reg: regParams,
        corr: corrParams,
        chisq: chisqParams,
      },
      outputs,
    });

  useEffect(() => {
    const timer = setTimeout(() => {
      const snapshot = buildProject();
      const json = serializeProject(snapshot);
      if (json === lastSavedProject.current) return;
      if (saveAutosaveText(json)) {
        lastSavedProject.current = json;
        autosaveWarned.current = false;
        setLastAutosave(new Date().toLocaleTimeString());
      } else if (!autosaveWarned.current) {
        // Quota exceeded or oversized grid: warn once, not on every keystroke.
        autosaveWarned.current = true;
        setLastAutosave(null);
        showToast('Autosave', 'Autosave unavailable (storage full or data too large) — use Save project', 'warn');
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, ioPrefs, ciLevel, activeAnalysis, activeTab, descVars, ttestParams, anovaParams, regParams, corrParams, chisqParams, outputs]);

  const applyProject = (project: ProjectSnapshot) => {
    resetGridHistory(project.grid);
    setDescVars(project.params.descVars);
    setTTestParams(project.params.ttest);
    setAnovaParams(project.params.anova);
    setRegParams(project.params.reg);
    setCorrParams(project.params.corr);
    setChisqParams(project.params.chisq);
    setCiLevel(project.settings.ciLevel);
    setActiveAnalysis(
      ANALYSIS_TABS.some((tab) => tab.id === project.settings.activeAnalysis)
        ? project.settings.activeAnalysis
        : DEFAULT_SETTINGS.activeAnalysis
    );
    setActiveTab(project.settings.activeTab);
    setIoPrefs(project.prefs);
    savePrefs(project.prefs);
    // Output snapshots are restored together with the data they were computed
    // from, so the console and the grid always belong to the same session.
    const restored = restoredOutputs(project.outputs);
    setOutputs(restored);
    setValidation({ ran: false, issues: [] });
    setSelRange(null);
    setFocusCell(null);
    setLastAutosave(new Date().toLocaleTimeString());
    showToast(
      'Project',
      `Loaded ${nonEmptyRowCount(project.grid.rows)} rows and ${restored.length} result block(s)`,
      'ok'
    );
  };

  const saveProjectFile = () => {
    downloadText(
      serializeProject(buildProject()),
      'lazstats-project.lzs',
      'application/json;charset=utf-8'
    );
    showToast('Project', 'Project saved as .lzs', 'ok');
  };

  const openProjectFile = async (file: File) => {
    try {
      if (file.size > 25_000_000) throw new Error('The project file is too large');
      const project = parseProject(await file.text());
      if (!window.confirm(`Load "${file.name}"? The current grid will be replaced and the output console cleared.`)) {
        return;
      }
      applyProject(project);
    } catch (error) {
      showToast('Project', error instanceof Error ? error.message : 'Could not read the project', 'error');
    }
  };

  const bootNoticeShown = useRef(false);
  useEffect(() => {
    if (bootNoticeShown.current) return;
    bootNoticeShown.current = true;
    if (boot) {
      showToast('Session', `Restored ${nonEmptyRowCount(boot.grid.rows)} rows from the last session`, 'ok');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nonParamRepeatedRef = useRef<NonParamRepeatedHandle>(null);
  const repeatedAnovaRef = useRef<RepeatedAnovaHandle>(null);
  const multivariateRef = useRef<MultivariateHandle>(null);
  const ancovaRef = useRef<AncovaHandle>(null);
  const contingencyRef = useRef<ContingencyHandle>(null);
  const sampleSizeRef = useRef<SampleSizeHandle>(null);
  const distFitRef = useRef<DistributionFitHandle>(null);
  const factorialRef = useRef<FactorialAnovaHandle>(null);
  const logisticRef = useRef<LogisticHandle>(null);
  const timeSeriesRef = useRef<TimeSeriesHandle>(null);
  const survivalRef = useRef<SurvivalHandle>(null);
  const coxRef = useRef<CoxHandle>(null);
  const wizardRef = useRef<WizardHandle>(null);

  const runAnalysis = () => {
    switch (activeAnalysis) {
      case 'descriptive':
        runDescriptive();
        break;
      case 'ttest':
        runTTest();
        break;
      case 'anova':
        runANOVA();
        break;
      case 'regression':
        runRegression();
        break;
      case 'correlation':
        runCorrelation();
        break;
      case 'chisquare':
        runChiSquare();
        break;
      case 'contingency':
        contingencyRef.current?.run();
        break;
      case 'nonparamrm':
        nonParamRepeatedRef.current?.run();
        break;
      case 'repeatedanova':
        repeatedAnovaRef.current?.run();
        break;
      case 'multivariate':
        multivariateRef.current?.run();
        break;
      case 'ancova':
        ancovaRef.current?.run();
        break;
      case 'samplesize':
        sampleSizeRef.current?.run();
        break;
      case 'distfit':
        distFitRef.current?.run();
        break;
      case 'factorial':
        factorialRef.current?.run();
        break;
      case 'logistic':
        logisticRef.current?.run();
        break;
      case 'timeseries':
        timeSeriesRef.current?.run();
        break;
      case 'survival':
        survivalRef.current?.run();
        break;
      case 'cox':
        coxRef.current?.run();
        break;
      case 'wizard':
        wizardRef.current?.run();
        break;
      default:
        showToast('Analysis', 'Analysis type not implemented yet', 'warn');
    }
  };

  const runDescriptive = () => {
    const results = descVars.map(vIdx => {
      const col = grid.cols[vIdx];
      const data = grid.rows.map(r => parseNum(r[vIdx])).filter(v => !isNaN(v));
      if (data.length === 0) return null;

      const n = data.length;
      const mean = jStat.mean(data);
      const median = jStat.median(data);
      const stdev = jStat.stdev(data, true); // sample SD
      const min = jStat.min(data);
      const max = jStat.max(data);
      const range = max - min;
      const sum = jStat.sum(data);
      const variance = jStat.variance(data, true);
      const skewness = jStat.skewness(data);
      const kurtosis = jStat.kurtosis(data);
      const quartiles = jStat.quartiles(data); // [Q1, Q2, Q3]

      // Histogram data: single source of truth for bin count, edges and counts
      const histogram = buildHistogram(data);

      // Normality calculations
      const normality = calcNormalityTests(data);
      const lilliefors = lillieforsTest(data);

      // Q-Q Plot calculations
      const sortedData = [...data].sort((a, b) => a - b);
      const qqData = sortedData.map((val, idx) => {
        const p = (idx + 1 - 0.375) / (n + 0.25);
        const theoreticalQuantile = jStat.normal.inv(p, 0, 1);
        return {
          x: theoreticalQuantile,
          y: val
        };
      });

      const q25 = jStat.normal.inv(0.25, 0, 1);
      const q75 = jStat.normal.inv(0.75, 0, 1);
      const x25 = quartiles[0];
      const x75 = quartiles[2];
      const qqSlope = (isNaN(stdev) || stdev === 0) ? 0 : (x75 - x25) / (q75 - q25);
      const qqIntercept = x25 - qqSlope * q25;

      // Keep the reference line inside the observed theoretical quantiles: the
      // old fixed ±3 range stretched the y domain far beyond the actual data.
      const qqXMin = Math.min(...qqData.map(d => d.x));
      const qqXMax = Math.max(...qqData.map(d => d.x));
      const qqSpan = (qqXMax - qqXMin) || 1;
      const xMin = qqXMin - qqSpan * 0.05;
      const xMax = qqXMax + qqSpan * 0.05;
      const qqLineData = [
        { x: xMin, y: qqSlope * xMin + qqIntercept },
        { x: xMax, y: qqSlope * xMax + qqIntercept }
      ];

      return { 
        name: col.name, n, mean, median, stdev, min, max, range, sum, variance, skewness, kurtosis,
        q1: quartiles[0], q3: quartiles[2], histData: histogram.data, histBins: histogram.bins,
        normality, lilliefors, qqData, qqLineData
      };
    }).filter(r => r !== null);

    if (results.length === 0) {
      showToast('Error', 'No valid numeric data selected', 'error');
      return;
    }

    const descTables = descriptiveTables(
      grid.rows,
      descVars,
      grid.cols.map(col => col.name),
      ciLevel
    );
    const descReport = descriptiveReport(descTables, ciLevel);

    const output = (
      <div className="output-block" key={Date.now()}>
        <div className="output-title">Descriptive Statistics</div>
        <ResultTables specs={descTables} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div className="h-[300px] bg-surface3/30 rounded p-2">
            <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter">Means Comparison</p>
            <VictoryChart
              theme={VictoryTheme.material}
              domainPadding={20}
              padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
              containerComponent={<VictoryVoronoiContainer />}
            >
              <VictoryAxis
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' } }}
              />
              <VictoryAxis
                dependentAxis
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
              />
              <VictoryBar
                data={results.map(r => ({ x: r.name, y: r.mean }))}
                style={{ data: { fill: '#4f9cf9', width: 25 } }}
                labels={({ datum }) => `Mean: ${fmt(datum.y)}`}
                labelComponent={<VictoryTooltip style={{ fontSize: 10 }} flyoutStyle={{ fill: '#1e1e1e', stroke: '#333' }} />}
              />
            </VictoryChart>
          </div>

          <div className="h-[300px] bg-surface3/30 rounded p-2">
            <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter">Box & Whisker Plot</p>
            <VictoryChart
              theme={VictoryTheme.material}
              domainPadding={50}
              padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
            >
              <VictoryAxis
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' } }}
              />
              <VictoryAxis
                dependentAxis
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
              />
              <VictoryBoxPlot
                data={results.map(r => ({
                  x: r.name,
                  min: r.min,
                  q1: r.q1,
                  median: r.median,
                  q3: r.q3,
                  max: r.max
                }))}
                style={{
                  min: { stroke: "#f87171", strokeWidth: 2 },
                  max: { stroke: "#f87171", strokeWidth: 2 },
                  q1: { fill: "#4f9cf9", fillOpacity: 0.5 },
                  q3: { fill: "#4f9cf9", fillOpacity: 0.5 },
                  median: { stroke: "#fff", strokeWidth: 2 }
                }}
              />
            </VictoryChart>
          </div>
        </div>

        {results.length > 0 && (
          <div className="h-[300px] w-full mt-4 bg-surface3/30 rounded p-2">
            <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter">Distribution (Histogram): {results[0].name}</p>
            <VictoryChart
              theme={VictoryTheme.material}
              domainPadding={{ x: results[0].histBins > 1 ? 190 / results[0].histBins : 20 }}
              padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
            >
              <VictoryAxis
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' } }}
              />
              <VictoryAxis
                dependentAxis
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
              />
              <VictoryBar
                data={results[0].histData}
                style={{ data: { fill: '#34d399', width: results[0].histBins > 1 ? 380 / results[0].histBins : 40 } }}
                labels={({ datum }) => `Freq: ${datum.y}`}
                labelComponent={<VictoryTooltip style={{ fontSize: 10 }} flyoutStyle={{ fill: '#1e1e1e', stroke: '#333' }} />}
              />
            </VictoryChart>
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-8 border-t border-border/40 pt-6">
            <h3 className="text-xs font-mono uppercase tracking-widest text-text2 mb-4">Normality Diagnostics & Q-Q Plots</h3>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {results.map((r, rIdx) => {
                const isNormalJB = r.normality.jbPValue > 0.05;
                const isNormalKS = r.lilliefors.p > 0.05;
                
                return (
                  <div key={rIdx} className="bg-surface3/30 border border-border2 rounded-lg p-4 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-accent mb-3 font-mono tracking-wider">{r.name}</h4>
                      
                      <div className="grid grid-cols-2 gap-4 mb-4 text-[11px] font-mono text-text2 bg-surface2/40 rounded p-3 border border-border/40">
                        <div>
                          <div className="text-[9px] text-text3 uppercase mb-1 font-semibold tracking-tighter font-sans">Jarque-Bera Test</div>
                          <div>JB Stat: <span className="text-text font-semibold">{fmt(r.normality.jbStat)}</span></div>
                          <div>p-value: <span className={`font-bold ${isNormalJB ? 'text-green' : 'text-red/90'}`}>{fmt(r.normality.jbPValue)}</span></div>
                          <div className="text-[10px] mt-1 text-text3 font-sans">
                            {isNormalJB ? '✓ Normal' : '✗ Non-Normal'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-text3 uppercase mb-1 font-semibold tracking-tighter font-sans">Kolmogorov-Smirnov (Lilliefors)</div>
                          <div>D Stat: <span className="text-text font-semibold">{fmt(r.lilliefors.d)}</span></div>
                          <div>p-value: <span className={`font-bold ${isNormalKS ? 'text-green' : 'text-red/90'}`}>{fmt(r.lilliefors.p)}</span></div>
                          <div className="text-[10px] mt-1 text-text3 font-sans">
                            {isNormalKS ? '✓ Normal' : '✗ Non-Normal'}
                          </div>
                        </div>
                        <div className="col-span-2 border-t border-border/30 pt-2 mt-1 grid grid-cols-2 font-sans">
                          <div>Skewness: <span className="text-text font-semibold font-mono">{fmt(r.skewness)}</span></div>
                          <div>Kurtosis (ex): <span className="text-text font-semibold font-mono">{fmt(r.kurtosis)}</span></div>
                        </div>
                      </div>
                    </div>

                    <div className="h-[260px] w-full bg-surface2/20 rounded p-1">
                      <p className="text-[9px] text-text3 uppercase tracking-tighter text-center mb-1 font-mono">Normal Q-Q Plot</p>
                      <VictoryChart
                        theme={VictoryTheme.material}
                        padding={{ top: 15, bottom: 40, left: 55, right: 15 }}
                      >
                        <VictoryAxis
                          label="Theoretical Quantiles"
                          style={{ 
                            axis: { stroke: '#444' }, 
                            axisLabel: { fill: '#888', fontSize: 9, padding: 25 },
                            tickLabels: { fill: '#888', fontSize: 8 },
                            grid: { stroke: '#333', strokeDasharray: '3 3' }
                          }}
                        />
                        <VictoryAxis
                          dependentAxis
                          label="Observed Values"
                          style={{ 
                            axis: { stroke: '#444' }, 
                            axisLabel: { fill: '#888', fontSize: 9, padding: 35 },
                            tickLabels: { fill: '#888', fontSize: 8 },
                            grid: { stroke: '#333', strokeDasharray: '3 3' }
                          }}
                        />
                        <VictoryScatter
                          data={r.qqData}
                          style={{ data: { fill: '#4f9cf9', fillOpacity: 0.8, r: 3 } }}
                          labels={({ datum }) => `Obs: ${fmt(datum.y)}\nTh: ${fmt(datum.x)}`}
                          labelComponent={<VictoryTooltip style={{ fontSize: 9 }} flyoutStyle={{ fill: '#1e1e1e', stroke: '#444' }} />}
                        />
                        <VictoryLine
                          data={r.qqLineData}
                          style={{ data: { stroke: '#ef4444', strokeWidth: 1.5 } }}
                        />
                      </VictoryChart>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
    pushOutput(output, descReport);
  };

  const runTTest = () => {
    const { type, var1, var2, mu, useNonParam, equalVar } = ttestParams;
    const a1 = grid.rows.map(r => parseNum(r[var1])).filter(v => !isNaN(v));
    const a2 = grid.rows.map(r => parseNum(r[var2])).filter(v => !isNaN(v));

    // Paired designs need complete cases per row: filtering each column on its
    // own would pair values coming from different observations.
    const paired = pairedValues(grid.rows, var1, var2);

    if (a1.length === 0 || (type !== 'one' && a2.length === 0) || (type === 'dep' && paired.a.length === 0)) {
      showToast('Error', 'Insufficient data for T-Test', 'error');
      return;
    }

    let resultHtml: React.ReactNode;
    let reportSpec: ReportSpec | null = null;

    if (type === 'one') {
      const n = a1.length;
      const mean = jStat.mean(a1);
      const sd = jStat.stdev(a1, true);
      const se = sd / Math.sqrt(n);
      const t = (mean - mu) / se;
      const df = n - 1;
      const p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));

      // Wilcoxon Signed-Rank Test
      const wilcox = calcWilcoxonSignedRank(a1, mu);
      const q = jStat.quartiles(a1);
      const boxData = [
        {
          x: grid.cols[var1].name,
          min: jStat.min(a1),
          q1: q[0],
          median: q[1],
          q3: q[2],
          max: jStat.max(a1)
        }
      ];

      const tables = ttestTables({
        type: 'one',
        rows: grid.rows,
        i1: var1,
        i2: var2,
        name1: grid.cols[var1].name,
        name2: grid.cols[var2].name,
        mu,
        equalVar,
        level: ciLevel,
        useNonParam,
      });

      reportSpec = ttestReport({
        tables,
        type: 'one',
        name1: grid.cols[var1].name,
        name2: grid.cols[var2].name,
        mu,
        level: ciLevel,
        equalVar,
        useNonParam,
      });

      resultHtml = (
        <div className="output-block" key={Date.now()}>
          <div className="output-title">One-Sample T-Test & Wilcoxon Signed-Rank: {grid.cols[var1].name}</div>
          
          <ResultTables specs={tables} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            <div className="h-[250px] bg-surface3/30 rounded p-2">
              <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center">Parametric: Sample Distribution & Test Value (μ)</p>
              <VictoryChart
                theme={VictoryTheme.material}
                domainPadding={50}
                padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
              >
                <VictoryAxis
                  tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                  style={{ axis: { stroke: '#333' } }}
                />
                <VictoryAxis
                  dependentAxis
                  tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                  style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
                />
                <VictoryBoxPlot
                  data={boxData}
                  style={{
                    min: { stroke: "#f87171", strokeWidth: 1.5 },
                    max: { stroke: "#f87171", strokeWidth: 1.5 },
                    q1: { fill: "#4f9cf9", fillOpacity: 0.4 },
                    q3: { fill: "#4f9cf9", fillOpacity: 0.4 },
                    median: { stroke: "#fff", strokeWidth: 2 }
                  }}
                />
                <VictoryLine
                  y={() => mu}
                  style={{ data: { stroke: '#ef4444', strokeWidth: 1.5, strokeDasharray: "4 4" } }}
                  labels={["μ"]}
                  labelComponent={<VictoryLabel dx={10} style={{ fill: '#ef4444', fontSize: 9 }} />}
                />
              </VictoryChart>
            </div>

            {useNonParam && !isNaN(wilcox.wStat) && (
              <div className="h-[250px] bg-surface3/30 rounded p-2">
                <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center">Non-Parametric: Boxplot & Test Value Median (H₀)</p>
                <VictoryChart
                  theme={VictoryTheme.material}
                  domainPadding={50}
                  padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
                >
                  <VictoryAxis
                    tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                    style={{ axis: { stroke: '#333' } }}
                  />
                  <VictoryAxis
                    dependentAxis
                    tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                    style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
                  />
                  <VictoryBoxPlot
                    data={boxData}
                    style={{
                      min: { stroke: "#f87171", strokeWidth: 1.5 },
                      max: { stroke: "#f87171", strokeWidth: 1.5 },
                      q1: { fill: "#34d399", fillOpacity: 0.4 },
                      q3: { fill: "#34d399", fillOpacity: 0.4 },
                      median: { stroke: "#fff", strokeWidth: 2 }
                    }}
                  />
                  <VictoryLine
                    y={() => mu}
                    style={{ data: { stroke: '#ef4444', strokeWidth: 1.5, strokeDasharray: "4 4" } }}
                    labels={["μ₀"]}
                    labelComponent={<VictoryLabel dx={10} style={{ fill: '#ef4444', fontSize: 9 }} />}
                  />
                </VictoryChart>
              </div>
            )}
          </div>
        </div>
      );
    } else if (type === 'ind') {
      const n1 = a1.length;
      const n2 = a2.length;
      if (n1 < 2 || n2 < 2) {
        showToast('Error', 'Each group needs at least 2 numeric values', 'error');
        return;
      }
      const m1 = jStat.mean(a1);
      const m2 = jStat.mean(a2);
      const v1 = jStat.variance(a1, true);
      const v2 = jStat.variance(a2, true);

      const { t, df, p } = equalVar ? pooledTTest(a1, a2) : welchTTest(a1, a2);
      const varianceLabel = equalVar ? 'Pooled Variance' : "Welch's Unequal Variances";

      // Mann-Whitney U test
      const mw = calcMannWhitneyU(a1, a2);

      const q1 = jStat.quartiles(a1);
      const q2 = jStat.quartiles(a2);
      const boxDataInd = [
        {
          x: grid.cols[var1].name,
          min: jStat.min(a1),
          q1: q1[0],
          median: q1[1],
          q3: q1[2],
          max: jStat.max(a1)
        },
        {
          x: grid.cols[var2].name,
          min: jStat.min(a2),
          q1: q2[0],
          median: q2[1],
          q3: q2[2],
          max: jStat.max(a2)
        }
      ];

      // Non-parametric boxplot: ranks of both groups
      const combinedForRanks = [
        ...a1.map(v => ({ val: v, group: 1, rank: 0 })),
        ...a2.map(v => ({ val: v, group: 2, rank: 0 }))
      ];
      const N_comb = combinedForRanks.length;
      combinedForRanks.sort((a, b) => a.val - b.val);
      let idx_comb = 0;
      while (idx_comb < N_comb) {
        let j = idx_comb;
        while (j < N_comb - 1 && combinedForRanks[j + 1].val === combinedForRanks[idx_comb].val) {
          j++;
        }
        const sumRanks = ((j + 1) * (j + 2)) / 2 - (idx_comb * (idx_comb + 1)) / 2;
        const avgRank = sumRanks / (j - idx_comb + 1);
        for (let k_comb = idx_comb; k_comb <= j; k_comb++) {
          combinedForRanks[k_comb].rank = avgRank;
        }
        idx_comb = j + 1;
      }
      const ranks1 = combinedForRanks.filter(item => item.group === 1).map(item => item.rank);
      const ranks2 = combinedForRanks.filter(item => item.group === 2).map(item => item.rank);
      const qRanks1 = jStat.quartiles(ranks1);
      const qRanks2 = jStat.quartiles(ranks2);
      const boxDataRanks = [
        {
          x: grid.cols[var1].name,
          min: jStat.min(ranks1),
          q1: qRanks1[0],
          median: qRanks1[1],
          q3: qRanks1[2],
          max: jStat.max(ranks1)
        },
        {
          x: grid.cols[var2].name,
          min: jStat.min(ranks2),
          q1: qRanks2[0],
          median: qRanks2[1],
          q3: qRanks2[2],
          max: jStat.max(ranks2)
        }
      ];

      const tables = ttestTables({
        type: 'ind',
        rows: grid.rows,
        i1: var1,
        i2: var2,
        name1: grid.cols[var1].name,
        name2: grid.cols[var2].name,
        mu,
        equalVar,
        level: ciLevel,
        useNonParam,
      });

      reportSpec = ttestReport({
        tables,
        type: 'ind',
        name1: grid.cols[var1].name,
        name2: grid.cols[var2].name,
        mu,
        level: ciLevel,
        equalVar,
        useNonParam,
      });

      resultHtml = (
        <div className="output-block" key={Date.now()}>
          <div className="output-title">Independent Samples T-Test & Mann-Whitney U</div>
          <p className="text-[11px] mb-4 text-accent2">{grid.cols[var1].name} vs {grid.cols[var2].name}</p>
          
          <ResultTables specs={tables} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            <div className="h-[250px] bg-surface3/30 rounded p-2">
              <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center">Parametric: Group Boxplots (Values)</p>
              <VictoryChart
                theme={VictoryTheme.material}
                domainPadding={40}
                padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
              >
                <VictoryAxis
                  tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                  style={{ axis: { stroke: '#333' } }}
                />
                <VictoryAxis
                  dependentAxis
                  tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                  style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
                />
                <VictoryBoxPlot
                  data={boxDataInd}
                  style={{
                    min: { stroke: "#f87171", strokeWidth: 1.5 },
                    max: { stroke: "#f87171", strokeWidth: 1.5 },
                    q1: { fill: "#4f9cf9", fillOpacity: 0.4 },
                    q3: { fill: "#4f9cf9", fillOpacity: 0.4 },
                    median: { stroke: "#fff", strokeWidth: 2 }
                  }}
                />
              </VictoryChart>
            </div>

            {useNonParam && !isNaN(mw.uStat) && (
              <div className="h-[250px] bg-surface3/30 rounded p-2">
                <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center">Non-Parametric: Group Rank Boxplots</p>
                <VictoryChart
                  theme={VictoryTheme.material}
                  domainPadding={40}
                  padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
                >
                  <VictoryAxis
                    tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                    style={{ axis: { stroke: '#333' } }}
                  />
                  <VictoryAxis
                    dependentAxis
                    tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                    style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
                  />
                  <VictoryBoxPlot
                    data={boxDataRanks}
                    style={{
                      min: { stroke: "#f87171", strokeWidth: 1.5 },
                      max: { stroke: "#f87171", strokeWidth: 1.5 },
                      q1: { fill: "#818cf8", fillOpacity: 0.4 },
                      q3: { fill: "#818cf8", fillOpacity: 0.4 },
                      median: { stroke: "#fff", strokeWidth: 2 }
                    }}
                  />
                </VictoryChart>
              </div>
            )}
          </div>
        </div>
      );
    } else if (type === 'dep') {
      // Paired samples: only rows where both columns hold a numeric value
      const n = paired.a.length;
      if (n < 2) {
        showToast('Error', 'Paired T-Test needs at least 2 complete pairs', 'error');
        return;
      }
      const diffs: number[] = [];
      for (let i = 0; i < n; i++) diffs.push(paired.a[i] - paired.b[i]);

      const meanDiff = jStat.mean(diffs);
      const sdDiff = jStat.stdev(diffs, true);
      const se = sdDiff / Math.sqrt(n);
      const t = meanDiff / se;
      const df = n - 1;
      const p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));

      // Wilcoxon Signed-Rank Test (paired differences vs 0)
      const wilcox = calcWilcoxonSignedRank(diffs, 0);

      const q1 = jStat.quartiles(paired.a);
      const q2 = jStat.quartiles(paired.b);
      const boxDataPaired = [
        {
          x: grid.cols[var1].name,
          min: jStat.min(paired.a),
          q1: q1[0],
          median: q1[1],
          q3: q1[2],
          max: jStat.max(paired.a)
        },
        {
          x: grid.cols[var2].name,
          min: jStat.min(paired.b),
          q1: q2[0],
          median: q2[1],
          q3: q2[2],
          max: jStat.max(paired.b)
        }
      ];

      const qDiffs = jStat.quartiles(diffs);
      const boxDataDiffs = [
        {
          x: 'Differences',
          min: jStat.min(diffs),
          q1: qDiffs[0],
          median: qDiffs[1],
          q3: qDiffs[2],
          max: jStat.max(diffs)
        }
      ];

      const tables = ttestTables({
        type: 'dep',
        rows: grid.rows,
        i1: var1,
        i2: var2,
        name1: grid.cols[var1].name,
        name2: grid.cols[var2].name,
        mu,
        equalVar,
        level: ciLevel,
        useNonParam,
      });

      reportSpec = ttestReport({
        tables,
        type: 'dep',
        name1: grid.cols[var1].name,
        name2: grid.cols[var2].name,
        mu,
        level: ciLevel,
        equalVar,
        useNonParam,
      });

      resultHtml = (
        <div className="output-block" key={Date.now()}>
          <div className="output-title">Paired Samples T-Test & Wilcoxon Signed-Rank</div>
          <p className="text-[11px] mb-4 text-accent2">{grid.cols[var1].name} - {grid.cols[var2].name}</p>
          
          <ResultTables specs={tables} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            <div className="h-[250px] bg-surface3/30 rounded p-2">
              <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center">Parametric: Group Boxplots (Values)</p>
              <VictoryChart
                theme={VictoryTheme.material}
                domainPadding={40}
                padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
              >
                <VictoryAxis
                  tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                  style={{ axis: { stroke: '#333' } }}
                />
                <VictoryAxis
                  dependentAxis
                  tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                  style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
                />
                <VictoryBoxPlot
                  data={boxDataPaired}
                  style={{
                    min: { stroke: "#f87171", strokeWidth: 1.5 },
                    max: { stroke: "#f87171", strokeWidth: 1.5 },
                    q1: { fill: "#4f9cf9", fillOpacity: 0.4 },
                    q3: { fill: "#4f9cf9", fillOpacity: 0.4 },
                    median: { stroke: "#fff", strokeWidth: 2 }
                  }}
                />
              </VictoryChart>
            </div>

            {useNonParam && !isNaN(wilcox.wStat) && (
              <div className="h-[250px] bg-surface3/30 rounded p-2">
                <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center">Non-Parametric: Boxplot of Differences (H₀: Median = 0)</p>
                <VictoryChart
                  theme={VictoryTheme.material}
                  domainPadding={50}
                  padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
                >
                  <VictoryAxis
                    tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                    style={{ axis: { stroke: '#333' } }}
                  />
                  <VictoryAxis
                    dependentAxis
                    tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                    style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
                  />
                  <VictoryBoxPlot
                    data={boxDataDiffs}
                    style={{
                      min: { stroke: "#f87171", strokeWidth: 1.5 },
                      max: { stroke: "#f87171", strokeWidth: 1.5 },
                      q1: { fill: "#a78bfa", fillOpacity: 0.4 },
                      q3: { fill: "#a78bfa", fillOpacity: 0.4 },
                      median: { stroke: "#fff", strokeWidth: 2 }
                    }}
                  />
                  <VictoryLine
                    y={() => 0}
                    style={{ data: { stroke: '#ef4444', strokeWidth: 1.5, strokeDasharray: "4 4" } }}
                    labels={["0"]}
                    labelComponent={<VictoryLabel dx={10} style={{ fill: '#ef4444', fontSize: 9 }} />}
                  />
                </VictoryChart>
              </div>
            )}
          </div>
        </div>
      );
    }
    pushOutput(resultHtml, reportSpec);
  };

  const runANOVA = () => {
    const { dep, grp, posthoc, useNonParam, kwPosthoc } = anovaParams;

    // Group labels are what tables and charts show; the codes stay in the grid.
    const rowsForAnalysis = analysisRows(grid, [grp]);

    // Group data
    const groups: { [key: string]: number[] } = {};
    rowsForAnalysis.forEach(row => {
      const d = parseNum(row[dep]);
      const g = row[grp];
      if (!isNaN(d) && g !== '') {
        if (!groups[g]) groups[g] = [];
        groups[g].push(d);
      }
    });

    const groupKeys = Object.keys(groups);
    if (groupKeys.length < 2) {
      showToast('Error', 'Need at least 2 groups for ANOVA', 'error');
      return;
    }

    const allData = Object.values(groups).flat();
    const grandMean = jStat.mean(allData);
    const nTotal = allData.length;
    const k = groupKeys.length;

    let ssBetween = 0;
    let ssWithin = 0;

    groupKeys.forEach(key => {
      const gData = groups[key];
      const gMean = jStat.mean(gData);
      const gN = gData.length;
      ssBetween += gN * Math.pow(gMean - grandMean, 2);
      gData.forEach(v => {
        ssWithin += Math.pow(v - gMean, 2);
      });
    });

    const dfBetween = k - 1;
    const dfWithin = nTotal - k;
    const msBetween = ssBetween / dfBetween;
    const msWithin = ssWithin / dfWithin;
    const f = msBetween / msWithin;
    const p = 1 - jStat.centralF.cdf(f, dfBetween, dfWithin);

    // Post-Hoc Analysis
    let postHocResults: any[] = [];
    if (posthoc !== 'none') {
      const numComps = (k * (k - 1)) / 2;
      for (let i = 0; i < groupKeys.length; i++) {
        for (let j = i + 1; j < groupKeys.length; j++) {
          const g1 = groupKeys[i];
          const g2 = groupKeys[j];
          const n1 = groups[g1].length;
          const n2 = groups[g2].length;
          const m1 = jStat.mean(groups[g1]);
          const m2 = jStat.mean(groups[g2]);
          const diff = m1 - m2;
          
          let pVal = 1;
          let testName = "";

          if (posthoc === 'tukey') {
            testName = "Tukey HSD (approx)";
            if (msWithin > 0) {
              const t = diff / (Math.sqrt(msWithin * (1/n1 + 1/n2)));
              pVal = 2 * (1 - jStat.studentt.cdf(Math.abs(t), dfWithin));
              pVal = Math.min(1, pVal * (k - 1));
            } else {
              pVal = diff === 0 ? 1 : 0;
            }
          } else if (posthoc === 'bonferroni') {
            testName = "Bonferroni";
            if (msWithin > 0) {
              const t = diff / (Math.sqrt(msWithin * (1/n1 + 1/n2)));
              pVal = 2 * (1 - jStat.studentt.cdf(Math.abs(t), dfWithin));
              pVal = Math.min(1, pVal * numComps);
            } else {
              pVal = diff === 0 ? 1 : 0;
            }
          }

          postHocResults.push({
            comp: `${g1} vs ${g2}`,
            diff,
            p: pVal,
            testName
          });
        }
      }
    }

    // Kruskal-Wallis Non-Parametric ANOVA Alternative
    const kw = calcKruskalWallis(groups);
    let kwPostHocResults: any[] = [];
    if (useNonParam && kwPosthoc === 'bonferroni' && k > 2) {
      const numComps = (k * (k - 1)) / 2;
      for (let i = 0; i < groupKeys.length; i++) {
        for (let j = i + 1; j < groupKeys.length; j++) {
          const g1 = groupKeys[i];
          const g2 = groupKeys[j];
          const vals1 = groups[g1];
          const vals2 = groups[g2];
          const mwu = calcMannWhitneyU(vals1, vals2);
          const adjP = Math.min(1.0, mwu.pValue * numComps);
          kwPostHocResults.push({
            comp: `${g1} vs ${g2}`,
            uStat: mwu.uStat,
            zStat: mwu.zStat,
            p: adjP
          });
        }
      }
    }

    const anovaBoxPlotData = groupKeys.map(key => {
      const vals = groups[key];
      const quartiles = jStat.quartiles(vals);
      return {
        x: key,
        min: jStat.min(vals),
        q1: quartiles[0],
        median: quartiles[1],
        q3: quartiles[2],
        max: jStat.max(vals)
      };
    });

    const kwCombined: { val: number; gKey: string; rank: number }[] = [];
    groupKeys.forEach(key => {
      groups[key].forEach(v => {
        kwCombined.push({ val: v, gKey: key, rank: 0 });
      });
    });
    const kwN = kwCombined.length;
    kwCombined.sort((a, b) => a.val - b.val);
    let kwIdx = 0;
    while (kwIdx < kwN) {
      let j = kwIdx;
      while (j < kwN - 1 && kwCombined[j + 1].val === kwCombined[kwIdx].val) {
        j++;
      }
      const sumRanks = ((j + 1) * (j + 2)) / 2 - (kwIdx * (kwIdx + 1)) / 2;
      const avgRank = sumRanks / (j - kwIdx + 1);
      for (let k_comb = kwIdx; k_comb <= j; k_comb++) {
        kwCombined[k_comb].rank = avgRank;
      }
      kwIdx = j + 1;
    }

    const kwBoxPlotData = groupKeys.map(key => {
      const ranksOfGroup = kwCombined.filter(item => item.gKey === key).map(item => item.rank);
      if (ranksOfGroup.length === 0) {
        return { x: key, min: 0, q1: 0, median: 0, q3: 0, max: 0 };
      }
      const quartiles = jStat.quartiles(ranksOfGroup);
      return {
        x: key,
        min: jStat.min(ranksOfGroup),
        q1: quartiles[0],
        median: quartiles[1],
        q3: quartiles[2],
        max: jStat.max(ranksOfGroup)
      };
    });

    const kwMeanRanksData = groupKeys.map(key => ({
      x: key,
      y: kw.groupMeanRanks[key] || 0
    }));

    const tables = anovaTables({
      rows: rowsForAnalysis,
      depIdx: dep,
      grpIdx: grp,
      depName: grid.cols[dep].name,
      grpName: grid.cols[grp].name,
      posthoc: posthoc as any,
      kwPosthoc,
      level: ciLevel,
      useNonParam,
    });
    const report = anovaReport({
      tables,
      depName: grid.cols[dep].name,
      grpName: grid.cols[grp].name,
      level: ciLevel,
      postHoc: posthoc,
      useNonParam,
    });

    const output = (
      <div className="output-block" key={Date.now()}>
        <div className="output-title">One-Way ANOVA & Kruskal-Wallis: {grid.cols[dep].name} by {grid.cols[grp].name}</div>
        
        <ResultTables specs={tables} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          <div className="h-[300px] bg-surface3/30 rounded p-2">
            <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center">Parametric: Group Boxplots (Values)</p>
            <VictoryChart
              theme={VictoryTheme.material}
              domainPadding={40}
              padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
            >
              <VictoryAxis
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' } }}
              />
              <VictoryAxis
                dependentAxis
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
              />
              <VictoryBoxPlot
                data={anovaBoxPlotData}
                style={{
                  min: { stroke: "#f87171", strokeWidth: 1.5 },
                  max: { stroke: "#f87171", strokeWidth: 1.5 },
                  q1: { fill: "#34d399", fillOpacity: 0.4 },
                  q3: { fill: "#34d399", fillOpacity: 0.4 },
                  median: { stroke: "#fff", strokeWidth: 2 }
                }}
              />
            </VictoryChart>
          </div>

          {useNonParam && !isNaN(kw.hStat) && (
            <div className="h-[300px] bg-surface3/30 rounded p-2">
              <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center">Non-Parametric: Group Rank Boxplots</p>
              <VictoryChart
                theme={VictoryTheme.material}
                domainPadding={40}
                padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
              >
                <VictoryAxis
                  tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                  style={{ axis: { stroke: '#333' } }}
                />
                <VictoryAxis
                  dependentAxis
                  tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                  style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
                />
                <VictoryBoxPlot
                  data={kwBoxPlotData}
                  style={{
                    min: { stroke: "#f87171", strokeWidth: 1.5 },
                    max: { stroke: "#f87171", strokeWidth: 1.5 },
                    q1: { fill: "#818cf8", fillOpacity: 0.4 },
                    q3: { fill: "#818cf8", fillOpacity: 0.4 },
                    median: { stroke: "#fff", strokeWidth: 2 }
                  }}
                />
              </VictoryChart>
            </div>
          )}
        </div>
      </div>
    );
    pushOutput(output, report);
  };

  const runRegression = () => {
    const { dep, indeps, useNonParam } = regParams;
    if (indeps.length === 0) {
      showToast('Error', 'Select at least one predictor', 'error');
      return;
    }

    // Filter valid rows
    const validRows = grid.rows.filter(row => {
      const y = parseNum(row[dep]);
      if (isNaN(y)) return false;
      return indeps.every(idx => !isNaN(parseNum(row[idx])));
    });

    if (validRows.length <= indeps.length + 1) {
      showToast('Error', 'Insufficient data for regression', 'error');
      return;
    }

    // Check for zero variance in predictors
    for (const idx of indeps) {
      const vals = validRows.map(row => parseNum(row[idx]));
      const mean = jStat.mean(vals);
      const sumSqDiff = vals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0);
      if (sumSqDiff === 0) {
        showToast('Error', `Predictor '${grid.cols[idx].name}' has zero variance (all values are identical).`, 'error');
        return;
      }
    }

    const Y = validRows.map(row => parseNum(row[dep]));
    const X = validRows.map(row => [1, ...indeps.map(idx => parseNum(row[idx]))]);

    const n = Y.length;
    const k = indeps.length;
    const df = n - k - 1;

    let coef: number[] = [];
    let R2 = 0;
    let se: number[] = [];
    let tStats: number[] = [];
    let pValues: number[] = [];

    try {
      if (k === 1) {
        // Analytical path for simple linear regression (highly stable, avoids QR decomposition instability)
        const xs = validRows.map(row => parseNum(row[indeps[0]]));
        const ys = Y;

        const meanX = jStat.mean(xs);
        const meanY = jStat.mean(ys);

        let sumXX = 0;
        let sumYY = 0;
        let sumXY = 0;
        for (let i = 0; i < n; i++) {
          const diffX = xs[i] - meanX;
          const diffY = ys[i] - meanY;
          sumXX += diffX * diffX;
          sumYY += diffY * diffY;
          sumXY += diffX * diffY;
        }

        const slope = sumXY / sumXX;
        const intercept = meanY - slope * meanX;
        coef = [intercept, slope];

        // Residual sum of squares
        const residuals = ys.map((y, i) => y - (intercept + slope * xs[i]));
        const rss = residuals.reduce((sum, r) => sum + r * r, 0);
        const mse = rss / df;

        R2 = sumYY === 0 ? 0 : 1 - (rss / sumYY);
        if (R2 < 0) R2 = 0;

        const seSlope = Math.sqrt(mse / sumXX);
        const seIntercept = Math.sqrt(mse * (1 / n + (meanX * meanX) / sumXX));
        se = [seIntercept, seSlope];

        tStats = [intercept / seIntercept, slope / seSlope];
        pValues = tStats.map(t => 2 * (1 - jStat.studentt.cdf(Math.abs(t), df)));
      } else {
        // Fallback to jStat models for multiple regression
        const ols = jStat.models.ols(Y, X);
        coef = ols.coef;
        R2 = ols.R2;
        const rss = ols.resid.reduce((a: number, b: number) => a + b * b, 0);
        const mse = rss / df;

        // X'X inverse
        const Xt = jStat.transpose(X);
        const XtX = jStat.multiply(Xt, X);
        const XtXinv = jStat.inv(XtX);

        se = coef.map((_: any, i: number) => Math.sqrt(mse * XtXinv[i][i]));
        tStats = coef.map((c: number, i: number) => c / se[i]);
        pValues = tStats.map(t => 2 * (1 - jStat.studentt.cdf(Math.abs(t), df)));
      }
    } catch (err) {
      console.error(err);
      showToast('Error', 'Regression failed. Please check if variables are collinear or have insufficient variance.', 'error');
      return;
    }

    const scatterData = validRows.map(row => ({
      x: parseNum(row[indeps[0]]),
      y: parseNum(row[dep])
    })).filter(d => !isNaN(d.x) && !isNaN(d.y));

    // Calculate Theil-Sen Robust Regression
    let tsSlope = NaN;
    let tsIntercept = NaN;
    let tsLineData: { x: number; y: number }[] = [];
    const tsEstimators: { name: string; slope: number; intercept: number }[] = [];

    if (k === 1 && scatterData.length > 0) {
      const xs = scatterData.map(d => d.x);
      const ys = scatterData.map(d => d.y);
      const tsResult = calcTheilSen(xs, ys);
      tsSlope = tsResult.slope;
      tsIntercept = tsResult.intercept;
    } else {
      // Calculate independent univariate Theil-Sen slopes for comparison
      indeps.forEach(idx => {
        const xs = validRows.map(row => parseNum(row[idx]));
        const tsResult = calcTheilSen(xs, Y);
        tsEstimators.push({
          name: grid.cols[idx].name,
          slope: tsResult.slope,
          intercept: tsResult.intercept
        });
      });
    }

    const coefData = indeps.map((idx, i) => ({
      name: grid.cols[idx].name,
      value: coef[i + 1]
    }));

    // Calculate bounds and regression line data if simple linear regression
    let regLineData: { x: number; y: number }[] = [];
    let xDomain: [number, number] | undefined = undefined;
    let yDomain: [number, number] | undefined = undefined;

    if (indeps.length === 1 && scatterData.length > 0) {
      const xs = scatterData.map(d => d.x);
      const ys = scatterData.map(d => d.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const yAtMinX = coef[0] + coef[1] * minX;
      const yAtMaxX = coef[0] + coef[1] * maxX;

      regLineData = [
        { x: minX, y: yAtMinX },
        { x: maxX, y: yAtMaxX }
      ];

      if (useNonParam && !isNaN(tsSlope)) {
        tsLineData = [
          { x: minX, y: tsIntercept + tsSlope * minX },
          { x: maxX, y: tsIntercept + tsSlope * maxX }
        ];
      }

      const xRange = maxX - minX || 1;
      const yMinVal = Math.min(minY, yAtMinX, yAtMaxX, useNonParam && !isNaN(tsSlope) ? tsIntercept + tsSlope * minX : minY);
      const yMaxVal = Math.max(maxY, yAtMinX, yAtMaxX, useNonParam && !isNaN(tsSlope) ? tsIntercept + tsSlope * maxX : maxY);
      const yRange = yMaxVal - yMinVal || 1;

      xDomain = [minX - xRange * 0.05, maxX + xRange * 0.05];
      yDomain = [yMinVal - yRange * 0.05, yMaxVal + yRange * 0.05];
    }

    const olsResids = indeps.length === 1 
      ? scatterData.map(d => d.y - (coef[0] + coef[1] * d.x))
      : Y.map((yVal, rIdx) => yVal - (coef[0] + indeps.reduce((sum, idx, i) => sum + coef[i+1] * parseNum(validRows[rIdx][idx]), 0)));

    const qOls = jStat.quartiles(olsResids);
    const regResidualsBoxPlotData = [
      {
        x: "OLS Residuals",
        min: jStat.min(olsResids),
        q1: qOls[0],
        median: qOls[1],
        q3: qOls[2],
        max: jStat.max(olsResids)
      }
    ];

    const calcResidStats = (resids: number[], name: string) => {
      const rMin = jStat.min(resids);
      const rMax = jStat.max(resids);
      const rMean = jStat.mean(resids);
      const rMedian = jStat.median(resids);
      const rStdev = jStat.stdev(resids, true);
      const rSkew = jStat.skewness(resids);
      const rKurt = jStat.kurtosis(resids);
      const rNorm = calcNormalityTests(resids);
      return {
        name,
        min: rMin,
        max: rMax,
        mean: rMean,
        median: rMedian,
        stdev: rStdev,
        skew: rSkew,
        kurt: rKurt,
        norm: rNorm
      };
    };

    const olsResidStats = calcResidStats(olsResids, "OLS Residuals");
    let tsResidStats: any = null;

    if (useNonParam) {
      if (indeps.length === 1 && !isNaN(tsSlope)) {
        const tsResids = scatterData.map(d => d.y - (tsIntercept + tsSlope * d.x));
        const qTs = jStat.quartiles(tsResids);
        regResidualsBoxPlotData.push({
          x: "Theil-Sen Residuals",
          min: jStat.min(tsResids),
          q1: qTs[0],
          median: qTs[1],
          q3: qTs[2],
          max: jStat.max(tsResids)
        });
        tsResidStats = calcResidStats(tsResids, "Theil-Sen Residuals");
      } else if (indeps.length > 1) {
        const firstTS = tsEstimators[0];
        if (firstTS) {
          const firstXs = validRows.map(row => parseNum(row[indeps[0]]));
          const tsResids = Y.map((yVal, rIdx) => yVal - (firstTS.intercept + firstTS.slope * firstXs[rIdx]));
          const qTs = jStat.quartiles(tsResids);
          regResidualsBoxPlotData.push({
            x: `Theil-Sen Resids\n(${grid.cols[indeps[0]].name})`,
            min: jStat.min(tsResids),
            q1: qTs[0],
            median: qTs[1],
            q3: qTs[2],
            max: jStat.max(tsResids)
          });
          tsResidStats = calcResidStats(tsResids, `Theil-Sen Residuals (${grid.cols[indeps[0]].name})`);
        }
      }
    }

    const tables = regressionTables({
      rows: grid.rows,
      depIdx: dep,
      indepIdxs: indeps,
      depName: grid.cols[dep].name,
      predNames: indeps.map(index => grid.cols[index].name),
      level: ciLevel,
    });
    const report = regressionReport({
      tables,
      depName: grid.cols[dep].name,
      predNames: indeps.map(index => grid.cols[index].name),
      level: ciLevel,
    });

    const output = (
      <div className="output-block" key={Date.now()}>
        <div className="output-title">Linear Regression & Robust Estimators: {grid.cols[dep].name}</div>
        <ResultTables specs={tables} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          {indeps.length === 1 && (
            <div className="h-[320px] bg-surface3/30 rounded p-2">
              <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center">
                Regression Line Comparison {useNonParam && <span className="text-green font-semibold">(Solid = Theil-Sen, Red = OLS)</span>}
              </p>
              <VictoryChart
                theme={VictoryTheme.material}
                scale={{ x: "linear", y: "linear" }}
                domain={xDomain && yDomain ? { x: xDomain, y: yDomain } : undefined}
                padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
              >
                <VictoryAxis
                  label={grid.cols[indeps[0]].name}
                  style={{ 
                    axis: { stroke: '#333' }, 
                    axisLabel: { fill: '#888', fontSize: 10, padding: 30 },
                    tickLabels: { fill: '#888', fontSize: 10 }
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  label={grid.cols[dep].name}
                  style={{ 
                    axis: { stroke: '#333' }, 
                    axisLabel: { fill: '#888', fontSize: 10, padding: 35 },
                    tickLabels: { fill: '#888', fontSize: 10 },
                    grid: { stroke: '#222' }
                  }}
                />
                <VictoryScatter
                  data={scatterData}
                  style={{ data: { fill: '#4f9cf9', fillOpacity: 0.7, r: 3 } }}
                />
                <VictoryLine
                  data={regLineData}
                  style={{ data: { stroke: '#ef4444', strokeWidth: 1.5, strokeDasharray: "4 4" } }}
                />
                {useNonParam && tsLineData.length > 0 && (
                  <VictoryLine
                    data={tsLineData}
                    style={{ data: { stroke: '#10b981', strokeWidth: 2 } }}
                  />
                )}
              </VictoryChart>
            </div>
          )}

          <div className={`h-[320px] bg-surface3/30 rounded p-2 ${indeps.length > 1 ? 'col-span-1 lg:col-span-2' : ''}`}>
            <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center">Residuals Distribution (Model Accuracy Diagnostic Boxplots)</p>
            <VictoryChart
              theme={VictoryTheme.material}
              domainPadding={40}
              padding={{ top: 20, bottom: 50, left: 100, right: 20 }}
            >
              <VictoryAxis
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' } }}
              />
              <VictoryAxis
                dependentAxis
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
              />
              <VictoryBoxPlot
                data={regResidualsBoxPlotData}
                style={{
                  min: { stroke: "#f87171", strokeWidth: 1.5 },
                  max: { stroke: "#f87171", strokeWidth: 1.5 },
                  q1: { fill: "#4f9cf9", fillOpacity: 0.4 },
                  q3: { fill: "#4f9cf9", fillOpacity: 0.4 },
                  median: { stroke: "#fff", strokeWidth: 2 }
                }}
              />
            </VictoryChart>
          </div>
        </div>

              </div>
    );
    pushOutput(output, report);
  };

  const runCorrelation = () => {
    const { vars, method, showSpearman, showKendall } = corrParams;
    if (vars.length < 2) {
      showToast('Error', 'Select at least 2 variables', 'error');
      return;
    }

    const matrixPearson: number[][] = [];
    const matrixSpearman: number[][] = [];
    const matrixKendall: number[][] = [];

    for (let i = 0; i < vars.length; i++) {
      matrixPearson[i] = [];
      matrixSpearman[i] = [];
      matrixKendall[i] = [];

      for (let j = 0; j < vars.length; j++) {
        if (i === j) {
          matrixPearson[i][j] = 1;
          matrixSpearman[i][j] = 1;
          matrixKendall[i][j] = 1;
          continue;
        }
        
        const v1 = vars[i];
        const v2 = vars[j];
        
        // Pairwise deletion
        const pairs = grid.rows.map(row => [parseNum(row[v1]), parseNum(row[v2])])
          .filter(p => !isNaN(p[0]) && !isNaN(p[1]));
        
        if (pairs.length < 3) {
          matrixPearson[i][j] = NaN;
          matrixSpearman[i][j] = NaN;
          matrixKendall[i][j] = NaN;
          continue;
        }

        const x = pairs.map(p => p[0]);
        const y = pairs.map(p => p[1]);

        // Pearson
        matrixPearson[i][j] = jStat.corrcoeff(x, y);

        // Spearman
        const rankX = jStat.rank(x);
        const rankY = jStat.rank(y);
        matrixSpearman[i][j] = jStat.corrcoeff(rankX, rankY);

        // Kendall's Tau
        matrixKendall[i][j] = calcKendallTau(x, y);
      }
    }

    const corrChartDataPearson = vars.slice(1).map((vIdx, i) => ({
      name: grid.cols[vIdx].name,
      value: matrixPearson[0][i + 1]
    }));

    const corrChartDataSpearman = vars.slice(1).map((vIdx, i) => ({
      name: grid.cols[vIdx].name,
      value: matrixSpearman[0][i + 1]
    }));

    const corrChartDataKendall = vars.slice(1).map((vIdx, i) => ({
      name: grid.cols[vIdx].name,
      value: matrixKendall[0][i + 1]
    }));

    const corrBoxPlotData = vars.map(idx => {
      const vals = grid.rows.map(row => parseNum(row[idx])).filter(v => !isNaN(v));
      const quartiles = jStat.quartiles(vals);
      return {
        x: grid.cols[idx].name,
        min: jStat.min(vals),
        q1: quartiles[0],
        median: quartiles[1],
        q3: quartiles[2],
        max: jStat.max(vals)
      };
    });

    // Scatter and Rank Scatter data for 2-variable case
    const rawScatterData = grid.rows.map(r => ({
      x: parseNum(r[vars[0]]),
      y: parseNum(r[vars[1]])
    })).filter(p => !isNaN(p.x) && !isNaN(p.y));

    let rankScatterData: { x: number; y: number }[] = [];
    if (vars.length === 2 && rawScatterData.length >= 3) {
      const xs = rawScatterData.map(d => d.x);
      const ys = rawScatterData.map(d => d.y);
      const rx = jStat.rank(xs);
      const ry = jStat.rank(ys);
      rankScatterData = rx.map((val, idx) => ({
        x: val,
        y: ry[idx]
      }));
    }

    const tables = correlationTables({
      rows: grid.rows,
      varIdxs: vars,
      varNames: vars.map(index => grid.cols[index].name),
      level: ciLevel,
      method: method as any,
      showSpearman,
      showKendall,
    });
    const report = correlationReport({
      tables,
      method: method as 'pearson' | 'spearman' | 'kendall',
      level: ciLevel,
    });

    const output = (
      <div className="output-block" key={Date.now()}>
        <div className="output-title">Correlation Analysis Suite</div>

        <ResultTables specs={tables} />

        {vars.length === 2 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            <div className="h-[280px] bg-surface3/30 rounded p-2">
              <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center">Parametric: Raw Scatter Plot</p>
              <VictoryChart
                theme={VictoryTheme.material}
                padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
              >
                <VictoryAxis
                  label={grid.cols[vars[0]].name}
                  style={{ 
                    axis: { stroke: '#333' }, 
                    axisLabel: { fill: '#888', fontSize: 10, padding: 30 },
                    tickLabels: { fill: '#888', fontSize: 10 }
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  label={grid.cols[vars[1]].name}
                  style={{ 
                    axis: { stroke: '#333' }, 
                    axisLabel: { fill: '#888', fontSize: 10, padding: 35 },
                    tickLabels: { fill: '#888', fontSize: 10 },
                    grid: { stroke: '#222' }
                  }}
                />
                <VictoryScatter
                  data={rawScatterData}
                  style={{ data: { fill: '#fb923c', r: 3 } }}
                />
              </VictoryChart>
            </div>

            {showSpearman && rankScatterData.length > 0 && (
              <div className="h-[280px] bg-surface3/30 rounded p-2">
                <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center text-green">Non-Parametric: Spearman Rank Space Scatter Plot</p>
                <VictoryChart
                  theme={VictoryTheme.material}
                  padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
                >
                  <VictoryAxis
                    label={`Rank: ${grid.cols[vars[0]].name}`}
                    style={{ 
                      axis: { stroke: '#333' }, 
                      axisLabel: { fill: '#888', fontSize: 10, padding: 30 },
                      tickLabels: { fill: '#888', fontSize: 10 }
                    }}
                  />
                  <VictoryAxis
                    dependentAxis
                    label={`Rank: ${grid.cols[vars[1]].name}`}
                    style={{ 
                      axis: { stroke: '#333' }, 
                      axisLabel: { fill: '#888', fontSize: 10, padding: 35 },
                      tickLabels: { fill: '#888', fontSize: 10 },
                      grid: { stroke: '#222' }
                    }}
                  />
                  <VictoryScatter
                    data={rankScatterData}
                    style={{ data: { fill: '#34d399', r: 3 } }}
                  />
                </VictoryChart>
              </div>
            )}
          </div>
        ) : (
          <div className="h-[340px] w-full mt-6 bg-surface3/30 rounded p-2">
            <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center">
              Selected Variables Distribution (Boxplots)
            </p>
            <VictoryChart
              theme={VictoryTheme.material}
              domainPadding={40}
              padding={{ top: 20, bottom: 50, left: 100, right: 20 }}
            >
              <VictoryAxis
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' } }}
              />
              <VictoryAxis
                dependentAxis
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
              />
              <VictoryBoxPlot
                data={corrBoxPlotData}
                style={{
                  min: { stroke: "#f87171", strokeWidth: 1.5 },
                  max: { stroke: "#f87171", strokeWidth: 1.5 },
                  q1: { fill: "#fb923c", fillOpacity: 0.4 },
                  q3: { fill: "#fb923c", fillOpacity: 0.4 },
                  median: { stroke: "#fff", strokeWidth: 2 }
                }}
              />
            </VictoryChart>
          </div>
        )}
      </div>
    );
    pushOutput(output, report);
  };

  const runChiSquare = () => {
    const { row1col1, row1col2, row2col1, row2col2, row1Label, row2Label, col1Label, col2Label, runFisherExact } = chisqParams;

    if (row1col1 < 0 || row1col2 < 0 || row2col1 < 0 || row2col2 < 0) {
      showToast('Error', 'Frequencies must be non-negative', 'error');
      return;
    }

    const o11 = row1col1;
    const o12 = row1col2;
    const o21 = row2col1;
    const o22 = row2col2;

    const r1 = o11 + o12;
    const r2 = o21 + o22;
    const c1 = o11 + o21;
    const c2 = o12 + o22;
    const n = r1 + r2;

    if (n === 0) {
      showToast('Error', 'Grand total cannot be zero', 'error');
      return;
    }

    const e11 = (r1 * c1) / n;
    const e12 = (r1 * c2) / n;
    const e21 = (r2 * c1) / n;
    const e22 = (r2 * c2) / n;

    if (e11 === 0 || e12 === 0 || e21 === 0 || e22 === 0) {
      showToast('Error', 'Expected frequencies cannot be zero. Please check your contingency table data.', 'error');
      return;
    }

    // Pearson Chi-Square
    const chi2 = 
      Math.pow(o11 - e11, 2) / e11 +
      Math.pow(o12 - e12, 2) / e12 +
      Math.pow(o21 - e21, 2) / e21 +
      Math.pow(o22 - e22, 2) / e22;

    // Yates Continuity Correction
    const chi2Yates = 
      Math.pow(Math.max(0, Math.abs(o11 - e11) - 0.5), 2) / e11 +
      Math.pow(Math.max(0, Math.abs(o12 - e12) - 0.5), 2) / e12 +
      Math.pow(Math.max(0, Math.abs(o21 - e21) - 0.5), 2) / e21 +
      Math.pow(Math.max(0, Math.abs(o22 - e22) - 0.5), 2) / e22;

    const df = 1;
    let pValue = 1;
    let pValueYates = 1;
    try {
      pValue = 1 - jStat.chisquare.cdf(chi2, df);
      pValueYates = 1 - jStat.chisquare.cdf(chi2Yates, df);
    } catch (e) {
      console.error(e);
    }

    const pValueFisher = runFisherExact ? calcFisherExact(o11, o12, o21, o22) : NaN;

    const phi = Math.sqrt(chi2 / n);
    let interpretation = 'Negligible';
    if (phi >= 0.5) interpretation = 'Strong association';
    else if (phi >= 0.3) interpretation = 'Moderate association';
    else if (phi >= 0.1) interpretation = 'Weak association';

    const minExpected = Math.min(e11, e12, e21, e22);
    const showCochranWarning = minExpected < 5;

    const chartDataObs = [
      { x: `${row1Label}\n(${col1Label})`, y: o11 },
      { x: `${row1Label}\n(${col2Label})`, y: o12 },
      { x: `${row2Label}\n(${col1Label})`, y: o21 },
      { x: `${row2Label}\n(${col2Label})`, y: o22 }
    ];

    const chartDataExp = [
      { x: `${row1Label}\n(${col1Label})`, y: e11 },
      { x: `${row1Label}\n(${col2Label})`, y: e12 },
      { x: `${row2Label}\n(${col1Label})`, y: e21 },
      { x: `${row2Label}\n(${col2Label})`, y: e22 }
    ];

    const tables = chiSquareTables({
      o11, o12, o21, o22,
      row1: row1Label,
      row2: row2Label,
      col1: col1Label,
      col2: col2Label,
      level: ciLevel,
      runFisher: runFisherExact,
    });
    const report = chiSquareReport({
      tables,
      level: ciLevel,
      row1: row1Label,
      row2: row2Label,
      col1: col1Label,
      col2: col2Label,
    });

    const output = (
      <div className="output-block" key={Date.now()}>
        <div className="output-title">Chi-Square (χ²) Test of Independence</div>
        
        <ResultTables specs={tables} />

        {showCochranWarning && (
          <div className="mt-4 p-2 bg-yellow/10 border border-yellow/20 rounded flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-yellow shrink-0 mt-0.5" />
            <div className="text-[10px] text-yellow leading-normal">
              <strong>Warning (Cochran's Rule):</strong> One or more expected frequencies is less than 5 (Min expected: {fmt(minExpected, 2)}).
              The standard Chi-Square test may be inaccurate. Yates' Continuity Correction is strongly recommended.
            </div>
          </div>
        )}

        <div className="h-[320px] w-full mt-6 bg-surface3/30 rounded p-2">
          <p className="text-[10px] text-text3 mb-1 uppercase tracking-tighter text-center">Observed vs. Expected Frequencies (by cell)</p>
          <div className="flex items-center justify-center gap-4 text-[10px] text-text3 mb-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: '#34d399' }} /> Observed</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: '#4f9cf9' }} /> Expected</span>
          </div>
          <VictoryChart
            theme={VictoryTheme.material}
            domainPadding={{ x: 60 }}
            padding={{ top: 20, bottom: 50, left: 50, right: 20 }}
          >
            <VictoryAxis
              tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 9 }} />}
              style={{ axis: { stroke: '#333' } }}
            />
            <VictoryAxis
              dependentAxis
              tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 9 }} />}
              style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
            />
            <VictoryGroup offset={16}>
              <VictoryBar
                data={chartDataObs}
                style={{ data: { fill: '#34d399', width: 14 } }}
                labels={({ datum }) => `Observed: ${datum.y}`}
                labelComponent={<VictoryTooltip style={{ fontSize: 9 }} flyoutStyle={{ fill: '#1e1e1e', stroke: '#333' }} />}
              />
              <VictoryBar
                data={chartDataExp}
                style={{ data: { fill: '#4f9cf9', width: 14 } }}
                labels={({ datum }) => `Expected: ${fmt(datum.y, 2)}`}
                labelComponent={<VictoryTooltip style={{ fontSize: 9 }} flyoutStyle={{ fill: '#1e1e1e', stroke: '#333' }} />}
              />
            </VictoryGroup>
          </VictoryChart>
        </div>
      </div>
    );
    pushOutput(output, report);
  };

  const clearOutput = () => {
    setOutputs([]);
    showToast('Output', 'Output console cleared', 'ok');
  };

  const removeOutput = (index: number) => {
    setOutputs((prev) => prev.filter((_, i) => i !== index));
    showToast('Output', 'Result block removed', 'ok');
  };

  const copyOutput = async () => {
    const el = document.getElementById('output-content');
    if (!el) return;
    const ok = await copyText(el.innerText);
    showToast('Output', ok ? 'Output copied to clipboard' : 'Could not copy the output', ok ? 'ok' : 'error');
  };

  const exportChartPngs = async () => {
    const el = document.getElementById('output-content');
    if (!el) return;
    const result = await exportChartsAsPng(el, 'lazstats-chart');
    if (result.exported === 0 && result.failed === 0) {
      showToast('Charts', 'No charts in the output console yet', 'warn');
    } else if (result.failed > 0) {
      showToast('Charts', `${result.exported} chart(s) exported, ${result.failed} failed`, 'warn');
    } else {
      showToast('Charts', `${result.exported} chart(s) exported as PNG`, 'ok');
    }
  };

  const exportResultsXlsx = () => {
    const el = document.getElementById('output-content');
    if (!el) return;
    try {
      const bytes = buildResultsWorkbookFromElement(el, grid);
      downloadBytes(bytes, 'lazstats-risultati.xlsx', XLSX_MIME);
      showToast('Export', 'Workbook .xlsx con il dataset e le tabelle dei risultati', 'ok');
    } catch (error) {
      showToast('Export', error instanceof Error ? error.message : 'Could not build the workbook', 'error');
    }
  };

  const exportReportHtml = () => {
    const el = document.getElementById('output-content');
    if (!el) return;
    const html = buildReportFromElement(el, {
      title: 'LazStats JS — Analysis Report',
      generatedAt: new Date().toLocaleString(),
      details: [`${nonEmptyRowCount(grid.rows)} rows`, `${grid.cols.length} columns`, `CI ${ciLevel}%`],
    });
    downloadText(html, 'lazstats-report.html', 'text/html;charset=utf-8');
    showToast('Report', 'Printable report downloaded — open it and print to PDF', 'ok');
  };

  return (
    <div className="flex flex-col h-screen bg-bg text-text font-sans selection:bg-accent/30">
      {/* Main Tabs */}
      <div className="bg-surface2 border-b border-border px-2 pt-1.5 flex gap-0.5 shrink-0 sticky top-0 z-50">
        <button 
          onClick={() => setActiveTab('data')}
          className={`main-tab ${activeTab === 'data' ? 'active' : ''}`}
        >
          <Database className="w-3 h-3 inline mr-2" />
          Data Editor
        </button>
        <button 
          onClick={() => setActiveTab('analysis')}
          className={`main-tab ${activeTab === 'analysis' ? 'active' : ''}`}
        >
          <BarChart3 className="w-3 h-3 inline mr-2" />
          Analysis & Output
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`main-tab ${activeTab === 'settings' ? 'active' : ''}`}
        >
          <Settings className="w-3 h-3 inline mr-2" />
          Settings
        </button>
        <button 
          onClick={() => setActiveTab('help')}
          className={`main-tab ${activeTab === 'help' ? 'active' : ''}`}
        >
          <HelpCircle className="w-3 h-3 inline mr-2" />
          Help
        </button>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'data' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-surface border-b border-border p-1.5 flex flex-wrap items-center gap-2 shrink-0">
              <span className="font-mono text-[10px] text-text3 uppercase tracking-widest px-2">File:</span>
              <button className="tb-btn" onClick={() => resetGridHistory(makeNewGrid())}>New</button>
              <button className="tb-btn" onClick={() => csvInputRef.current?.click()}>Import</button>
              <button className="tb-btn" onClick={exportCsv}>Export</button>
              <div className="h-4 w-px bg-border mx-1" />
              <button
                className="tb-btn"
                onClick={saveProjectFile}
                title="Save grid, settings and analysis parameters as a .lzs project"
              >
                Save project
              </button>
              <button
                className="tb-btn"
                onClick={() => projectInputRef.current?.click()}
                title="Open a .lzs project and replace the current session"
              >
                Open project
              </button>
              <input
                ref={projectInputRef}
                type="file"
                accept=".lzs,application/json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void openProjectFile(file);
                  event.target.value = '';
                }}
              />
              {lastAutosave && (
                <span
                  className="font-mono text-[9px] text-text3 uppercase tracking-wider"
                  title="Grid, settings and parameters are autosaved in this browser"
                >
                  Autosave {lastAutosave}
                </span>
              )}
              <div className="h-4 w-px bg-border mx-1" />
              <button className="tb-btn" disabled={!canUndoGrid} onClick={undoGrid} title="Undo (Ctrl+Z)">
                Undo
              </button>
              <button className="tb-btn" disabled={!canRedoGrid} onClick={redoGrid} title="Redo (Ctrl+Y)">
                Redo
              </button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,.tsv,.tab,.txt,.json,.psv,.xlsx,.xls,.xlsm,text/csv,text/plain,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importCsv(file);
                  event.target.value = '';
                }}
              />
              <div className="h-4 w-px bg-border mx-2" />
              <button
                className="tb-btn text-yellow"
                onClick={() => {
                  const issues = gridFindInvalid(grid);
                  setValidation({ ran: true, issues });
                  if (issues.length === 0) showToast('Validation', 'All cells validated successfully', 'ok');
                  else showToast('Validation', `${issues.length} invalid cells found`, 'warn');
                }}
              >
                Validate
              </button>
              <button
                className="tb-btn"
                onClick={() => {
                  const { grid: next, changed } = gridCoerce(grid);
                  if (changed === 0) {
                    showToast('Auto-fix', 'Nothing to coerce', 'ok');
                    return;
                  }
                  setGrid(next);
                  setValidation({ ran: false, issues: [] });
                  showToast('Auto-fix', `${changed} cells coerced`, 'ok');
                }}
              >
                Auto-fix
              </button>
              <button className={`tb-btn ${showClean ? 'bg-accent text-white border-accent' : ''}`} onClick={() => setShowClean((v) => !v)}>
                Clean
              </button>
              <button className={`tb-btn ${showTransform ? 'bg-accent text-white border-accent' : ''}`} onClick={() => setShowTransform((v) => !v)}>
                Transform
              </button>
              <div className="h-4 w-px bg-border mx-1" />
              <button
                className={`tb-btn ${freezeFirstCol ? 'bg-accent text-white border-accent' : ''}`}
                onClick={() => setFreezeFirstCol((v) => !v)}
                title="Keep the row numbers and the first column visible while scrolling"
              >
                Freeze col
              </button>
              <button
                className={`tb-btn ${showFilter ? 'bg-accent text-white border-accent' : ''}`}
                onClick={() => setShowFilter((v) => !v)}
                title="Filter the rows shown in the grid (view only, data unchanged)"
              >
                Filter
              </button>
            </div>

            {showFilter && (
              <div className="bg-surface border-b border-border px-3 py-1.5 flex flex-wrap items-center gap-2 text-[11px] shrink-0">
                <span className="font-mono text-[9px] text-text3 uppercase tracking-widest">Row filter</span>
                <select
                  className="bg-surface3 border border-border2 rounded px-1 py-1 text-text"
                  value={filterCol}
                  onChange={(e) => setFilterCol(Number(e.target.value))}
                >
                  {grid.cols.map((c, i) => (
                    <option key={i} value={i}>{c.name}</option>
                  ))}
                </select>
                <select
                  className="bg-surface3 border border-border2 rounded px-1 py-1 text-text"
                  value={filterOp}
                  onChange={(e) => setFilterOp(e.target.value as RowFilterOp)}
                >
                  <option value="contains">contains</option>
                  <option value="equals">=</option>
                  <option value="notEquals">≠</option>
                  <option value="gt">&gt;</option>
                  <option value="gte">≥</option>
                  <option value="lt">&lt;</option>
                  <option value="lte">≤</option>
                  <option value="empty">is empty</option>
                  <option value="notEmpty">is not empty</option>
                </select>
                {filterNeedsValue && (
                  <input
                    className="bg-surface3 border border-border2 rounded px-2 py-1 w-40 text-text"
                    placeholder="Value"
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                  />
                )}
                <span className="text-text3 font-mono text-[10px]">
                  {visibleRowCount} / {grid.rows.length} rows
                </span>
                <button
                  className="tb-btn"
                  onClick={() => {
                    setFilterValue('');
                    setFilterOp('contains');
                  }}
                >
                  Clear filter
                </button>
                <span className="text-text3 text-[10px] italic">view only — analyses still use all rows</span>
              </div>
            )}

            {showTransform && (
              <TransformPanel
                grid={grid}
                onApply={(next, msg, kind = 'ok') => {
                  if (next !== grid) {
                    setGrid(next);
                    setValidation({ ran: false, issues: [] });
                  }
                  showToast('Transform', msg, kind);
                }}
              />
            )}

            {showClean && (
              <CleanPanel
                grid={grid}
                onApply={(next, msg) => {
                  setGrid(next);
                  setValidation({ ran: false, issues: [] });
                  showToast('Clean', msg, 'ok');
                }}
              />
            )}

            {validation.ran && (
              <div className="bg-surface border-b border-border px-3 py-1.5 flex flex-wrap items-center gap-2 text-[10px] font-mono shrink-0">
                {validation.issues.length === 0 ? (
                  <span className="text-green">VALID: 0 invalid cells</span>
                ) : (
                  <>
                    <span className="text-yellow font-bold">{validation.issues.length} INVALID</span>
                    <span className="text-text3">|</span>
                    {gridInvalidByColumn(grid)
                      .filter((c) => c.count > 0)
                      .map((c) => (
                        <button
                          key={c.col}
                          className="tb-btn"
                          onClick={() => {
                            const first = validation.issues.find((i) => i.c === c.col);
                            if (first) {
                              setFocusCell({ r: first.r, c: first.c, stamp: Date.now() });
                              setActiveTab('data');
                            }
                          }}
                        >
                          {c.name}: {c.count}
                        </button>
                      ))}
                    <button
                      className="tb-btn"
                      onClick={() => {
                        const first = validation.issues[0];
                        if (first) setFocusCell({ r: first.r, c: first.c, stamp: Date.now() });
                      }}
                    >
                      Jump to first
                    </button>
                    <button className="tb-btn" onClick={() => setValidation({ ran: false, issues: [] })}>
                      Dismiss
                    </button>
                  </>
                )}
              </div>
            )}
            
            <div className="panel-header">
              <div className="w-1.5 h-1.5 bg-accent rounded-full" />
              Grid View
            </div>

            <DataGrid
              grid={grid}
              focusCell={focusCell}
              onCell={updateCell}
              onRenameCol={(c, name) => {
                setGrid((prev) => gridRenameColumn(prev, c, name));
                setValidation((v) => ({ ...v, ran: false }));
              }}
              onColType={updateColType}
              onLevels={updateColumnLevels}
              onRecode={updateColumnRecode}
              onInsertCol={(at) => setGrid((prev) => gridInsertColumn(prev, at))}
              onDuplicateCol={(c) => setGrid((prev) => gridDuplicateColumn(prev, c))}
              onMoveCol={(c, dir) => setGrid((prev) => gridMoveColumn(prev, c, dir))}
              onDeleteCol={(c) => {
                if (grid.cols.length <= 1) {
                  showToast('Columns', 'At least one column is required', 'warn');
                  return;
                }
                if (!window.confirm(`Delete column "${grid.cols[c]?.name}"? You can undo.`)) return;
                setGrid((prev) => gridDeleteColumn(prev, c));
              }}
              onInsertRow={(at) => setGrid((prev) => gridInsertRow(prev, at))}
              onDeleteRow={(r) => {
                if (grid.rows.length <= 1) {
                  showToast('Rows', 'At least one row is required', 'warn');
                  return;
                }
                if (!window.confirm(`Delete row ${r + 1}? You can undo.`)) return;
                setGrid((prev) => gridDeleteRow(prev, r));
              }}
              onPaste={(r, c, text) => {
                const block = parseTsvBlock(text).filter((line) => line.some((v) => String(v ?? '').trim() !== ''));
                if (block.length === 0) return;
                setGrid((prev) => gridPasteTsv(prev, r, c, block));
                showToast('Paste', `${block.length}x${Math.max(...block.map((l) => l.length))} cells pasted`, 'ok');
              }}
              onCopyRange={(range) => {
                setSelRange(range);
                const tsv = gridRangeToTsv(grid, range);
                navigator.clipboard?.writeText(tsv).catch(() => undefined);
                showToast('Copy', 'Range copied to clipboard', 'ok');
              }}
              onClearRange={(range) => setGrid((prev) => gridClearRange(prev, range))}
              onFillDown={(range) => setGrid((prev) => gridFillDown(prev, range))}
              freezeFirstCol={freezeFirstCol}
              rowFilter={activeRowFilter}
              onSortCol={(col, dir) => {
                setGrid((prev) => gridSortByColumn(prev, col, dir));
                setValidation({ ran: false, issues: [] });
                showToast('Sort', `Sorted by ${grid.cols[col]?.name ?? `column ${col + 1}`} (${dir})`, 'ok');
              }}
            />
            {selRange && (
              <div className="bg-surface border-t border-border px-3 py-1 flex items-center gap-2 text-[10px] font-mono text-text3 shrink-0">
                <span>
                  SEL: R{Math.min(selRange.r0, selRange.r1) + 1}-{Math.max(selRange.r0, selRange.r1) + 1} C
                  {Math.min(selRange.c0, selRange.c1) + 1}-{Math.max(selRange.c0, selRange.c1) + 1}
                </span>
                <button className="tb-btn" onClick={() => setGrid((prev) => gridFillDown(prev, selRange))}>
                  Fill down
                </button>
                <button className="tb-btn" onClick={() => setGrid((prev) => gridClearRange(prev, selRange))}>
                  Clear selection
                </button>
                <button
                  className="tb-btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(gridRangeToTsv(grid, selRange)).catch(() => undefined);
                    showToast('Copy', 'Range copied to clipboard', 'ok');
                  }}
                >
                  Copy
                </button>
              </div>
            )}

            <div className="bg-surface border-t border-border p-2 flex gap-2 shrink-0">
              <button className="tb-btn" onClick={addColumn}><Plus className="w-3 h-3 inline mr-1" /> Column</button>
              <button className="tb-btn" onClick={addRow}><Plus className="w-3 h-3 inline mr-1" /> Row</button>
              <button
                className="tb-btn text-red/80 hover:bg-red hover:text-white"
                onClick={() => {
                  if (!window.confirm('Clear all cells? You can undo.')) return;
                  setGrid((prev) => gridClear(prev));
                }}
              >
                <Trash2 className="w-3 h-3 inline mr-1" /> Clear
              </button>
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-surface border-b border-border shrink-0">
              <div className="flex overflow-x-auto scrollbar">
                {ANALYSIS_TABS.map(a => (
                  <button 
                    key={a.id}
                    onClick={() => setActiveAnalysis(a.id)}
                    className={`atab ${activeAnalysis === a.id ? 'active' : ''}`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              
              <div className="p-4 flex flex-wrap gap-6 items-start">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">CI Level</label>
                  <select
                    className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[90px]"
                    value={ciLevel}
                    onChange={(e) => setCiLevel(parseInt(e.target.value))}
                  >
                    <option value={90}>90%</option>
                    <option value={95}>95%</option>
                    <option value={99}>99%</option>
                  </select>
                </div>
                {activeAnalysis === 'descriptive' && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Select Variables</label>
                    <div className="bg-surface3 border border-border2 rounded p-2 min-w-[200px] max-h-[100px] overflow-auto scrollbar">
                      {grid.cols.map((col, i) => (
                        <label key={i} className="flex items-center gap-2 text-[11px] text-text2 hover:text-text cursor-pointer py-0.5">
                          <input 
                            type="checkbox" 
                            className="accent-accent" 
                            checked={descVars.includes(i)} 
                            onChange={(e) => {
                              const newVars = e.target.checked 
                                ? [...descVars, i]
                                : descVars.filter(idx => idx !== i);
                              setDescVars(newVars);
                            }}
                          />
                          {col.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {activeAnalysis === 'ttest' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Test Type</label>
                      <select 
                        className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[150px]"
                        value={ttestParams.type}
                        onChange={(e) => setTTestParams(p => ({ ...p, type: e.target.value as any }))}
                      >
                        <option value="ind">Independent Samples</option>
                        <option value="dep">Paired Samples</option>
                        <option value="one">One-Sample</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Variable 1</label>
                      <select 
                        className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
                        value={ttestParams.var1}
                        onChange={(e) => setTTestParams(p => ({ ...p, var1: parseInt(e.target.value) }))}
                      >
                        {grid.cols.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
                      </select>
                    </div>
                    {ttestParams.type !== 'one' ? (
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Variable 2</label>
                        <select 
                          className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
                          value={ttestParams.var2}
                          onChange={(e) => setTTestParams(p => ({ ...p, var2: parseInt(e.target.value) }))}
                        >
                          {grid.cols.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Test Mean (μ₀)</label>
                        <input 
                          type="number" 
                          className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded w-24"
                          value={ttestParams.mu}
                          onChange={(e) => setTTestParams(p => ({ ...p, mu: parseFloat(e.target.value) }))}
                        />
                      </div>
                    )}
                    {ttestParams.type === 'ind' && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Variances</label>
                        <select
                          className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[150px]"
                          value={ttestParams.equalVar ? 'equal' : 'welch'}
                          onChange={(e) => setTTestParams(p => ({ ...p, equalVar: e.target.value === 'equal' }))}
                        >
                          <option value="equal">Equal (pooled)</option>
                          <option value="welch">Unequal (Welch)</option>
                        </select>
                      </div>
                    )}
                  </>
                )}

                {activeAnalysis === 'anova' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Dependent Var</label>
                      <select 
                        className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
                        value={anovaParams.dep}
                        onChange={(e) => setAnovaParams(p => ({ ...p, dep: parseInt(e.target.value) }))}
                      >
                        {grid.cols.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Group Var</label>
                      <div className="flex items-center gap-1">
                        <select 
                          className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
                          value={anovaParams.grp}
                          onChange={(e) => setAnovaParams(p => ({ ...p, grp: parseInt(e.target.value) }))}
                        >
                          {groupColumnIndexes(grid).map((i) => (
                            <option key={i} value={i}>{grid.cols[i].name}</option>
                          ))}
                          {!isGroupColumn(grid, anovaParams.grp) && grid.cols[anovaParams.grp] && (
                            <option value={anovaParams.grp}>{grid.cols[anovaParams.grp].name} (numeric)</option>
                          )}
                        </select>
                        <LevelsEditor
                          grid={grid}
                          column={anovaParams.grp}
                          onLevels={updateColumnLevels}
                          onRecode={updateColumnRecode}
                          label="Modifica livelli"
                          className="tb-btn flex items-center gap-1 h-[29px] px-2 text-[10px] whitespace-nowrap"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Post-Hoc</label>
                      <select 
                        className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
                        value={anovaParams.posthoc}
                        onChange={(e) => setAnovaParams(p => ({ ...p, posthoc: e.target.value as any }))}
                      >
                        <option value="none">None</option>
                        <option value="tukey">Tukey–Kramer (approx.)</option>
                        <option value="bonferroni">Bonferroni</option>
                        <option value="holm">Holm</option>
                        <option value="gameshowell">Games–Howell</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Non-Parametric</label>
                      <label className="flex items-center gap-1.5 text-[11px] text-text2 hover:text-text cursor-pointer h-full pt-1">
                        <input 
                          type="checkbox" 
                          className="accent-accent" 
                          checked={anovaParams.useNonParam}
                          onChange={(e) => setAnovaParams(p => ({ ...p, useNonParam: e.target.checked }))}
                        />
                        Kruskal-Wallis H
                      </label>
                    </div>
                    {anovaParams.useNonParam && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">K-W Post-Hoc</label>
                        <select 
                          className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
                          value={anovaParams.kwPosthoc}
                          onChange={(e) => setAnovaParams(p => ({ ...p, kwPosthoc: e.target.value as any }))}
                        >
                          <option value="none">None</option>
                          <option value="bonferroni">Bonferroni</option>
                          <option value="holm">Holm</option>
                        </select>
                      </div>
                    )}
                  </>
                )}

                {activeAnalysis === 'regression' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Dependent (Y)</label>
                      <select 
                        className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
                        value={regParams.dep}
                        onChange={(e) => setRegParams(p => ({ ...p, dep: parseInt(e.target.value) }))}
                      >
                        {grid.cols.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Independents (X)</label>
                      <div className="bg-surface3 border border-border2 rounded p-2 min-w-[200px] max-h-[100px] overflow-auto scrollbar">
                        {grid.cols.map((col, i) => (
                          <label key={i} className="flex items-center gap-2 text-[11px] text-text2 hover:text-text cursor-pointer py-0.5">
                            <input 
                              type="checkbox" 
                              className="accent-accent" 
                              checked={regParams.indeps.includes(i)}
                              onChange={(e) => {
                                const newIndeps = e.target.checked 
                                  ? [...regParams.indeps, i]
                                  : regParams.indeps.filter(idx => idx !== i);
                                setRegParams(p => ({ ...p, indeps: newIndeps }));
                              }}
                            />
                            {col.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Non-Parametric</label>
                      <label className="flex items-center gap-1.5 text-[11px] text-text2 hover:text-text cursor-pointer h-full pt-1">
                        <input 
                          type="checkbox" 
                          className="accent-accent" 
                          checked={regParams.useNonParam}
                          onChange={(e) => setRegParams(p => ({ ...p, useNonParam: e.target.checked }))}
                        />
                        Theil-Sen Robust Line
                      </label>
                    </div>
                  </>
                )}

                {activeAnalysis === 'correlation' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Variables</label>
                      <div className="bg-surface3 border border-border2 rounded p-2 min-w-[200px] max-h-[100px] overflow-auto scrollbar">
                        {grid.cols.map((col, i) => (
                          <label key={i} className="flex items-center gap-2 text-[11px] text-text2 hover:text-text cursor-pointer py-0.5">
                            <input 
                              type="checkbox" 
                              className="accent-accent" 
                              checked={corrParams.vars.includes(i)}
                              onChange={(e) => {
                                const newVars = e.target.checked 
                                  ? [...corrParams.vars, i]
                                  : corrParams.vars.filter(idx => idx !== i);
                                setCorrParams(p => ({ ...p, vars: newVars }));
                              }}
                            />
                            {col.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Primary Method</label>
                      <select 
                        className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
                        value={corrParams.method}
                        onChange={(e) => setCorrParams(p => ({ ...p, method: e.target.value as any }))}
                      >
                        <option value="pearson">Pearson</option>
                        <option value="spearman">Spearman</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Non-Parametric</label>
                      <div className="flex flex-col gap-1 pt-0.5">
                        <label className="flex items-center gap-1.5 text-[11px] text-text2 hover:text-text cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="accent-accent" 
                            checked={corrParams.showSpearman}
                            onChange={(e) => setCorrParams(p => ({ ...p, showSpearman: e.target.checked }))}
                          />
                          Spearman (ρ)
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-text2 hover:text-text cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="accent-accent" 
                            checked={corrParams.showKendall}
                            onChange={(e) => setCorrParams(p => ({ ...p, showKendall: e.target.checked }))}
                          />
                          Kendall's Tau (τ)
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {activeAnalysis === 'chisquare' && (
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">
                      Contingency Table (2x2)
                    </label>
                    <div className="bg-surface3 border border-border2 rounded p-3">
                      <table className="text-[11px] text-text2">
                        <thead>
                          <tr>
                            <th className="p-1"></th>
                            <th className="p-1 text-center font-mono text-[9px] uppercase tracking-wider text-text3">
                              Col 1 (Label)
                            </th>
                            <th className="p-1 text-center font-mono text-[9px] uppercase tracking-wider text-text3">
                              Col 2 (Label)
                            </th>
                          </tr>
                          <tr>
                            <th className="p-1"></th>
                            <th className="p-1">
                              <input
                                type="text"
                                className="bg-surface border border-border2 text-text text-[11px] p-1 rounded text-center w-28 font-semibold"
                                value={chisqParams.col1Label}
                                onChange={(e) => setChisqParams(p => ({ ...p, col1Label: e.target.value }))}
                              />
                            </th>
                            <th className="p-1">
                              <input
                                type="text"
                                className="bg-surface border border-border2 text-text text-[11px] p-1 rounded text-center w-28 font-semibold"
                                value={chisqParams.col2Label}
                                onChange={(e) => setChisqParams(p => ({ ...p, col2Label: e.target.value }))}
                              />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="p-1">
                              <input
                                type="text"
                                className="bg-surface border border-border2 text-text text-[11px] p-1 rounded font-semibold w-28"
                                value={chisqParams.row1Label}
                                onChange={(e) => setChisqParams(p => ({ ...p, row1Label: e.target.value }))}
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                min="0"
                                className="bg-surface border border-border2 text-text text-[11px] p-1 rounded text-center w-28"
                                value={chisqParams.row1col1}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  setChisqParams(p => ({ ...p, row1col1: isNaN(val) ? 0 : val }));
                                }}
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                min="0"
                                className="bg-surface border border-border2 text-text text-[11px] p-1 rounded text-center w-28"
                                value={chisqParams.row1col2}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  setChisqParams(p => ({ ...p, row1col2: isNaN(val) ? 0 : val }));
                                }}
                              />
                            </td>
                          </tr>
                          <tr>
                            <td className="p-1">
                              <input
                                type="text"
                                className="bg-surface border border-border2 text-text text-[11px] p-1 rounded font-semibold w-28"
                                value={chisqParams.row2Label}
                                onChange={(e) => setChisqParams(p => ({ ...p, row2Label: e.target.value }))}
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                min="0"
                                className="bg-surface border border-border2 text-text text-[11px] p-1 rounded text-center w-28"
                                value={chisqParams.row2col1}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  setChisqParams(p => ({ ...p, row2col1: isNaN(val) ? 0 : val }));
                                }}
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                min="0"
                                className="bg-surface border border-border2 text-text text-[11px] p-1 rounded text-center w-28"
                                value={chisqParams.row2col2}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  setChisqParams(p => ({ ...p, row2col2: isNaN(val) ? 0 : val }));
                                }}
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="flex items-center justify-between gap-1.5 mt-3">
                        <label className="flex items-center gap-1.5 text-[11px] text-text2 hover:text-text cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="accent-accent" 
                            checked={chisqParams.runFisherExact}
                            onChange={(e) => setChisqParams(p => ({ ...p, runFisherExact: e.target.checked }))}
                          />
                          Run Fisher's Exact Test
                        </label>
                        <div className="flex gap-1.5">
                          <button 
                            className="text-[10px] bg-surface hover:bg-border px-2 py-0.5 rounded font-mono text-text3 hover:text-text border border-border cursor-pointer"
                            onClick={() => setChisqParams(p => ({
                              ...p,
                              row1col1: 30,
                              row1col2: 20,
                              row2col1: 15,
                              row2col2: 35,
                              row1Label: 'Treatment Group',
                              row2Label: 'Control Group',
                              col1Label: 'Improved',
                              col2Label: 'No Change'
                            }))}
                          >
                            Preset 1: Trial
                          </button>
                          <button 
                            className="text-[10px] bg-surface hover:bg-border px-2 py-0.5 rounded font-mono text-text3 hover:text-text border border-border cursor-pointer"
                            onClick={() => setChisqParams(p => ({
                              ...p,
                              row1col1: 120,
                              row1col2: 880,
                              row2col1: 90,
                              row2col2: 910,
                              row1Label: 'Variant A',
                              row2Label: 'Variant B',
                              col1Label: 'Converted',
                              col2Label: 'Bounced'
                            }))}
                          >
                            Preset 2: A/B Test
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeAnalysis === 'timeseries' && (
                  <TimeSeriesAnalysis
                    ref={timeSeriesRef}
                    grid={grid}
                    ciLevel={ciLevel}
                    onOutput={pushOutput}
                    onError={(message) => showToast('Error', message, 'error')}
                  />
                )}

                {activeAnalysis === 'survival' && (
                  <SurvivalAnalysis
                    ref={survivalRef}
                    grid={grid}
                    onLevels={updateColumnLevels}
                    onRecode={updateColumnRecode}
                    ciLevel={ciLevel}
                    onOutput={pushOutput}
                    onError={(message) => showToast('Error', message, 'error')}
                  />
                )}

                {activeAnalysis === 'cox' && (
                  <CoxAnalysis
                    ref={coxRef}
                    grid={grid}
                    ciLevel={ciLevel}
                    onOutput={pushOutput}
                    onError={(message) => showToast('Error', message, 'error')}
                  />
                )}

                {activeAnalysis === 'wizard' && (
                  <WizardAnalysis
                    ref={wizardRef}
                    grid={grid}
                    onLevels={updateColumnLevels}
                    onRecode={updateColumnRecode}
                    ciLevel={ciLevel}
                    onOutput={pushOutput}
                    onOpenAnalysis={(analysisId) => setActiveAnalysis(analysisId)}
                  />
                )}

                {activeAnalysis === 'logistic' && (
                  <LogisticAnalysis
                    ref={logisticRef}
                    grid={grid}
                    ciLevel={ciLevel}
                    onOutput={pushOutput}
                    onError={(message) => showToast('Error', message, 'error')}
                  />
                )}

                {activeAnalysis === 'factorial' && (
                  <FactorialAnovaAnalysis
                    ref={factorialRef}
                    grid={grid}
                    onLevels={updateColumnLevels}
                    onRecode={updateColumnRecode}
                    ciLevel={ciLevel}
                    onOutput={pushOutput}
                    onError={(message) => showToast('Error', message, 'error')}
                  />
                )}

                {activeAnalysis === 'distfit' && (
                  <DistributionFitAnalysis
                    ref={distFitRef}
                    grid={grid}
                    ciLevel={ciLevel}
                    onOutput={pushOutput}
                    onError={(message) => showToast('Error', message, 'error')}
                  />
                )}

                {activeAnalysis === 'samplesize' && (
                  <SampleSizeAnalysis
                    ref={sampleSizeRef}
                    ciLevel={ciLevel}
                    onOutput={pushOutput}
                    onError={(message) => showToast('Error', message, 'error')}
                  />
                )}

                {activeAnalysis === 'ancova' && (
                  <AncovaAnalysis
                    ref={ancovaRef}
                    grid={grid}
                    onLevels={updateColumnLevels}
                    onRecode={updateColumnRecode}
                    ciLevel={ciLevel}
                    onOutput={pushOutput}
                    onError={(message) => showToast('Error', message, 'error')}
                  />
                )}

                {activeAnalysis === 'multivariate' && (
                  <MultivariateAnalysis
                    ref={multivariateRef}
                    grid={grid}
                    ciLevel={ciLevel}
                    onOutput={pushOutput}
                    onError={(message) => showToast('Error', message, 'error')}
                  />
                )}

                {activeAnalysis === 'repeatedanova' && (
                  <RepeatedAnovaAnalysis
                    ref={repeatedAnovaRef}
                    grid={grid}
                    ciLevel={ciLevel}
                    onOutput={pushOutput}
                    onError={(message) => showToast('Error', message, 'error')}
                  />
                )}

                {activeAnalysis === 'nonparamrm' && (
                  <NonParamRepeatedAnalysis
                    ref={nonParamRepeatedRef}
                    grid={grid}
                    onLevels={updateColumnLevels}
                    onRecode={updateColumnRecode}
                    ciLevel={ciLevel}
                    onOutput={pushOutput}
                    onError={(message) => showToast('Error', message, 'error')}
                  />
                )}

                {activeAnalysis === 'contingency' && (
                  <ContingencyAnalysis
                    ref={contingencyRef}
                    ciLevel={ciLevel}
                    onOutput={pushOutput}
                    onError={(message) => showToast('Error', message, 'error')}
                  />
                )}

                <button className="run-btn h-9 self-end" onClick={runAnalysis}>
                  <Play className="w-3 h-3 inline mr-2" />
                  Run Analysis
                </button>
              </div>
            </div>

            <div className="bg-surface border-b border-border px-3 py-1 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <span className="font-mono text-[10px] text-text3 uppercase tracking-widest">Output Console</span>
              <div className="flex flex-wrap gap-2">
                <button
                  className="tb-btn flex items-center gap-1"
                  onClick={() => setActiveTab('data')}
                  aria-label="Back to Data Editor"
                >
                  <Database className="w-3 h-3" /> Data Editor
                </button>
                <button className="tb-btn" onClick={clearOutput}>Clear</button>
                <button className="tb-btn" onClick={copyOutput}>Copy</button>
                <button
                  className="tb-btn"
                  onClick={exportChartPngs}
                  disabled={outputs.length === 0}
                  title="Download every chart in the output console as a PNG"
                >
                  Charts PNG
                </button>
                <button
                  className="tb-btn"
                  onClick={exportReportHtml}
                  disabled={outputs.length === 0}
                  title="Download a self-contained printable HTML report"
                >
                  Report HTML
                </button>
                <button
                  className="tb-btn"
                  onClick={exportResultsXlsx}
                  disabled={outputs.length === 0}
                  title="Download an Excel workbook with the dataset and every result table"
                >
                  Results XLSX
                </button>
              </div>
            </div>

            {/* THE FIX: Margine di rispetto inferiore applicato via ID in index.css */}
            <div id="output-content" className="scrollbar">
              {outputs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-text3 opacity-50 gap-4">
                  <FileText className="w-12 h-12" />
                  <p className="text-[11px] uppercase tracking-widest">No analysis output yet</p>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto">
                  {outputs.map((output, i) => (
                    <div key={output.id} className="relative output-run group">
                      <button
                        type="button"
                        onClick={() => removeOutput(i)}
                        data-no-print
                        title="Remove this result"
                        aria-label="Remove this result block"
                        className="output-remove"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      {i > 0 && (
                        <div className="output-separator">
                          <div className="output-separator-dot">
                            <span />
                            <span />
                            <span />
                          </div>
                        </div>
                      )}
                      {output.node ?? (
                        <div
                          className="restored-output"
                          dangerouslySetInnerHTML={{ __html: output.html }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {outputs.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('data')}
                className="lg:hidden fixed bottom-4 right-4 z-50 tb-btn shadow-lg bg-surface2 border-accent text-accent"
                aria-label="Back to Data Editor"
              >
                <Database className="w-3 h-3 inline mr-1" /> Data Editor
              </button>
            )}
          </div>
        )}

        {activeTab === 'help' && <HelpPanel />}

        {activeTab === 'settings' && (
          <div className="flex-1 overflow-auto scrollbar p-8">
            <div className="max-w-2xl mx-auto space-y-8">
              <section className="bg-surface border border-border rounded-lg p-6">
                <h2 className="text-accent2 font-mono text-[11px] font-bold uppercase tracking-widest mb-6 pb-2 border-b border-border">
                  General Preferences
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-text2 text-[12px]">Decimal Separator</span>
                    <select className="bg-surface3 border border-border2 text-text text-[11px] p-1 rounded min-w-[120px]">
                      <option value=".">Period (.)</option>
                      <option value=",">Comma (,)</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text2 text-[12px]">Significant Digits</span>
                    <input type="number" className="bg-surface3 border border-border2 text-text text-[11px] p-1 rounded w-20" defaultValue={4} />
                  </div>
                </div>
              </section>

              <section className="bg-surface border border-border rounded-lg p-6">
                <h2 className="text-accent2 font-mono text-[11px] font-bold uppercase tracking-widest mb-6 pb-2 border-b border-border">
                  Import / Export
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-text2 text-[12px]">Default delimiter</span>
                    <select
                      className="bg-surface3 border border-border2 text-text text-[11px] p-1 rounded min-w-[120px]"
                      value={ioPrefs.delimiter}
                      onChange={(e) => {
                        const next = { ...ioPrefs, delimiter: e.target.value };
                        setIoPrefs(next);
                        savePrefs(next);
                      }}
                    >
                      <option value="auto">Auto-detect</option>
                      <option value=",">Comma (,)</option>
                      <option value=";">Semicolon (;)</option>
                      <option value="tab">Tab</option>
                      <option value="|">Pipe (|)</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text2 text-[12px]">Decimal separator</span>
                    <select
                      className="bg-surface3 border border-border2 text-text text-[11px] p-1 rounded min-w-[120px]"
                      value={ioPrefs.decimalSeparator}
                      onChange={(e) => {
                        const next = { ...ioPrefs, decimalSeparator: e.target.value as '.' | ',' };
                        setIoPrefs(next);
                        savePrefs(next);
                      }}
                    >
                      <option value=".">Period (12.5)</option>
                      <option value=",">Comma (12,5)</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text2 text-[12px]">Assume first row is header</span>
                    <input
                      type="checkbox"
                      className="accent-accent"
                      checked={ioPrefs.hasHeader}
                      onChange={(e) => {
                        const next = { ...ioPrefs, hasHeader: e.target.checked };
                        setIoPrefs(next);
                        savePrefs(next);
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text2 text-[12px]">Default export format</span>
                    <select
                      className="bg-surface3 border border-border2 text-text text-[11px] p-1 rounded min-w-[120px]"
                      value={ioPrefs.exportFormat}
                      onChange={(e) => {
                        const next = { ...ioPrefs, exportFormat: e.target.value };
                        setIoPrefs(next);
                        savePrefs(next);
                      }}
                    >
                      <option value="csv">CSV</option>
                      <option value="tsv">TSV</option>
                      <option value="pipe">Pipe TXT</option>
                      <option value="json">JSON</option>
                      <option value="spss">SPSS (CSV + .sps)</option>
                      <option value="xlsx">Excel (.xlsx)</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className="bg-surface border border-border rounded-lg p-6">
                <h2 className="text-accent2 font-mono text-[11px] font-bold uppercase tracking-widest mb-6 pb-2 border-b border-border">
                  Output Settings
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-text2 text-[12px]">Show Summary Interpretation</span>
                    <input type="checkbox" className="accent-accent" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text2 text-[12px]">Include Plots in Output</span>
                    <input type="checkbox" className="accent-accent" defaultChecked />
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {pendingImport && (
        <ImportWizard
          fileName={pendingImport.fileName}
          text={pendingImport.text}
          sheets={pendingImport.sheets}
          gridCols={grid.cols.map((c) => c.name)}
          onClose={() => setPendingImport(null)}
          onApply={applyImportTable}
        />
      )}
      {showExport && (
        <ExportDialog
          grid={grid}
          onClose={() => setShowExport(false)}
          onExport={(files) => {
            files.forEach((f) => downloadExportFile(f));
            setShowExport(false);
            showToast('Export', files.map((f) => f.fileName).join(' + '), 'ok');
          }}
        />
      )}

      {/* Footer / Statusbar */}
      <footer className="h-8 bg-surface border-t border-border flex items-center px-4 text-[10px] font-mono text-text3 gap-6 shrink-0">
        <div>ROWS: <span className="text-text2">{nonEmptyRowCount(grid.rows)}/{grid.rows.length}</span></div>
        <div className="w-px h-3 bg-border" />
        <div>COLS: <span className="text-text2">{grid.cols.length}</span></div>
        <div className="w-px h-3 bg-border" />
        <div>INVALID: <span className={countInvalidCells(grid) > 0 ? 'text-yellow' : 'text-green'}>{countInvalidCells(grid)}</span></div>
        <div className="w-px h-3 bg-border" />
        <div>STATUS: <span className="text-green">READY</span></div>
        <div className="ml-auto flex items-center gap-2">
          <Info className="w-3 h-3" />
          <span>LazStats JS v3.0.0</span>
        </div>
      </footer>

      {/* Toasts */}
      <div className="fixed bottom-10 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div 
              key={t.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`bg-surface border border-border2 rounded p-3 shadow-2xl min-w-[250px] pointer-events-auto border-l-4 ${
                t.type === 'ok' ? 'border-l-green' : t.type === 'warn' ? 'border-l-yellow' : 'border-l-red'
              }`}
            >
              <div className={`text-[11px] font-bold mb-1 ${
                t.type === 'ok' ? 'text-green' : t.type === 'warn' ? 'text-yellow' : 'text-red'
              }`}>
                {t.title}
              </div>
              <div className="text-[11px] text-text2" dangerouslySetInnerHTML={{ __html: t.msg }} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
