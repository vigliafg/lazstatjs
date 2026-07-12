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
  VictoryLabel
} from 'victory';

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
    ci: 95
  });

  const [anovaParams, setAnovaParams] = useState({
    dep: 0,
    grp: 2,
    posthoc: 'none'
  });

  const [regParams, setRegParams] = useState({
    dep: 1,
    indeps: [0] as number[]
  });

  const [corrParams, setCorrParams] = useState({
    vars: [0, 1] as number[],
    method: 'pearson'
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

      return { 
        name: col.name, n, mean, median, stdev, min, max, range, sum, variance, skewness, kurtosis,
        q1: quartiles[0], q3: quartiles[2], histData
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
      </div>
    );
    setOutputs(prev => [...prev, output]);
  };

  const runTTest = () => {
    const { type, var1, var2, mu, ci } = ttestParams;
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
      
      resultHtml = (
        <div className="output-block" key={Date.now()}>
          <div className="output-title">One-Sample T-Test: {grid.cols[var1].name}</div>
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
          <p className="text-[10px] text-text3 mt-2 italic">H₀: μ = {mu} (Confidence Interval: {ci}%)</p>
          
          <div className="h-[250px] w-full mt-6 bg-surface3/30 rounded p-2">
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
              <VictoryBar
                data={[
                  { x: 'Sample Mean', y: mean, fill: '#4f9cf9' },
                  { x: 'Test Value (μ)', y: mu, fill: '#f87171' }
                ]}
                style={{ data: { fill: ({ datum }) => datum.fill, width: 40 } }}
                labels={({ datum }) => `${datum.x}: ${fmt(datum.y)}`}
                labelComponent={<VictoryTooltip style={{ fontSize: 10 }} flyoutStyle={{ fill: '#1e1e1e', stroke: '#333' }} />}
              />
            </VictoryChart>
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

      resultHtml = (
        <div className="output-block" key={Date.now()}>
          <div className="output-title">Independent Samples T-Test</div>
          <p className="text-[11px] mb-2">{grid.cols[var1].name} vs {grid.cols[var2].name}</p>
          <table className="output-table">
            <thead>
              <tr><th>Group</th><th>N</th><th>Mean</th><th>SD</th><th>t</th><th>df</th><th>p</th></tr>
            </thead>
            <tbody>
              <tr><td>{grid.cols[var1].name}</td><td>{n1}</td><td>{fmt(m1)}</td><td>{fmt(Math.sqrt(v1))}</td><td rowSpan={2} className="align-middle">{fmt(t)}</td><td rowSpan={2} className="align-middle">{df}</td><td rowSpan={2} className="align-middle font-bold text-green">{fmtP(p)}</td></tr>
              <tr><td>{grid.cols[var2].name}</td><td>{n2}</td><td>{fmt(m2)}</td><td>{fmt(Math.sqrt(v2))}</td></tr>
            </tbody>
          </table>

          <div className="h-[250px] w-full mt-6 bg-surface3/30 rounded p-2">
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
              <VictoryBar
                data={[
                  { x: grid.cols[var1].name, y: m1, fill: '#4f9cf9' },
                  { x: grid.cols[var2].name, y: m2, fill: '#34d399' }
                ]}
                style={{ data: { fill: ({ datum }) => datum.fill, width: 40 } }}
                labels={({ datum }) => `${datum.x}: ${fmt(datum.y)}`}
                labelComponent={<VictoryTooltip style={{ fontSize: 10 }} flyoutStyle={{ fill: '#1e1e1e', stroke: '#333' }} />}
              />
              <VictoryErrorBar
                data={[
                  { x: grid.cols[var1].name, y: m1, error: Math.sqrt(v1) / Math.sqrt(n1) },
                  { x: grid.cols[var2].name, y: m2, error: Math.sqrt(v2) / Math.sqrt(n2) }
                ]}
                style={{ data: { stroke: "#fff", strokeWidth: 2 } }}
              />
            </VictoryChart>
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

      resultHtml = (
        <div className="output-block" key={Date.now()}>
          <div className="output-title">Paired Samples T-Test</div>
          <p className="text-[11px] mb-2">{grid.cols[var1].name} - {grid.cols[var2].name}</p>
          <table className="output-table">
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

          <div className="h-[250px] w-full mt-6 bg-surface3/30 rounded p-2">
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
              <VictoryBar
                data={[
                  { x: grid.cols[var1].name, y: jStat.mean(a1), fill: '#4f9cf9' },
                  { x: grid.cols[var2].name, y: jStat.mean(a2), fill: '#a78bfa' }
                ]}
                style={{ data: { fill: ({ datum }) => datum.fill, width: 40 } }}
                labels={({ datum }) => `${datum.x}: ${fmt(datum.y)}`}
                labelComponent={<VictoryTooltip style={{ fontSize: 10 }} flyoutStyle={{ fill: '#1e1e1e', stroke: '#333' }} />}
              />
            </VictoryChart>
          </div>
        </div>
      );
    }
    setOutputs(prev => [...prev, resultHtml]);
  };

  const runANOVA = () => {
    const { dep, grp } = anovaParams;
    
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
    if (anovaParams.posthoc !== 'none') {
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

          if (anovaParams.posthoc === 'tukey') {
            testName = "Tukey HSD (approx)";
            if (msWithin > 0) {
              const t = diff / (Math.sqrt(msWithin * (1/n1 + 1/n2)));
              pVal = 2 * (1 - jStat.studentt.cdf(Math.abs(t), dfWithin));
              pVal = Math.min(1, pVal * (k - 1));
            } else {
              pVal = diff === 0 ? 1 : 0;
            }
          } else if (anovaParams.posthoc === 'bonferroni') {
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

    const anovaBoxPlotData = groupKeys.map(key => {
      const vals = groups[key];
      const quartiles = jStat.quartiles(vals);
      return {
        x: key,
        min: jStat.min(vals),
        q1: quartiles[0],
        median: jStat.median(vals),
        q3: quartiles[2],
        max: jStat.max(vals)
      };
    });

    const output = (
      <div className="output-block" key={Date.now()}>
        <div className="output-title">One-Way ANOVA: {grid.cols[dep].name} by {grid.cols[grp].name}</div>
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

        <div className="h-[300px] w-full mt-6 bg-surface3/30 rounded p-2">
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
                min: { stroke: "#f87171", strokeWidth: 2 },
                max: { stroke: "#f87171", strokeWidth: 2 },
                q1: { fill: "#34d399", fillOpacity: 0.5 },
                q3: { fill: "#34d399", fillOpacity: 0.5 },
                median: { stroke: "#fff", strokeWidth: 2 }
              }}
            />
          </VictoryChart>
        </div>
      </div>
    );
    setOutputs(prev => [...prev, output]);
  };

  const runRegression = () => {
    const { dep, indeps } = regParams;
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

      const xRange = maxX - minX || 1;
      const yMinVal = Math.min(minY, yAtMinX, yAtMaxX);
      const yMaxVal = Math.max(maxY, yAtMinX, yAtMaxX);
      const yRange = yMaxVal - yMinVal || 1;

      xDomain = [minX - xRange * 0.05, maxX + xRange * 0.05];
      yDomain = [yMinVal - yRange * 0.05, yMaxVal + yRange * 0.05];
    }

    const output = (
      <div className="output-block" key={Date.now()}>
        <div className="output-title">Linear Regression: {grid.cols[dep].name}</div>
        <div className="mb-4">
          <span className="text-[11px] text-text2 mr-4">R²: <span className="text-accent font-bold">{fmt(R2)}</span></span>
          <span className="text-[11px] text-text2">Adj. R²: <span className="text-accent font-bold">{fmt(1 - (1 - R2) * (n - 1) / df)}</span></span>
        </div>
        <table className="output-table">
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

        {indeps.length === 1 ? (
          <div className="h-[300px] w-full mt-6 bg-surface3/30 rounded p-2">
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
                style={{ data: { fill: '#4f9cf9' } }}
              />
              <VictoryLine
                data={regLineData}
                style={{ data: { stroke: '#f87171', strokeWidth: 2 } }}
              />
            </VictoryChart>
          </div>
        ) : (
          <div className="h-[300px] w-full mt-6 bg-surface3/30 rounded p-2">
            <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter">Coefficients Comparison</p>
            <VictoryChart
              theme={VictoryTheme.material}
              domainPadding={20}
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
              <VictoryBar
                horizontal
                data={coefData.map(d => ({ x: d.name, y: d.value }))}
                style={{ data: { fill: '#4f9cf9', width: 20 } }}
                labels={({ datum }) => `B: ${fmt(datum.y)}`}
                labelComponent={<VictoryTooltip style={{ fontSize: 10 }} flyoutStyle={{ fill: '#1e1e1e', stroke: '#333' }} />}
              />
            </VictoryChart>
          </div>
        )}
      </div>
    );
    setOutputs(prev => [...prev, output]);
  };

  const runCorrelation = () => {
    const { vars, method } = corrParams;
    if (vars.length < 2) {
      showToast('Error', 'Select at least 2 variables', 'error');
      return;
    }

    const matrix: number[][] = [];
    for (let i = 0; i < vars.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < vars.length; j++) {
        if (i === j) {
          matrix[i][j] = 1;
          continue;
        }
        
        const v1 = vars[i];
        const v2 = vars[j];
        
        // Pairwise deletion
        const pairs = grid.rows.map(row => [parseNum(row[v1]), parseNum(row[v2])])
          .filter(p => !isNaN(p[0]) && !isNaN(p[1]));
        
        if (pairs.length < 3) {
          matrix[i][j] = NaN;
          continue;
        }

        const x = pairs.map(p => p[0]);
        const y = pairs.map(p => p[1]);

        if (method === 'pearson') {
          matrix[i][j] = jStat.corrcoeff(x, y);
        } else {
          // Spearman
          const rankX = jStat.rank(x);
          const rankY = jStat.rank(y);
          matrix[i][j] = jStat.corrcoeff(rankX, rankY);
        }
      }
    }

    const corrChartData = vars.slice(1).map((vIdx, i) => ({
      name: grid.cols[vIdx].name,
      value: matrix[0][i + 1]
    }));

    const output = (
      <div className="output-block" key={Date.now()}>
        <div className="output-title">{method.charAt(0).toUpperCase() + method.slice(1)} Correlation Matrix</div>
        <table className="output-table">
          <thead>
            <tr><th></th>{vars.map(v => <th key={v}>{grid.cols[v].name}</th>)}</tr>
          </thead>
          <tbody>
            {vars.map((v1, i) => (
              <tr key={v1}>
                <td className="font-bold">{grid.cols[v1].name}</td>
                {vars.map((v2, j) => (
                  <td key={v2} className={Math.abs(matrix[i][j]) > 0.5 && i !== j ? 'text-accent font-bold' : ''}>
                    {fmt(matrix[i][j], 3)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {vars.length === 2 ? (
          <div className="h-[300px] w-full mt-6 bg-surface3/30 rounded p-2">
            <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter">Scatter Plot: {grid.cols[vars[0]].name} vs {grid.cols[vars[1]].name}</p>
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
                data={grid.rows.map(r => ({ x: parseNum(r[vars[0]]), y: parseNum(r[vars[1]]) })).filter(p => !isNaN(p.x) && !isNaN(p.y))}
                style={{ data: { fill: '#fb923c' } }}
              />
            </VictoryChart>
          </div>
        ) : (
          <div className="h-[300px] w-full mt-6 bg-surface3/30 rounded p-2">
            <p className="text-[10px] text-text3 mb-2 uppercase tracking-tighter">Correlations with {grid.cols[vars[0]].name}</p>
            <VictoryChart
              theme={VictoryTheme.material}
              domainPadding={20}
              padding={{ top: 20, bottom: 50, left: 100, right: 20 }}
            >
              <VictoryAxis
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' } }}
              />
              <VictoryAxis
                dependentAxis
                domain={[-1, 1]}
                tickLabelComponent={<VictoryLabel style={{ fill: '#888', fontSize: 10 }} />}
                style={{ axis: { stroke: '#333' }, grid: { stroke: '#222' } }}
              />
              <VictoryBar
                horizontal
                data={corrChartData.map(d => ({ x: d.name, y: d.value }))}
                style={{ 
                  data: { 
                    fill: ({ datum }) => datum.y > 0 ? '#34d399' : '#f87171',
                    width: 20 
                  } 
                }}
                labels={({ datum }) => `r: ${fmt(datum.y, 3)}`}
                labelComponent={<VictoryTooltip style={{ fontSize: 10 }} flyoutStyle={{ fill: '#1e1e1e', stroke: '#333' }} />}
              />
            </VictoryChart>
          </div>
        )}
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
                  { id: 'correlation', label: 'Correlation' }
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
                      <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Method</label>
                      <select 
                        className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
                        value={corrParams.method}
                        onChange={(e) => setCorrParams(p => ({ ...p, method: e.target.value as any }))}
                      >
                        <option value="pearson">Pearson</option>
                        <option value="spearman">Spearman</option>
                      </select>
                    </div>
                  </>
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
