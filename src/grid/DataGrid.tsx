import React, { useEffect, useRef, useState } from 'react';
import type { ColType, GridData } from './types';
import { COL_TYPES, validateValue } from './types';
import { rowMatches, type RowFilter } from './ops';

interface Props {
  grid: GridData;
  onCell: (r: number, c: number, val: string) => void;
  onRenameCol: (c: number, name: string) => void;
  onColType: (c: number, type: ColType) => void;
  onInsertCol: (at: number) => void;
  onDuplicateCol: (c: number) => void;
  onMoveCol: (c: number, dir: -1 | 1) => void;
  onDeleteCol: (c: number) => void;
  onInsertRow: (at: number) => void;
  onDeleteRow: (r: number) => void;
  onPaste: (r: number, c: number, text: string) => void;
  onCopyRange: (range: { r0: number; c0: number; r1: number; c1: number }) => void;
  onClearRange: (range: { r0: number; c0: number; r1: number; c1: number }) => void;
  onFillDown: (range: { r0: number; c0: number; r1: number; c1: number }) => void;
  onSortCol?: (col: number, dir: 'asc' | 'desc') => void;
  rowFilter?: RowFilter | null;
  freezeFirstCol?: boolean;
  focusCell?: { r: number; c: number; stamp: number } | null;
}

export function DataGrid(props: Props) {
  const { grid, freezeFirstCol } = props;
  const visibleRows = grid.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => rowMatches(grid, row, props.rowFilter ?? null));
  const [editingCol, setEditingCol] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [menu, setMenu] = useState<{ kind: 'col' | 'row'; index: number; x: number; y: number } | null>(null);
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  const [sel, setSel] = useState<{ r0: number; c0: number; r1: number; c1: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const inSel = (r: number, c: number): boolean => {
    if (!sel) return false;
    const r0 = Math.min(sel.r0, sel.r1);
    const r1 = Math.max(sel.r0, sel.r1);
    const c0 = Math.min(sel.c0, sel.c1);
    const c1 = Math.max(sel.c0, sel.c1);
    return r >= r0 && r <= r1 && c >= c0 && c <= c1;
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    // Delay so the same right-click that opened the menu does not close it.
    const t = setTimeout(() => window.addEventListener('click', close), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (!props.focusCell) return;
    const el = document.querySelector<HTMLInputElement>(`input[data-cell="${props.focusCell.r}-${props.focusCell.c}"]`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  }, [props.focusCell]);

  const commitRename = (c: number) => {
    if (draftName.trim() && draftName.trim() !== grid.cols[c].name) props.onRenameCol(c, draftName);
    setEditingCol(null);
  };

  const openMenu = (e: React.MouseEvent, kind: 'col' | 'row', index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ kind, index, x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div className="flex-1 overflow-auto scrollbar">
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-surface2">
              <th className={`w-10 border border-border p-1 text-text3 ${freezeFirstCol ? 'sticky left-0 z-30 bg-surface2' : ''}`}>#</th>
              {grid.cols.map((col, i) => (
                <th
                  key={i}
                  className={`border border-border p-1 text-accent2 min-w-[100px] cursor-context-menu select-none ${
                    freezeFirstCol && i === 0 ? 'sticky left-10 z-20 bg-surface2' : ''
                  }`}
                  title="Double-click to rename, right-click for column menu"
                  onDoubleClick={() => {
                    setEditingCol(i);
                    setDraftName(col.name);
                  }}
                  onContextMenu={(e) => openMenu(e, 'col', i)}
                >
                  {editingCol === i ? (
                    <input
                      autoFocus
                      className="w-full bg-surface3 border border-accent rounded px-1 py-0.5 text-text outline-none text-center"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => commitRename(i)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(i);
                        if (e.key === 'Escape') setEditingCol(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    col.name
                  )}
                </th>
              ))}
            </tr>
            <tr className="bg-surface2/80 backdrop-blur">
              <th className={`border border-border text-[8px] text-text3 uppercase p-1 ${freezeFirstCol ? 'sticky left-0 z-30 bg-surface2' : ''}`}>Type</th>
              {grid.cols.map((col, i) => (
                <th
                  key={i}
                  className={`border border-border p-0 ${
                    freezeFirstCol && i === 0 ? 'sticky left-10 z-20 bg-surface2' : ''
                  }`}
                >
                  <select
                    className="w-full bg-transparent border-none text-accent2 text-[10px] font-semibold p-1 outline-none appearance-none text-center cursor-pointer hover:bg-white/5"
                    value={col.type}
                    onChange={(e) => props.onColType(i, e.target.value as ColType)}
                  >
                    {COL_TYPES.map((t) => (
                      <option key={t.id} value={t.id} title={t.full}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={grid.cols.length + 1}
                  className="border border-border p-4 text-center text-text3 italic"
                >
                  No rows match the active filter
                </td>
              </tr>
            )}
            {visibleRows.map(({ row, index: rIdx }) => (
              <tr key={rIdx} className="hover:bg-white/5 transition-colors">
                <td
                  className={`border border-border text-center text-text3 bg-surface2/30 cursor-context-menu select-none ${
                    freezeFirstCol ? 'sticky left-0 z-10 bg-surface2' : ''
                  }`}
                  title="Right-click for row menu"
                  onContextMenu={(e) => openMenu(e, 'row', rIdx)}
                >
                  {rIdx + 1}
                </td>
                {row.map((cell, cIdx) => {
                  const isValid = validateValue(cell, grid.cols[cIdx]?.type ?? 'str');
                  const selected = inSel(rIdx, cIdx);
                  return (
                    <td
                      key={cIdx}
                      className={`border border-border p-0 relative ${
                        selected ? 'outline outline-1 outline-accent' : ''
                      } ${
                        freezeFirstCol && cIdx === 0 ? 'sticky left-10 z-10 bg-bg' : ''
                      }`}
                    >
                      <input
                        type="text"
                        data-cell={`${rIdx}-${cIdx}`}
                        className={`w-full h-full bg-transparent border-none px-2 py-1 text-text outline-none focus:bg-accent/10 transition-colors ${!isValid ? 'bg-red/10 text-red' : ''} ${selected ? 'bg-accent/10' : ''}`}
                        value={cell}
                        onFocus={(e) => {
                          // Programmatic focus from keyboard nav already set the
                          // anchor/selection; do not collapse a shift-selection.
                          const ae = e.relatedTarget as HTMLElement | null;
                          if (ae?.dataset?.cell) return;
                          setAnchor({ r: rIdx, c: cIdx });
                          setSel({ r0: rIdx, c0: cIdx, r1: rIdx, c1: cIdx });
                        }}
                        onClick={(e) => {
                          if (e.shiftKey && anchor) {
                            setSel({ r0: anchor.r, c0: anchor.c, r1: rIdx, c1: cIdx });
                          } else {
                            setAnchor({ r: rIdx, c: cIdx });
                            setSel({ r0: rIdx, c0: cIdx, r1: rIdx, c1: cIdx });
                          }
                        }}
                        onChange={(e) => props.onCell(rIdx, cIdx, e.target.value)}
                        onKeyDown={(e) => {
                          const move = (dr: number, dc: number) => {
                            // Navigate over the visible (filtered) rows, not the
                            // raw indexes, or arrow keys land on hidden cells.
                            let nr = rIdx;
                            if (dr !== 0) {
                              const pos = visibleRows.findIndex((entry) => entry.index === rIdx);
                              const next = Math.max(0, Math.min(visibleRows.length - 1, pos + dr));
                              nr = visibleRows[next]?.index ?? rIdx;
                            }
                            const nc = Math.max(0, Math.min(grid.cols.length - 1, cIdx + dc));
                            if (e.shiftKey && anchor) {
                              setSel({ r0: anchor.r, c0: anchor.c, r1: nr, c1: nc });
                            } else {
                              setAnchor({ r: nr, c: nc });
                              setSel({ r0: nr, c0: nc, r1: nr, c1: nc });
                            }
                            requestAnimationFrame(() => {
                              document.querySelector<HTMLInputElement>(`input[data-cell="${nr}-${nc}"]`)?.focus();
                            });
                          };
                          if (e.key === 'ArrowDown') { e.preventDefault(); move(1, 0); }
                          else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1, 0); }
                          else if (e.key === 'ArrowLeft') { e.preventDefault(); move(0, -1); }
                          else if (e.key === 'ArrowRight') { e.preventDefault(); move(0, 1); }
                          else if (e.key === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1, 0); }
                          else if (e.key === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); }
                          else if ((e.key === 'Delete' || e.key === 'Backspace') && e.ctrlKey && sel) {
                            e.preventDefault();
                            props.onClearRange(sel);
                          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && sel) {
                            e.preventDefault();
                            props.onCopyRange(sel);
                          }
                        }}
                        onPaste={(e) => {
                          const text = e.clipboardData.getData('text');
                          if (text.includes('\t') || text.includes('\n')) {
                            e.preventDefault();
                            props.onPaste(rIdx, cIdx, text);
                          }
                        }}
                      />
                      {cell === '' && <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-text3 pointer-events-none italic opacity-50">null</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {menu && (
        <div
          ref={menuRef}
          className="fixed z-[9999] bg-surface2 border border-border2 rounded shadow-2xl py-1 min-w-[170px] text-[11px]"
          style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 260) }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.kind === 'col' ? (
            <>
              <MenuItem
                label="Sort ascending"
                onClick={() => {
                  props.onSortCol?.(menu.index, 'asc');
                  setMenu(null);
                }}
              />
              <MenuItem
                label="Sort descending"
                onClick={() => {
                  props.onSortCol?.(menu.index, 'desc');
                  setMenu(null);
                }}
              />
              <div className="h-px bg-border my-1" />
              <MenuItem label="Insert column left" onClick={() => props.onInsertCol(menu.index)} />
              <MenuItem label="Insert column right" onClick={() => props.onInsertCol(menu.index + 1)} />
              <MenuItem label="Duplicate column" onClick={() => props.onDuplicateCol(menu.index)} />
              <MenuItem label="Move left" onClick={() => props.onMoveCol(menu.index, -1)} />
              <MenuItem label="Move right" onClick={() => props.onMoveCol(menu.index, 1)} />
              <div className="h-px bg-border my-1" />
              <MenuItem danger label="Delete column" onClick={() => props.onDeleteCol(menu.index)} />
            </>
          ) : (
            <>
              <MenuItem label="Insert row above" onClick={() => props.onInsertRow(menu.index)} />
              <MenuItem label="Insert row below" onClick={() => props.onInsertRow(menu.index + 1)} />
              <div className="h-px bg-border my-1" />
              <MenuItem danger label="Delete row" onClick={() => props.onDeleteRow(menu.index)} />
            </>
          )}
        </div>
      )}
    </>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={`w-full text-left px-3 py-1.5 hover:bg-accent hover:text-white transition-colors ${danger ? 'text-red/90' : 'text-text2'}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
