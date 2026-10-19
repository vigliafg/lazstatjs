import React, { forwardRef, useImperativeHandle, useState } from 'react';
import {
  VictoryAxis,
  VictoryChart,
  VictoryGroup,
  VictoryLine,
  VictoryScatter,
  VictoryTheme,
} from 'victory';
import { factorialCells, factorialReport, factorialTables } from '../stats/factorial';
import { ResultTables } from '../components/ResultTable';
import { parseNum } from '../stats/core';
import { analysisRows, groupColumnIndexes, type CategoryLevel, type GridData } from '../grid/types';
import { LevelsEditor, LEVELS_BUTTON_CLASS } from '../grid/LevelsEditor';
import type { ReportSpec } from '../stats/report';

export interface FactorialAnovaHandle {
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

const COLORS = ['#4f9cf9', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#38bdf8'];

/**
 * Picks a response and two categorical-looking factors, preferring a pair
 * whose combinations are all present. When the pair is incomplete the
 * interaction is switched off, because the full model would not be estimable.
 */
const defaultSelection = (grid: Props['grid']) => {
  const distinct = grid.cols.map((_, index) =>
    new Set(grid.rows.map(row => String(row[index] ?? '').trim()).filter(value => value !== '')).size
  );
  const candidates = groupColumnIndexes(grid).filter((index) => distinct[index] >= 2 && distinct[index] <= 8);

  const complete = (a: number, b: number): boolean => {
    const seen = new Set<string>();
    grid.rows.forEach(row => {
      const left = String(row[a] ?? '').trim();
      const right = String(row[b] ?? '').trim();
      if (left !== '' && right !== '') seen.add(`${left}|${right}`);
    });
    return seen.size === distinct[a] * distinct[b];
  };

  let factorA = candidates[0] ?? 1;
  let factorB = candidates.find(index => index !== factorA) ?? 0;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (complete(candidates[i], candidates[j])) {
        factorA = candidates[i];
        factorB = candidates[j];
        i = candidates.length;
        break;
      }
    }
  }

  const response = grid.cols.findIndex(
    (_, index) => index !== factorA && index !== factorB && distinct[index] > 2
  );

  return {
    response: response >= 0 ? response : 0,
    factorA,
    factorB,
    interaction: complete(factorA, factorB),
  };
};

export const FactorialAnovaAnalysis = forwardRef<FactorialAnovaHandle, Props>(
  ({ grid, onLevels, onRecode, ciLevel, onOutput, onError }, ref) => {
    const [defaults] = useState(() => defaultSelection(grid));
    const [response, setResponse] = useState(defaults.response);
    const [factorA, setFactorA] = useState(defaults.factorA);
    const [factorB, setFactorB] = useState(defaults.factorB);
    const [interaction, setInteraction] = useState(defaults.interaction);

    const run = () => {
      if (factorA === factorB) {
        onError('Choose two different factors');
        return;
      }
      if (response === factorA || response === factorB) {
        onError('The response must be different from the two factors');
        return;
      }

      const responseValues: number[] = [];
      const labelsA: string[] = [];
      const labelsB: string[] = [];
      analysisRows(grid, [factorA, factorB]).forEach(row => {
        const value = parseNum(row[response]);
        if (!Number.isFinite(value)) return;
        responseValues.push(value);
        labelsA.push(String(row[factorA] ?? '').trim());
        labelsB.push(String(row[factorB] ?? '').trim());
      });

      if (responseValues.length < 4) {
        onError('Not enough valid rows for the selected response');
        return;
      }

      const options = {
        response: responseValues,
        factorA: labelsA,
        factorB: labelsB,
        responseName: grid.cols[response]?.name ?? 'Y',
        aName: grid.cols[factorA]?.name ?? 'Factor A',
        bName: grid.cols[factorB]?.name ?? 'Factor B',
        level: ciLevel,
        interaction,
      };

      const tables = factorialTables(options);
      if (tables.length === 0) {
        onError(
          'The design is not estimable: some combination of the two factors has no observations. Include the interaction only when every cell is populated.'
        );
        return;
      }

      const cells = factorialCells(options);
      const bLevels = Array.from(new Set(cells.map(cell => cell.b))).sort();
      const aLevels = Array.from(new Set(cells.map(cell => cell.a))).sort();
      const plotGroups = aLevels.map((level, index) => ({
        level,
        color: COLORS[index % COLORS.length],
        data: bLevels
          .map((b, bIndex) => {
            const cell = cells.find(item => item.a === level && item.b === b);
            return { x: bIndex, y: cell?.mean ?? NaN };
          })
          // Cells with no observations are simply not drawn instead of passing NaN to Victory.
          .filter(point => Number.isFinite(point.y)),
      }));

      onOutput(
        <div className="mb-6">
          <ResultTables specs={tables} />
          <section className="mb-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
              <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider">
                Interaction plot
              </h3>
              <span className="text-[10px] text-text3 font-mono">
                {`${grid.cols[factorA]?.name} × ${grid.cols[factorB]?.name}`}
              </span>
            </div>
            <div className="h-[280px] w-full bg-surface3/30 rounded p-2">
              <VictoryChart theme={VictoryTheme.material} padding={{ top: 15, bottom: 55, left: 65, right: 25 }}>
                <VictoryAxis
                  tickValues={bLevels.map((_, index) => index)}
                  tickFormat={(value: number) => bLevels[value] ?? ''}
                  label={grid.cols[factorB]?.name}
                  style={{
                    axis: { stroke: '#333' },
                    axisLabel: { fill: '#888', fontSize: 10, padding: 32 },
                    tickLabels: { fill: '#888', fontSize: 9 },
                    grid: { stroke: '#222' },
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  label="Media"
                  style={{
                    axis: { stroke: '#333' },
                    axisLabel: { fill: '#888', fontSize: 10, padding: 40 },
                    tickLabels: { fill: '#888', fontSize: 9 },
                    grid: { stroke: '#222' },
                  }}
                />
                {plotGroups.map(group => (
                  <VictoryGroup key={group.level} data={group.data}>
                    <VictoryLine style={{ data: { stroke: group.color, strokeWidth: 2 } }} />
                    <VictoryScatter style={{ data: { fill: group.color, size: 3.5 } }} />
                  </VictoryGroup>
                ))}
              </VictoryChart>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
              {plotGroups.map(group => (
                <span key={group.level} className="flex items-center gap-1.5 text-[10px] text-text3 font-mono">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: group.color }} />
                  {`${grid.cols[factorA]?.name} = ${group.level}`}
                </span>
              ))}
            </div>
          </section>
        </div>,
        factorialReport(tables, ciLevel)
      );
    };

    useImperativeHandle(ref, () => ({ run }));

    return (
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Response (Y)</label>
          <select
            className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
            value={response}
            onChange={e => setResponse(parseInt(e.target.value, 10))}
          >
            {grid.cols.map((column, index) => (
              <option key={index} value={index}>
                {column.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Factor A</label>
          <div className="flex items-center gap-1">
            <select
              className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
              value={factorA}
              onChange={e => setFactorA(parseInt(e.target.value, 10))}
            >
              {groupColumnIndexes(grid).map((index) => (
                <option key={index} value={index}>
                  {grid.cols[index]?.name}
                </option>
              ))}
            </select>
            <LevelsEditor
              grid={grid}
              column={factorA}
              onLevels={onLevels}
              onRecode={onRecode}
              label="Modifica livelli"
              className={LEVELS_BUTTON_CLASS}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Factor B</label>
          <div className="flex items-center gap-1">
            <select
              className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
              value={factorB}
              onChange={e => setFactorB(parseInt(e.target.value, 10))}
            >
              {groupColumnIndexes(grid).map((index) => (
                <option key={index} value={index}>
                  {grid.cols[index]?.name}
                </option>
              ))}
            </select>
            <LevelsEditor
              grid={grid}
              column={factorB}
              onLevels={onLevels}
              onRecode={onRecode}
              label="Modifica livelli"
              className={LEVELS_BUTTON_CLASS}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Model</label>
          <label className="flex items-center gap-1.5 text-[11px] text-text2 hover:text-text cursor-pointer pt-1.5">
            <input
              type="checkbox"
              className="accent-accent"
              checked={interaction}
              onChange={e => setInteraction(e.target.checked)}
            />
            Include A × B interaction
          </label>
        </div>
      </div>
    );
  }
);

FactorialAnovaAnalysis.displayName = 'FactorialAnovaAnalysis';
