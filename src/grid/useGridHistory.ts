import { useCallback, useRef, useState } from 'react';
import type { GridData } from './types';

const CAP = 50;

const clone = (g: GridData): GridData => ({
  cols: g.cols.map((c) => ({ ...c })),
  rows: g.rows.map((r) => [...r]),
});

const sameGrid = (a: GridData, b: GridData): boolean =>
  a.cols.length === b.cols.length &&
  a.rows.length === b.rows.length &&
  a.cols.every((c, i) => c.name === b.cols[i].name && c.type === b.cols[i].type) &&
  a.rows.every((r, i) => r.length === b.rows[i].length && r.every((v, j) => v === b.rows[i][j]));

/** Undo/redo stack for the data grid. Call `commit(next)` instead of setState. */
export function useGridHistory(initial: GridData) {
  const [grid, setGridState] = useState<GridData>(initial);
  const past = useRef<GridData[]>([]);
  const future = useRef<GridData[]>([]);
  const [, force] = useState(0);

  const commit = useCallback(
    (next: GridData | ((prev: GridData) => GridData)) => {
      setGridState((prev) => {
        const value = typeof next === 'function' ? (next as (p: GridData) => GridData)(prev) : next;
        if (sameGrid(prev, value)) return prev;
        past.current.push(clone(prev));
        if (past.current.length > CAP) past.current.shift();
        future.current = [];
        queueMicrotask(() => force((x) => x + 1));
        return value;
      });
    },
    []
  );

  const setWithoutHistory = useCallback((next: GridData) => {
    future.current = [];
    past.current = [];
    setGridState(next);
    force((x) => x + 1);
  }, []);

  const undo = useCallback(() => {
    setGridState((prev) => {
      const last = past.current.pop();
      if (!last) return prev;
      future.current.push(clone(prev));
      force((x) => x + 1);
      return last;
    });
  }, []);

  const redo = useCallback(() => {
    setGridState((prev) => {
      const next = future.current.pop();
      if (!next) return prev;
      past.current.push(clone(prev));
      force((x) => x + 1);
      return next;
    });
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
