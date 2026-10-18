/**
 * Minimal CSV support for the data editor: quoted fields, embedded delimiters
 * and newlines, comma or semicolon separators, and type inference for the
 * imported columns.
 */

export type InferredType = 'num' | 'int' | 'dec' | 'str' | 'bol' | 'dat';

export const detectDelimiter = (text: string): string => {
  const firstLine = text.split(/\r?\n/).find(line => line.trim() !== '') ?? '';
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ';' : ',';
};

export const parseCsv = (text: string, delimiter?: string, opts?: { keepEmpty?: boolean }): string[][] => {
  const separator = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field === '') {
      inQuotes = true;
    } else if (character === separator) {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (character === '\r') {
      // handled by the following \n
    } else {
      field += character;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (opts?.keepEmpty) return rows;
  return rows.filter(values => values.some(value => value.trim() !== ''));
};

const isInteger = (value: string): boolean => /^-?\d+$/.test(value.trim());
const isNumber = (value: string): boolean => /^-?\d*[.,]?\d+(e[+-]?\d+)?$/i.test(value.trim());
const isDecimal = (value: string): boolean => isNumber(value) && !isInteger(value);
const isDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
const isBoolean = (value: string): boolean => /^(0|1|t|f|true|false|yes|no)$/i.test(value.trim());

export const inferColumnType = (values: string[]): InferredType => {
  const filled = values.filter(value => value.trim() !== '');
  if (filled.length === 0) return 'str';
  if (filled.every(isBoolean) && filled.some(value => !isInteger(value))) return 'bol';
  if (filled.every(isDate)) return 'dat';
  if (filled.every(isInteger)) return 'int';
  if (filled.every(isNumber)) return 'dec';
  return 'str';
};

/**
 * Splits a parsed CSV into a header row and data rows. The first row is used
 * as the header when it is non-empty and does not look numeric.
 */
export const csvToTable = (
  rows: string[][]
): { names: string[]; types: InferredType[]; rows: string[][] } => {
  if (rows.length === 0) return { names: [], types: [], rows: [] };

  const width = Math.max(...rows.map(row => row.length));
  const padded = rows.map(row => Array.from({ length: width }, (_, index) => row[index] ?? ''));
  const first = padded[0];
  const hasHeader = first.some(cell => cell.trim() !== '') && first.every(cell => !isNumber(cell));

  const body = hasHeader ? padded.slice(1) : padded;
  const names = hasHeader
    ? first.map((cell, index) => cell.trim() || `Var${index + 1}`)
    : Array.from({ length: width }, (_, index) => `Var${index + 1}`);
  const types = Array.from({ length: width }, (_, index) =>
    inferColumnType(body.map(row => row[index] ?? ''))
  );

  // Semicolon-delimited files from Italian locales use a decimal comma: turn
  // it into a dot so the numeric columns can be analysed.
  const numeric = types.map(type => type === 'num' || type === 'dec');
  const normalized = body.map(row =>
    row.map((cell, index) =>
      numeric[index] && isDecimal(cell) ? cell.trim().replace(',', '.') : cell
    )
  );

  return { names, types, rows: normalized };
};

export const escapeField = (value: string, delimiter: string): string => {
  if (value.includes(delimiter) || value.includes('"') || /[\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const toCsv = (
  names: string[],
  rows: string[][],
  delimiter = ','
): string => {
  const lines = [names.map(name => escapeField(name, delimiter)).join(delimiter)];
  rows.forEach(row => {
    lines.push(names.map((_, index) => escapeField(row[index] ?? '', delimiter)).join(delimiter));
  });
  return lines.join('\n');
};

/** Drops the trailing empty rows the grid keeps for typing. */
export const trimEmptyRows = (rows: string[][]): string[][] =>
  rows.filter(row => row.some(cell => String(cell ?? '').trim() !== ''));
