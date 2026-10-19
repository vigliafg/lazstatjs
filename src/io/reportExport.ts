/** Standalone, printable HTML report built from the rendered output console. */

export interface ReportMeta {
  title: string;
  generatedAt: string;
  details?: string[];
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const PRINT_CSS = `
  :root { color-scheme: light; }
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px 28px 40px;
    background: #ffffff;
    color: #111827;
    font-family: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 12px;
    line-height: 1.5;
  }
  header.report-header {
    border-bottom: 2px solid #0ea5e9;
    padding-bottom: 10px;
    margin-bottom: 22px;
  }
  header.report-header h1 {
    margin: 0 0 4px;
    font-size: 19px;
    letter-spacing: 0.01em;
  }
  header.report-header .meta {
    margin: 0;
    color: #64748b;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .output-block, section { margin-bottom: 22px; }
  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #0369a1;
    margin: 16px 0 6px;
  }
  h4 { font-size: 11px; color: #334155; margin: 12px 0 4px; }
  p { margin: 0 0 6px; }
  ul { margin: 4px 0 8px; padding-left: 18px; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 4px 0 14px;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 9.5px;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 3px 6px;
    text-align: left;
    vertical-align: top;
  }
  th { background: #eef2f7; font-weight: 600; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  svg {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 8px 0 14px;
    background: #0d0f14;
    border-radius: 6px;
  }
  [data-report] {
    border: 1px solid #cbd5e1;
    border-left: 4px solid #0ea5e9;
    background: #f8fafc;
    border-radius: 6px;
    padding: 10px 14px;
    margin: 18px 0;
    page-break-inside: avoid;
  }
  [data-report] > p:first-of-type {
    background: #eef2f7;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 12px;
    color: #0f172a;
  }
  [role="img"], [aria-label*="chart" i] { page-break-inside: avoid; }
  button, [data-no-print] { display: none !important; }
  @media print {
    body { padding: 0; }
    a { color: inherit; text-decoration: none; }
  }
`;

export const buildReportDocument = (bodyHtml: string, meta: ReportMeta): string => {
  const details = (meta.details ?? []).map(escapeHtml).join(' · ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(meta.title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<header class="report-header">
  <h1>${escapeHtml(meta.title)}</h1>
  <p class="meta">${escapeHtml(meta.generatedAt)}${details ? ` · ${details}` : ''}</p>
</header>
<main>
${bodyHtml}
</main>
</body>
</html>
`;
};

/**
 * Snapshot the console into a self-contained document: interactive chrome is
 * removed, the SVGs already rendered by Victory stay inline, and the print
 * stylesheet replaces the app's Tailwind classes (which are not copied).
 */
export const buildReportFromElement = (root: HTMLElement, meta: ReportMeta): string => {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button, [data-no-print]').forEach((node) => node.remove());
  clone.querySelectorAll('.output-separator').forEach((node) => node.remove());
  return buildReportDocument(clone.innerHTML, meta);
};
