import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { VictoryAxis, VictoryChart, VictoryLine, VictoryScatter, VictoryTheme } from 'victory';
import {
  DISTRIBUTION_LABEL,
  distributionFitReport,
  distributionFitTables,
  fitDistributions,
  probabilityPlotData,
  type DistributionName,
} from '../stats/distfit';
import { ResultTables } from '../components/ResultTable';
import { parseNum } from '../stats/core';
import type { ReportSpec } from '../stats/report';

export interface DistributionFitHandle {
  run: () => void;
}

interface Props {
  grid: { cols: { name: string }[]; rows: string[][] };
  ciLevel: number;
  onOutput: (node: React.ReactNode, report: ReportSpec | null) => void;
  onError: (message: string) => void;
}

const ALL: DistributionName[] = ['normal', 'lognormal', 'exponential', 'gamma', 'weibull'];

export const DistributionFitAnalysis = forwardRef<DistributionFitHandle, Props>(
  ({ grid, ciLevel, onOutput, onError }, ref) => {
    const [variable, setVariable] = useState(0);
    const [selected, setSelected] = useState<DistributionName[]>(ALL);

    const toggle = (name: DistributionName) => {
      setSelected(prev => (prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]));
    };

    const run = () => {
      const values = grid.rows
        .map(row => parseNum(row[variable]))
        .filter(value => Number.isFinite(value));

      if (values.length < 3) {
        onError('Select a numeric variable with at least three valid values');
        return;
      }
      if (selected.length === 0) {
        onError('Select at least one distribution to fit');
        return;
      }

      const tables = distributionFitTables(values, selected, ciLevel);
      if (tables.length === 0) {
        onError('No distribution could be fitted: positive-support models need values greater than zero');
        return;
      }

      const fits = fitDistributions(values, selected);
      const best = fits[0];
      const plot = probabilityPlotData(best, values);
      const min = Math.min(...plot.flatMap(point => [point.x, point.y]));
      const max = Math.max(...plot.flatMap(point => [point.x, point.y]));
      const reference = [
        { x: min, y: min },
        { x: max, y: max },
      ];

      onOutput(
        <div className="mb-6">
          <ResultTables specs={tables} />
          <section className="mb-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
              <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider">
                Probability plot
              </h3>
              <span className="text-[10px] text-text3 font-mono">
                {`${DISTRIBUTION_LABEL[best.name]} · ${grid.cols[variable]?.name ?? 'Y'}`}
              </span>
            </div>
            <div className="h-[280px] w-full bg-surface3/30 rounded p-2">
              <VictoryChart theme={VictoryTheme.material} padding={{ top: 15, bottom: 50, left: 65, right: 25 }}>
                <VictoryAxis
                  label="Quantili teorici"
                  style={{
                    axis: { stroke: '#333' },
                    axisLabel: { fill: '#888', fontSize: 10, padding: 30 },
                    tickLabels: { fill: '#888', fontSize: 9 },
                    grid: { stroke: '#222' },
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  label="Valori osservati"
                  style={{
                    axis: { stroke: '#333' },
                    axisLabel: { fill: '#888', fontSize: 10, padding: 40 },
                    tickLabels: { fill: '#888', fontSize: 9 },
                    grid: { stroke: '#222' },
                  }}
                />
                <VictoryLine
                  data={reference}
                  style={{ data: { stroke: '#555', strokeDasharray: '4,4', strokeWidth: 1 } }}
                />
                <VictoryScatter
                  data={plot}
                  style={{ data: { fill: '#4f9cf9', size: 3 } }}
                />
              </VictoryChart>
            </div>
            <p className="text-[10px] text-text3 mt-1">
              Più i punti stanno sulla diagonale, meglio la distribuzione descrive i dati. Le deviazioni alle estremità indicano code mal descritte.
            </p>
          </section>
        </div>,
        distributionFitReport(tables, ciLevel)
      );
    };

    useImperativeHandle(ref, () => ({ run }));

    return (
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Variable</label>
          <select
            className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[140px]"
            value={variable}
            onChange={e => setVariable(parseInt(e.target.value, 10))}
          >
            {grid.cols.map((column, index) => (
              <option key={index} value={index}>
                {column.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Distributions</label>
          <div className="bg-surface3 border border-border2 rounded p-2 flex flex-wrap gap-x-3 gap-y-1 max-w-[360px]">
            {ALL.map(name => (
              <label
                key={name}
                className="flex items-center gap-1.5 text-[11px] text-text2 hover:text-text cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={selected.includes(name)}
                  onChange={() => toggle(name)}
                />
                {DISTRIBUTION_LABEL[name]}
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

DistributionFitAnalysis.displayName = 'DistributionFitAnalysis';
