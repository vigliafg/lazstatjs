/** TableSpec serialisation for clipboard/paste workflows. */

import { formatCell } from '../stats/format';
import type { TableSpec } from '../stats/types';

const escapeTsv = (value: string): string =>
  /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * One table as TSV. Values use the same formatting as the rendered table so
 * the paste matches what the user sees (CI ranges, p-values, percentages).
 */
export const tableToTsv = (spec: TableSpec): string => {
  const rows = [
    spec.columns.map((column) => escapeTsv(column.label)).join('\t'),
    ...spec.rows.map((row) =>
      spec.columns.map((column) => escapeTsv(formatCell(row[column.key], column.format))).join('\t')
    ),
  ];
  return rows.join('\n');
};
