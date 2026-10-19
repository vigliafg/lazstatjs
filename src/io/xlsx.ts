/**
 * Excel (.xlsx) import/export. SheetJS is used only on data that the user
 * opens or downloads locally: no workbook ever leaves the browser.
 *
 * Reading returns a rectangle of cell text per sheet, which then flows through
 * the same `toImportTable` pipeline as CSV/JSON (type inference, header
 * dedupe, caps). Writing turns numbers into real numeric cells so Excel can
 * sort, chart and average them without a text-to-number cleanup.
 */

import * as XLSX from 'xlsx';
import type { GridData } from '../grid/types';
import { toImportTable, type ImportTable } from './readers';
import type { ColType } from '../grid/types';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface XlsxSheet {
  name: string;
  /** Raw cell text, one array per row (ragged rows allowed). */
  rows: string[][];
}

export interface WorkbookSheet {
  name: string;
  rows: (string | number | null)[][];
}

const NUMBER_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
};

const isBlankRow = (row: string[]): boolean => row.every((cell) => cell.trim() === '');

/** Read every worksheet of a workbook as text matrices (blank rows dropped). */
export const readXlsxSheets = (bytes: ArrayBuffer | Uint8Array): XlsxSheet[] => {
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true, cellNF: false, cellText: false });
  const sheets: XlsxSheet[] = [];
  workbook.SheetNames.forEach((name) => {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) return;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });
    const rows = matrix
      .map((row) => (Array.isArray(row) ? row.map(cellText) : []))
      .filter((row) => !isBlankRow(row));
    // Drop trailing empty columns so a stray formatted cell at the far right
    // does not turn a 4-column sheet into a 60-column import.
    let width = 0;
    rows.forEach((row) => {
      for (let i = row.length - 1; i >= 0; i -= 1) {
        if (row[i].trim() !== '') {
          width = Math.max(width, i + 1);
          break;
        }
      }
    });
    if (width === 0) return;
    sheets.push({ name, rows: rows.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? '')) });
  });
  if (sheets.length === 0) throw new Error('The workbook has no non-empty sheets');
  return sheets;
};

/** Build the final typed table from one worksheet, reusing the CSV contract. */
export const xlsxSheetToTable = (
  sheet: XlsxSheet,
  opts: { hasHeader: boolean; decimalComma?: boolean; typeOverrides?: Record<number, ColType> }
): ImportTable => {
  const rows = sheet.rows.filter((row) => !isBlankRow(row));
  if (rows.length === 0) throw new Error('The sheet has no data rows');
  const names = rows[0].map((cell, index) => cell.trim() || `Var${index + 1}`);
  const body = opts.hasHeader ? rows.slice(1) : rows;
  if (opts.hasHeader && body.length === 0) throw new Error('Header found but no data rows');
  return toImportTable(names, body, {
    hasHeader: opts.hasHeader,
    decimalComma: opts.decimalComma,
    typeOverrides: opts.typeOverrides,
    skippedEmpty: sheet.rows.length - rows.length,
  });
};

const usedNames = (): { take: (name: string) => string } => {
  const used = new Set<string>();
  return {
    take: (name: string): string => {
      const base = sanitizeSheetName(name);
      let candidate = base;
      let counter = 2;
      while (used.has(candidate.toLowerCase())) {
        const suffix = `_${counter}`;
        candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
        counter += 1;
      }
      used.add(candidate.toLowerCase());
      return candidate;
    },
  };
};

/** Excel sheet-name rules: 31 chars, no []:*?/\\ and unique case-insensitively. */
export const sanitizeSheetName = (name: string): string => {
  const cleaned = name
    .replace(/[\[\]:*?/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^'+|'+$/g, '')
    .trim()
    .slice(0, 31);
  return cleaned || 'Sheet';
};

const toNumericCell = (value: string, numericColumn: boolean): string | number => {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (numericColumn && NUMBER_RE.test(trimmed)) return Number(trimmed);
  return value;
};

export const gridToWorkbookSheet = (
  grid: GridData,
  opts: { includeHeader: boolean; dropEmptyRows: boolean }
): WorkbookSheet => {
  const rows = opts.dropEmptyRows
    ? grid.rows.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    : grid.rows;
  const numeric = grid.cols.map((column) => column.type === 'int' || column.type === 'num' || column.type === 'dec');
  const body = rows.map((row) => grid.cols.map((_, index) => toNumericCell(String(row[index] ?? ''), numeric[index])));
  const header = grid.cols.map((column) => column.name);
  return { name: 'Dati', rows: opts.includeHeader ? [header, ...body] : body };
};

const infoSheet = (grid: GridData, rowsExported: number): WorkbookSheet => ({
  name: 'Info',
  rows: [
    ['LazStats JS'],
    ['Generato', new Date().toISOString()],
    ['Righe esportate', rowsExported],
    ['Colonne', grid.cols.length],
    ['Nota', 'Il foglio Dati contiene la griglia; eventuali altri fogli contengono le tabelle dei risultati.'],
  ],
});

/** Workbook with the dataset plus an Info sheet. */
export const buildDataWorkbook = (
  grid: GridData,
  opts: { includeHeader: boolean; dropEmptyRows: boolean }
): Uint8Array => {
  const data = gridToWorkbookSheet(grid, opts);
  const rowsExported = Math.max(0, data.rows.length - (opts.includeHeader ? 1 : 0));
  return writeWorkbook([data, infoSheet(grid, rowsExported)]);
};

const renderTableRows = (table: HTMLTableElement): (string | number)[][] => {
  const rows: (string | number)[][] = [];
  table.querySelectorAll('tr').forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll('th, td')).map((cell) => {
      const text = (cell.textContent ?? '').replace(/\s+/g, ' ').trim();
      // Keep the on-screen formatting; convert only plain numbers so Excel
      // can compute with them ("< 0.001" and "1.2 – 3.4" stay text).
      return NUMBER_RE.test(text) ? Number(text) : text;
    });
    if (cells.some((cell) => String(cell) !== '')) rows.push(cells);
  });
  return rows;
};

/**
 * Snapshot the output console as a workbook: every rendered result table
 * becomes a sheet, next to the dataset. Table titles come from the section
 * heading so the sheets are recognisable without opening them.
 */
export const buildResultsWorkbookFromElement = (root: HTMLElement, grid: GridData): Uint8Array => {
  const data = gridToWorkbookSheet(grid, { includeHeader: true, dropEmptyRows: true });
  const rowsExported = Math.max(0, data.rows.length - 1);
  const names = usedNames();
  const sheets: WorkbookSheet[] = [data, infoSheet(grid, rowsExported)];
  root.querySelectorAll('table.output-table').forEach((table, index) => {
    const heading = table.closest('section')?.querySelector('h3')?.textContent?.trim();
    const title = heading && heading !== '' ? heading : `Tabella ${index + 1}`;
    const rows = renderTableRows(table as HTMLTableElement);
    if (rows.length === 0) return;
    sheets.push({ name: names.take(title), rows });
  });
  return writeWorkbook(sheets);
};

/** Serialise sheets to a compressed .xlsx byte array. */
export const writeWorkbook = (sheets: WorkbookSheet[]): Uint8Array => {
  const workbook = XLSX.utils.book_new();
  const names = usedNames();
  sheets.forEach((sheet) => {
    const rows = sheet.rows.length > 0 ? sheet.rows : [['']];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const width = Math.max(1, ...rows.map((row) => row.length));
    worksheet['!cols'] = Array.from({ length: width }, (_, column) => {
      const longest = rows.reduce((max, row) => {
        const text = row[column] === null || row[column] === undefined ? '' : String(row[column]);
        return Math.max(max, text.length);
      }, 0);
      return { wch: Math.min(48, Math.max(10, longest + 2)) };
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, names.take(sheet.name));
  });
  const out = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
  return new Uint8Array(out as ArrayBuffer);
};
