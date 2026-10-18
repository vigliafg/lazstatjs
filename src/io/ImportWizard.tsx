import { useEffect, useMemo, useState } from 'react';
import { detectFormat, looksLikeJson, type Delimiter, type Detection } from './detect';
import { readDelimitedTable, readJsonTable, type ImportTable } from './readers';
import { COL_TYPES, type ColType } from '../grid/types';
import { loadPrefs, savePrefs } from './prefs';

export type ImportMode = 'overwrite' | 'append-rows' | 'append-cols';

interface Props {
  fileName: string;
  text: string;
  gridCols: string[];
  onApply: (table: ImportTable, mode: ImportMode) => void;
  onClose: () => void;
}

const DELIMS: { id: string; label: string; char: Delimiter }[] = [
  { id: 'auto', label: 'Auto', char: ',' },
  { id: ',', label: 'Comma (,)', char: ',' },
  { id: ';', label: 'Semicolon (;)', char: ';' },
  { id: 'tab', label: 'Tab', char: '\t' },
  { id: '|', label: 'Pipe (|)', char: '|' },
];

export function ImportWizard({ fileName, text, gridCols, onApply, onClose }: Props) {
  const detection: Detection = useMemo(() => detectFormat(fileName, text), [fileName, text]);
  const isJson = useMemo(() => looksLikeJson(text) || fileName.toLowerCase().endsWith('.json'), [text, fileName]);
  const prefs = useMemo(() => loadPrefs(), []);
  const [delimId, setDelimId] = useState<string>(() =>
    prefs.delimiter === '\t' ? 'tab' : ['auto', ',', ';', 'tab', '|'].includes(prefs.delimiter) ? prefs.delimiter : 'auto'
  );
  const [hasHeader, setHasHeader] = useState<boolean>(prefs.hasHeader);
  const [decimalComma, setDecimalComma] = useState<boolean>(detection.decimalComma);
  const [mode, setMode] = useState<ImportMode>('overwrite');
  const [overrides, setOverrides] = useState<Record<number, ColType>>({});

  useEffect(() => {
    setDecimalComma(detection.decimalComma);
  }, [detection.decimalComma]);

  const effDelim: Delimiter = delimId === 'auto' ? detection.delimiter : (DELIMS.find((d) => d.id === delimId)?.char ?? detection.delimiter);

  const parsed: { table: ImportTable | null; error: string | null } = useMemo(() => {
    try {
      if (isJson) return { table: readJsonTable(text, { decimalComma, typeOverrides: overrides }), error: null };
      return { table: readDelimitedTable(text, { delimiter: effDelim, hasHeader, decimalComma, typeOverrides: overrides }), error: null };
    } catch (e) {
      return { table: null, error: e instanceof Error ? e.message : 'Cannot parse file' };
    }
  }, [isJson, text, effDelim, hasHeader, decimalComma, overrides]);
  const { table, error } = parsed;

  const preview = table ? table.rows.slice(0, 10) : [];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-surface border border-border2 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-accent2 font-mono text-[12px] font-bold uppercase tracking-widest">Smart Import</h2>
            <p className="text-[11px] text-text3 font-mono truncate max-w-[500px]">{fileName}</p>
          </div>
          <button className="tb-btn" onClick={onClose}>Close</button>
        </div>

        <div className="px-4 py-3 border-b border-border flex flex-wrap gap-4 items-end text-[11px]">
          {!isJson && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-text3 font-mono uppercase">Delimiter {delimId === 'auto' && <span className="text-accent">(detected: {detection.delimiter === '\t' ? 'TAB' : detection.delimiter})</span>}</span>
                <select className="bg-surface3 border border-border2 rounded px-2 py-1 text-text" value={delimId} onChange={(e) => setDelimId(e.target.value)}>
                  {DELIMS.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-text3 font-mono uppercase">Header</span>
                <select className="bg-surface3 border border-border2 rounded px-2 py-1 text-text" value={hasHeader ? 'yes' : 'no'} onChange={(e) => setHasHeader(e.target.value === 'yes')}>
                  <option value="yes">First row is header ({Math.round(detection.headerConfidence * 100)}%)</option>
                  <option value="no">No header</option>
                </select>
              </label>
            </>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-text3 font-mono uppercase">Decimals</span>
            <select className="bg-surface3 border border-border2 rounded px-2 py-1 text-text" value={decimalComma ? 'comma' : 'dot'} onChange={(e) => setDecimalComma(e.target.value === 'comma')}>
              <option value="dot">Dot (12.5)</option>
              <option value="comma">Comma (12,5)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-text3 font-mono uppercase">Apply as</span>
            <select className="bg-surface3 border border-border2 rounded px-2 py-1 text-text" value={mode} onChange={(e) => setMode(e.target.value as ImportMode)}>
              <option value="overwrite">Overwrite grid</option>
              <option value="append-rows">Append rows ({gridCols.length} cols in grid)</option>
              <option value="append-cols">Merge columns (match by name)</option>
            </select>
          </label>
        </div>

        {error ? (
          <div className="px-4 py-6 text-center text-red text-[12px] font-mono">{error}</div>
        ) : table ? (
          <>
            <div className="px-4 py-2 text-[10px] font-mono text-text3 border-b border-border">
              {table.rows.length} rows x {table.names.length} cols
              {table.skippedEmpty > 0 && <span> · {table.skippedEmpty} empty skipped</span>}
              {table.renamedDupes > 0 && <span> · {table.renamedDupes} dup headers renamed</span>}
              {detection.hadBOM && <span> · BOM stripped</span>}
            </div>
            <div className="flex-1 overflow-auto scrollbar px-4 py-2">
              <table className="w-full border-collapse font-mono text-[11px]">
                <thead className="sticky top-0">
                  <tr className="bg-surface2">
                    {table.names.map((n, i) => (
                      <th key={i} className="border border-border p-1">
                        <div className="text-accent2">{n}</div>
                        <select
                          className="mt-1 w-full bg-surface3 border border-border2 text-text2 text-[10px] rounded px-1 py-0.5"
                          value={overrides[i] ?? table.types[i]}
                          onChange={(e) => setOverrides((o) => ({ ...o, [i]: e.target.value as ColType }))}
                        >
                          {COL_TYPES.map((t) => (
                            <option key={t.id} value={t.id}>{t.label} — {t.full}</option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, r) => (
                    <tr key={r} className="hover:bg-white/5">
                      {table.names.map((_, c) => (
                        <td key={c} className="border border-border px-2 py-0.5 text-text2 max-w-[160px] truncate" title={row[c] ?? ''}>
                          {row[c] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {table.rows.length > 10 && <p className="text-[10px] text-text3 font-mono py-1">…showing first 10 of {table.rows.length}</p>}
            </div>
          </>
        ) : null}

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button
            className="tb-btn bg-accent text-white border-accent disabled:opacity-40"
            disabled={!table}
            onClick={() => {
              if (!table) return;
              const prefs = loadPrefs();
              savePrefs({
                ...prefs,
                delimiter: delimId,
                hasHeader,
                decimalSeparator: decimalComma ? ',' : '.',
              });
              onApply({ ...table, types: table.names.map((_, i) => overrides[i] ?? table.types[i]) }, mode);
            }}
          >
            Import {table ? `${table.rows.length} rows` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
