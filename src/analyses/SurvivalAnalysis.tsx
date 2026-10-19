import React, { forwardRef, useImperativeHandle, useState } from 'react';
import {
  VictoryAxis,
  VictoryChart,
  VictoryLine,
  VictoryTheme,
} from 'victory';
import { survivalReport, survivalTables } from '../stats/survival';
import { ResultTables } from '../components/ResultTable';
import { parseNum } from '../stats/core';
import { analysisRows, groupColumnIndexes, type CategoryLevel, type GridData } from '../grid/types';
import { LevelsEditor, LEVELS_BUTTON_CLASS } from '../grid/LevelsEditor';
import type { ReportSpec } from '../stats/report';

export interface SurvivalHandle {
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

const inputClass =
  'bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]';
const COLORS = ['#4f9cf9', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#38bdf8'];

export const SurvivalAnalysis = forwardRef<SurvivalHandle, Props>(
  ({ grid, onLevels, onRecode, ciLevel, onOutput, onError }, ref) => {
    const [timeVariable, setTimeVariable] = useState(() => {
      for (let index = 0; index < grid.cols.length; index++) {
        const values = grid.rows.map(row => parseNum(row[index])).filter(value => Number.isFinite(value));
        if (values.length > 0 && values.every(value => value >= 0)) return index;
      }
      return 0;
    });
    const [eventVariable, setEventVariable] = useState(() => {
      for (let index = grid.cols.length - 1; index >= 0; index--) {
        const levels = new Set(
          grid.rows.map(row => String(row[index] ?? '').trim()).filter(value => value !== '')
        );
        if (levels.size === 2) return index;
      }
      return Math.min(1, grid.cols.length - 1);
    });
    const [groupVariable, setGroupVariable] = useState(-1);

    const run = () => {
      if (timeVariable === eventVariable) {
        onError('Time and event must be different columns');
        return;
      }

      const eventLevels = Array.from(
        new Set(
          grid.rows
            .map(row => String(row[eventVariable] ?? '').trim())
            .filter(value => value !== '')
        )
      ).sort();
      if (eventLevels.length !== 2) {
        onError('The event column needs exactly two values (for example 0/1 or no/yes)');
        return;
      }

      const rows: { time: number; event: number; group: string }[] = [];
      const rowsForAnalysis = groupVariable >= 0 ? analysisRows(grid, [groupVariable]) : grid.rows;
      rowsForAnalysis.forEach(row => {
        const time = parseNum(row[timeVariable]);
        const label = String(row[eventVariable] ?? '').trim();
        if (!Number.isFinite(time) || time < 0 || label === '') return;
        rows.push({
          time,
          event: label === eventLevels[1] ? 1 : 0,
          group: groupVariable >= 0 ? String(row[groupVariable] ?? '').trim() || 'All' : 'All',
        });
      });

      if (rows.length < 3) {
        onError('Not enough complete rows: time must be numeric and non-negative');
        return;
      }

      const tables = survivalTables({
        time: rows.map(row => row.time),
        event: rows.map(row => row.event),
        groups: rows.map(row => row.group),
        level: ciLevel,
      });

      if (tables.length === 0) {
        onError('The survival analysis needs at least three observations');
        return;
      }

      const kmRows = tables.find(spec => spec.id === 'surv-km')?.rows ?? [];
      const groups = Array.from(new Set(kmRows.map(row => String(row.group))));
      const curves = groups.map((group, index) => ({
        group,
        color: COLORS[index % COLORS.length],
        data: [
          { x: 0, y: 100 },
          ...kmRows
            .filter(row => String(row.group) === group)
            .map(row => ({ x: Number(row.time), y: Number(row.survival) * 100 })),
        ],
      }));

      onOutput(
        <div className="mb-6">
          <p className="text-[10px] text-text3 font-mono mb-3">
            {`Time: ${grid.cols[timeVariable]?.name} · event: ${grid.cols[eventVariable]?.name} = "${eventLevels[1]}" · ${rows.length} observations`}
          </p>
          <ResultTables specs={tables} />

          <section className="mb-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
              <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider">
                Curve di Kaplan–Meier
              </h3>
              <span className="text-[10px] text-text3 font-mono">{`CI ${ciLevel}%`}</span>
            </div>
            <div className="h-[300px] w-full bg-surface3/30 rounded p-2">
              <VictoryChart theme={VictoryTheme.material} padding={{ top: 15, bottom: 50, left: 65, right: 25 }} domain={{ y: [0, 100] }}>
                <VictoryAxis
                  label="Tempo"
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
                {curves.map(curve => (
                  <VictoryLine
                    key={curve.group}
                    data={curve.data}
                    interpolation="stepAfter"
                    style={{ data: { stroke: curve.color, strokeWidth: 2 } }}
                  />
                ))}
              </VictoryChart>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
              {curves.map(curve => (
                <span key={curve.group} className="flex items-center gap-1.5 text-[10px] text-text3 font-mono">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: curve.color }} />
                  {curve.group}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-text3 mt-1">
              Ogni gradino è un evento; i tratti piatti indicano che in quell’intervallo non ci sono stati eventi.
            </p>
          </section>
        </div>,
        survivalReport(tables, ciLevel)
      );
    };

    useImperativeHandle(ref, () => ({ run }));

    return (
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Time</label>
          <select className={inputClass} value={timeVariable} onChange={e => setTimeVariable(parseInt(e.target.value, 10))}>
            {grid.cols.map((column, index) => (
              <option key={index} value={index}>
                {column.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Event (0/1)</label>
          <select className={inputClass} value={eventVariable} onChange={e => setEventVariable(parseInt(e.target.value, 10))}>
            {grid.cols.map((column, index) => (
              <option key={index} value={index}>
                {column.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Group (optional)</label>
          <div className="flex items-center gap-1">
            <select className={inputClass} value={groupVariable} onChange={e => setGroupVariable(parseInt(e.target.value, 10))}>
              <option value={-1}>None</option>
              {groupColumnIndexes(grid).map((index) => (
                <option key={index} value={index}>
                  {grid.cols[index]?.name}
                </option>
              ))}
            </select>
            <LevelsEditor
              grid={grid}
              column={groupVariable}
              onLevels={onLevels}
              onRecode={onRecode}
              label="Modifica livelli"
              className={LEVELS_BUTTON_CLASS}
            />
          </div>
        </div>
      </div>
    );
  }
);

SurvivalAnalysis.displayName = 'SurvivalAnalysis';
