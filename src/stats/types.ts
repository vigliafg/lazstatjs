export type CellFormat =
  | 'text'
  | 'int'
  | 'dec1'
  | 'dec2'
  | 'dec3'
  | 'dec4'
  | 'p'
  | 'pct';

export interface TableColumn {
  key: string;
  label: string;
  format?: CellFormat;
  align?: 'left' | 'right';
}

export type CellValue = number | string | null | undefined;

export interface TableRow {
  [key: string]: CellValue;
}

export interface TableSpec {
  id: string;
  title: string;
  subtitle?: string;
  columns: TableColumn[];
  rows: TableRow[];
  notes?: string[];
}
