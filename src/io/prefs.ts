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

export const loadPrefs = (): IoPreferences => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<IoPreferences>;
    return { ...DEFAULT_PREFS, ...parsed };
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
