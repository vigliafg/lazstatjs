import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { contingencyReport, contingencyTables } from '../stats/contingency';
import { ResultTables } from '../components/ResultTable';
import type { ReportSpec } from '../stats/report';

export interface ContingencyHandle {
  run: () => void;
}

interface Props {
  ciLevel: number;
  onOutput: (node: React.ReactNode, report: ReportSpec | null) => void;
  onError: (message: string) => void;
}

const PRESETS = {
  trial: {
    rows: ['Treatment', 'Control'],
    cols: ['Improved', 'Unchanged', 'Worse'],
    values: [
      ['42', '18', '6'],
      ['21', '34', '11'],
    ],
  },
  survey: {
    rows: ['North', 'Centre', 'South'],
    cols: ['Yes', 'No', 'Undecided'],
    values: [
      ['64', '41', '12'],
      ['52', '58', '15'],
      ['38', '47', '21'],
    ],
  },
};

const cellInput =
  'bg-surface border border-border2 text-text text-[11px] p-1 rounded text-center w-16 font-mono';

export const ContingencyAnalysis = forwardRef<ContingencyHandle, Props>(
  ({ ciLevel, onOutput, onError }, ref) => {
    const [rows, setRows] = useState<string[]>(PRESETS.trial.rows);
    const [cols, setCols] = useState<string[]>(PRESETS.trial.cols);
    const [values, setValues] = useState<string[][]>(PRESETS.trial.values);
    const [exact, setExact] = useState(true);
    const [monteCarlo, setMonteCarlo] = useState(true);

    const setCell = (i: number, j: number, value: string) => {
      setValues(prev => prev.map((row, ri) => (ri === i ? row.map((cell, ci) => (ci === j ? value : cell)) : row)));
    };

    const addRow = () => {
      setRows(prev => [...prev, `Row ${prev.length + 1}`]);
      setValues(prev => [...prev, cols.map(() => '0')]);
    };

    const removeRow = () => {
      if (rows.length <= 2) return;
      setRows(prev => prev.slice(0, -1));
      setValues(prev => prev.slice(0, -1));
    };

    const addCol = () => {
      setCols(prev => [...prev, `Col ${prev.length + 1}`]);
      setValues(prev => prev.map(row => [...row, '0']));
    };

    const removeCol = () => {
      if (cols.length <= 2) return;
      setCols(prev => prev.slice(0, -1));
      setValues(prev => prev.map(row => row.slice(0, -1)));
    };

    const applyPreset = (preset: keyof typeof PRESETS) => {
      const next = PRESETS[preset];
      setRows([...next.rows]);
      setCols([...next.cols]);
      setValues(next.values.map(row => [...row]));
    };

    const run = () => {
      const observed = values.map(row => row.map(cell => Number.parseInt(cell, 10) || 0));
      if (observed.some(row => row.some(value => value < 0))) {
        onError('Frequencies must be non-negative');
        return;
      }
      if (observed.flat().reduce((sum, value) => sum + value, 0) === 0) {
        onError('The grand total cannot be zero');
        return;
      }

      const tables = contingencyTables({
        observed,
        rowLabels: rows,
        colLabels: cols,
        level: ciLevel,
        exact,
        monteCarlo,
      });

      if (tables.length === 0) {
        onError('Every row and every column needs at least one observation');
        return;
      }

      onOutput(
        <div className="mb-6">
          <ResultTables specs={tables} />
        </div>,
        contingencyReport(tables, ciLevel)
      );
    };

    useImperativeHandle(ref, () => ({ run }));

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">
            Contingency Table (R x C)
          </label>
          <div className="flex gap-1.5">
            <button
              className="text-[10px] bg-surface hover:bg-border px-2 py-0.5 rounded font-mono text-text3 hover:text-text border border-border cursor-pointer"
              onClick={() => applyPreset('trial')}
            >
              Preset: trial
            </button>
            <button
              className="text-[10px] bg-surface hover:bg-border px-2 py-0.5 rounded font-mono text-text3 hover:text-text border border-border cursor-pointer"
              onClick={() => applyPreset('survey')}
            >
              Preset: survey
            </button>
          </div>
        </div>

        <div className="bg-surface3 border border-border2 rounded p-2 overflow-x-auto scrollbar">
          <table className="text-[10px] text-text2">
            <thead>
              <tr>
                <th />
                {cols.map((col, j) => (
                  <th key={j} className="p-1">
                    <input
                      className="bg-surface border border-border2 text-text text-[10px] p-1 rounded text-center w-16 font-semibold"
                      value={col}
                      onChange={e => setCols(prev => prev.map((label, index) => (index === j ? e.target.value : label)))}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {values.map((row, i) => (
                <tr key={i}>
                  <td className="p-1">
                    <input
                      className="bg-surface border border-border2 text-text text-[10px] p-1 rounded font-semibold w-20"
                      value={rows[i] ?? ''}
                      onChange={e => setRows(prev => prev.map((label, index) => (index === i ? e.target.value : label)))}
                    />
                  </td>
                  {row.map((cell, j) => (
                    <td key={j} className="p-1">
                      <input
                        type="number"
                        min="0"
                        className={cellInput}
                        value={cell}
                        onChange={e => setCell(i, j, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex gap-1">
            <button className="text-[10px] bg-surface hover:bg-border px-2 py-0.5 rounded font-mono text-text3 hover:text-text border border-border cursor-pointer" onClick={addRow}>
              + Row
            </button>
            <button className="text-[10px] bg-surface hover:bg-border px-2 py-0.5 rounded font-mono text-text3 hover:text-text border border-border cursor-pointer" onClick={removeRow}>
              − Row
            </button>
            <button className="text-[10px] bg-surface hover:bg-border px-2 py-0.5 rounded font-mono text-text3 hover:text-text border border-border cursor-pointer" onClick={addCol}>
              + Col
            </button>
            <button className="text-[10px] bg-surface hover:bg-border px-2 py-0.5 rounded font-mono text-text3 hover:text-text border border-border cursor-pointer" onClick={removeCol}>
              − Col
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-text2 hover:text-text cursor-pointer">
            <input type="checkbox" className="accent-accent" checked={exact} onChange={e => setExact(e.target.checked)} />
            Fisher (2x2)
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-text2 hover:text-text cursor-pointer">
            <input
              type="checkbox"
              className="accent-accent"
              checked={monteCarlo}
              onChange={e => setMonteCarlo(e.target.checked)}
            />
            Monte Carlo if E &lt; 5
          </label>
        </div>
      </div>
    );
  }
);

ContingencyAnalysis.displayName = 'ContingencyAnalysis';
