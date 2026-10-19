import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import type { CategoryLevel, ColType, GridData } from './types';
import { COL_TYPES, columnLevels, isGroupColumn, levelLabel, validateValue } from './types';
import { rowMatches, type RowFilter } from './ops';
import { LevelsEditor } from './LevelsEditor';

interface Props {
  grid: GridData;
  onCell: (r: number, c: number, val: string) => void;
  onRenameCol: (c: number, name: string) => void;
  onColType: (c: number, type: ColType) => void;
  onLevels: (c: number, levels: CategoryLevel[], reference?: string) => void;
  onRecode: (c: number, mapping: Record<string, string>) => void;
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
    const el = document.querySelector<HTMLElement>(`[data-cell="${props.focusCell.r}-${props.focusCell.c}"]`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  }, [props.focusCell]);

  const commitRename = (c: number) => {
    if (draftName.trim() && draftName.trim() !== grid.cols[c].name) props.onRenameCol(c, draftName);
    setEditingCol(null);
  };

  const moveTo = (rIdx: number, cIdx: number, dr: number, dc: number, shift: boolean) => {
    let nr = rIdx;
    if (dr !== 0) {
      const pos = visibleRows.findIndex((entry) => entry.index === rIdx);
      const next = Math.max(0, Math.min(visibleRows.length - 1, pos + dr));
      nr = visibleRows[next]?.index ?? rIdx;
    }
    const nc = Math.max(0, Math.min(grid.cols.length - 1, cIdx + dc));
    if (shift && anchor) {
      setSel({ r0: anchor.r, c0: anchor.c, r1: nr, c1: nc });
    } else {
      setAnchor({ r: nr, c: nc });
      setSel({ r0: nr, c0: nc, r1: nr, c1: nc });
    }
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-cell="${nr}-${nc}"]`)?.focus();
    });
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
                  className={`group border border-border p-1 text-accent2 min-w-[100px] cursor-context-menu select-none ${
                    freezeFirstCol && i === 0 ? 'sticky left-10 z-20 bg-surface2' : ''
                  }`}
                  title={`Double-click to rename "${col.name}" (duplicate names get a _2 suffix), right-click for the column menu`}
                  onDoubleClick={() => {
                    setEditingCol(i);
                    setDraftName(col.name);
                  }}
                  onContextMenu={(e) => openMenu(e, 'col', i)}
                >
                  {editingCol === i ? (
                    <input
                      autoFocus
                      aria-label={`Column name for ${col.name}`}
                      maxLength={64}
                      className="w-full bg-surface3 border border-accent rounded px-1 py-0.5 text-text outline-none text-center"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onBlur={() => commitRename(i)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(i);
                        if (e.key === 'Escape') setEditingCol(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex items-center justify-center gap-1">
                      <span className="truncate">{col.name}</span>
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-text3 hover:text-accent transition-opacity"
                        title={`Rename "${col.name}"`}
                        aria-label={`Rename column ${col.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCol(i);
                          setDraftName(col.name);
                        }}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </th>
              ))}
            </tr>
            <tr className="bg-surface2/80 backdrop-blur">
              <th
                className={`border border-border text-[8px] text-text3 uppercase p-1 ${freezeFirstCol ? 'sticky left-0 z-30 bg-surface2' : ''}`}
                title={
                  'Column type — drives cell validation, Auto-fix coercion and the Excel export. Analyses still infer numbers from the values.\n' +
                  COL_TYPES.map((t) => `${t.label} = ${t.full}`).join('\n')
                }
              >
                Type
              </th>
              {grid.cols.map((col, i) => (
                <th
                  key={i}
                  className={`border border-border p-0 ${
                    freezeFirstCol && i === 0 ? 'sticky left-10 z-20 bg-surface2' : ''
                  }`}
                >
                  <div className="relative">
                    <select
                      aria-label={`Data type for ${col.name}`}
                      title={COL_TYPES.find((t) => t.id === col.type)?.full ?? col.type}
                      className="w-full bg-transparent border-none text-accent2 text-[10px] font-semibold py-1 pl-1 pr-5 outline-none appearance-none text-center cursor-pointer hover:bg-white/5"
                      value={col.type}
                      onChange={(e) => props.onColType(i, e.target.value as ColType)}
                    >
                      {COL_TYPES.map((t) => (
                        <option key={t.id} value={t.id} title={t.full}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-text3" />
                  </div>
                  {(col.type === 'cat' || isGroupColumn(grid, i)) && (
                    <LevelsEditor
                      grid={grid}
                      column={i}
                      onLevels={props.onLevels}
                      onRecode={props.onRecode}
                    />
                  )}
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
                  const col = grid.cols[cIdx];
                  const isValid = validateValue(cell, col?.type ?? 'str');
                  const selected = inSel(rIdx, cIdx);
                  const isCat = col?.type === 'cat';
                  const catLevels = isCat ? columnLevels(col, grid.rows, cIdx) : [];
                  const rawCell = String(cell ?? '');
                  const extraLevel = isCat && rawCell !== '' && !catLevels.some((level) => level.value === rawCell);
                  return (
                    <td
                      key={cIdx}
                      className={`border border-border p-0 relative ${
                        selected ? 'outline outline-1 outline-accent' : ''
                      } ${
                        freezeFirstCol && cIdx === 0 ? 'sticky left-10 z-10 bg-bg' : ''
                      }`}
                    >
                      {isCat ? (
                        <select
                          data-cell={`${rIdx}-${cIdx}`}
                          aria-label={`${col?.name ?? 'Group'} value`}
                          title={extraLevel ? `${rawCell} is not in the declared levels` : undefined}
                          className={`w-full h-full bg-transparent border-none pl-2 pr-6 py-1 text-text outline-none focus:bg-accent/10 transition-colors cursor-pointer ${extraLevel ? 'italic text-yellow' : ''} ${selected ? 'bg-accent/10' : ''}`}
                          value={rawCell}
                          onFocus={(e) => {
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
                            if (e.key === 'Enter') { e.preventDefault(); moveTo(rIdx, cIdx, e.shiftKey ? -1 : 1, 0, e.shiftKey); }
                            else if (e.key === 'Tab') { e.preventDefault(); moveTo(rIdx, cIdx, 0, e.shiftKey ? -1 : 1, e.shiftKey); }
                            else if (e.key === 'Escape') { e.currentTarget.blur(); }
                          }}
                          onPaste={(e) => {
                            const text = e.clipboardData.getData('text');
                            if (text.includes('\t') || text.includes('\n')) {
                              e.preventDefault();
                              props.onPaste(rIdx, cIdx, text);
                            } else if (text.trim() !== '') {
                              e.preventDefault();
                              props.onCell(rIdx, cIdx, text.trim());
                            }
                          }}
                        >
                          <option value="">—</option>
                          {catLevels.map((level) => (
                            <option key={level.value} value={level.value}>
                              {level.label}
                            </option>
                          ))}
                          {extraLevel && <option value={rawCell}>{rawCell} (not in list)</option>}
                        </select>
                      ) : (
                        <input
                          type="text"
                          data-cell={`${rIdx}-${cIdx}`}
                          className={`w-full h-full bg-transparent border-none px-2 py-1 text-text outline-none focus:bg-accent/10 transition-colors ${!isValid ? 'cell-invalid' : ''} ${selected ? 'bg-accent/10' : ''}`}
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
                            if (e.key === 'ArrowDown') { e.preventDefault(); moveTo(rIdx, cIdx, 1, 0, e.shiftKey); }
                            else if (e.key === 'ArrowUp') { e.preventDefault(); moveTo(rIdx, cIdx, -1, 0, e.shiftKey); }
                            else if (e.key === 'ArrowLeft') { e.preventDefault(); moveTo(rIdx, cIdx, 0, -1, e.shiftKey); }
                            else if (e.key === 'ArrowRight') { e.preventDefault(); moveTo(rIdx, cIdx, 0, 1, e.shiftKey); }
                            else if (e.key === 'Enter') { e.preventDefault(); moveTo(rIdx, cIdx, e.shiftKey ? -1 : 1, 0, e.shiftKey); }
                            else if (e.key === 'Tab') { e.preventDefault(); moveTo(rIdx, cIdx, 0, e.shiftKey ? -1 : 1, e.shiftKey); }
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
                      )}
                      {!isCat && cell === '' && <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-text3 pointer-events-none italic opacity-50">null</span>}
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
                label="Rename column"
                onClick={() => {
                  setEditingCol(menu.index);
                  setDraftName(grid.cols[menu.index]?.name ?? '');
                  setMenu(null);
                }}
              />
              <div className="h-px bg-border my-1" />
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
              <MenuItem label="Insert column left" onClick={() => { setMenu(null); props.onInsertCol(menu.index); }} />
              <MenuItem label="Insert column right" onClick={() => { setMenu(null); props.onInsertCol(menu.index + 1); }} />
              <MenuItem label="Duplicate column" onClick={() => { setMenu(null); props.onDuplicateCol(menu.index); }} />
              <MenuItem label="Move left" onClick={() => { setMenu(null); props.onMoveCol(menu.index, -1); }} />
              <MenuItem label="Move right" onClick={() => { setMenu(null); props.onMoveCol(menu.index, 1); }} />
              <div className="h-px bg-border my-1" />
              <MenuItem danger label="Delete column" onClick={() => { setMenu(null); props.onDeleteCol(menu.index); }} />
            </>
          ) : (
            <>
              <MenuItem label="Insert row above" onClick={() => { setMenu(null); props.onInsertRow(menu.index); }} />
              <MenuItem label="Insert row below" onClick={() => { setMenu(null); props.onInsertRow(menu.index + 1); }} />
              <div className="h-px bg-border my-1" />
              <MenuItem danger label="Delete row" onClick={() => { setMenu(null); props.onDeleteRow(menu.index); }} />
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
