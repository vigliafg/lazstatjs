import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryScatter,
  VictoryTheme,
} from 'victory';
import {
  alphaReport,
  alphaTables,
  cronbachAlpha,
  pcaReport,
  pcaTables,
  principalComponents,
} from '../stats/multivariate';
import { ResultTables } from '../components/ResultTable';
import { parseNum } from '../stats/core';
import type { ReportSpec } from '../stats/report';

export interface MultivariateHandle {
  run: () => void;
}

type Mode = 'pca' | 'alpha';

interface Props {
  grid: { cols: { name: string; type: string }[]; rows: string[][] };
  ciLevel: number;
  onOutput: (node: React.ReactNode, report: ReportSpec | null) => void;
  onError: (message: string) => void;
}

const AXIS_STYLE = {
  axis: { stroke: '#333' },
  axisLabel: { fill: '#888', fontSize: 10, padding: 38 },
  tickLabels: { fill: '#888', fontSize: 9 },
  grid: { stroke: '#222' },
};

const isNumericColumn = (grid: Props['grid'], index: number): boolean => {
  const values = grid.rows
    .map((row) => String(row[index] ?? '').trim())
    .filter((value) => value !== '');
  return values.length >= 2 && values.every((value) => Number.isFinite(parseNum(value)));
};

const defaultColumns = (grid: Props['grid']): number[] =>
  grid.cols
    .map((_, index) => index)
    .filter((index) => isNumericColumn(grid, index))
    .slice(0, 4);

export const MultivariateAnalysis = forwardRef<MultivariateHandle, Props>(
  ({ grid, ciLevel, onOutput, onError }, ref) => {
    const [mode, setMode] = useState<Mode>('pca');
    const [standardize, setStandardize] = useState(true);
    const [selected, setSelected] = useState<number[]>(() => defaultColumns(grid));

    useEffect(() => {
      setSelected(defaultColumns(grid));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [grid.cols.length]);

    const toggle = (index: number) => {
      setSelected((prev) =>
        prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index]
      );
    };

    const numericColumns = grid.cols
      .map((_, index) => index)
      .filter((index) => isNumericColumn(grid, index));

    const run = () => {
      const columns = selected.filter((index) => isNumericColumn(grid, index));
      const minimum = 2;
      if (columns.length < minimum) {
        onError(
          mode === 'pca'
            ? 'Select at least two numeric variables'
            : 'Select at least two numeric items of the scale'
        );
        return;
      }

      const names = columns.map((index) => grid.cols[index]?.name ?? `Var${index + 1}`);
      const data: number[][] = [];
      // Complete-case analysis: PCA and alpha both need every selected value.
      grid.rows.forEach((row) => {
        const values = columns.map((index) => parseNum(row[index]));
        if (values.every((value) => Number.isFinite(value))) data.push(values);
      });

      if (data.length < 3) {
        onError('Not enough complete rows: every selected variable must be numeric and present');
        return;
      }

      if (mode === 'pca') {
        const result = principalComponents(data, names, standardize);
        if (!result) {
          onError('The components could not be computed: check constant variables and complete rows');
          return;
        }
        const tables = pcaTables(result);
        const scree = result.eigenvalues.map((value, index) => ({
          x: `PC${index + 1}`,
          y: result.variancePct[index],
        }));
        const scoreData = result.scores.map((scores, index) => ({
          x: scores[0],
          y: scores[1] ?? 0,
          label: `Riga ${index + 1}`,
        }));

        onOutput(
          <div className="mb-6">
            <p className="text-[10px] text-text3 font-mono mb-3">
              {`PCA · ${result.n} casi · ${result.variables.length} variabili · ${result.retained} componenti`}
            </p>
            <ResultTables specs={tables} />
            <section className="mb-6">
              <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">
                Scree plot — varianza spiegata
              </h3>
              <div className="h-[240px] w-full bg-surface3/30 rounded p-2">
                <VictoryChart
                  theme={VictoryTheme.material}
                  domainPadding={{ x: 20 }}
                  padding={{ top: 15, bottom: 50, left: 55, right: 20 }}
                >
                  <VictoryAxis style={AXIS_STYLE} />
                  <VictoryAxis
                    dependentAxis
                    tickFormat={(value: number) => `${value.toFixed(0)}%`}
                    style={AXIS_STYLE}
                  />
                  <VictoryBar
                    data={scree}
                    style={{ data: { fill: '#4f9cf9' } }}
                    labels={({ datum }) => `${datum.y.toFixed(1)}%`}
                  />
                </VictoryChart>
              </div>
            </section>
            <section className="mb-6">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider">
                  Punteggi dei componenti
                </h3>
                <span className="text-[10px] text-text3 font-mono">PC1 × PC2</span>
              </div>
              <div className="h-[260px] w-full bg-surface3/30 rounded p-2">
                <VictoryChart
                  theme={VictoryTheme.material}
                  padding={{ top: 15, bottom: 55, left: 60, right: 25 }}
                >
                  <VictoryAxis label={scoreData.length ? 'PC1' : ''} style={AXIS_STYLE} />
                  <VictoryAxis dependentAxis label="PC2" style={AXIS_STYLE} />
                  <VictoryScatter
                    data={scoreData}
                    size={3.5}
                    style={{ data: { fill: '#34d399', opacity: 0.75 } }}
                  />
                </VictoryChart>
              </div>
            </section>
          </div>,
          pcaReport(tables, result, ciLevel)
        );
        return;
      }

      const result = cronbachAlpha(data, names);
      if (!result) {
        onError('Cronbach alpha could not be computed: check constant items and complete rows');
        return;
      }
      const tables = alphaTables(result);
      onOutput(
        <div className="mb-6">
          <p className="text-[10px] text-text3 font-mono mb-3">
            {`Cronbach α · ${result.k} item · ${result.n} casi completi`}
          </p>
          <ResultTables specs={tables} />
        </div>,
        alphaReport(tables, result)
      );
    };

    useImperativeHandle(ref, () => ({ run }));

    return (
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">
            Analysis
          </label>
          <select
            className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[150px]"
            value={mode}
            onChange={(event) => setMode(event.target.value as Mode)}
          >
            <option value="pca">PCA (componenti)</option>
            <option value="alpha">Cronbach α (affidabilità)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">
            {mode === 'pca' ? 'Variables (≥ 2)' : 'Items of the scale (≥ 2)'}
          </label>
          <div className="bg-surface3 border border-border2 rounded p-2 min-w-[240px] max-h-[120px] overflow-auto scrollbar">
            {numericColumns.length === 0 && (
              <p className="text-[10px] text-text3 italic">No numeric columns</p>
            )}
            {numericColumns.map((index) => (
              <label key={index} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={selected.includes(index)}
                  onChange={() => toggle(index)}
                />
                <span className="text-[11px] text-text2">{grid.cols[index]?.name}</span>
                <span className="text-[9px] text-text3 font-mono">{grid.cols[index]?.type}</span>
              </label>
            ))}
          </div>
        </div>

        {mode === 'pca' && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">
              Matrix
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-text2 hover:text-text cursor-pointer pt-1.5">
              <input
                type="checkbox"
                className="accent-accent"
                checked={standardize}
                onChange={(event) => setStandardize(event.target.checked)}
              />
              Correlation (standardized)
            </label>
          </div>
        )}

        <p className="text-[10px] text-text3 max-w-[380px] self-end pb-1">
          {mode === 'pca'
            ? 'La PCA riassume le variabili in componenti non correlati. La matrice di correlazione è consigliata quando le scale differiscono; Kaiser, Bartlett e KMO sono calcolati automaticamente.'
            : 'L’α di Cronbach stima la coerenza interna della scala. Servono item nella stessa direzione (ricodifica i reverse) e casi completi.'}
        </p>
      </div>
    );
  }
);

MultivariateAnalysis.displayName = 'MultivariateAnalysis';
