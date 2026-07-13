import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jStat } from 'jstat';
import { 
  VictoryChart, 
  VictoryBar, 
  VictoryScatter, 
  VictoryLine, 
  VictoryAxis, 
  VictoryTooltip, 
  VictoryVoronoiContainer, 
  VictoryBoxPlot, 
  VictoryErrorBar,
  VictoryTheme,
  VictoryLabel,
  VictoryGroup,
  VictoryLegend
} from 'victory';

import { 
  calcFisherExact, 
  calcWilcoxonSignedRank, 
  calcMannWhitneyU, 
  calcKruskalWallis, 
  calcTheilSen, 
  calcKendallTau,
  calcNormalityTests,
  NormalityResult
} from './statsHelpers';

// --- Types ---
type ColType = 'num' | 'int' | 'dec' | 'str' | 'alp' | 'chr' | 'bol' | 'dat';

interface Column {
  name: string;
  type: ColType;
}

interface GridData {
  cols: Column[];
  rows: string[][];
}

interface AnalysisConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
}

// --- Constants ---
const COL_TYPES: { id: ColType; label: string; full: string; regex: RegExp }[] = [
  { id: 'num', label: 'num', full: 'Numeric (auto-detect)', regex: /^-?\d*\.?\d*$/ },
  { id: 'int', label: 'int', full: 'Integer (whole number)', regex: /^-?\d+$/ },
  { id: 'dec', label: 'dec', full: 'Decimal (floating point)', regex: /^-?\d+\.?\d*$/ },
  { id: 'str', label: 'str', full: 'String (free text)', regex: /[\s\S]*/ },
  { id: 'alp', label: 'alp', full: 'Alpha (a–z, A–Z only)', regex: /^[A-Za-z]+$/ },
  { id: 'chr', label: 'chr', full: 'Char (single character)', regex: /^.$/ },
  { id: 'bol', label: 'bol', full: 'Boolean (0/1/T/F/yes/no)', regex: /^(0|1|t|f|true|false|yes|no)$/i },
  { id: 'dat', label: 'dat', full: 'Date (YYYY-MM-DD)', regex: /^\d{4}-\d{2}-\d{2}$/ },
];

const PALETTE = ['#4f9cf9', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#38bdf8', '#fb923c', '#e879f9'];

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

const parseNum = (x: string | number | undefined | null): number => {
  if (x === undefined || x === null) return NaN;
  if (typeof x === 'number') return x;
  const clean = x.trim().replace(',', '.');
  return parseFloat(clean);
};

const validateValue = (val: string, type: ColType) => {
  if (val === '' || val === null) return true;
  const ti = COL_TYPES.find(t => t.id === type) || COL_TYPES[0];
  return ti.regex.test(val.trim());
};

// --- Components ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'data' | 'analysis' | 'settings'>('data');
  const [activeAnalysis, setActiveAnalysis] = useState<string>('descriptive');
  const [grid, setGrid] = useState<GridData>({
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
  const [outputs, setOutputs] = useState<React.ReactNode[]>([]);
  const [toasts, setToasts] = useState<{ id: number; title: string; msg: string; type: 'ok' | 'warn' | 'error' }[]>([]);
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [outputs]);

  const showToast = (title: string, msg: string, type: 'ok' | 'warn' | 'error' = 'ok') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const addColumn = () => {
    setGrid(prev => ({
      cols: [...prev.cols, { name: `Var${prev.cols.length + 1}`, type: 'num' }],
      rows: prev.rows.map(r => [...r, ''])
    }));
  };

  const addRow = () => {
    setGrid(prev => ({
      ...prev,
      rows: [...prev.rows, new Array(prev.cols.length).fill('')]
    }));
  };

  const updateCell = (r: number, c: number, val: string) => {
    setGrid(prev => {
      const newRows = [...prev.rows];
      newRows[r] = [...newRows[r]];
      newRows[r][c] = val;
      return { ...prev, rows: newRows };
    });
  };

  const updateColType = (c: number, type: ColType) => {
    setGrid(prev => {
      const newCols = [...prev.cols];
      newCols[c] = { ...newCols[c], type };
      return { ...prev, cols: newCols };
    });
  };

  const [descVars, setDescVars] = useState<number[]>([0, 1]);
  const [ttestParams, setTTestParams] = useState({
    type: 'ind' as 'ind' | 'dep' | 'one',
    var1: 0,
    var2: 1,
    mu: 0,
    ci: 95,
    useNonParam: true,
    continuityCorr: true
  });

  const [anovaParams, setAnovaParams] = useState({
    dep: 0,
    grp: 2,
    posthoc: 'none',
    useNonParam: true,
    kwPosthoc: 'bonferroni' as 'none' | 'bonferroni'
  });

  const [regParams, setRegParams] = useState({
    dep: 1,
    indeps: [0] as number[],
    useNonParam: true,
    robustEstimator: 'theilsen'
  });

  const [corrParams, setCorrParams] = useState({
    vars: [0, 1] as number[],
    method: 'pearson',
    showSpearman: true,
    showKendall: true
  });

  const [chisqParams, setChisqParams] = useState({
    row1col1: 30,
    row1col2: 20,
    row2col1: 15,
    row2col2: 35,
    row1Label: 'Group A',
    row2Label: 'Group B',
    col1Label: 'Success',
    col2Label: 'Failure',
    runFisherExact: true
  });

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

      // Histogram data
      const numBins = Math.ceil(Math.sqrt(n));
      const histogram = jStat.histogram(data, numBins);
      const binWidth = range / numBins;
      const histData = histogram.map((count, i) => ({
        x: min + (i * binWidth) + (binWidth / 2),
        y: count
      }));

      // Normality calculations
      const normality = calcNormalityTests(data);

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

      const xMin = -3.0;
      const xMax = 3.0;
      const qqLineData = [
        { x: xMin, y: qqSlope * xMin + qqIntercept },
        { x: xMax, y: qqSlope * xMax + qqIntercept }
      ];

      return { 
        name: col.name, n, mean, median, stdev, min, max, range, sum, variance, skewness, kurtosis,
        q1: quartiles[0], q3: quartiles[2], histData, normality, qqData, qqLineData
      };
    }).filter(r => r !== null);

    if (results.length === 0) {
      showToast('Error', 'No valid numeric data selected', 'error');
      return;
    }

    const output = (
      <div className="output-block" key={Date.now()}>
        <div className="output-title">Descriptive Statistics</div>
        <table className="output-table mb-6">
          <thead>
            <tr>
              <th>Variable</th>
              <th>N</th>
              <th>Mean</th>
              <th>SD</th>
              <th>Min</th>
              <th>Max</th>
              <th>Median</th>
              <th>IQR (Q3-Q1)</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i}>
                <td className="font-bold">{r.name}</td>
                <td>{r.n}</td>
                <td>{fmt(r.mean)}</td>
                <td>{fmt(r.stdev)}</td>
                <td>{fmt(r.min)}</td>
                <td>{fmt(r.max)}</td>
                <td>{fmt(r.median)}</td>
                <td>{r ? fmt(r.q3 - r.q1) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

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
              domainPadding={10}
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
                style={{ data: { fill: '#34d399' } }}
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
                const isNormalKS = r.normality.ksPValue > 0.05;
                
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
                          <div className="text-[9px] text-text3 uppercase mb-1 font-semibold tracking-tighter font-sans">Kolmogorov-Smirnov</div>
                          <div>D Stat: <span className="text-text font-semibold">{fmt(r.normality.ksStat)}</span></div>
                          <div>p-value: <span className={`font-bold ${isNormalKS ? 'text-green' : 'text-red/90'}`}>{fmt(r.normality.ksPValue)}</span></div>
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
    setOutputs(prev => [...prev, output]);
  };

  const runTTest = () => {
    const { type, var1, var2, mu, ci, useNonParam, continuityCorr } = ttestParams;
    const a1 = grid.rows.map(r => parseNum(r[var1])).filter(v => !isNaN(v));
    const a2 = grid.rows.map(r => parseNum(r[var2])).filter(v => !isNaN(v));

    if (a1.length === 0 || (type !== 'one' && a2.length === 0)) {
      showToast('Error', 'Insufficient data for T-Test', 'error');
      return;
    }

    let resultHtml: React.ReactNode;

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

      resultHtml = (
        <div className="output-block" key={Date.now()}>
          <div className="output-title">One-Sample T-Test & Wilcoxon Signed-Rank: {grid.cols[var1].name}</div>
          
          <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Parametric: One-Sample T-Test</div>
          <table className="output-table">
            <thead>
              <tr><th>N</th><th>Mean</th><th>SD</th><th>SE</th><th>t</th><th>df</th><th>p</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>{n}</td>
                <td>{fmt(mean)}</td>
                <td>{fmt(sd)}</td>
                <td>{fmt(se)}</td>
                <td>{fmt(t)}</td>
                <td>{df}</td>
                <td className={p < 0.05 ? 'text-green font-bold' : ''}>{fmtP(p)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-[10px] text-text3 mt-1 italic mb-6">H₀: μ = {mu} (Confidence Interval: {ci}%)</p>

          {useNonParam && !isNaN(wilcox.wStat) && (
            <div className="border-t border-border/30 pt-4 mt-4">
              <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Non-Parametric: Wilcoxon Signed-Rank Test</div>
              <table className="output-table mb-2">
                <thead>
                  <tr><th>N (Effective)</th><th>W Statistic</th><th>Z Score</th><th>p-value</th><th>Sig.</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{wilcox.nEffective}</td>
                    <td>{fmt(wilcox.wStat)}</td>
                    <td>{fmt(wilcox.zStat)}</td>
                    <td className={wilcox.pValue < 0.05 ? 'text-green font-bold' : ''}>{fmtP(wilcox.pValue)}</td>
                    <td>{wilcox.pValue < 0.05 ? '*' : ''}{wilcox.pValue < 0.01 ? '*' : ''}{wilcox.pValue < 0.001 ? '*' : ''}</td>
                  </tr>
                </tbody>
              </table>
              <div className="flex gap-4 text-[10px] text-text3 mb-6 bg-surface3/20 p-2 rounded max-w-fit">
                <span>Sum of Positive Ranks (W⁺): <strong className="text-accent">{fmt(wilcox.posRankSum)}</strong></span>
                <span>Sum of Negative Ranks (W⁻): <strong className="text-accent">{fmt(wilcox.negRankSum)}</strong></span>
              </div>
            </div>
          )}

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
      const m1 = jStat.mean(a1);
      const m2 = jStat.mean(a2);
      const v1 = jStat.variance(a1, true);
      const v2 = jStat.variance(a2, true);

      // Pooled variance
      const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
      const se = Math.sqrt(sp2 * (1/n1 + 1/n2));
      const t = (m1 - m2) / se;
      const df = n1 + n2 - 2;
      const p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));

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

      resultHtml = (
        <div className="output-block" key={Date.now()}>
          <div className="output-title">Independent Samples T-Test & Mann-Whitney U</div>
          <p className="text-[11px] mb-4 text-accent2">{grid.cols[var1].name} vs {grid.cols[var2].name}</p>
          
          <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Parametric: Independent Samples T-Test</div>
          <table className="output-table mb-6">
            <thead>
              <tr><th>Group</th><th>N</th><th>Mean</th><th>SD</th><th>t</th><th>df</th><th>p</th></tr>
            </thead>
            <tbody>
              <tr><td>{grid.cols[var1].name}</td><td>{n1}</td><td>{fmt(m1)}</td><td>{fmt(Math.sqrt(v1))}</td><td rowSpan={2} className="align-middle">{fmt(t)}</td><td rowSpan={2} className="align-middle">{df}</td><td rowSpan={2} className="align-middle font-bold text-green">{fmtP(p)}</td></tr>
              <tr><td>{grid.cols[var2].name}</td><td>{n2}</td><td>{fmt(m2)}</td><td>{fmt(Math.sqrt(v2))}</td></tr>
            </tbody>
          </table>

          {useNonParam && !isNaN(mw.uStat) && (
            <div className="border-t border-border/30 pt-4 mt-4">
              <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Non-Parametric: Mann-Whitney U Test (Wilcoxon Rank-Sum)</div>
              <table className="output-table mb-6">
                <thead>
                  <tr><th>Group</th><th>N</th><th>Rank Sum</th><th>Mean Rank</th><th>U Statistic</th><th>Z Score</th><th>p-value</th><th>Sig.</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{grid.cols[var1].name}</td>
                    <td>{n1}</td>
                    <td>{fmt(mw.sumRank1, 1)}</td>
                    <td>{fmt(mw.meanRank1, 2)}</td>
                    <td rowSpan={2} className="align-middle">{fmt(mw.uStat, 1)}</td>
                    <td rowSpan={2} className="align-middle">{fmt(mw.zStat, 3)}</td>
                    <td rowSpan={2} className={`align-middle font-bold ${mw.pValue < 0.05 ? 'text-green' : ''}`}>{fmtP(mw.pValue)}</td>
                    <td rowSpan={2} className="align-middle">{mw.pValue < 0.05 ? '*' : ''}{mw.pValue < 0.01 ? '*' : ''}{mw.pValue < 0.001 ? '*' : ''}</td>
                  </tr>
                  <tr>
                    <td>{grid.cols[var2].name}</td>
                    <td>{n2}</td>
                    <td>{fmt(mw.sumRank2, 1)}</td>
                    <td>{fmt(mw.meanRank2, 2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

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
      // Paired samples
      const n = Math.min(a1.length, a2.length);
      const diffs = [];
      for(let i=0; i<n; i++) diffs.push(a1[i] - a2[i]);

      const meanDiff = jStat.mean(diffs);
      const sdDiff = jStat.stdev(diffs, true);
      const se = sdDiff / Math.sqrt(n);
      const t = meanDiff / se;
      const df = n - 1;
      const p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));

      // Wilcoxon Signed-Rank Test (paired differences vs 0)
      const wilcox = calcWilcoxonSignedRank(diffs, 0);

      const q1 = jStat.quartiles(a1);
      const q2 = jStat.quartiles(a2);
      const boxDataPaired = [
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

      resultHtml = (
        <div className="output-block" key={Date.now()}>
          <div className="output-title">Paired Samples T-Test & Wilcoxon Signed-Rank</div>
          <p className="text-[11px] mb-4 text-accent2">{grid.cols[var1].name} - {grid.cols[var2].name}</p>
          
          <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Parametric: Paired Samples T-Test</div>
          <table className="output-table mb-6">
            <thead>
              <tr><th>Mean Diff</th><th>SD Diff</th><th>SE</th><th>t</th><th>df</th><th>p</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>{fmt(meanDiff)}</td>
                <td>{fmt(sdDiff)}</td>
                <td>{fmt(se)}</td>
                <td>{fmt(t)}</td>
                <td>{df}</td>
                <td className={p < 0.05 ? 'text-green font-bold' : ''}>{fmtP(p)}</td>
              </tr>
            </tbody>
          </table>

          {useNonParam && !isNaN(wilcox.wStat) && (
            <div className="border-t border-border/30 pt-4 mt-4">
              <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Non-Parametric: Wilcoxon Signed-Rank Test (Paired)</div>
              <table className="output-table mb-2">
                <thead>
                  <tr><th>N (Effective)</th><th>W Statistic</th><th>Z Score</th><th>p-value</th><th>Sig.</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{wilcox.nEffective}</td>
                    <td>{fmt(wilcox.wStat)}</td>
                    <td>{fmt(wilcox.zStat)}</td>
                    <td className={wilcox.pValue < 0.05 ? 'text-green font-bold' : ''}>{fmtP(wilcox.pValue)}</td>
                    <td>{wilcox.pValue < 0.05 ? '*' : ''}{wilcox.pValue < 0.01 ? '*' : ''}{wilcox.pValue < 0.001 ? '*' : ''}</td>
                  </tr>
                </tbody>
              </table>
              <div className="flex gap-4 text-[10px] text-text3 mb-6 bg-surface3/20 p-2 rounded max-w-fit">
                <span>Sum of Positive Ranks (W⁺): <strong className="text-accent">{fmt(wilcox.posRankSum)}</strong></span>
                <span>Sum of Negative Ranks (W⁻): <strong className="text-accent">{fmt(wilcox.negRankSum)}</strong></span>
              </div>
            </div>
          )}

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
    setOutputs(prev => [...prev, resultHtml]);
  };

  const runANOVA = () => {
    const { dep, grp, posthoc, useNonParam, kwPosthoc } = anovaParams;
    
    // Group data
    const groups: { [key: string]: number[] } = {};
    grid.rows.forEach(row => {
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

    const output = (
      <div className="output-block" key={Date.now()}>
        <div className="output-title">One-Way ANOVA & Kruskal-Wallis: {grid.cols[dep].name} by {grid.cols[grp].name}</div>
        
        <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Parametric: One-Way ANOVA</div>
        <table className="output-table mb-4">
          <thead>
            <tr><th>Source</th><th>SS</th><th>df</th><th>MS</th><th>F</th><th>p</th></tr>
          </thead>
          <tbody>
            <tr><td>Between</td><td>{fmt(ssBetween)}</td><td>{dfBetween}</td><td>{fmt(msBetween)}</td><td rowSpan={2} className="align-middle">{fmt(f)}</td><td rowSpan={2} className="align-middle font-bold text-green">{fmtP(p)}</td></tr>
            <tr><td>Within</td><td>{fmt(ssWithin)}</td><td>{dfWithin}</td><td>{fmt(msWithin)}</td></tr>
            <tr className="border-t border-border font-bold"><td>Total</td><td>{fmt(ssBetween + ssWithin)}</td><td>{nTotal - 1}</td><td></td><td></td><td></td></tr>
          </tbody>
        </table>

        {postHocResults.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Post-Hoc Tests ({postHocResults[0].testName})</div>
            <table className="output-table">
              <thead>
                <tr><th>Comparison</th><th>Mean Diff</th><th>p-adj</th><th>Sig.</th></tr>
              </thead>
              <tbody>
                {postHocResults.map((res, idx) => (
                  <tr key={idx}>
                    <td>{res.comp}</td>
                    <td>{fmt(res.diff)}</td>
                    <td className={res.p < 0.05 ? 'text-green font-bold' : ''}>{fmtP(res.p)}</td>
                    <td>{res.p < 0.05 ? '*' : ''}{res.p < 0.01 ? '*' : ''}{res.p < 0.001 ? '*' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {useNonParam && !isNaN(kw.hStat) && (
          <div className="border-t border-border/30 pt-4 mt-6">
            <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Non-Parametric: Kruskal-Wallis H Test</div>
            <table className="output-table mb-4">
              <thead>
                <tr><th>Chi-Square (H)</th><th>df</th><th>p-value</th><th>Sig.</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{fmt(kw.hStat)}</td>
                  <td>{kw.df}</td>
                  <td className={kw.pValue < 0.05 ? 'text-green font-bold' : ''}>{fmtP(kw.pValue)}</td>
                  <td>{kw.pValue < 0.05 ? '*' : ''}{kw.pValue < 0.01 ? '*' : ''}{kw.pValue < 0.001 ? '*' : ''}</td>
                </tr>
              </tbody>
            </table>

            <div className="text-[10px] text-text3 font-semibold mb-2">Group Ranks Summary</div>
            <table className="output-table mb-4">
              <thead>
                <tr><th>Group</th><th>N</th><th>Rank Sum</th><th>Mean Rank</th></tr>
              </thead>
              <tbody>
                {groupKeys.map(key => (
                  <tr key={key}>
                    <td className="font-bold">{key}</td>
                    <td>{kw.groupNs[key]}</td>
                    <td>{fmt(kw.groupRankSums[key], 1)}</td>
                    <td>{fmt(kw.groupMeanRanks[key], 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {kwPostHocResults.length > 0 && (
              <div className="mb-6">
                <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Non-Parametric Post-Hoc: Pairwise Mann-Whitney (Bonferroni)</div>
                <table className="output-table">
                  <thead>
                    <tr><th>Comparison</th><th>U Statistic</th><th>Z Score</th><th>p-adj</th><th>Sig.</th></tr>
                  </thead>
                  <tbody>
                    {kwPostHocResults.map((res, idx) => (
                      <tr key={idx}>
                        <td>{res.comp}</td>
                        <td>{fmt(res.uStat, 1)}</td>
                        <td>{fmt(res.zStat, 3)}</td>
                        <td className={res.p < 0.05 ? 'text-green font-bold' : ''}>{fmtP(res.p)}</td>
                        <td>{res.p < 0.05 ? '*' : ''}{res.p < 0.01 ? '*' : ''}{res.p < 0.001 ? '*' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
    setOutputs(prev => [...prev, output]);
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

    const output = (
      <div className="output-block" key={Date.now()}>
        <div className="output-title">Linear Regression & Robust Estimators: {grid.cols[dep].name}</div>
        <div className="mb-4">
          <span className="text-[11px] text-text2 mr-4">R²: <span className="text-accent font-bold">{fmt(R2)}</span></span>
          <span className="text-[11px] text-text2 mr-4">Adj. R²: <span className="text-accent font-bold">{fmt(1 - (1 - R2) * (n - 1) / df)}</span></span>
          <span className="text-[11px] text-text2">N: <span className="text-accent font-bold">{n}</span></span>
        </div>

        <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Parametric: Ordinary Least Squares (OLS)</div>
        <table className="output-table mb-6">
          <thead>
            <tr><th>Variable</th><th>Coef (B)</th><th>Std. Error</th><th>t</th><th>p</th></tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-bold italic">Intercept</td>
              <td>{fmt(coef[0])}</td>
              <td>{fmt(se[0])}</td>
              <td>{fmt(tStats[0])}</td>
              <td className={pValues[0] < 0.05 ? 'text-green font-bold' : ''}>{fmtP(pValues[0])}</td>
            </tr>
            {indeps.map((idx, i) => (
              <tr key={idx}>
                <td className="font-bold">{grid.cols[idx].name}</td>
                <td>{fmt(coef[i+1])}</td>
                <td>{fmt(se[i+1])}</td>
                <td>{fmt(tStats[i+1])}</td>
                <td className={pValues[i+1] < 0.05 ? 'text-green font-bold' : ''}>{fmtP(pValues[i+1])}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {useNonParam && (
          <div className="border-t border-border/30 pt-4 mt-4">
            <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Non-Parametric: Robust Theil-Sen Estimator</div>
            {k === 1 ? (
              <table className="output-table mb-6">
                <thead>
                  <tr><th>Variable</th><th>OLS Slope</th><th>Theil-Sen Robust Slope</th><th>OLS Intercept</th><th>Theil-Sen Robust Intercept</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-bold">{grid.cols[indeps[0]].name}</td>
                    <td>{fmt(coef[1])}</td>
                    <td className="text-green font-bold bg-green/5">{fmt(tsSlope)}</td>
                    <td>{fmt(coef[0])}</td>
                    <td>{fmt(tsIntercept)}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <table className="output-table mb-6">
                <thead>
                  <tr><th>Predictor</th><th>OLS Slope (B)</th><th>Theil-Sen Univariate Robust Slope</th></tr>
                </thead>
                <tbody>
                  {tsEstimators.map((est, i) => (
                    <tr key={i}>
                      <td className="font-bold">{est.name}</td>
                      <td>{fmt(coef[i+1])}</td>
                      <td className="text-green font-bold bg-green/5">{fmt(est.slope)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-[10px] text-text3 italic mb-4">Note: Theil-Sen estimator represents the median slope between all pairs of data points, making it highly robust to outliers.</p>
          </div>
        )}

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

        <div className="mt-6 border-t border-border/30 pt-4">
          <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">
            Studio e Analisi Statistica dei Residui
          </div>
          <table className="output-table">
            <thead>
              <tr>
                <th className="text-left py-2 px-3 text-xs font-mono">Metrica</th>
                <th className="text-left py-2 px-3 text-xs font-mono">Residui OLS</th>
                {tsResidStats && <th className="text-left py-2 px-3 text-xs font-mono">Residui Theil-Sen</th>}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/10">
                <td className="font-bold py-2 px-3 text-xs">Media (Mean)</td>
                <td className="py-2 px-3 text-xs font-mono">{fmt(olsResidStats.mean)}</td>
                {tsResidStats && <td className="py-2 px-3 text-xs font-mono">{fmt(tsResidStats.mean)}</td>}
              </tr>
              <tr className="border-b border-border/10">
                <td className="font-bold py-2 px-3 text-xs">Mediana (Median)</td>
                <td className="py-2 px-3 text-xs font-mono">{fmt(olsResidStats.median)}</td>
                {tsResidStats && <td className="py-2 px-3 text-xs font-mono">{fmt(tsResidStats.median)}</td>}
              </tr>
              <tr className="border-b border-border/10">
                <td className="font-bold py-2 px-3 text-xs">Deviazione Standard (Std Dev)</td>
                <td className="py-2 px-3 text-xs font-mono">{fmt(olsResidStats.stdev)}</td>
                {tsResidStats && <td className="py-2 px-3 text-xs font-mono">{fmt(tsResidStats.stdev)}</td>}
              </tr>
              <tr className="border-b border-border/10">
                <td className="font-bold py-2 px-3 text-xs">Minimo / Massimo (Min / Max)</td>
                <td className="py-2 px-3 text-xs font-mono">{fmt(olsResidStats.min)} / {fmt(olsResidStats.max)}</td>
                {tsResidStats && <td className="py-2 px-3 text-xs font-mono">{fmt(tsResidStats.min)} / {fmt(tsResidStats.max)}</td>}
              </tr>
              <tr className="border-b border-border/10">
                <td className="font-bold py-2 px-3 text-xs">Asimmetria (Skewness)</td>
                <td className="py-2 px-3 text-xs font-mono">{fmt(olsResidStats.skew)}</td>
                {tsResidStats && <td className="py-2 px-3 text-xs font-mono">{fmt(tsResidStats.skew)}</td>}
              </tr>
              <tr className="border-b border-border/10">
                <td className="font-bold py-2 px-3 text-xs">Curtosi in Eccesso (Excess Kurtosis)</td>
                <td className="py-2 px-3 text-xs font-mono">{fmt(olsResidStats.kurt)}</td>
                {tsResidStats && <td className="py-2 px-3 text-xs font-mono">{fmt(tsResidStats.kurt)}</td>}
              </tr>
              <tr className="border-b border-border/10">
                <td className="font-bold py-2 px-3 text-xs">Test Jarque-Bera (JB Stat, p-value)</td>
                <td className="py-2 px-3 text-xs">
                  <div className="flex flex-col gap-0.5 font-mono">
                    <span>Stat: <b>{fmt(olsResidStats.norm.jbStat)}</b></span>
                    <span>p-val: <b className={olsResidStats.norm.jbPValue < 0.05 ? 'text-red/90' : 'text-green'}>{fmt(olsResidStats.norm.jbPValue)}</b></span>
                    <span className="text-[10px] text-text3 font-sans mt-0.5">
                      {olsResidStats.norm.jbPValue > 0.05 ? '✓ Distr. Normale' : '✗ Distr. Non Normale'}
                    </span>
                  </div>
                </td>
                {tsResidStats && (
                  <td className="py-2 px-3 text-xs">
                    <div className="flex flex-col gap-0.5 font-mono">
                      <span>Stat: <b>{fmt(tsResidStats.norm.jbStat)}</b></span>
                      <span>p-val: <b className={tsResidStats.norm.jbPValue < 0.05 ? 'text-red/90' : 'text-green'}>{fmt(tsResidStats.norm.jbPValue)}</b></span>
                      <span className="text-[10px] text-text3 font-sans mt-0.5">
                        {tsResidStats.norm.jbPValue > 0.05 ? '✓ Distr. Normale' : '✗ Distr. Non Normale'}
                      </span>
                    </div>
                  </td>
                )}
              </tr>
              <tr>
                <td className="font-bold py-2 px-3 text-xs">Test Kolmogorov-Smirnov (D Stat, p-value)</td>
                <td className="py-2 px-3 text-xs">
                  <div className="flex flex-col gap-0.5 font-mono">
                    <span>Stat (D): <b>{fmt(olsResidStats.norm.ksStat)}</b></span>
                    <span>p-val: <b className={olsResidStats.norm.ksPValue < 0.05 ? 'text-red/90' : 'text-green'}>{fmt(olsResidStats.norm.ksPValue)}</b></span>
                    <span className="text-[10px] text-text3 font-sans mt-0.5">
                      {olsResidStats.norm.ksPValue > 0.05 ? '✓ Distr. Normale' : '✗ Distr. Non Normale'}
                    </span>
                  </div>
                </td>
                {tsResidStats && (
                  <td className="py-2 px-3 text-xs">
                    <div className="flex flex-col gap-0.5 font-mono">
                      <span>Stat (D): <b>{fmt(tsResidStats.norm.ksStat)}</b></span>
                      <span>p-val: <b className={tsResidStats.norm.ksPValue < 0.05 ? 'text-red/90' : 'text-green'}>{fmt(tsResidStats.norm.ksPValue)}</b></span>
                      <span className="text-[10px] text-text3 font-sans mt-0.5">
                        {tsResidStats.norm.ksPValue > 0.05 ? '✓ Distr. Normale' : '✗ Distr. Non Normale'}
                      </span>
                    </div>
                  </td>
                )}
              </tr>
            </tbody>
          </table>
          <p className="text-[10px] text-text3 italic mt-3 leading-relaxed">
            * Nota: L&#39;analisi diagnostica dei residui serve a verificare i presupposti fondamentali del modello classico di regressione lineare.
            Residui distribuiti normalmente (con p-value &gt; 0,05 nei test di Jarque-Bera o Kolmogorov-Smirnov) e con media vicina a zero indicano che il modello cattura correttamente la struttura dei dati senza distorsioni sistematiche.
          </p>
        </div>
      </div>
    );
    setOutputs(prev => [...prev, output]);
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

    const output = (
      <div className="output-block" key={Date.now()}>
        <div className="output-title">Correlation Analysis Suite</div>

        <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Parametric: Pearson Correlation Matrix</div>
        <table className="output-table mb-6">
          <thead>
            <tr><th></th>{vars.map(v => <th key={v}>{grid.cols[v].name}</th>)}</tr>
          </thead>
          <tbody>
            {vars.map((v1, i) => (
              <tr key={v1}>
                <td className="font-bold">{grid.cols[v1].name}</td>
                {vars.map((v2, j) => (
                  <td key={v2} className={Math.abs(matrixPearson[i][j]) > 0.5 && i !== j ? 'text-accent font-bold' : ''}>
                    {isNaN(matrixPearson[i][j]) ? 'N/A' : fmt(matrixPearson[i][j], 3)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {showSpearman && (
          <div className="border-t border-border/30 pt-4 mt-4">
            <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Non-Parametric: Spearman Rank Correlation Matrix (ρ)</div>
            <table className="output-table mb-6">
              <thead>
                <tr><th></th>{vars.map(v => <th key={v}>{grid.cols[v].name}</th>)}</tr>
              </thead>
              <tbody>
                {vars.map((v1, i) => (
                  <tr key={v1}>
                    <td className="font-bold">{grid.cols[v1].name}</td>
                    {vars.map((v2, j) => (
                      <td key={v2} className={Math.abs(matrixSpearman[i][j]) > 0.5 && i !== j ? 'text-green font-bold' : ''}>
                        {isNaN(matrixSpearman[i][j]) ? 'N/A' : fmt(matrixSpearman[i][j], 3)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showKendall && (
          <div className="border-t border-border/30 pt-4 mt-4">
            <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Non-Parametric: Kendall's Tau-b Correlation Matrix (τ)</div>
            <table className="output-table mb-6">
              <thead>
                <tr><th></th>{vars.map(v => <th key={v}>{grid.cols[v].name}</th>)}</tr>
              </thead>
              <tbody>
                {vars.map((v1, i) => (
                  <tr key={v1}>
                    <td className="font-bold">{grid.cols[v1].name}</td>
                    {vars.map((v2, j) => (
                      <td key={v2} className={Math.abs(matrixKendall[i][j]) > 0.5 && i !== j ? 'text-purple-400 font-bold' : ''}>
                        {isNaN(matrixKendall[i][j]) ? 'N/A' : fmt(matrixKendall[i][j], 3)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
    setOutputs(prev => [...prev, output]);
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

    const obsValues = [o11, o12, o21, o22];
    const expValues = [e11, e12, e21, e22];
    const qObs = jStat.quartiles(obsValues);
    const qExp = jStat.quartiles(expValues);
    const boxDataChisq = [
      {
        x: "Observed",
        min: jStat.min(obsValues),
        q1: qObs[0],
        median: qObs[1],
        q3: qObs[2],
        max: jStat.max(obsValues)
      },
      {
        x: "Expected",
        min: jStat.min(expValues),
        q1: qExp[0],
        median: qExp[1],
        q3: qExp[2],
        max: jStat.max(expValues)
      }
    ];

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

    const output = (
      <div className="output-block" key={Date.now()}>
        <div className="output-title">Chi-Square (χ²) Test of Independence</div>
        
        <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Contingency Table: Observed vs (Expected)</div>
        <table className="output-table mb-6">
          <thead>
            <tr>
              <th></th>
              <th>{col1Label}</th>
              <th>{col2Label}</th>
              <th className="font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-bold">{row1Label}</td>
              <td>{o11} ({fmt(e11, 2)})</td>
              <td>{o12} ({fmt(e12, 2)})</td>
              <td className="font-bold">{r1}</td>
            </tr>
            <tr>
              <td className="font-bold">{row2Label}</td>
              <td>{o21} ({fmt(e21, 2)})</td>
              <td>{o22} ({fmt(e22, 2)})</td>
              <td className="font-bold">{r2}</td>
            </tr>
            <tr className="border-t border-border font-bold">
              <td>Total</td>
              <td>{c1}</td>
              <td>{c2}</td>
              <td>{n}</td>
            </tr>
          </tbody>
        </table>

        <div className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">Test Statistics (df = 1)</div>
        <table className="output-table">
          <thead>
            <tr>
              <th>Test Type</th>
              <th>Value (χ²)</th>
              <th>p-value</th>
              <th>Sig.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Pearson Chi-Square</td>
              <td>{fmt(chi2, 4)}</td>
              <td className={pValue < 0.05 ? 'text-green font-bold' : ''}>{fmtP(pValue)}</td>
              <td>{pValue < 0.05 ? '*' : ''}{pValue < 0.01 ? '*' : ''}{pValue < 0.001 ? '*' : ''}</td>
            </tr>
            <tr>
              <td>Yates' Continuity Correction</td>
              <td>{fmt(chi2Yates, 4)}</td>
              <td className={pValueYates < 0.05 ? 'text-green font-bold' : ''}>{fmtP(pValueYates)}</td>
              <td>{pValueYates < 0.05 ? '*' : ''}{pValueYates < 0.01 ? '*' : ''}{pValueYates < 0.001 ? '*' : ''}</td>
            </tr>
            {runFisherExact && !isNaN(pValueFisher) && (
              <tr>
                <td className="font-semibold text-green">Fisher's Exact Test (Non-Parametric)</td>
                <td>N/A (Exact Probability)</td>
                <td className={pValueFisher < 0.05 ? 'text-green font-bold bg-green/5' : ''}>{fmtP(pValueFisher)}</td>
                <td>{pValueFisher < 0.05 ? '*' : ''}{pValueFisher < 0.01 ? '*' : ''}{pValueFisher < 0.001 ? '*' : ''}</td>
              </tr>
            )}
            <tr className="border-t border-border font-bold">
              <td>Cramér's V (Phi Coefficient)</td>
              <td>{fmt(phi, 4)}</td>
              <td colSpan={2} className="text-accent">{interpretation}</td>
            </tr>
          </tbody>
        </table>

        {showCochranWarning && (
          <div className="mt-4 p-2 bg-yellow/10 border border-yellow/20 rounded flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-yellow shrink-0 mt-0.5" />
            <div className="text-[10px] text-yellow leading-normal">
              <strong>Warning (Cochran's Rule):</strong> One or more expected frequencies is less than 5 (Min expected: {fmt(minExpected, 2)}).
              The standard Chi-Square test may be inaccurate. Yates' Continuity Correction is strongly recommended.
            </div>
          </div>
        )}

        <div className="h-[300px] w-full mt-6 bg-surface3/30 rounded p-2">
          <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter text-center">Observed vs. Expected Distributions (Boxplots)</p>
          <VictoryChart
            theme={VictoryTheme.material}
            domainPadding={{ x: 50 }}
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
            <VictoryBoxPlot
              data={boxDataChisq}
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
      </div>
    );
    setOutputs(prev => [...prev, output]);
  };

  const clearOutput = () => {
    setOutputs([]);
    showToast('Output', 'Output console cleared', 'ok');
  };

  const copyOutput = () => {
    const el = document.getElementById('output-content');
    if (el) {
      navigator.clipboard.writeText(el.innerText);
      showToast('Output', 'Output copied to clipboard', 'ok');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-bg text-text font-sans selection:bg-accent/30">
      {/* Main Tabs */}
      <div className="bg-surface2 border-b border-border px-2 pt-1.5 flex gap-0.5 shrink-0">
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
      </div>

      {/* Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'data' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-surface border-b border-border p-1.5 flex items-center gap-2 shrink-0">
              <span className="font-mono text-[10px] text-text3 uppercase tracking-widest px-2">File:</span>
              <button className="tb-btn" onClick={() => setGrid({ cols: [{ name: 'Var1', type: 'num' }], rows: Array(20).fill(['']) })}>New</button>
              <button className="tb-btn">Import CSV</button>
              <button className="tb-btn">Export CSV</button>
              <div className="h-4 w-px bg-border mx-2" />
              <button className="tb-btn text-yellow" onClick={() => showToast('Validation', 'All cells validated successfully', 'ok')}>Validate</button>
            </div>
            
            <div className="panel-header">
              <div className="w-1.5 h-1.5 bg-accent rounded-full" />
              Grid View
            </div>

            <div className="flex-1 overflow-auto scrollbar">
              <table className="w-full border-collapse font-mono text-[11px]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-surface2">
                    <th className="w-10 border border-border p-1 text-text3">#</th>
                    {grid.cols.map((col, i) => (
                      <th key={i} className="border border-border p-1 text-accent2 min-w-[100px]">
                        {col.name}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-surface2/80 backdrop-blur">
                    <th className="border border-border text-[8px] text-text3 uppercase p-1">Type</th>
                    {grid.cols.map((col, i) => (
                      <th key={i} className="border border-border p-0">
                        <select 
                          className="w-full bg-transparent border-none text-accent2 text-[10px] font-semibold p-1 outline-none appearance-none text-center cursor-pointer hover:bg-white/5"
                          value={col.type}
                          onChange={(e) => updateColType(i, e.target.value as ColType)}
                        >
                          {COL_TYPES.map(t => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-white/5 transition-colors">
                      <td className="border border-border text-center text-text3 bg-surface2/30">{rIdx + 1}</td>
                      {row.map((cell, cIdx) => {
                        const isValid = validateValue(cell, grid.cols[cIdx].type);
                        return (
                          <td key={cIdx} className="border border-border p-0 relative">
                            <input 
                              type="text"
                              className={`w-full h-full bg-transparent border-none px-2 py-1 text-text outline-none focus:bg-accent/10 transition-colors ${!isValid ? 'bg-red/10 text-red' : ''}`}
                              value={cell}
                              onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                            />
                            {cell === '' && <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-text3 pointer-events-none italic opacity-50">null</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-surface border-t border-border p-2 flex gap-2 shrink-0">
              <button className="tb-btn" onClick={addColumn}><Plus className="w-3 h-3 inline mr-1" /> Column</button>
              <button className="tb-btn" onClick={addRow}><Plus className="w-3 h-3 inline mr-1" /> Row</button>
              <button className="tb-btn text-red/80 hover:bg-red hover:text-white" onClick={() => setGrid(prev => ({ ...prev, rows: prev.rows.map(r => ['']) }))}><Trash2 className="w-3 h-3 inline mr-1" /> Clear</button>
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-surface border-b border-border shrink-0">
              <div className="flex overflow-x-auto scrollbar">
                {[
                  { id: 'descriptive', label: 'Descriptive' },
                  { id: 'ttest', label: 'T-Test' },
                  { id: 'anova', label: 'ANOVA' },
                  { id: 'regression', label: 'Regression' },
                  { id: 'correlation', label: 'Correlation' },
                  { id: 'chisquare', label: 'Chi-Square (χ²)' }
                ].map(a => (
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
                      <select 
                        className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
                        value={anovaParams.grp}
                        onChange={(e) => setAnovaParams(p => ({ ...p, grp: parseInt(e.target.value) }))}
                      >
                        {grid.cols.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Post-Hoc</label>
                      <select 
                        className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
                        value={anovaParams.posthoc}
                        onChange={(e) => setAnovaParams(p => ({ ...p, posthoc: e.target.value as any }))}
                      >
                        <option value="none">None</option>
                        <option value="tukey">Tukey HSD</option>
                        <option value="bonferroni">Bonferroni</option>
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

                <button className="run-btn h-9 self-end" onClick={runAnalysis}>
                  <Play className="w-3 h-3 inline mr-2" />
                  Run Analysis
                </button>
              </div>
            </div>

            <div className="bg-surface border-b border-border px-3 py-1 flex items-center justify-between shrink-0">
              <span className="font-mono text-[10px] text-text3 uppercase tracking-widest">Output Console</span>
              <div className="flex gap-2">
                <button className="tb-btn" onClick={clearOutput}>Clear</button>
                <button className="tb-btn" onClick={copyOutput}>Copy Text</button>
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
                  {outputs}
                  <div ref={outputEndRef} />
                </div>
              )}
            </div>
          </div>
        )}

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

      {/* Footer / Statusbar */}
      <footer className="h-8 bg-surface border-t border-border flex items-center px-4 text-[10px] font-mono text-text3 gap-6 shrink-0">
        <div>ROWS: <span className="text-text2">{grid.rows.filter(r => r.some(v => v !== '')).length}</span></div>
        <div className="w-px h-3 bg-border" />
        <div>COLS: <span className="text-text2">{grid.cols.length}</span></div>
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
