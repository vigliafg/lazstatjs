import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryTheme,
} from 'victory';
import {
  repeatedAnovaReport,
  repeatedAnovaTables,
  repeatedMeasuresAnova,
} from '../stats/repeatedAnova';
import { ResultTables } from '../components/ResultTable';
import { parseNum } from '../stats/core';
import type { ReportSpec } from '../stats/report';

export interface RepeatedAnovaHandle {
  run: () => void;
}

interface Props {
  grid: { cols: { name: string; type: string }[]; rows: string[][] };
  ciLevel: number;
  onOutput: (node: React.ReactNode, report: ReportSpec | null) => void;
  onError: (message: string) => void;
}

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
    .slice(0, 3);

export const RepeatedAnovaAnalysis = forwardRef<RepeatedAnovaHandle, Props>(
  ({ grid, ciLevel, onOutput, onError }, ref) => {
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

    const run = () => {
      const columns = selected.filter((index) => isNumericColumn(grid, index));
      if (columns.length < 3) {
        onError('Select at least three numeric columns measured on the same rows');
        return;
      }
      const blocks: number[][] = [];
      grid.rows.forEach((row) => {
        const values = columns.map((index) => parseNum(row[index]));
        if (values.every((value) => Number.isFinite(value))) blocks.push(values);
      });
      if (blocks.length < 3) {
        onError('Not enough complete rows: every condition must be numeric and present');
        return;
      }
      const result = repeatedMeasuresAnova(blocks);
      if (!result) {
        onError('The model could not be estimated: check the selected columns and complete rows');
        return;
      }
      const names = columns.map((index) => grid.cols[index]?.name ?? `Var${index + 1}`);
      const tables = repeatedAnovaTables(result, names, ciLevel);
      const data = names.map((name, index) => ({ x: name, y: result.means[index] }));

      onOutput(
        <div className="mb-6">
          <p className="text-[10px] text-text3 font-mono mb-3">
            {`Repeated-measures ANOVA · ${result.n} soggetti · ${result.k} condizioni`}
          </p>
          <ResultTables specs={tables} />
          <section className="mb-6">
            <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">
              Medie per condizione
            </h3>
            <div className="h-[260px] w-full bg-surface3/30 rounded p-2">
              <VictoryChart
                theme={VictoryTheme.material}
                domainPadding={{ x: 30 }}
                padding={{ top: 15, bottom: 55, left: 55, right: 20 }}
              >
                <VictoryAxis
                  style={{
                    axis: { stroke: '#333' },
                    tickLabels: { fill: '#888', fontSize: 9 },
                    grid: { stroke: '#222' },
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  style={{
                    axis: { stroke: '#333' },
                    tickLabels: { fill: '#888', fontSize: 9 },
                    grid: { stroke: '#222' },
                  }}
                />
                <VictoryBar
                  data={data}
                  style={{ data: { fill: '#4f9cf9' } }}
                  labels={({ datum }) => datum.y.toFixed(2)}
                />
              </VictoryChart>
            </div>
          </section>
        </div>,
        repeatedAnovaReport(tables, names, ciLevel)
      );
    };

    useImperativeHandle(ref, () => ({ run }));

    const numericColumns = grid.cols
      .map((_, index) => index)
      .filter((index) => isNumericColumn(grid, index));

    return (
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">
            Within-subject conditions (≥ 3)
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
        <p className="text-[10px] text-text3 max-w-[360px] self-end pb-1">
          Una riga = un soggetto. Le condizioni sono confrontate within-subject; Mauchly e le
          correzioni Greenhouse–Geisser/Huynh–Feldt sono calcolate automaticamente.
        </p>
      </div>
    );
  }
);
