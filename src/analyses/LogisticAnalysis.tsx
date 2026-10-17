import React, { forwardRef, useImperativeHandle, useState } from 'react';
import {
  VictoryAxis,
  VictoryChart,
  VictoryLine,
  VictoryScatter,
  VictoryTheme,
} from 'victory';
import { fitLogistic, logisticCurve, logisticReport, logisticTables } from '../stats/logistic';
import { ResultTables } from '../components/ResultTable';
import { parseNum } from '../stats/core';
import type { ReportSpec } from '../stats/report';

export interface LogisticHandle {
  run: () => void;
}

interface Props {
  grid: { cols: { name: string }[]; rows: string[][] };
  ciLevel: number;
  onOutput: (node: React.ReactNode, report: ReportSpec | null) => void;
  onError: (message: string) => void;
}

const inputClass =
  'bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[110px]';

export const LogisticAnalysis = forwardRef<LogisticHandle, Props>(
  ({ grid, ciLevel, onOutput, onError }, ref) => {
    const [outcome, setOutcome] = useState(() => {
      // Prefer the last column that looks binary.
      for (let index = grid.cols.length - 1; index >= 0; index--) {
        const levels = new Set(grid.rows.map(row => String(row[index] ?? '').trim()).filter(value => value !== ''));
        if (levels.size === 2) return index;
      }
      return 0;
    });
    const [predictors, setPredictors] = useState<number[]>(() =>
      grid.cols.map((_, index) => index).filter(index => index !== outcome).slice(0, 1)
    );
    const [cutoff, setCutoff] = useState(0.5);

    const toggle = (index: number) => {
      setPredictors(prev => (prev.includes(index) ? prev.filter(item => item !== index) : [...prev, index]));
    };

    const run = () => {
      if (predictors.length === 0) {
        onError('Select at least one predictor');
        return;
      }
      if (predictors.includes(outcome)) {
        onError('The outcome cannot also be a predictor');
        return;
      }

      const levels = Array.from(
        new Set(
          grid.rows
            .map(row => String(row[outcome] ?? '').trim())
            .filter(value => value !== '')
        )
      ).sort();
      if (levels.length !== 2) {
        onError('The outcome needs exactly two distinct values (for example 0/1 or yes/no)');
        return;
      }

      const rows = grid.rows
        .map(row => {
          const label = String(row[outcome] ?? '').trim();
          const values = predictors.map(index => parseNum(row[index]));
          if (label === '' || values.some(value => !Number.isFinite(value))) return null;
          return { y: label === levels[1] ? 1 : 0, values };
        })
        .filter((row): row is { y: number; values: number[] } => row !== null);

      if (rows.length < 5) {
        onError('Not enough complete rows: the outcome and all predictors must be numeric and present');
        return;
      }

      const y = rows.map(row => row.y);
      const predictorData = predictors.map((index, position) => ({
        name: grid.cols[index]?.name ?? `X${position + 1}`,
        values: rows.map(row => row.values[position]),
      }));

      const model = fitLogistic(y, predictorData, ciLevel, cutoff);
      if (!model) {
        onError('The model could not be estimated: check for constant predictors or a single outcome class');
        return;
      }

      const tables = logisticTables(model, ciLevel, cutoff);

      if (predictors.length === 1) {
        const curve = logisticCurve(model, predictorData[0].values, 40);
        onOutput(
          <div className="mb-6">
            <p className="text-[10px] text-text3 font-mono mb-3">
              {`Outcome: ${grid.cols[outcome]?.name} · event = "${levels[1]}" · predictor: ${predictorData[0].name}`}
            </p>
            <ResultTables specs={tables} />
            <section className="mb-6">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider">
                  Curva di probabilità
                </h3>
                <span className="text-[10px] text-text3 font-mono">{predictorData[0].name}</span>
              </div>
              <div className="h-[280px] w-full bg-surface3/30 rounded p-2">
                <VictoryChart theme={VictoryTheme.material} padding={{ top: 15, bottom: 50, left: 65, right: 25 }} domain={{ y: [0, 100] }}>
                  <VictoryAxis
                    label={predictorData[0].name}
                    style={{
                      axis: { stroke: '#333' },
                      axisLabel: { fill: '#888', fontSize: 10, padding: 30 },
                      tickLabels: { fill: '#888', fontSize: 9 },
                      grid: { stroke: '#222' },
                    }}
                  />
                  <VictoryAxis
                    dependentAxis
                    tickFormat={value => `${value}%`}
                    style={{
                      axis: { stroke: '#333' },
                      tickLabels: { fill: '#888', fontSize: 9 },
                      grid: { stroke: '#222' },
                    }}
                  />
                  <VictoryLine data={curve} style={{ data: { stroke: '#4f9cf9', strokeWidth: 2 } }} />
                  <VictoryScatter
                    data={rows.map((row, index) => ({
                      x: row.values[0],
                      y: row.y * 100,
                    }))}
                    style={{ data: { fill: '#34d399', size: 2, fillOpacity: 0.5 } }}
                  />
                </VictoryChart>
              </div>
              <p className="text-[10px] text-text3 mt-1">
                La curva è la probabilità stimata dall’esito (0–100%); i punti verdi in alto sono le osservazioni con esito = 1, quelli in basso con esito = 0.
              </p>
            </section>
          </div>,
          logisticReport(tables, ciLevel)
        );
        return;
      }

      onOutput(
        <div className="mb-6">
          <p className="text-[10px] text-text3 font-mono mb-3">
            {`Outcome: ${grid.cols[outcome]?.name} · event = "${levels[1]}"`}
          </p>
          <ResultTables specs={tables} />
        </div>,
        logisticReport(tables, ciLevel)
      );
    };

    useImperativeHandle(ref, () => ({ run }));

    return (
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Outcome (0/1)</label>
          <select className={inputClass} value={outcome} onChange={e => setOutcome(parseInt(e.target.value, 10))}>
            {grid.cols.map((column, index) => (
              <option key={index} value={index}>
                {column.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Predictors (X)</label>
          <div className="bg-surface3 border border-border2 rounded p-2 min-w-[200px] max-h-[100px] overflow-auto scrollbar">
            {grid.cols.map((column, index) => (
              <label
                key={index}
                className="flex items-center gap-2 text-[11px] text-text2 hover:text-text cursor-pointer py-0.5"
              >
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={predictors.includes(index)}
                  disabled={index === outcome}
                  onChange={() => toggle(index)}
                />
                {column.name}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Cut-off</label>
          <input
            type="number"
            min="0.05"
            max="0.95"
            step="0.05"
            className={`${inputClass} w-20`}
            value={cutoff}
            onChange={e => setCutoff(parseFloat(e.target.value))}
          />
        </div>
      </div>
    );
  }
);

LogisticAnalysis.displayName = 'LogisticAnalysis';
