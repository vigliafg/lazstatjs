import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryTheme,
} from 'victory';
import {
  cochranQ,
  cochranReport,
  cochranTables,
  friedmanReport,
  friedmanTables,
  friedmanTest,
  jonckheereReport,
  jonckheereTables,
  jonckheereTerpstra,
  mcnemarReport,
  mcnemarTables,
  mcnemarTest,
  nemenyiPosthoc,
} from '../stats/repeated';
import { ResultTables } from '../components/ResultTable';
import { parseNum } from '../stats/core';
import { analysisRows, groupColumnIndexes, levelLabel, orderedColumnLevels, type CategoryLevel, type GridData } from '../grid/types';
import { LevelsEditor, LEVELS_BUTTON_CLASS } from '../grid/LevelsEditor';
import type { ReportSpec } from '../stats/report';

export interface NonParamRepeatedHandle {
  run: () => void;
}

interface Props {
  grid: GridData;
  onLevels: (column: number, levels: CategoryLevel[], reference?: string) => void;
  onRecode: (column: number, mapping: Record<string, string>) => void;
  ciLevel: number;
  onOutput: (node: React.ReactNode, report: ReportSpec | null) => void;
  onError: (message: string) => void;
}

type Mode = 'friedman' | 'mcnemar' | 'cochran' | 'jonckheere';

const inputClass =
  'bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]';

const levelsOf = (grid: Props['grid'], index: number): string[] => {
  const col = grid.cols[index];
  return orderedColumnLevels(col, grid.rows, index).map((level) => levelLabel(col, level.value));
};

const isNumericColumn = (grid: Props['grid'], index: number): boolean => {
  const values = grid.rows
    .map((row) => String(row[index] ?? '').trim())
    .filter((value) => value !== '');
  if (values.length < 2) return false;
  return values.every((value) => Number.isFinite(parseNum(value)));
};

const isBinaryColumn = (grid: Props['grid'], index: number): boolean =>
  levelsOf(grid, index).length === 2;

const defaultSelection = (grid: Props['grid'], mode: Mode): number[] => {
  if (mode === 'friedman') {
    return grid.cols
      .map((_, index) => index)
      .filter((index) => isNumericColumn(grid, index))
      .slice(0, 3);
  }
  if (mode === 'cochran') {
    return grid.cols
      .map((_, index) => index)
      .filter((index) => isBinaryColumn(grid, index))
      .slice(0, 3);
  }
  return [];
};

const gridTheme = {
  ...VictoryTheme.material,
  axis: {
    style: {
      axis: { stroke: '#333' },
      tickLabels: { fill: '#888', fontSize: 9 },
      grid: { stroke: '#222' },
      axisLabel: { fill: '#888', fontSize: 10, padding: 30 },
    },
  },
};

export const NonParamRepeatedAnalysis = forwardRef<NonParamRepeatedHandle, Props>(
  ({ grid, onLevels, onRecode, ciLevel, onOutput, onError }, ref) => {
    const [mode, setMode] = useState<Mode>('friedman');
    const [selected, setSelected] = useState<number[]>(() => defaultSelection(grid, 'friedman'));
    const [left, setLeft] = useState(() => {
      const binary = grid.cols.map((_, index) => index).filter((index) => isBinaryColumn(grid, index));
      return binary[0] ?? 0;
    });
    const [right, setRight] = useState(() => {
      const binary = grid.cols.map((_, index) => index).filter((index) => isBinaryColumn(grid, index));
      return binary[1] ?? binary[0] ?? 1;
    });
    const [outcome, setOutcome] = useState(() => {
      const numeric = grid.cols.map((_, index) => index).filter((index) => isNumericColumn(grid, index));
      return numeric[0] ?? 0;
    });
    const [group, setGroup] = useState(() => groupColumnIndexes(grid)[0] ?? 1);

    useEffect(() => {
      setSelected(defaultSelection(grid, mode));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, grid.cols.length]);

    useEffect(() => {
      const max = Math.max(0, grid.cols.length - 1);
      if (left > max) setLeft(max);
      if (right > max) setRight(max);
      if (outcome > max) setOutcome(max);
      if (group > max) setGroup(max);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [grid.cols.length]);

    const toggle = (index: number) => {
      setSelected((prev) =>
        prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index]
      );
    };

    const runFriedman = () => {
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
      if (blocks.length < 2) {
        onError('Not enough complete rows: every selected column must be numeric');
        return;
      }
      const test = friedmanTest(blocks);
      if (!test) {
        onError('The test could not be computed: check for constant or tied columns');
        return;
      }
      const names = columns.map((index) => grid.cols[index]?.name ?? `Var${index + 1}`);
      const posthoc = nemenyiPosthoc(test, ciLevel);
      const tables = friedmanTables(test, posthoc, names, ciLevel);
      const data = names.map((name, index) => ({ x: name, y: test.meanRanks[index] }));
      onOutput(
        <div className="mb-6">
          <p className="text-[10px] text-text3 font-mono mb-3">
            {`Friedman · ${blocks.length} blocchi · ${columns.length} misure ripetute`}
          </p>
          <ResultTables specs={tables} />
          <section className="mb-6">
            <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">
              Ranghi medi
            </h3>
            <div className="h-[260px] w-full bg-surface3/30 rounded p-2">
              <VictoryChart theme={gridTheme} domainPadding={{ x: 30 }} padding={{ top: 15, bottom: 55, left: 55, right: 20 }}>
                <VictoryAxis style={gridTheme.axis.style} />
                <VictoryAxis dependentAxis style={gridTheme.axis.style} />
                <VictoryBar
                  data={data}
                  style={{ data: { fill: '#4f9cf9' } }}
                  labels={({ datum }) => datum.y.toFixed(2)}
                />
              </VictoryChart>
            </div>
          </section>
        </div>,
        friedmanReport(tables, names, ciLevel)
      );
    };

    const runMcNemar = () => {
      if (left === right) {
        onError('Choose two different binary columns');
        return;
      }
      const leftLevels = levelsOf(grid, left);
      const rightLevels = levelsOf(grid, right);
      if (leftLevels.length !== 2 || rightLevels.length !== 2) {
        onError('McNemar needs two columns with exactly two values each (for example 0/1 or no/yes)');
        return;
      }
      const pairs: [number, number][] = [];
      grid.rows.forEach((row) => {
        const a = String(row[left] ?? '').trim();
        const b = String(row[right] ?? '').trim();
        if (a === '' || b === '') return;
        if (!leftLevels.includes(a) || !rightLevels.includes(b)) return;
        pairs.push([a === leftLevels[1] ? 1 : 0, b === rightLevels[1] ? 1 : 0]);
      });
      const result = mcnemarTest(pairs);
      if (!result) {
        onError('Not enough valid pairs: both columns must be complete and binary');
        return;
      }
      const names: [string, string] = [
        `${grid.cols[left]?.name ?? 'X1'} (${leftLevels[1]})`,
        `${grid.cols[right]?.name ?? 'X2'} (${rightLevels[1]})`,
      ];
      const tables = mcnemarTables(result, names, ciLevel);
      onOutput(
        <div className="mb-6">
          <p className="text-[10px] text-text3 font-mono mb-3">
            {`McNemar · ${pairs.length} coppie · evento = valore più alto`}
          </p>
          <ResultTables specs={tables} />
        </div>,
        mcnemarReport(tables, names, ciLevel)
      );
    };

    const runCochran = () => {
      const columns = selected.filter((index) => isBinaryColumn(grid, index));
      if (columns.length < 3) {
        onError('Select at least three binary columns measured on the same rows');
        return;
      }
      const levels = columns.map((index) => levelsOf(grid, index));
      if (levels.some((values) => values.length !== 2)) {
        onError('Cochran Q needs binary columns with exactly two values');
        return;
      }
      const blocks: number[][] = [];
      grid.rows.forEach((row) => {
        const values = columns.map((index, position) => {
          const value = String(row[index] ?? '').trim();
          if (value === '') return NaN;
          return value === levels[position][1] ? 1 : 0;
        });
        if (values.every((value) => value === 0 || value === 1)) blocks.push(values);
      });
      const result = cochranQ(blocks);
      if (!result) {
        onError('The test could not be computed: need complete rows and at least three conditions');
        return;
      }
      const names = columns.map((index) => grid.cols[index]?.name ?? `Var${index + 1}`);
      const tables = cochranTables(result, names, ciLevel);
      const data = names.map((name, index) => ({
        x: name,
        y: result.successes[index] / result.n,
      }));
      onOutput(
        <div className="mb-6">
          <p className="text-[10px] text-text3 font-mono mb-3">
            {`Cochran Q · ${result.n} blocchi · ${result.k} condizioni binarie`}
          </p>
          <ResultTables specs={tables} />
          <section className="mb-6">
            <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">
              Proporzione di successi
            </h3>
            <div className="h-[260px] w-full bg-surface3/30 rounded p-2">
              <VictoryChart theme={gridTheme} domain={{ y: [0, 1] }} domainPadding={{ x: 30 }} padding={{ top: 15, bottom: 55, left: 55, right: 20 }}>
                <VictoryAxis style={gridTheme.axis.style} />
                <VictoryAxis dependentAxis style={gridTheme.axis.style} />
                <VictoryBar
                  data={data}
                  style={{ data: { fill: '#34d399' } }}
                  labels={({ datum }) => datum.y.toFixed(2)}
                />
              </VictoryChart>
            </div>
          </section>
        </div>,
        cochranReport(tables, names, ciLevel)
      );
    };

    const runJonckheere = () => {
      if (outcome === group) {
        onError('The outcome and the ordered group column must be different');
        return;
      }
      if (!isNumericColumn(grid, outcome)) {
        onError('The outcome column must be numeric');
        return;
      }
      const groupLevels = levelsOf(grid, group);
      if (groupLevels.length < 2 || groupLevels.length > 10) {
        onError('The ordered group column needs between 2 and 10 distinct values');
        return;
      }
      const buckets: number[][] = groupLevels.map(() => []);
      analysisRows(grid, [group]).forEach((row) => {
        const value = parseNum(row[outcome]);
        const label = String(row[group] ?? '').trim();
        const index = groupLevels.indexOf(label);
        if (Number.isFinite(value) && index >= 0) buckets[index].push(value);
      });
      if (buckets.some((bucket) => bucket.length === 0)) {
        onError('Every group needs at least one numeric observation');
        return;
      }
      const result = jonckheereTerpstra(buckets);
      if (!result) {
        onError('The test could not be computed: check the group ordering and group sizes');
        return;
      }
      const names = groupLevels;
      const tables = jonckheereTables(result, buckets, names, ciLevel);
      onOutput(
        <div className="mb-6">
          <p className="text-[10px] text-text3 font-mono mb-3">
            {`Jonckheere–Terpstra · ${grid.cols[outcome]?.name} per ${grid.cols[group]?.name} · ordine: ${names.join(' < ')}`}
          </p>
          <ResultTables specs={tables} />
        </div>,
        jonckheereReport(tables, names, ciLevel)
      );
    };

    const run = () => {
      if (mode === 'friedman') runFriedman();
      else if (mode === 'mcnemar') runMcNemar();
      else if (mode === 'cochran') runCochran();
      else runJonckheere();
    };

    useImperativeHandle(ref, () => ({ run }));

    const numericColumns = grid.cols
      .map((_, index) => index)
      .filter((index) => isNumericColumn(grid, index));
    const binaryColumns = grid.cols
      .map((_, index) => index)
      .filter((index) => isBinaryColumn(grid, index));
    const listColumns = mode === 'friedman' ? numericColumns : mode === 'cochran' ? binaryColumns : [];

    return (
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Test</label>
          <select className={inputClass} value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
            <option value="friedman">Friedman + Nemenyi</option>
            <option value="mcnemar">McNemar</option>
            <option value="cochran">Cochran Q</option>
            <option value="jonckheere">Jonckheere–Terpstra</option>
          </select>
        </div>

        {(mode === 'friedman' || mode === 'cochran') && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">
              {mode === 'friedman' ? 'Numeric measures (≥ 3)' : 'Binary conditions (≥ 3)'}
            </label>
            <div className="bg-surface3 border border-border2 rounded p-2 min-w-[220px] max-h-[120px] overflow-auto scrollbar">
              {listColumns.length === 0 && (
                <p className="text-[10px] text-text3 italic">No suitable columns</p>
              )}
              {listColumns.map((index) => (
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
        )}

        {mode === 'mcnemar' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">First measure</label>
              <select className={inputClass} value={left} onChange={(event) => setLeft(Number(event.target.value))}>
                {grid.cols.map((column, index) => (
                  <option key={index} value={index}>{column.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Second measure</label>
              <select className={inputClass} value={right} onChange={(event) => setRight(Number(event.target.value))}>
                {grid.cols.map((column, index) => (
                  <option key={index} value={index}>{column.name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {mode === 'jonckheere' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Numeric outcome</label>
              <select className={inputClass} value={outcome} onChange={(event) => setOutcome(Number(event.target.value))}>
                {grid.cols.map((column, index) => (
                  <option key={index} value={index}>{column.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Ordered groups (2–10)</label>
              <div className="flex items-center gap-1">
                <select className={inputClass} value={group} onChange={(event) => setGroup(Number(event.target.value))}>
                  {groupColumnIndexes(grid).map((index) => (
                    <option key={index} value={index}>{grid.cols[index]?.name}</option>
                  ))}
                </select>
                <LevelsEditor
                  grid={grid}
                  column={group}
                  onLevels={onLevels}
                  onRecode={onRecode}
                  label="Modifica livelli"
                  className={LEVELS_BUTTON_CLASS}
                />
              </div>
            </div>
            <p className="text-[10px] text-text3 max-w-[220px] self-end pb-1">
              Il test usa l’ordine alfabetico/numerico dei livelli del gruppo.
            </p>
          </>
        )}
      </div>
    );
  }
);
