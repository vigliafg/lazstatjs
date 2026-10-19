import { useEffect, useMemo, useState } from 'react';
import { detectFormat, detectHeader, looksLikeJson, type Delimiter, type Detection } from './detect';
import { readDelimitedTable, readJsonTable, type ImportTable } from './readers';
import { COL_TYPES, type ColType } from '../grid/types';
import { loadPrefs, savePrefs } from './prefs';
import { xlsxSheetToTable, type XlsxSheet } from './xlsx';

export type ImportMode = 'overwrite' | 'append-rows' | 'append-cols';

interface Props {
  fileName: string;
  /** Delimited/JSON payload; omitted when the file was an Excel workbook. */
  text?: string;
  /** Worksheets parsed from an .xlsx/.xls file (same pipeline as CSV). */
  sheets?: XlsxSheet[];
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

export function ImportWizard({ fileName, text = '', sheets, gridCols, onApply, onClose }: Props) {
  const isWorkbook = (sheets?.length ?? 0) > 0;
  const prefs = useMemo(() => loadPrefs(), []);
  const [sheetIndex, setSheetIndex] = useState(0);
  const sheet = isWorkbook ? sheets?.[Math.min(sheetIndex, (sheets?.length ?? 1) - 1)] : undefined;

  const detection: Detection = useMemo(() => {
    if (sheet) {
      const header = detectHeader(sheet.rows.slice(0, 10));
      return {
        delimiter: ',',
        delimiterScores: { ',': 0, ';': 0, '\t': 0, '|': 0 },
        hasHeader: header.hasHeader,
        headerConfidence: header.confidence,
        hadBOM: false,
        decimalComma: false,
        previewRows: Math.min(sheet.rows.length, 10),
      };
    }
    return detectFormat(fileName, text);
  }, [sheet, fileName, text]);
  const isJson = useMemo(
    () => !isWorkbook && (looksLikeJson(text) || fileName.toLowerCase().endsWith('.json')),
    [isWorkbook, text, fileName]
  );
  const [delimId, setDelimId] = useState<string>(() =>
    prefs.delimiter === '\t' ? 'tab' : ['auto', ',', ';', 'tab', '|'].includes(prefs.delimiter) ? prefs.delimiter : 'auto'
  );
  const [hasHeader, setHasHeader] = useState<boolean>(isWorkbook ? true : prefs.hasHeader);
  const [decimalComma, setDecimalComma] = useState<boolean>(detection.decimalComma);
  const [mode, setMode] = useState<ImportMode>('overwrite');
  const [overrides, setOverrides] = useState<Record<number, ColType>>({});

  // Re-sync header/decimal defaults only when a *different* file or sheet
  // arrives while the wizard is open; at first open the persisted prefs win.
  const firstFile = useMemo(
    () => `${fileName}\0${text.length}\0${sheets?.map((item) => item.name).join('|') ?? ''}`,
    []
  );
  useEffect(() => {
    if (`${fileName}\0${text.length}\0${sheets?.map((item) => item.name).join('|') ?? ''}` === firstFile) return;
    setDecimalComma(detection.decimalComma);
    setHasHeader(detection.hasHeader);
  }, [fileName, text, sheets, detection, firstFile]);

  // A sheet switch changes the columns, so per-column type overrides must not
  // leak from the previous sheet.
  const switchSheet = (index: number) => {
    setSheetIndex(index);
    setOverrides({});
    const next = sheets?.[index];
    if (next) setHasHeader(detectHeader(next.rows.slice(0, 10)).hasHeader);
  };

  const effDelim: Delimiter = delimId === 'auto' ? detection.delimiter : (DELIMS.find((d) => d.id === delimId)?.char ?? detection.delimiter);

  const parsed: { table: ImportTable | null; error: string | null } = useMemo(() => {
    try {
      if (sheet) {
        return { table: xlsxSheetToTable(sheet, { hasHeader, decimalComma, typeOverrides: overrides }), error: null };
      }
      if (isJson) return { table: readJsonTable(text, { decimalComma, typeOverrides: overrides }), error: null };
      return { table: readDelimitedTable(text, { delimiter: effDelim, hasHeader, decimalComma, typeOverrides: overrides }), error: null };
    } catch (e) {
      return { table: null, error: e instanceof Error ? e.message : 'Cannot parse file' };
    }
  }, [sheet, isJson, text, effDelim, hasHeader, decimalComma, overrides]);
  const { table, error } = parsed;

  const preview = table ? table.rows.slice(0, 10) : [];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-surface border border-border2 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-accent2 font-mono text-[12px] font-bold uppercase tracking-widest">Smart Import</h2>
            <p className="text-[11px] text-text3 font-mono truncate max-w-[500px]">
              {fileName}
              {isWorkbook && <span> · {sheets?.length} sheet{sheets && sheets.length > 1 ? 's' : ''}</span>}
            </p>
          </div>
          <button className="tb-btn" onClick={onClose}>Close</button>
        </div>

        <div className="px-4 py-3 border-b border-border flex flex-wrap gap-4 items-end text-[11px]">
          {isWorkbook && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-text3 font-mono uppercase">Worksheet</span>
              <select
                className="bg-surface3 border border-border2 rounded px-2 py-1 text-text"
                value={sheetIndex}
                onChange={(e) => switchSheet(parseInt(e.target.value, 10))}
              >
                {sheets?.map((item, index) => (
                  <option key={`${item.name}-${index}`} value={index}>
                    {item.name} ({item.rows.length} rows)
                  </option>
                ))}
              </select>
            </label>
          )}
          {!isJson && !isWorkbook && (
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
          {isWorkbook && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-text3 font-mono uppercase">Header</span>
              <select className="bg-surface3 border border-border2 rounded px-2 py-1 text-text" value={hasHeader ? 'yes' : 'no'} onChange={(e) => setHasHeader(e.target.value === 'yes')}>
                <option value="yes">First row is header</option>
                <option value="no">No header</option>
              </select>
            </label>
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
              {sheet && <span className="text-accent2">{sheet.name} · </span>}
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
