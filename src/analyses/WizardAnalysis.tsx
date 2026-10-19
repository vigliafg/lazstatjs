import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Compass, ArrowRight } from 'lucide-react';
import { ResultTables } from '../components/ResultTable';
import {
  WIZARD_GOALS,
  goalLabel,
  profileColumns,
  runWizard,
  type WizardGoal,
} from '../stats/wizard';
import type { ReportSpec } from '../stats/report';
import { analysisRows, groupColumnIndexes, type CategoryLevel, type GridData } from '../grid/types';
import { LevelsEditor, LEVELS_BUTTON_CLASS } from '../grid/LevelsEditor';

export interface WizardHandle {
  run: () => void;
}

interface Props {
  grid: GridData;
  onLevels: (column: number, levels: CategoryLevel[], reference?: string) => void;
  onRecode: (column: number, mapping: Record<string, string>) => void;
  ciLevel: number;
  onOutput: (node: React.ReactNode, report: ReportSpec | null) => void;
  onOpenAnalysis: (analysisId: string) => void;
}

const inputClass =
  'bg-surface3 border border-border2 text-text text-[11px] p-1.5 rounded min-w-[150px]';

const firstOfKind = (
  profiles: ReturnType<typeof profileColumns>,
  kind: 'numeric' | 'binary' | 'categorical',
  exclude: number[] = []
): number => {
  const found = profiles.find(profile => profile.kind === kind && !exclude.includes(profile.index));
  return found ? found.index : -1;
};

export const WizardAnalysis = forwardRef<WizardHandle, Props>(
  ({ grid, onLevels, onRecode, ciLevel, onOutput, onOpenAnalysis }, ref) => {
    // Group columns are profiled on their labels: the recommendation text and
    // every table then speak the user's language ("Controllo"), not the codes.
    const analysisGrid = useMemo(
      () => ({ ...grid, rows: analysisRows(grid, groupColumnIndexes(grid)) }),
      [grid]
    );
    const profiles = useMemo(() => profileColumns(analysisGrid.cols, analysisGrid.rows), [analysisGrid]);
    const [goal, setGoal] = useState<WizardGoal>('compare');
    const [outcome, setOutcome] = useState(() => {
      const numeric = firstOfKind(profiles, 'numeric');
      return numeric >= 0 ? numeric : firstOfKind(profiles, 'binary');
    });
    const [group, setGroup] = useState(() => {
      const binary = firstOfKind(profiles, 'binary', [outcome]);
      return binary >= 0 ? binary : firstOfKind(profiles, 'categorical', [outcome]);
    });
    const [second, setSecond] = useState(() => firstOfKind(profiles, 'numeric', [outcome]));
    const [paired, setPaired] = useState(false);

    const analysis = useMemo(
      () =>
        runWizard({
          columns: analysisGrid.cols,
          rows: analysisGrid.rows,
          selection: { goal, outcome, group, second, paired },
          level: ciLevel,
        }),
      [analysisGrid, goal, outcome, group, second, paired, ciLevel]
    );

    const { recommendation } = analysis;
    const needsOutcome = goal !== 'describe' && goal !== 'plan' && goal !== 'forecast';
    const needsGroup = goal === 'compare' || goal === 'survive';
    const needsSecond = goal === 'associate' || goal === 'predict';

    const run = () => {
      onOutput(
        <div className="mb-6">
          <p className="text-[10px] text-text3 font-mono mb-3">
            {`Domanda: ${goalLabel(goal)} · raccomandazione: ${recommendation.tabLabel} · ${recommendation.title}`}
          </p>
          <section className="mb-6 border border-border2 rounded-lg p-4 bg-surface3/30">
            <div className="flex items-center gap-2 mb-2">
              <Compass className="w-3.5 h-3.5 text-accent2" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-text3">
                Raccomandazione
              </span>
              <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-accent2/30 bg-accent2/10 text-accent2">
                {recommendation.tabLabel}
              </span>
            </div>
            <h3 className="text-[13px] text-text font-semibold mb-1">{recommendation.title}</h3>
            <p className="text-[11px] text-text2 leading-relaxed">{recommendation.headline}</p>
            <ul className="list-disc pl-4 mt-2 space-y-1">
              {recommendation.why.map((reason, index) => (
                <li key={index} className="text-[11px] text-text2 leading-relaxed">
                  {reason}
                </li>
              ))}
            </ul>
          </section>
          <ResultTables specs={analysis.tables} />
        </div>,
        analysis.report
      );
    };

    useImperativeHandle(ref, () => ({ run }));

    return (
      <div className="flex flex-col gap-3 w-full">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] text-text3 font-mono uppercase tracking-widest">
            1 · Che domanda vuoi rispondere?
          </span>
          <div className="flex flex-wrap gap-2">
            {WIZARD_GOALS.map(option => (
              <button
                key={option.id}
                onClick={() => setGoal(option.id)}
                className={`px-3 py-2 rounded border text-left transition-colors ${
                  goal === option.id
                    ? 'border-accent2 bg-accent2/10 text-text'
                    : 'border-border2 bg-surface3 text-text2 hover:text-text'
                }`}
                title={option.hint}
              >
                <span className="block text-[11px] font-semibold">{option.label}</span>
                <span className="block text-[9px] font-mono text-text3">{option.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-start">
          {needsOutcome && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">
                2 · Variabile di esito
              </label>
              <select className={inputClass} value={outcome} onChange={e => setOutcome(parseInt(e.target.value, 10))}>
                <option value={-1}>— seleziona —</option>
                {grid.cols.map((column, index) => (
                  <option key={index} value={index}>
                    {column.name} ({profiles[index]?.kind ?? 'vuota'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {needsGroup && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">
                Gruppi {goal === 'survive' ? '(opzionale)' : ''}
              </label>
              <div className="flex items-center gap-1">
                <select className={inputClass} value={group} onChange={e => setGroup(parseInt(e.target.value, 10))}>
                  <option value={-1}>— nessun gruppo —</option>
                  {groupColumnIndexes(grid).map((index) => (
                    <option key={index} value={index}>
                      {grid.cols[index]?.name} ({profiles[index]?.unique ?? 0} livelli)
                    </option>
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
          )}

          {needsSecond && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">
                Seconda variabile {goal === 'predict' ? '(predittore)' : ''}
              </label>
              <select className={inputClass} value={second} onChange={e => setSecond(parseInt(e.target.value, 10))}>
                <option value={-1}>— nessuna —</option>
                {grid.cols.map((column, index) => (
                  <option key={index} value={index}>
                    {column.name} ({profiles[index]?.kind ?? 'vuota'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {goal === 'compare' && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text3 font-mono uppercase tracking-widest">Disegno</label>
              <select
                className={inputClass}
                value={paired ? 'paired' : 'independent'}
                onChange={e => setPaired(e.target.value === 'paired')}
              >
                <option value="independent">Gruppi indipendenti</option>
                <option value="paired">Misure appaiate</option>
              </select>
            </div>
          )}
        </div>

        <section className="border border-accent2/30 bg-accent2/5 rounded-lg p-3">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Compass className="w-3.5 h-3.5 text-accent2" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-text3">
              Raccomandazione
            </span>
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-accent2/40 bg-accent2/10 text-accent2">
              {recommendation.tabLabel}
            </span>
          </div>
          <h3 className="text-[12px] text-text font-semibold mb-1">{recommendation.title}</h3>
          <p className="text-[11px] text-text2 leading-relaxed mb-2">{recommendation.headline}</p>
          {recommendation.checks.length > 0 && (
            <ul className="list-disc pl-4 space-y-1 mb-2">
              {recommendation.checks.slice(0, 3).map((check, index) => (
                <li key={index} className="text-[10px] text-text3 leading-relaxed">
                  {check}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="tb-btn flex items-center gap-1"
              onClick={() => onOpenAnalysis(recommendation.analysis)}
            >
              Apri {recommendation.tabLabel} <ArrowRight className="w-3 h-3" />
            </button>
            <span className="text-[10px] text-text3 font-mono">
              Poi premi Run Analysis per eseguire l’analisi sulla scheda.
            </span>
          </div>
        </section>
      </div>
    );
  }
);

WizardAnalysis.displayName = 'WizardAnalysis';
