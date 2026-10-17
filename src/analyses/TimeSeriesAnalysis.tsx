import React, { forwardRef, useImperativeHandle, useState } from 'react';
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryLine,
  VictoryScatter,
  VictoryTheme,
} from 'victory';
import { timeSeriesReport, timeSeriesTables } from '../stats/timeseries';
import { arimaAnalysis } from '../stats/arima';
import { ResultTables } from '../components/ResultTable';
import { parseNum } from '../stats/core';
import type { ReportSpec } from '../stats/report';

export interface TimeSeriesHandle {
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

const axisStyle = {
  axis: { stroke: '#333' },
  axisLabel: { fill: '#888', fontSize: 10, padding: 30 },
  tickLabels: { fill: '#888', fontSize: 9 },
  grid: { stroke: '#222' },
};

export const TimeSeriesAnalysis = forwardRef<TimeSeriesHandle, Props>(
  ({ grid, ciLevel, onOutput, onError }, ref) => {
    const [variable, setVariable] = useState(0);
    const [period, setPeriod] = useState(0);
    const [horizon, setHorizon] = useState(12);
    const [differenceMode, setDifferenceMode] = useState('auto');
    const [seasonalDifferenceMode, setSeasonalDifferenceMode] = useState('auto');

    const run = () => {
      const values = grid.rows
        .map(row => parseNum(row[variable]))
        .filter(value => Number.isFinite(value));

      if (values.length < 5) {
        onError('Select a numeric column with at least five observations in time order');
        return;
      }
      if (period < 0 || period === 1) {
        onError('The seasonal period must be 0 (none) or at least 2');
        return;
      }
      if (horizon < 1) {
        onError('The forecast horizon must be at least 1');
        return;
      }

      const steps = Math.max(1, Math.min(horizon, 60));
      const arima = arimaAnalysis({
        values,
        period,
        horizon: steps,
        level: ciLevel,
        d: differenceMode === 'auto' ? 'auto' : Number(differenceMode),
        D: seasonalDifferenceMode === 'auto' ? 'auto' : Number(seasonalDifferenceMode),
      });

      const baseTables = timeSeriesTables({ values, period, horizon: steps, level: ciLevel });
      if (baseTables.length === 0) {
        onError('The series is too short for this analysis');
        return;
      }

      // The ARIMA point forecasts supersede the simple-model forecast table.
      const tables = arima.fit
        ? [...baseTables.filter(spec => spec.id !== 'ts-forecast'), ...arima.tables]
        : baseTables;

      const acfRows = (baseTables.find(spec => spec.id === 'ts-acf')?.rows ?? []).filter(
        row => Number(row.lag) >= 1
      );
      const acfData = acfRows.map(row => ({ x: Number(row.lag), y: Number(row.acf) }));
      const band = Number(acfRows[0]?.hi ?? 0);
      const maxLag = Math.max(1, ...acfRows.map(row => Number(row.lag)));

      const simpleForecastRows = baseTables.find(spec => spec.id === 'ts-forecast')?.rows ?? [];
      const seriesData = values.map((value, index) => ({ x: index + 1, y: value }));
      const simpleForecastData = [
        { x: values.length, y: values[values.length - 1] },
        ...simpleForecastRows.map(row => ({ x: Number(row.step), y: Number(row.forecast) })),
      ];

      const arimaForecastRows = tables.find(spec => spec.id === 'ts-arima-forecast')?.rows ?? [];
      const arimaModelLabel = String(
        tables
          .find(spec => spec.id === 'ts-arima-model')
          ?.rows.find(row => String(row.metric) === 'Modello')?.value ?? ''
      );
      const arimaForecastData = [
        { x: values.length, y: values[values.length - 1] },
        ...arimaForecastRows.map(row => ({ x: Number(row.step), y: Number(row.forecast) })),
      ];
      const arimaUpper = arimaForecastRows.map(row => ({ x: Number(row.step), y: Number(row.hi) }));
      const arimaLower = arimaForecastRows.map(row => ({ x: Number(row.step), y: Number(row.lo) }));

      onOutput(
        <div className="mb-6">
          <p className="text-[10px] text-text3 font-mono mb-3">
            {`Series: ${grid.cols[variable]?.name ?? 'Y'} · ${values.length} observations · period ${period >= 2 ? period : 'none'}`}
          </p>
          <ResultTables specs={tables} />

          <section className="mb-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
              <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider">
                Autocorrelazione
              </h3>
              <span className="text-[10px] text-text3 font-mono">{`banda ±${band.toFixed(3)}`}</span>
            </div>
            <div className="h-[240px] w-full bg-surface3/30 rounded p-2">
              <VictoryChart theme={VictoryTheme.material} padding={{ top: 15, bottom: 45, left: 55, right: 20 }}>
                <VictoryAxis
                  label="Lag"
                  tickValues={acfRows.map(row => Number(row.lag))}
                  style={axisStyle}
                />
                <VictoryAxis dependentAxis style={axisStyle} />
                <VictoryLine
                  data={[
                    { x: 0.5, y: band },
                    { x: maxLag + 0.5, y: band },
                  ]}
                  style={{ data: { stroke: '#f87171', strokeDasharray: '4,4', strokeWidth: 1 } }}
                />
                <VictoryLine
                  data={[
                    { x: 0.5, y: -band },
                    { x: maxLag + 0.5, y: -band },
                  ]}
                  style={{ data: { stroke: '#f87171', strokeDasharray: '4,4', strokeWidth: 1 } }}
                />
                <VictoryBar data={acfData} style={{ data: { fill: '#4f9cf9' } }} barRatio={0.6} />
              </VictoryChart>
            </div>
            <p className="text-[10px] text-text3 mt-1">
              Le barre oltre le linee tratteggiate indicano autocorrelazione non attribuibile al caso.
            </p>
          </section>

          {arimaForecastRows.length > 0 && (
            <section className="mb-6">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider">
                  Previsioni ARIMA / SARIMA
                </h3>
                <span className="text-[10px] text-text3 font-mono">
                  {`${arimaModelLabel} · ${arimaForecastRows.length} passi · IC ${ciLevel}%`}
                </span>
              </div>
              <div className="h-[300px] w-full bg-surface3/30 rounded p-2">
                <VictoryChart theme={VictoryTheme.material} padding={{ top: 15, bottom: 50, left: 65, right: 25 }}>
                  <VictoryAxis label="t" style={axisStyle} />
                  <VictoryAxis dependentAxis style={axisStyle} />
                  <VictoryLine data={seriesData} style={{ data: { stroke: '#4f9cf9', strokeWidth: 2 } }} />
                  <VictoryLine
                    data={arimaUpper}
                    style={{ data: { stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3,3' } }}
                  />
                  <VictoryLine
                    data={arimaLower}
                    style={{ data: { stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3,3' } }}
                  />
                  <VictoryLine
                    data={arimaForecastData}
                    style={{ data: { stroke: '#fbbf24', strokeWidth: 2, strokeDasharray: '5,4' } }}
                  />
                  <VictoryScatter data={seriesData} style={{ data: { fill: '#4f9cf9', size: 2 } }} />
                  <VictoryScatter
                    data={arimaForecastData.slice(1)}
                    style={{ data: { fill: '#fbbf24', size: 2.5 } }}
                  />
                </VictoryChart>
              </div>
              <p className="text-[10px] text-text3 mt-1">
                Blu: valori osservati. Giallo tratteggiato: previsione ARIMA. Grigio tratteggiato: limiti
                dell’intervallo di previsione al {ciLevel}%.
              </p>
            </section>
          )}

          {simpleForecastRows.length > 0 && (
            <section className="mb-6">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider">
                  Serie e previsioni (modello semplice)
                </h3>
                <span className="text-[10px] text-text3 font-mono">
                  {`${simpleForecastRows.length} passi previsti`}
                </span>
              </div>
              <div className="h-[300px] w-full bg-surface3/30 rounded p-2">
                <VictoryChart theme={VictoryTheme.material} padding={{ top: 15, bottom: 50, left: 65, right: 25 }}>
                  <VictoryAxis label="t" style={axisStyle} />
                  <VictoryAxis dependentAxis style={axisStyle} />
                  <VictoryLine data={seriesData} style={{ data: { stroke: '#4f9cf9', strokeWidth: 2 } }} />
                  <VictoryLine
                    data={simpleForecastData}
                    style={{ data: { stroke: '#fbbf24', strokeWidth: 2, strokeDasharray: '5,4' } }}
                  />
                  <VictoryScatter data={seriesData} style={{ data: { fill: '#4f9cf9', size: 2 } }} />
                  <VictoryScatter
                    data={simpleForecastData.slice(1)}
                    style={{ data: { fill: '#fbbf24', size: 2.5 } }}
                  />
                </VictoryChart>
              </div>
              <p className="text-[10px] text-text3 mt-1">
                Blu: valori osservati. Giallo tratteggiato: previsioni del modello semplice con l’RMSE più basso.
              </p>
            </section>
          )}
        </div>,
        timeSeriesReport(tables, ciLevel)
      );
    };

    useImperativeHandle(ref, () => ({ run }));

    return (
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Series (Y)</label>
          <select className={inputClass} value={variable} onChange={e => setVariable(parseInt(e.target.value, 10))}>
            {grid.cols.map((column, index) => (
              <option key={index} value={index}>
                {column.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Seasonal period</label>
          <input
            type="number"
            min="0"
            step="1"
            className={`${inputClass} w-24`}
            value={period}
            onChange={e => setPeriod(parseInt(e.target.value, 10))}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Forecast horizon</label>
          <input
            type="number"
            min="1"
            max="60"
            step="1"
            className={`${inputClass} w-24`}
            value={horizon}
            onChange={e => setHorizon(parseInt(e.target.value, 10))}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Differencing d</label>
          <select
            className={`${inputClass} w-28`}
            value={differenceMode}
            onChange={e => setDifferenceMode(e.target.value)}
            title="Regular differencing for the ARIMA model"
          >
            <option value="auto">Auto (ADF)</option>
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Seasonal D</label>
          <select
            className={`${inputClass} w-28`}
            value={seasonalDifferenceMode}
            onChange={e => setSeasonalDifferenceMode(e.target.value)}
            disabled={period < 2}
            title="Seasonal differencing; available when a seasonal period is set"
          >
            <option value="auto">Auto</option>
            <option value="0">0</option>
            <option value="1">1</option>
          </select>
        </div>
      </div>
    );
  }
);

TimeSeriesAnalysis.displayName = 'TimeSeriesAnalysis';
