import { useMemo, useState } from 'react';
import type { GridData } from '../grid/types';
import { nonEmptyRowCount } from '../grid/types';
import { buildSpsSyntax, gridToRows, serializeTable, type ExportFormat, type ExportOptions } from './writers';
import type { Delimiter } from './detect';
import { loadPrefs, savePrefs } from './prefs';

interface Props {
  grid: GridData;
  onClose: () => void;
  onExport: (files: { content: string; fileName: string; mime: string }[]) => void;
}

export function ExportDialog({ grid, onClose, onExport }: Props) {
  const prefs = useMemo(() => loadPrefs(), []);
  const [format, setFormat] = useState<ExportFormat>(
    (['csv', 'tsv', 'pipe', 'json', 'spss'] as ExportFormat[]).includes(prefs.exportFormat as ExportFormat)
      ? (prefs.exportFormat as ExportFormat)
      : 'csv'
  );
  const [delimiter, setDelimiter] = useState<Delimiter>(
    prefs.delimiter === 'tab' || prefs.delimiter === '\t'
      ? '\t'
      : ([';', '|', ','].includes(prefs.delimiter) ? (prefs.delimiter as Delimiter) : ',')
  );
  const [decimalSeparator, setDecimalSeparator] = useState<'.' | ','>(prefs.decimalSeparator);
  const [includeHeader, setIncludeHeader] = useState(prefs.includeHeader);
  const [dropEmptyRows, setDropEmptyRows] = useState(prefs.dropEmptyRows);

  const rows = gridToRows(grid, dropEmptyRows);
  const opts: ExportOptions = { format, delimiter, decimalSeparator, includeHeader, dropEmptyRows };
  const main = serializeTable(grid.cols.map((c) => c.name), rows, opts);
  const preview = main.content.split('\n').slice(0, 8).join('\n');

  const doExport = () => {
    const prefs = loadPrefs();
    savePrefs({
      ...prefs,
      delimiter: format === 'csv' || format === 'spss' ? delimiter : prefs.delimiter,
      decimalSeparator,
      exportFormat: format,
      includeHeader,
      dropEmptyRows,
    });
    if (format === 'spss') {
      const sps = buildSpsSyntax(main.fileName, grid.cols.map((c) => c.name), grid.cols.map((c) => c.type), opts);
      onExport([
        { content: main.content, fileName: main.fileName, mime: main.mime },
        { content: sps, fileName: 'lazstats.sps', mime: 'text/plain;charset=utf-8' },
      ]);
    } else {
      onExport([{ content: main.content, fileName: main.fileName, mime: main.mime }]);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-surface border border-border2 rounded-lg shadow-2xl w-full max-w-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-accent2 font-mono text-[12px] font-bold uppercase tracking-widest">Export data</h2>
          <button className="tb-btn" onClick={onClose}>Close</button>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-4 items-end text-[11px]">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-text3 font-mono uppercase">Format</span>
            <select className="bg-surface3 border border-border2 rounded px-2 py-1 text-text" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              <option value="csv">CSV (Excel, R)</option>
              <option value="tsv">TSV (tab)</option>
              <option value="pipe">Pipe TXT</option>
              <option value="json">JSON (records)</option>
              <option value="spss">SPSS: CSV + .sps syntax</option>
            </select>
          </label>
          {(format === 'csv' || format === 'spss') && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-text3 font-mono uppercase">Delimiter</span>
              <select className="bg-surface3 border border-border2 rounded px-2 py-1 text-text" value={delimiter} onChange={(e) => setDelimiter(e.target.value as Delimiter)}>
                <option value=",">Comma (,)</option>
                <option value=";">Semicolon (;)</option>
                <option value="	">Tab</option>
                <option value="|">Pipe (|)</option>
              </select>
            </label>
          )}
          {format !== 'json' && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-text3 font-mono uppercase">Decimals</span>
              <select className="bg-surface3 border border-border2 rounded px-2 py-1 text-text" value={decimalSeparator} onChange={(e) => setDecimalSeparator(e.target.value as '.' | ',')}>
                <option value=".">Dot (12.5)</option>
                <option value=",">Comma (12,5)</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5 text-text2">
            <input type="checkbox" className="accent-accent" checked={includeHeader} onChange={(e) => setIncludeHeader(e.target.checked)} />
            Header row
          </label>
          <label className="flex items-center gap-1.5 text-text2">
            <input type="checkbox" className="accent-accent" checked={dropEmptyRows} onChange={(e) => setDropEmptyRows(e.target.checked)} />
            Drop empty rows
          </label>
        </div>
        <div className="px-4 py-2 text-[10px] font-mono text-text3 border-t border-border">
          {rows.length} rows ({nonEmptyRowCount(grid.rows)} non-empty) x {grid.cols.length} cols → {main.fileName}
          {format === 'spss' && <span> + lazstats.sps</span>}
        </div>
        <pre className="mx-4 mb-2 p-2 bg-surface3/40 border border-border rounded text-[10px] font-mono text-text2 overflow-auto max-h-40 scrollbar whitespace-pre-wrap">{preview}</pre>
        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button className="tb-btn bg-accent text-white border-accent" onClick={doExport} disabled={rows.length === 0}>
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
