/**
 * Serialisable snapshots of the output console.
 *
 * Every run is pushed as React nodes (tables, Victory charts, written report),
 * which cannot be stored in a .lzs file. The console therefore keeps a static
 * HTML snapshot of the same block: it is produced by `renderToStaticMarkup`
 * (the charts become self-contained SVG) and any restored snapshot is passed
 * through `sanitizeOutputHtml` before it is injected into the document.
 *
 * Snapshots are deliberately capped: the console is a reading aid, not the
 * project data, and localStorage has a ~5 MB budget shared with the grid.
 */

export const MAX_STORED_OUTPUTS = 20;
/** Total HTML kept in the project file / autosave (roughly 20 charts-heavy runs). */
export const MAX_STORED_OUTPUT_CHARS = 1_500_000;
/** A single block above this size is not stored (defensive on file load). */
export const MAX_SINGLE_OUTPUT_CHARS = 600_000;

export interface StoredOutput {
  id: string;
  title: string;
  createdAt: string;
  html: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

const decodeEntities = (value: string): string =>
  value
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * The first `.output-title` in a rendered block names the analysis. Extracted
 * from the snapshot itself so `pushOutput` stays a single call for every
 * analysis (and future ones) instead of a new title argument at each call site.
 */
export const extractOutputTitle = (html: string): string => {
  const match = html.match(
    /<[^>]*class="[^"]*\boutput-title\b[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i
  );
  const raw = match ? match[1].replace(/<[^>]*>/g, ' ') : '';
  const title = decodeEntities(raw).replace(/\s+/g, ' ').trim();
  return title || 'Analysis output';
};

/** Keep the newest blocks that fit the count and character budget. */
export const capStoredOutputs = <T extends StoredOutput>(outputs: T[]): T[] => {
  const capped = outputs.slice(-MAX_STORED_OUTPUTS);
  const kept: T[] = [];
  let total = 0;
  for (let index = capped.length - 1; index >= 0; index -= 1) {
    const entry = capped[index];
    if (kept.length > 0 && total + entry.html.length > MAX_STORED_OUTPUT_CHARS) break;
    kept.unshift(entry);
    total += entry.html.length;
  }
  return kept;
};

/** Validate an untrusted `outputs` array coming from a project file. */
export const parseStoredOutputs = (value: unknown): StoredOutput[] => {
  if (!Array.isArray(value)) return [];
  const entries: StoredOutput[] = [];
  value.forEach((raw) => {
    if (!isRecord(raw)) return;
    const html = text(raw.html, '');
    if (!html || html.length > MAX_SINGLE_OUTPUT_CHARS) return;
    entries.push({
      id: text(raw.id, `run-${entries.length + 1}`),
      title: text(raw.title, 'Analysis output'),
      createdAt: text(raw.createdAt, ''),
      html,
    });
  });
  return capStoredOutputs(entries);
};

const FORBIDDEN_TAGS = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'textarea',
  'select',
  'option',
  'button',
  'style',
]);

const UNSAFE_URL = /^\s*(javascript|vbscript|data:text\/html)/i;
const UNSAFE_STYLE = /url\s*\(|expression\s*\(|@import/i;

/**
 * Allow-list of attributes that cannot execute code once the forbidden tags
 * above are gone. Inline styles are kept (Victory uses them) but CSS-based
 * payloads (`url(...)`, `expression(...)`, `@import`) are dropped.
 */
const isSafeAttribute = (attribute: Attr): boolean => {
  const name = attribute.name.toLowerCase();
  if (name.startsWith('on')) return false;
  if (name === 'srcdoc' || name === 'formaction' || name === 'action') return false;
  if (name === 'src' || name === 'href' || name === 'xlink:href') {
    const value = attribute.value.trim();
    return value.startsWith('#') || /^data:image\//i.test(value);
  }
  if (name === 'style') return !UNSAFE_STYLE.test(attribute.value);
  return true;
};

const sanitizeElement = (element: Element): void => {
  Array.from(element.children).forEach((child) => {
    if (FORBIDDEN_TAGS.has(child.tagName.toLowerCase())) {
      child.remove();
      return;
    }
    Array.from(child.attributes).forEach((attribute) => {
      if (attribute.name.toLowerCase() === 'href' && UNSAFE_URL.test(attribute.value)) {
        child.removeAttribute(attribute.name);
        return;
      }
      if (!isSafeAttribute(attribute)) child.removeAttribute(attribute.name);
    });
    sanitizeElement(child);
  });
};

/**
 * Strip executable content from a stored snapshot. Runs only in the browser
 * (DOMParser); returning an empty string elsewhere is safe because snapshots
 * are only rendered in the browser. The HTML is generated by our own renderer,
 * so this is defence in depth against a hand-edited or hostile .lzs file.
 */
export const sanitizeOutputHtml = (html: string): string => {
  if (!html || html.length > MAX_SINGLE_OUTPUT_CHARS) return '';
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (doc.body) sanitizeElement(doc.body);
  return doc.body ? doc.body.innerHTML : '';
};
