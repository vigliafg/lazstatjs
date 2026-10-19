import { escapeField, toCsv, trimEmptyRows } from '../csv';
import type { GridData } from '../grid/types';
import type { Delimiter } from './detect';

export type ExportFormat = 'csv' | 'tsv' | 'pipe' | 'json' | 'spss' | 'xlsx';

export interface ExportOptions {
  format: ExportFormat;
  delimiter: Delimiter;
  decimalSeparator: '.' | ',';
  includeHeader: boolean;
  dropEmptyRows: boolean;
}

export const DEFAULT_EXPORT: ExportOptions = {
  format: 'csv',
  delimiter: ',',
  decimalSeparator: '.',
  includeHeader: true,
  dropEmptyRows: true,
};

const formatFor = (format: ExportFormat): Delimiter => {
  if (format === 'tsv') return '\t';
  if (format === 'pipe') return '|';
  return ',';
};

const applyDecimals = (value: string, decimalSeparator: '.' | ','): string => {
  if (decimalSeparator === '.') return value;
  // Only rewrite plain dot-decimals, leave dates/text alone.
  return /^-?\d+\.\d+(e[+-]?\d+)?$/i.test(value.trim()) ? value.trim().replace('.', ',') : value;
};

export const gridToRows = (grid: GridData, dropEmpty: boolean): string[][] => {
  const rows = grid.rows.map((row) => grid.cols.map((_, i) => row[i] ?? ''));
  return dropEmpty ? trimEmptyRows(rows) : rows;
};

export const serializeTable = (
  names: string[],
  rows: string[][],
  opts: ExportOptions
): { content: string; fileName: string; mime: string } => {
  const delim = opts.format === 'csv' || opts.format === 'spss' ? opts.delimiter : formatFor(opts.format);
  const converted = rows.map((row) => row.map((v) => applyDecimals(v, opts.decimalSeparator)));
  if (opts.format === 'json') {
    const arr = converted.map((row) => Object.fromEntries(names.map((n, i) => [n, row[i] ?? ''])));
    return { content: JSON.stringify(arr, null, 2), fileName: 'lazstats.json', mime: 'application/json;charset=utf-8' };
  }
  const body = opts.includeHeader
    ? toCsv(names, converted, delim)
    : converted.map((row) => names.map((_, i) => escapeField(row[i] ?? '', delim)).join(delim)).join('\n');
  if (opts.format === 'spss') {
    return { content: body, fileName: 'lazstats.csv', mime: 'text/csv;charset=utf-8' };
  }
  const ext = opts.format === 'tsv' ? 'tsv' : opts.format === 'pipe' ? 'txt' : 'csv';
  const mime = opts.format === 'tsv' ? 'text/tab-separated-values;charset=utf-8' : 'text/csv;charset=utf-8';
  return { content: body, fileName: `lazstats.${ext}`, mime };
};

/** Minimal SPSS companion: GET DATA + VARIABLE LABELS + FORMATS. */
export const buildSpsSyntax = (
  csvFileName: string,
  names: string[],
  types: string[],
  opts: ExportOptions
): string => {
  const delim = opts.delimiter === '\t' ? 'TAB' : `"${opts.delimiter}"`;
  const decimal = opts.decimalSeparator === ',' ? 'COMMA' : 'DOT';
  // Sanitized names can collide ("a-b" vs "a b" -> A_B): dedupe to keep
  // the .sps / CSV column mapping 1:1.
  const seen = new Map<string, number>();
  const spsNames = names.map((n) => {
    const base = sanitizeSpsName(n);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base.slice(0, 60)}_${count + 1}`;
  });
  const vars = names.map((_, i) => {
    const t = types[i] ?? 'str';
    const fmt = t === 'int' ? 'F8.0' : t === 'dec' || t === 'num' ? 'F12.4' : 'A64';
    return `  ${spsNames[i]} (${fmt})`;
  });
  return [
    `* LazStats export companion. Run in SPSS with the CSV in the same folder.`,
    `GET DATA /TYPE=TXT`,
    `  /FILE="${csvFileName}"`,
    `  /ENCODING="UTF8"`,
    `  /ARRANGEMENT=DELIMITED`,
    `  /DELCASE=LINE`,
    `  /DELIMITERS=${delim}`,
    `  /QUALIFIER='"'`,
    `  /FIRSTCASE=${opts.includeHeader ? 2 : 1}`,
    `  /VARIABLES=`,
    vars.join('\n'),
    `  .`,
    `SET DECIMAL ${decimal}.`,
    `VARIABLE LABELS`,
    names.map((n, i) => `  ${spsNames[i]} "${n.replace(/"/g, "'").slice(0, 120)}"`).join('\n'),
    `  .`,
    `EXECUTE.`,
    ``,
  ].join('\n');
};

const sanitizeSpsName = (name: string): string => {
  let s = name.trim().replace(/[^A-Za-z0-9_]/g, '_');
  if (/^[0-9]/.test(s)) s = `V_${s}`;
  return (s || 'VAR').slice(0, 64).toUpperCase();
};

export const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  // Firefox requires the anchor in the DOM for click() to trigger.
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on next tick so the download can start first.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadText = (content: string, fileName: string, mime: string): void => {
  downloadBlob(new Blob([content], { type: mime }), fileName);
};

export const downloadBytes = (bytes: Uint8Array, fileName: string, mime: string): void => {
  // Copy into a fresh ArrayBuffer so the Blob never aliases a larger buffer.
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  downloadBlob(new Blob([copy], { type: mime }), fileName);
};

/** A file produced by an export dialog: text formats or binary workbooks. */
export type ExportFile =
  | { content: string; fileName: string; mime: string; bytes?: undefined }
  | { bytes: Uint8Array; fileName: string; mime: string; content?: undefined };

export const downloadExportFile = (file: ExportFile): void => {
  if (file.bytes) downloadBytes(file.bytes, file.fileName, file.mime);
  else downloadText(file.content ?? '', file.fileName, file.mime);
};
