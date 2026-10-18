import { useEffect, useState } from 'react';
import type { GridData } from './types';
import { sortByColumn, recodeColumn, splitColumn, mergeColumns, computeColumn } from './ops';

interface Props {
  grid: GridData;
  onApply: (next: GridData, msg: string, kind?: 'ok' | 'warn' | 'error') => void;
}

export function TransformPanel({ grid, onApply }: Props) {
  const [sortCol, setSortCol] = useState(0);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [recodeCol, setRecodeCol] = useState(0);
  const [recodeText, setRecodeText] = useState('1=Yes\n2=No');
  const [splitCol, setSplitCol] = useState(0);
  const [splitSep, setSplitSep] = useState(';');
  const [mergeA, setMergeA] = useState(0);
  const [mergeB, setMergeB] = useState(1);
  const [mergeSep, setMergeSep] = useState('_');
  const [expr, setExpr] = useState('Score_Post - Score_Pre');
  const [exprName, setExprName] = useState('Diff');

  // Column indexes go stale after delete/merge: clamp into range.
  useEffect(() => {
    const max = Math.max(0, grid.cols.length - 1);
    if (sortCol > max) setSortCol(max);
    if (recodeCol > max) setRecodeCol(max);
    if (splitCol > max) setSplitCol(max);
    if (mergeA > max) setMergeA(max);
    if (mergeB > max) setMergeB(Math.min(max, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid.cols.length]);

  const parseMapping = (): Record<string, string> => {
    const map: Record<string, string> = {};
    recodeText.split('\n').forEach((line) => {
      const idx = line.indexOf('=');
      if (idx > 0) map[line.slice(0, idx)] = line.slice(idx + 1);
    });
    return map;
  };

  return (
    <div className="bg-surface border-b border-border px-3 py-2 flex flex-wrap gap-4 items-end text-[11px] shrink-0">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-text3 font-mono uppercase tracking-widest">Sort</span>
        <div className="flex gap-1.5 items-center">
          <select className="bg-surface3 border border-border2 rounded px-1 py-1 text-text" value={sortCol} onChange={(e) => setSortCol(Number(e.target.value))}>
            {grid.cols.map((c, i) => (
              <option key={i} value={i}>{c.name}</option>
            ))}
          </select>
          <select className="bg-surface3 border border-border2 rounded px-1 py-1 text-text" value={sortDir} onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}>
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
          <button className="tb-btn" onClick={() => onApply(sortByColumn(grid, sortCol, sortDir), `Sorted by ${grid.cols[sortCol]?.name}`)}>Sort</button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-text3 font-mono uppercase tracking-widest">Recode (old=new per line)</span>
        <div className="flex gap-1.5 items-start">
          <select className="bg-surface3 border border-border2 rounded px-1 py-1 text-text" value={recodeCol} onChange={(e) => setRecodeCol(Number(e.target.value))}>
            {grid.cols.map((c, i) => (
              <option key={i} value={i}>{c.name}</option>
            ))}
          </select>
          <textarea className="bg-surface3 border border-border2 rounded px-2 py-1 w-28 h-[52px] text-text font-mono" value={recodeText} onChange={(e) => setRecodeText(e.target.value)} />
          <button
            className="tb-btn"
            onClick={() => {
              const { grid: next, changed } = recodeColumn(grid, recodeCol, parseMapping());
              onApply(next, changed === 0 ? 'No values recoded' : `${changed} cells recoded`);
            }}
          >
            Recode
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-text3 font-mono uppercase tracking-widest">Split / Merge</span>
        <div className="flex gap-1.5 items-center">
          <select className="bg-surface3 border border-border2 rounded px-1 py-1 text-text" value={splitCol} onChange={(e) => setSplitCol(Number(e.target.value))}>
            {grid.cols.map((c, i) => (
              <option key={i} value={i}>{c.name}</option>
            ))}
          </select>
          <input className="bg-surface3 border border-border2 rounded px-1 py-1 w-10 text-text text-center" value={splitSep} onChange={(e) => setSplitSep(e.target.value)} title="Separator" />
          <button className="tb-btn" onClick={() => onApply(splitColumn(grid, splitCol, splitSep), 'Column split')}>Split</button>
          <span className="text-text3">|</span>
          <select className="bg-surface3 border border-border2 rounded px-1 py-1 text-text" value={mergeA} onChange={(e) => setMergeA(Number(e.target.value))}>
            {grid.cols.map((c, i) => (
              <option key={i} value={i}>{c.name}</option>
            ))}
          </select>
          <select className="bg-surface3 border border-border2 rounded px-1 py-1 text-text" value={mergeB} onChange={(e) => setMergeB(Number(e.target.value))}>
            {grid.cols.map((c, i) => (
              <option key={i} value={i}>{c.name}</option>
            ))}
          </select>
          <input className="bg-surface3 border border-border2 rounded px-1 py-1 w-10 text-text text-center" value={mergeSep} onChange={(e) => setMergeSep(e.target.value)} title="Separator" />
          <button className="tb-btn" onClick={() => onApply(mergeColumns(grid, mergeA, mergeB, mergeSep), 'Columns merged')}>Merge</button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-text3 font-mono uppercase tracking-widest">Compute (e.g. A - B)</span>
        <div className="flex gap-1.5 items-center">
          <input className="bg-surface3 border border-border2 rounded px-2 py-1 w-40 text-text font-mono" value={expr} onChange={(e) => setExpr(e.target.value)} />
          <input className="bg-surface3 border border-border2 rounded px-2 py-1 w-20 text-text" value={exprName} onChange={(e) => setExprName(e.target.value)} placeholder="Name" />
          <button
            className="tb-btn"
            onClick={() => {
              const colIndex: Record<string, number> = {};
              grid.cols.forEach((c, i) => {
                colIndex[c.name] = i;
              });
              const { grid: next, error } = computeColumn(grid, expr, exprName, colIndex);
              if (error) onApply(grid, error, 'error');
              else onApply(next, `Computed ${exprName}`, 'ok');
            }}
          >
            Compute
          </button>
        </div>
      </div>
    </div>
  );
}
