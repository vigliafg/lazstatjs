/** Smart format detection: delimiter, header confidence, encoding hints. */

export type Delimiter = ',' | ';' | '\t' | '|';

export interface Detection {
  delimiter: Delimiter;
  delimiterScores: Record<Delimiter, number>;
  hasHeader: boolean;
  headerConfidence: number;
  hadBOM: boolean;
  decimalComma: boolean;
  previewRows: number;
}

const CANDIDATES: Delimiter[] = [',', ';', '\t', '|'];

const stripBOM = (text: string): { text: string; hadBOM: boolean } =>
  text.charCodeAt(0) === 0xfeff ? { text: text.slice(1), hadBOM: true } : { text, hadBOM: false };

const sampleLines = (text: string, max = 12): string[] => {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length && lines.length < max; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (text[i + 1] === '"') {
        current += '""';
        i += 1;
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      if (current.trim() !== '') lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '' && lines.length < max) lines.push(current);
  return lines;
};

const splitLine = (line: string, delim: Delimiter): string[] => {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
};

const isNum = (v: string): boolean => /^-?\d*[.,]?\d+(e[+-]?\d+)?$/i.test(v.trim()) && v.trim() !== '';

/** Score delimiters by column-count consistency across sampled lines. */
export const detectDelimiter = (text: string): { delimiter: Delimiter; scores: Record<Delimiter, number> } => {
  const { text: clean } = stripBOM(text);
  const lines = sampleLines(clean).slice(0, 8);
  const scores = { ',': 0, ';': 0, '\t': 0, '|': 0 } as Record<Delimiter, number>;
  if (lines.length === 0) return { delimiter: ',', scores };
  CANDIDATES.forEach((d) => {
    const counts = lines.map((l) => splitLine(l, d).length);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (avg <= 1) {
      scores[d] = 0;
      return;
    }
    const variance = counts.reduce((a, c) => a + (c - avg) ** 2, 0) / counts.length;
    // Consistent multi-column splits score high; single-column scores zero.
    scores[d] = avg / (1 + variance);
  });
  let best: Delimiter = ',';
  CANDIDATES.forEach((d) => {
    if (scores[d] > scores[best]) best = d;
  });
  return { delimiter: best, scores };
};

/** Heuristic: header when first row is non-numeric while body rows are. */
export const detectHeader = (rows: string[][]): { hasHeader: boolean; confidence: number } => {
  if (rows.length < 2) return { hasHeader: rows.length === 1, confidence: 0.5 };
  const first = rows[0];
  const body = rows.slice(1, Math.min(rows.length, 9));
  const firstNumeric = first.filter((c) => isNum(c)).length / Math.max(1, first.length);
  const bodyNumeric = body.flat().filter((c) => c.trim() !== '' && isNum(c)).length / Math.max(1, body.flat().filter((c) => c.trim() !== '').length);
  const firstEmpty = first.filter((c) => c.trim() === '').length / Math.max(1, first.length);
  // A first row that is entirely numeric while the body is numeric too is
  // data (years, IDs), not a header: the usual type-contrast signal is absent.
  if (firstNumeric === 1 && bodyNumeric >= 0.5) {
    return { hasHeader: false, confidence: 0.2 };
  }
  let confidence = 0.5 + (bodyNumeric - firstNumeric) * 0.5 - firstEmpty * 0.3;
  confidence = Math.max(0.05, Math.min(0.99, confidence));
  return { hasHeader: confidence >= 0.5, confidence };
};

export const looksLikeJson = (text: string): boolean => {
  const t = text.trim().replace(/^﻿/, '');
  return t.startsWith('[') || t.startsWith('{');
};

export const detectFormat = (fileName: string, text: string): Detection => {
  const { hadBOM } = stripBOM(text);
  const lower = fileName.toLowerCase();
  const json = looksLikeJson(text);
  const { delimiter: detected, scores } = detectDelimiter(text);
  let delimiter: Delimiter = ',';
  if (lower.endsWith('.tsv') || lower.endsWith('.tab')) delimiter = '\t';
  else if (!json) delimiter = detected;
  // Cheap parse of first rows for header detection.
  const lines = sampleLines(stripBOM(text).text, 10).map((l) => splitLine(l, delimiter));
  const { hasHeader, confidence } = detectHeader(lines);
  const sample = lines.flat().join(' ');
  const decimalComma = /;\s*\d+,\d+/.test(text.slice(0, 4000)) || (delimiter === ';' && /\d,\d/.test(sample));
  return {
    delimiter,
    delimiterScores: scores,
    hasHeader,
    headerConfidence: confidence,
    hadBOM,
    decimalComma,
    previewRows: lines.length,
  };
};
