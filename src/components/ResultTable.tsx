import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { TableColumn, TableSpec } from '../stats/types';
import { formatCell, isSignificantP } from '../stats/format';
import { copyText } from '../io/clipboard';
import { tableToTsv } from '../io/tableTsv';

const isNumericFormat = (column: TableColumn): boolean =>
  column.format !== undefined && column.format !== 'text';

const cellClass = (column: TableColumn, value: unknown): string => {
  const classes: string[] = ['whitespace-nowrap', 'font-mono', 'text-[11px]'];
  if (column.align === 'left' || !isNumericFormat(column)) classes.push('text-left');
  else classes.push('text-right');
  if (column.format === 'p' && isSignificantP(value as number)) {
    classes.push('text-green', 'font-bold');
  }
  return classes.join(' ');
};

const CopyTableButton: React.FC<{ spec: TableSpec }> = ({ spec }) => {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const onClick = async () => {
    const ok = await copyText(tableToTsv(spec));
    setState(ok ? 'ok' : 'fail');
    setTimeout(() => setState('idle'), 1500);
  };
  const label = state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy failed' : 'Copy table as TSV';
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={`${label}: ${spec.title}`}
      data-no-print
      className={`tb-btn ml-auto flex items-center gap-1 px-1.5 py-0.5 text-[10px] ${
        state === 'ok' ? 'text-green border-green/50' : state === 'fail' ? 'text-red border-red/50' : ''
      }`}
    >
      {state === 'ok' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {state === 'ok' ? 'Copied' : 'TSV'}
    </button>
  );
};

export const ResultTable: React.FC<{ spec: TableSpec }> = ({ spec }) => (
  <section className="mb-6">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
      <h3 className="text-[11px] text-accent2 font-semibold uppercase tracking-wider">
        {spec.title}
      </h3>
      {spec.subtitle && (
        <span className="text-[10px] text-text3 font-mono">{spec.subtitle}</span>
      )}
      <CopyTableButton spec={spec} />
    </div>

    <div className="overflow-x-auto scrollbar">
      <table className="output-table w-full">
        <thead>
          <tr>
            {spec.columns.map(column => (
              <th
                key={column.key}
                className={`whitespace-nowrap ${
                  column.align === 'left' || !isNumericFormat(column)
                    ? 'text-left'
                    : 'text-right'
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.rows.length === 0 ? (
            <tr>
              <td colSpan={spec.columns.length} className="text-center text-text3 italic">
                Nessun dato disponibile
              </td>
            </tr>
          ) : (
            spec.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {spec.columns.map(column => {
                  const value = row[column.key];
                  const isFirst = column === spec.columns[0];
                  return (
                    <td
                      key={column.key}
                      className={`${cellClass(column, value)} ${
                        isFirst ? 'font-bold text-text' : ''
                      }`}
                    >
                      {formatCell(value, column.format)}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>

    {spec.notes && spec.notes.length > 0 && (
      <div className="mt-1.5 text-[10px] text-text3 leading-relaxed">
        {spec.notes.map((note, index) => (
          <p key={index}>{note}</p>
        ))}
      </div>
    )}
  </section>
);

export const ResultTables: React.FC<{ specs: TableSpec[] }> = ({ specs }) => (
  <>
    {specs.map(spec => (
      <ResultTable key={spec.id} spec={spec} />
    ))}
  </>
);
