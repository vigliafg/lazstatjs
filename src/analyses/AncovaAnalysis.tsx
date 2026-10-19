import React, { forwardRef, useImperativeHandle, useState } from 'react';
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryGroup,
  VictoryLegend,
  VictoryTheme,
} from 'victory';
import { ancovaReport, ancovaTables } from '../stats/ancova';
import { ResultTables } from '../components/ResultTable';
import { parseNum } from '../stats/core';
import {
  analysisRows,
  groupColumnIndexes,
  levelLabel,
  orderedColumnLevels,
  referenceFirst,
  type CategoryLevel,
  type GridData,
} from '../grid/types';
import { LevelsEditor, LEVELS_BUTTON_CLASS } from '../grid/LevelsEditor';
import type { ReportSpec } from '../stats/report';

export interface AncovaHandle {
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

const distinctValues = (grid: Props['grid'], index: number): Set<string> =>
  new Set(
    grid.rows
      .map((row) => String(row[index] ?? '').trim())
      .filter((value) => value !== '')
  );

const defaultSelection = (grid: Props['grid']) => {
  const distinct = grid.cols.map((_, index) => distinctValues(grid, index).size);
  const factorCandidates = groupColumnIndexes(grid);
  // Prefer a genuine categorical column, then fall back to a numeric code.
  const factor =
    factorCandidates.find((index) => !isNumericColumn(grid, index)) ??
    factorCandidates[0] ??
    0;
  const response =
    grid.cols.findIndex(
      (_, index) => index !== factor && isNumericColumn(grid, index) && distinct[index] > 2
    ) ?? 0;
  const covariates = grid.cols
    .map((_, index) => index)
    .filter((index) => index !== response && index !== factor && isNumericColumn(grid, index))
    .slice(0, 2);
  return {
    response: response >= 0 ? response : 0,
    factor,
    covariates,
  };
};

export const AncovaAnalysis = forwardRef<AncovaHandle, Props>(
  ({ grid, onLevels, onRecode, ciLevel, onOutput, onError }, ref) => {
    const [defaults] = useState(() => defaultSelection(grid));
    const [response, setResponse] = useState(defaults.response);
    const [factor, setFactor] = useState(defaults.factor);
    const [covariates, setCovariates] = useState<number[]>(defaults.covariates);

    const numericColumns = grid.cols
      .map((_, index) => index)
      .filter((index) => isNumericColumn(grid, index));
    const factorColumns = groupColumnIndexes(grid);

    const toggleCovariate = (index: number) => {
      setCovariates((prev) =>
        prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index]
      );
    };

    const run = () => {
      if (response === factor) {
        onError('The response must be different from the factor');
        return;
      }
      const chosen = covariates.filter((index) => index !== response && index !== factor);
      if (chosen.length === 0) {
        onError('Select at least one numeric covariate');
        return;
      }

      const y: number[] = [];
      const levels: string[] = [];
      const covariateValues: number[][] = chosen.map(() => []);
      analysisRows(grid, [factor]).forEach((row) => {
        const value = parseNum(row[response]);
        const level = String(row[factor] ?? '').trim();
        if (!Number.isFinite(value) || level === '') return;
        const covs = chosen.map((index) => parseNum(row[index]));
        if (covs.some((cell) => !Number.isFinite(cell))) return;
        y.push(value);
        levels.push(level);
        covs.forEach((cell, index) => covariateValues[index].push(cell));
      });

      if (y.length < 4) {
        onError('Not enough complete rows for the selected response, factor and covariates');
        return;
      }
      const groups = new Set(levels);
      if (groups.size < 2) {
        onError('The factor needs at least two groups with complete data');
        return;
      }

      const responseName = grid.cols[response]?.name ?? 'Y';
      const factorName = grid.cols[factor]?.name ?? 'Fattore';
      const covariateNames = chosen.map((index) => grid.cols[index]?.name ?? `Cov${index + 1}`);
      const factorCol = grid.cols[factor];
      const declaredLevels = orderedColumnLevels(factorCol, grid.rows, factor).map((level) =>
        levelLabel(factorCol, level.value)
      );
      const referenceLabel = factorCol?.reference ? levelLabel(factorCol, factorCol.reference) : undefined;
      const options = {
        response: y,
        factor: levels,
        covariates: covariateValues,
        responseName,
        factorName,
        covariateNames,
        levels: referenceFirst(declaredLevels, referenceLabel),
        level: ciLevel,
      };

      const tables = ancovaTables(options);
      if (tables.length === 0) {
        onError(
          'The model is not estimable: check collinearity, group sizes and that there are more rows than parameters'
        );
        return;
      }

      const means = tables.find((table) => table.id === 'ancova-means')?.rows ?? [];
      const chartData = means.map((row, index) => ({
        x: index,
        group: String(row.group ?? ''),
        raw: Number(row.rawMean ?? NaN),
        adjusted: Number(row.adjusted ?? NaN),
      }));
      const domainX = chartData.map((point) => point.x);

      onOutput(
        <div className="mb-6">
          <p className="text-[10px] text-text3 font-mono mb-3">
            {`ANCOVA · ${responseName} ~ ${factorName} + ${covariateNames.join(' + ')} · ${levels.length} righe`}
          </p>
          <ResultTables specs={tables} />
          <section className="mb-6">
            <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider mb-2">
              Medie grezze e aggiustate
            </h3>
            <div className="h-[300px] w-full bg-surface3/30 rounded p-2">
              <VictoryChart
                theme={VictoryTheme.material}
                domainPadding={{ x: 28 }}
                padding={{ top: 45, bottom: 55, left: 60, right: 20 }}
              >
                <VictoryLegend
                  x={60}
                  y={10}
                  orientation="horizontal"
                  gutter={18}
                  style={{
                    labels: { fill: '#aaa', fontSize: 9 },
                    data: { strokeWidth: 0 },
                  }}
                  data={[
                    { name: 'Grezza', symbol: { fill: '#4f9cf9' } },
                    { name: 'Aggiustata', symbol: { fill: '#34d399' } },
                  ]}
                />
                <VictoryAxis
                  tickValues={domainX}
                  tickFormat={(value: number) => chartData[value]?.group ?? ''}
                  style={AXIS_STYLE}
                />
                <VictoryAxis
                  dependentAxis
                  label={responseName}
                  style={AXIS_STYLE}
                />
                <VictoryGroup offset={18} colorScale={['#4f9cf9', '#34d399']}>
                  <VictoryBar
                    data={chartData.map((point) => ({ x: point.x, y: point.raw }))}
                    labels={({ datum }) => (Number.isFinite(datum.y) ? datum.y.toFixed(2) : '')}
                    style={{ data: { width: 16 } }}
                  />
                  <VictoryBar
                    data={chartData.map((point) => ({ x: point.x, y: point.adjusted }))}
                    labels={({ datum }) => (Number.isFinite(datum.y) ? datum.y.toFixed(2) : '')}
                    style={{ data: { width: 16 } }}
                  />
                </VictoryGroup>
              </VictoryChart>
            </div>
            <p className="text-[10px] text-text3 mt-1">
              Le barre verdi sono le medie aggiustate alla media delle covariate: è questa la
              differenza che l’ANCOVA testa.
            </p>
          </section>
        </div>,
        ancovaReport(tables, factorName, covariateNames, ciLevel)
      );
    };

    useImperativeHandle(ref, () => ({ run }));

    return (
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">
            Response (Y)
          </label>
          <select
            className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
            value={response}
            onChange={(event) => setResponse(parseInt(event.target.value, 10))}
          >
            {numericColumns.map((index) => (
              <option key={index} value={index}>
                {grid.cols[index]?.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">
            Factor
          </label>
          <div className="flex items-center gap-1">
            <select
              className="bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[120px]"
              value={factor}
              onChange={(event) => setFactor(parseInt(event.target.value, 10))}
            >
              {factorColumns.map((index) => (
                <option key={index} value={index}>
                  {grid.cols[index]?.name}
                </option>
              ))}
            </select>
            <LevelsEditor
              grid={grid}
              column={factor}
              onLevels={onLevels}
              onRecode={onRecode}
              label="Modifica livelli"
              className={LEVELS_BUTTON_CLASS}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">
            Covariates (≥ 1)
          </label>
          <div className="bg-surface3 border border-border2 rounded p-2 min-w-[220px] max-h-[120px] overflow-auto scrollbar">
            {numericColumns.filter((index) => index !== response && index !== factor).length === 0 && (
              <p className="text-[10px] text-text3 italic">No numeric covariates</p>
            )}
            {numericColumns
              .filter((index) => index !== response && index !== factor)
              .map((index) => (
                <label key={index} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={covariates.includes(index)}
                    onChange={() => toggleCovariate(index)}
                  />
                  <span className="text-[11px] text-text2">{grid.cols[index]?.name}</span>
                  <span className="text-[9px] text-text3 font-mono">{grid.cols[index]?.type}</span>
                </label>
              ))}
          </div>
        </div>

        <p className="text-[10px] text-text3 max-w-[380px] self-end pb-1">
          Confronta le medie dei gruppi rimuovendo l’effetto lineare delle covariate. Il test di
          omogeneità delle pendenze e i confronti Holm sulle medie aggiustate sono automatici.
        </p>
      </div>
    );
  }
);

AncovaAnalysis.displayName = 'AncovaAnalysis';
