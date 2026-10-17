import React, { forwardRef, useImperativeHandle, useState } from 'react';
import {
  VictoryAxis,
  VictoryChart,
  VictoryLine,
  VictoryScatter,
  VictoryTheme,
} from 'victory';
import { coxReport, coxTables, fitCox } from '../stats/cox';
import { ResultTables } from '../components/ResultTable';
import { parseNum } from '../stats/core';
import type { ReportSpec } from '../stats/report';

export interface CoxHandle {
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

interface EncodedCovariate {
  name: string;
  values: number[];
  error?: string;
}

const columnStrings = (grid: { rows: string[][] }, index: number): string[] =>
  grid.rows.map(row => String(row[index] ?? '').trim());

const defaultTime = (grid: { cols: { name: string }[]; rows: string[][] }): number => {
  for (let index = 0; index < grid.cols.length; index++) {
    const values = columnStrings(grid, index).filter(value => value !== '');
    if (values.length >= 3 && values.every(value => Number.isFinite(parseNum(value)) && parseNum(value) >= 0)) {
      return index;
    }
  }
  return 0;
};

const defaultEvent = (grid: { cols: { name: string }[]; rows: string[][] }): number => {
  for (let index = grid.cols.length - 1; index >= 0; index--) {
    const levels = new Set(columnStrings(grid, index).filter(value => value !== ''));
    if (levels.size === 2) return index;
  }
  return Math.min(1, grid.cols.length - 1);
};

const defaultCovariates = (grid: { cols: { name: string }[]; rows: string[][] }): number[] => {
  const time = defaultTime(grid);
  const event = defaultEvent(grid);
  const numeric = grid.cols
    .map((_, index) => index)
    .filter(index => {
      const values = columnStrings(grid, index).filter(value => value !== '');
      return values.length > 0 && values.every(value => Number.isFinite(parseNum(value)));
    });
  const candidate = numeric.find(index => index !== time && index !== event);
  if (candidate !== undefined) return [candidate];
  const fallback = numeric[0];
  return fallback === undefined ? [] : [fallback];
};

const numericShare = (values: string[]): number => {
  if (values.length === 0) return 0;
  const parsed = values.filter(value => Number.isFinite(parseNum(value))).length;
  return parsed / values.length;
};

/** Numeric columns stay numeric; small categorical columns become dummies. */
const encodeColumn = (
  rows: string[][],
  index: number,
  name: string
): EncodedCovariate[] => {
  const raw = rows.map(row => String(row[index] ?? '').trim());
  const present = raw.filter(value => value !== '');
  if (present.length === 0) return [];

  if (numericShare(present) >= 0.8) {
    return [{ name, values: raw.map(value => (value === '' ? NaN : parseNum(value))) }];
  }

  const levels = Array.from(new Set(present)).sort();
  if (levels.length > 4) {
    return [{ name, values: [], error: `"${name}" ha ${levels.length} livelli: usa una codifica manuale` }];
  }
  return levels.slice(1).map(level => ({
    name: `${name} = ${level}`,
    values: raw.map(value => (value === '' ? NaN : value === level ? 1 : 0)),
  }));
};

export const CoxAnalysis = forwardRef<CoxHandle, Props>(
  ({ grid, ciLevel, onOutput, onError }, ref) => {
    const [timeVariable, setTimeVariable] = useState(() => defaultTime(grid));
    const [eventVariable, setEventVariable] = useState(() => defaultEvent(grid));
    const [covariates, setCovariates] = useState<number[]>(() => defaultCovariates(grid));

    const toggle = (index: number) => {
      setCovariates(previous =>
        previous.includes(index) ? previous.filter(item => item !== index) : [...previous, index]
      );
    };

    const run = () => {
      if (covariates.length === 0) {
        onError('Select at least one covariate');
        return;
      }
      if (covariates.includes(timeVariable) || covariates.includes(eventVariable)) {
        onError('Time and event columns cannot be used as covariates');
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

      const encoded: EncodedCovariate[] = [];
      for (const index of covariates) {
        const columns = encodeColumn(grid.rows, index, grid.cols[index]?.name ?? `X${index + 1}`);
        const problem = columns.find(column => column.error);
        if (problem?.error) {
          onError(problem.error);
          return;
        }
        encoded.push(...columns);
      }
      if (encoded.length === 0) {
        onError('The selected covariates contain no usable values');
        return;
      }

      const times: number[] = [];
      const events: number[] = [];
      const covariateValues: number[][] = encoded.map(() => []);
      grid.rows.forEach((row, rowIndex) => {
        const time = parseNum(row[timeVariable]);
        const label = String(row[eventVariable] ?? '').trim();
        if (!Number.isFinite(time) || time < 0 || label === '') return;
        const values = encoded.map(column => column.values[rowIndex]);
        if (values.some(value => !Number.isFinite(value))) return;
        times.push(time);
        events.push(label === eventLevels[1] ? 1 : 0);
        values.forEach((value, index) => covariateValues[index].push(value));
      });

      if (times.length < encoded.length + 3) {
        onError('Not enough complete rows: time, event and all covariates must be present');
        return;
      }

      const fit = fitCox({
        time: times,
        event: events,
        covariates: encoded.map((column, index) => ({ name: column.name, values: covariateValues[index] })),
        level: ciLevel,
      });

      if (!fit) {
        onError('The Cox model could not be estimated: check for constant covariates or too few events');
        return;
      }

      const tables = coxTables(fit, ciLevel);

      const usable = fit.coefficients.filter(
        coefficient =>
          Number.isFinite(coefficient.hr) &&
          Number.isFinite(coefficient.lo) &&
          Number.isFinite(coefficient.hi)
      );
      const low = usable.length > 0 ? Math.min(1, ...usable.map(coefficient => coefficient.lo)) : 0.5;
      const high = usable.length > 0 ? Math.max(1, ...usable.map(coefficient => coefficient.hi)) : 2;
      const span = high > low ? high - low : Math.max(0.5, Math.abs(high) * 0.2);
      const forestData = fit.coefficients.map((coefficient, index) => ({
        term: coefficient.term,
        y: fit.coefficients.length - 1 - index,
        hr: coefficient.hr,
        lo: coefficient.lo,
        hi: coefficient.hi,
        usable:
          Number.isFinite(coefficient.hr) &&
          Number.isFinite(coefficient.lo) &&
          Number.isFinite(coefficient.hi),
      }));

      onOutput(
        <div className="mb-6">
          <p className="text-[10px] text-text3 font-mono mb-3">
            {`Time: ${grid.cols[timeVariable]?.name} · event: ${grid.cols[eventVariable]?.name} = "${eventLevels[1]}" · ${times.length} observations · ${fit.events} events`}
          </p>
          <ResultTables specs={tables} />

          <section className="mb-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
              <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider">
                Hazard ratio per covariata
              </h3>
              <span className="text-[10px] text-text3 font-mono">{`IC ${ciLevel}% · scala lineare`}</span>
            </div>
            <div className="h-[260px] w-full bg-surface3/30 rounded p-2">
              <VictoryChart
                theme={VictoryTheme.material}
                padding={{ top: 15, bottom: 55, left: 120, right: 30 }}
                domain={{ x: [low - span * 0.08, high + span * 0.08], y: [-0.5, fit.coefficients.length - 0.5] }}
              >
                <VictoryAxis
                  label="Hazard ratio"
                  style={{
                    axis: { stroke: '#333' },
                    axisLabel: { fill: '#888', fontSize: 10, padding: 32 },
                    tickLabels: { fill: '#888', fontSize: 9 },
                    grid: { stroke: '#222' },
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  tickValues={forestData.map(point => point.y)}
                  tickFormat={value => {
                    const point = forestData.find(item => item.y === value);
                    return point ? point.term : '';
                  }}
                  style={{
                    axis: { stroke: '#333' },
                    tickLabels: { fill: '#888', fontSize: 9 },
                    grid: { stroke: 'transparent' },
                  }}
                />
                <VictoryLine
                  data={[
                    { x: 1, y: -0.5 },
                    { x: 1, y: fit.coefficients.length - 0.5 },
                  ]}
                  style={{ data: { stroke: '#f87171', strokeDasharray: '4,4', strokeWidth: 1 } }}
                />
                {forestData.filter(point => point.usable).map(point => (
                  <VictoryLine
                    key={`ci-${point.term}`}
                    data={[
                      { x: point.lo, y: point.y },
                      { x: point.hi, y: point.y },
                    ]}
                    style={{ data: { stroke: '#4f9cf9', strokeWidth: 2 } }}
                  />
                ))}
                <VictoryScatter
                  data={forestData
                    .filter(point => point.usable)
                    .map(point => ({ x: point.hr, y: point.y }))}
                  style={{ data: { fill: '#fbbf24', size: 4 } }}
                />
              </VictoryChart>
            </div>
            <p className="text-[10px] text-text3 mt-1">
              Punto: stima dell’HR. Segmento: intervallo di confidenza. Linea tratteggiata: HR = 1, cioè nessun
              effetto. Il grafico usa una scala lineare, quindi gli HR protettivi sono compressi vicino allo zero.
              {fit.separation
                ? ' Con stime instabili gli intervalli non finiti sono omessi dal grafico.'
                : ''}
            </p>
          </section>
        </div>,
        coxReport(tables, ciLevel)
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
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Covariates (X)</label>
          <div className="bg-surface3 border border-border2 rounded p-2 min-w-[200px] max-h-[110px] overflow-auto scrollbar">
            {grid.cols.map((column, index) => (
              <label
                key={index}
                className="flex items-center gap-2 text-[11px] text-text2 hover:text-text cursor-pointer py-0.5"
              >
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={covariates.includes(index)}
                  disabled={index === timeVariable || index === eventVariable}
                  onChange={() => toggle(index)}
                />
                {column.name}
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

CoxAnalysis.displayName = 'CoxAnalysis';
