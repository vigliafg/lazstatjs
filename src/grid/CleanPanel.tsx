import { useEffect, useState } from 'react';
import type { GridData } from './types';
import {
  findReplace, trimGrid, removeEmptyRows, removeDuplicateRows, fillMissing,
} from './ops';

interface Props {
  grid: GridData;
  onApply: (next: GridData, msg: string) => void;
}

export function CleanPanel({ grid, onApply }: Props) {
  const [search, setSearch] = useState('');
  const [replace, setReplace] = useState('');
  const [regex, setRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [scopeCol, setScopeCol] = useState<number | 'all'>('all');
  const [fillCol, setFillCol] = useState(0);
  const [fillStrategy, setFillStrategy] = useState<'mean' | 'median' | 'mode' | 'value'>('mean');
  const [fillValue, setFillValue] = useState('');

  useEffect(() => {
    const max = Math.max(0, grid.cols.length - 1);
    if (fillCol > max) setFillCol(max);
    if (typeof scopeCol === 'number' && scopeCol > max) setScopeCol(max);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid.cols.length]);

  const runFindReplace = () => {
    const { grid: next, count } = findReplace(grid, search, replace, {
      regex,
      matchCase,
      col: scopeCol === 'all' ? null : scopeCol,
    });
    onApply(next, count === 0 ? 'No matches found' : `${count} replacements made`);
  };

  return (
    <div className="bg-surface border-b border-border px-3 py-2 flex flex-wrap gap-4 items-end text-[11px] shrink-0">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-text3 font-mono uppercase tracking-widest">Find / Replace</span>
        <div className="flex gap-1.5 items-center">
          <input className="bg-surface3 border border-border2 rounded px-2 py-1 w-24 text-text" placeholder="Find" value={search} onChange={(e) => setSearch(e.target.value)} />
          <input className="bg-surface3 border border-border2 rounded px-2 py-1 w-24 text-text" placeholder="Replace" value={replace} onChange={(e) => setReplace(e.target.value)} />
          <select className="bg-surface3 border border-border2 rounded px-1 py-1 text-text" value={scopeCol === 'all' ? 'all' : String(scopeCol)} onChange={(e) => setScopeCol(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All cols</option>
            {grid.cols.map((c, i) => (
              <option key={i} value={i}>{c.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-text2"><input type="checkbox" className="accent-accent" checked={regex} onChange={(e) => setRegex(e.target.checked)} />Regex</label>
          <label className="flex items-center gap-1 text-text2"><input type="checkbox" className="accent-accent" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />Aa</label>
          <button className="tb-btn" onClick={runFindReplace}>Apply</button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-text3 font-mono uppercase tracking-widest">Missing</span>
        <div className="flex gap-1.5 items-center">
          <select className="bg-surface3 border border-border2 rounded px-1 py-1 text-text" value={fillCol} onChange={(e) => setFillCol(Number(e.target.value))}>
            {grid.cols.map((c, i) => (
              <option key={i} value={i}>{c.name}</option>
            ))}
          </select>
          <select className="bg-surface3 border border-border2 rounded px-1 py-1 text-text" value={fillStrategy} onChange={(e) => setFillStrategy(e.target.value as typeof fillStrategy)}>
            <option value="mean">Mean</option>
            <option value="median">Median</option>
            <option value="mode">Mode</option>
            <option value="value">Value</option>
          </select>
          {fillStrategy === 'value' && (
            <input className="bg-surface3 border border-border2 rounded px-2 py-1 w-20 text-text" placeholder="Value" value={fillValue} onChange={(e) => setFillValue(e.target.value)} />
          )}
          <button
            className="tb-btn"
            onClick={() => {
              const strategy = fillStrategy === 'value' ? { value: fillValue } : fillStrategy;
              const { grid: next, filled, fillWith } = fillMissing(grid, fillCol, strategy);
              onApply(next, filled === 0 ? 'No missing cells filled' : `${filled} cells filled with ${fillWith}`);
            }}
          >
            Fill
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-text3 font-mono uppercase tracking-widest">Tidy</span>
        <div className="flex gap-1.5">
          <button
            className="tb-btn"
            onClick={() => {
              const { grid: next, changed } = trimGrid(grid);
              onApply(next, changed === 0 ? 'No whitespace to trim' : `${changed} cells trimmed`);
            }}
          >
            Trim spaces
          </button>
          <button
            className="tb-btn"
            onClick={() => {
              const { grid: next, removed } = removeEmptyRows(grid);
              onApply(next, removed === 0 ? 'No empty rows' : `${removed} empty rows removed`);
            }}
          >
            Drop empty rows
          </button>
          <button
            className="tb-btn"
            onClick={() => {
              const { grid: next, removed } = removeDuplicateRows(grid);
              onApply(next, removed === 0 ? 'No duplicates' : `${removed} duplicate rows removed`);
            }}
          >
            Drop duplicates
          </button>
        </div>
      </div>
    </div>
  );
}
