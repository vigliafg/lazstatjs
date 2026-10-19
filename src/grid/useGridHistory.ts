import { useCallback, useRef, useState } from 'react';
import type { CategoryLevel, GridData } from './types';

const CAP = 50;

const clone = (g: GridData): GridData => ({
  cols: g.cols.map((c) => ({ ...c, levels: c.levels?.map((level) => ({ ...level })) })),
  rows: g.rows.map((r) => [...r]),
});

const sameLevels = (a?: CategoryLevel[], b?: CategoryLevel[]): boolean => {
  const left = a ?? [];
  const right = b ?? [];
  return (
    left.length === right.length &&
    left.every((level, i) => level.value === right[i]?.value && level.label === right[i]?.label)
  );
};

const sameGrid = (a: GridData, b: GridData): boolean =>
  a.cols.length === b.cols.length &&
  a.rows.length === b.rows.length &&
  a.cols.every(
    (c, i) =>
      c.name === b.cols[i]?.name &&
      c.type === b.cols[i]?.type &&
      c.reference === b.cols[i]?.reference &&
      sameLevels(c.levels, b.cols[i]?.levels)
  ) &&
  a.rows.every((r, i) => {
    const other = b.rows[i] ?? [];
    // Ragged rows from legacy states: compare up to the widest row.
    const width = Math.max(r.length, other.length);
    for (let j = 0; j < width; j += 1) {
      if ((r[j] ?? '') !== (other[j] ?? '')) return false;
    }
    return true;
  });

/** Undo/redo stack for the data grid. Call `commit(next)` instead of setState. */
export function useGridHistory(initial: GridData) {
  const [grid, setGridState] = useState<GridData>(initial);
  const gridRef = useRef<GridData>(initial);
  const past = useRef<GridData[]>([]);
  const future = useRef<GridData[]>([]);
  const [, setVersion] = useState(0);
  const lastCommitAt = useRef(0);
  const lastCommitKind = useRef<string>('');

  const bump = () => setVersion((x) => x + 1);

  // Coalesce rapid cell edits (typing) into a single history entry so one
  // Undo restores the pre-typing value instead of one char at a time.
  const commit = useCallback(
    (next: GridData | ((prev: GridData) => GridData), opts?: { coalesce?: boolean; kind?: string }) => {
      const prev = gridRef.current;
      const value = typeof next === 'function' ? (next as (p: GridData) => GridData)(prev) : next;
      if (sameGrid(prev, value)) return;
      const now = Date.now();
      const canCoalesce =
        opts?.coalesce &&
        opts.kind !== undefined &&
        lastCommitKind.current === opts.kind &&
        now - lastCommitAt.current < 1200 &&
        past.current.length > 0;
      if (!canCoalesce) {
        past.current.push(clone(prev));
        if (past.current.length > CAP) past.current.shift();
      }
      future.current = [];
      lastCommitAt.current = now;
      lastCommitKind.current = opts?.kind ?? '';
      gridRef.current = value;
      setGridState(value);
      bump();
    },
    []
  );

  const setWithoutHistory = useCallback((next: GridData) => {
    future.current = [];
    past.current = [];
    lastCommitKind.current = '';
    gridRef.current = next;
    setGridState(next);
    bump();
  }, []);

  const undo = useCallback(() => {
    const last = past.current.pop();
    if (!last) return;
    future.current.push(clone(gridRef.current));
    lastCommitKind.current = '';
    gridRef.current = last;
    setGridState(last);
    bump();
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(clone(gridRef.current));
    lastCommitKind.current = '';
    gridRef.current = next;
    setGridState(next);
    bump();
  }, []);

  return {
    grid,
    commit,
    setWithoutHistory,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
