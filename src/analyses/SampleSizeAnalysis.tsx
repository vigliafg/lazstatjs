import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { VictoryAxis, VictoryChart, VictoryLine, VictoryScatter, VictoryTheme } from 'victory';
import { sampleSizeReport, sampleSizeTables, type SampleSizeDesign } from '../stats/samplesize';
import { ResultTables } from '../components/ResultTable';
import type { ReportSpec } from '../stats/report';

export interface SampleSizeHandle {
  run: () => void;
}

interface Props {
  ciLevel: number;
  onOutput: (node: React.ReactNode, report: ReportSpec | null) => void;
  onError: (message: string) => void;
}

const DESIGNS: { id: SampleSizeDesign; label: string }[] = [
  { id: 'twoMeans', label: 'Two independent means' },
  { id: 'oneMean', label: 'One mean' },
  { id: 'paired', label: 'Paired means' },
  { id: 'twoProportions', label: 'Two proportions' },
  { id: 'correlation', label: 'Correlation' },
  { id: 'anova', label: 'One-way ANOVA' },
];

const inputClass =
  'bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[110px]';
const labelClass = 'text-[10px] text-text3 font-mono uppercase tracking-widest';

export const SampleSizeAnalysis = forwardRef<SampleSizeHandle, Props>(
  ({ onOutput, onError }, ref) => {
    const [design, setDesign] = useState<SampleSizeDesign>('twoMeans');
    const [alpha, setAlpha] = useState(0.05);
    const [power, setPower] = useState(0.8);
    const [delta, setDelta] = useState(5);
    const [sd, setSd] = useState(10);
    const [p1, setP1] = useState(0.5);
    const [p2, setP2] = useState(0.3);
    const [r, setR] = useState(0.3);
    const [groups, setGroups] = useState(3);
    const [f, setF] = useState(0.25);
    const [margin, setMargin] = useState(0);

    const run = () => {
      const { tables, result } = sampleSizeTables({
        design,
        alpha,
        power,
        tails: 2,
        delta,
        sd,
        p1,
        p2,
        r,
        groups,
        f,
        margin: margin > 0 ? margin : undefined,
      });

      if (tables.length === 0 || !Number.isFinite(result.nPerGroup)) {
        onError('Effect size must be greater than zero and probabilities must be between 0 and 1');
        return;
      }

      const curve = tables.find(spec => spec.id === 'ss-curve')?.rows ?? [];
      const chartData = curve.map(row => ({ x: Number(row.n), y: Number(row.power) }));

      onOutput(
        <div className="mb-6">
          <ResultTables specs={tables} />
          <section className="mb-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
              <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider">
                Curva di potenza
              </h3>
              <span className="text-[10px] text-text3 font-mono">
                {`potenza ${Math.round(power * 100)}% · α = ${alpha}`}
              </span>
            </div>
            <div className="h-[260px] w-full bg-surface3/30 rounded p-2">
              <VictoryChart
                theme={VictoryTheme.material}
                padding={{ top: 15, bottom: 45, left: 60, right: 20 }}
                domain={{ y: [0, 100] }}
              >
                <VictoryAxis
                  label="n per gruppo"
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
                <VictoryLine
                  data={chartData}
                  style={{ data: { stroke: '#4f9cf9', strokeWidth: 2 } }}
                />
                <VictoryScatter
                  data={chartData}
                  style={{ data: { fill: '#34d399', size: 2.5 } }}
                />
              </VictoryChart>
            </div>
          </section>
        </div>,
        sampleSizeReport(tables, 95)
      );
    };

    useImperativeHandle(ref, () => ({ run }));

    const meanDesign = design === 'twoMeans' || design === 'oneMean' || design === 'paired';

    return (
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Design</label>
          <select className={inputClass} value={design} onChange={e => setDesign(e.target.value as SampleSizeDesign)}>
            {DESIGNS.map(item => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        {meanDesign && (
          <>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Difference (Δ)</label>
              <input type="number" step="any" className={`${inputClass} w-24`} value={delta} onChange={e => setDelta(parseFloat(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>SD</label>
              <input type="number" step="any" min="0" className={`${inputClass} w-24`} value={sd} onChange={e => setSd(parseFloat(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>CI half-width (optional)</label>
              <input type="number" step="any" min="0" className={`${inputClass} w-24`} value={margin} onChange={e => setMargin(parseFloat(e.target.value))} />
            </div>
          </>
        )}

        {design === 'twoProportions' && (
          <>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>P1</label>
              <input type="number" step="0.01" min="0" max="1" className={`${inputClass} w-24`} value={p1} onChange={e => setP1(parseFloat(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>P2</label>
              <input type="number" step="0.01" min="0" max="1" className={`${inputClass} w-24`} value={p2} onChange={e => setP2(parseFloat(e.target.value))} />
            </div>
          </>
        )}

        {design === 'correlation' && (
          <div className="flex flex-col gap-1">
            <label className={labelClass}>r</label>
            <input type="number" step="0.01" min="-0.99" max="0.99" className={`${inputClass} w-24`} value={r} onChange={e => setR(parseFloat(e.target.value))} />
          </div>
        )}

        {design === 'anova' && (
          <>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Groups (k)</label>
              <input type="number" min="2" step="1" className={`${inputClass} w-20`} value={groups} onChange={e => setGroups(parseInt(e.target.value, 10))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Cohen's f</label>
              <input type="number" step="0.01" min="0" className={`${inputClass} w-24`} value={f} onChange={e => setF(parseFloat(e.target.value))} />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1">
          <label className={labelClass}>α</label>
          <select className={inputClass} value={alpha} onChange={e => setAlpha(parseFloat(e.target.value))}>
            <option value={0.1}>0.10</option>
            <option value={0.05}>0.05</option>
            <option value={0.01}>0.01</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Power</label>
          <select className={inputClass} value={power} onChange={e => setPower(parseFloat(e.target.value))}>
            <option value={0.8}>80%</option>
            <option value={0.85}>85%</option>
            <option value={0.9}>90%</option>
            <option value={0.95}>95%</option>
          </select>
        </div>
      </div>
    );
  }
);

SampleSizeAnalysis.displayName = 'SampleSizeAnalysis';
