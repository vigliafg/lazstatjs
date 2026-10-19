/** Persisted import/export preferences (localStorage). */

export interface IoPreferences {
  delimiter: string;
  decimalSeparator: '.' | ',';
  hasHeader: boolean;
  exportFormat: string;
  includeHeader: boolean;
  dropEmptyRows: boolean;
}

export const DEFAULT_PREFS: IoPreferences = {
  delimiter: 'auto',
  decimalSeparator: '.',
  hasHeader: true,
  exportFormat: 'csv',
  includeHeader: true,
  dropEmptyRows: true,
};

const KEY = 'lazstats.io.prefs.v1';

/** Sanitize partial/corrupted preferences into a usable object. */
export const normalizePrefs = (parsed: Partial<IoPreferences>): IoPreferences => {
  const merged = { ...DEFAULT_PREFS, ...parsed };
  // Corrupted or hand-edited values must never reach the IO pipeline.
  if (!['auto', ',', ';', 'tab', '\t', '|'].includes(merged.delimiter)) merged.delimiter = DEFAULT_PREFS.delimiter;
  if (merged.decimalSeparator !== '.' && merged.decimalSeparator !== ',') merged.decimalSeparator = DEFAULT_PREFS.decimalSeparator;
  if (!['csv', 'tsv', 'pipe', 'json', 'spss', 'xlsx'].includes(merged.exportFormat)) merged.exportFormat = DEFAULT_PREFS.exportFormat;
  merged.hasHeader = merged.hasHeader !== false;
  merged.includeHeader = merged.includeHeader !== false;
  merged.dropEmptyRows = merged.dropEmptyRows !== false;
  return merged;
};

export const loadPrefs = (): IoPreferences => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return normalizePrefs(JSON.parse(raw) as Partial<IoPreferences>);
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const savePrefs = (prefs: IoPreferences): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private mode etc: preferences simply do not persist.
  }
};
