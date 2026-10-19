/**
 * Help content for the in-app HELP tab.
 *
 * Kept as plain data (no JSX) so the wording can be reviewed and tested without
 * a DOM: `src/help/helpContent.test.ts` checks the structure and that every
 * analysis panel and the main tools are documented.
 *
 * Labels in `steps` mirror the labels shown by the application (buttons,
 * selectors, menu entries) so the instructions match what the user sees.
 */

export interface HelpTable {
  head: string[];
  rows: string[][];
}

export interface HelpExample {
  title: string;
  /** Numbered walkthrough referring to the buttons and values of the app. */
  steps: string[];
  note?: string;
}

export interface HelpBlock {
  title: string;
  intro?: string;
  steps?: string[];
  example?: HelpExample;
  table?: HelpTable;
  tip?: string;
}

export interface HelpSection {
  id: string;
  title: string;
  summary: string;
  blocks: HelpBlock[];
}

export interface HelpTab {
  id: string;
  label: string;
  title: string;
  blurb: string;
  sections: HelpSection[];
}

const DEMO = 'Score_Pre, Score_Post, Group and Age';

export const HELP_TABS: HelpTab[] = [
  /* ------------------------------------------------------------------ */
  {
    id: 'overview',
    label: 'Overview',
    title: 'What LazStats JS is and how to get through it',
    blurb:
      'Everything runs in your browser: the data never leaves the machine. A session is three steps — put data in, run an analysis, take the results out.',
    sections: [
      {
        id: 'tour',
        title: 'The tour',
        summary: 'The four tabs at the top of the window and what each one is for.',
        blocks: [
          {
            title: 'What the application does',
            intro:
              'LazStats JS is a spreadsheet-like data editor with a full statistics suite: descriptive statistics, t-tests, ANOVA family, regression, correlations, contingency tables, non-parametric tests, time series, survival analysis and a guided Wizard that chooses the right test for you.',
            steps: [
              'Type or paste data in DATA EDITOR, or bring a CSV/TSV/JSON/Excel file in through Import.',
              'Declare which columns are groups and, if you want, give their codes readable labels.',
              'Choose an analysis in ANALYSIS & OUTPUT, set its parameters and press Run Analysis.',
              'Read the tables, the charts and the written report in the output console.',
              'Copy a single table, export PNG charts, a printable HTML report or an Excel workbook.',
            ],
          },
          {
            title: 'The tabs',
            table: {
              head: ['Tab', 'Use it for'],
              rows: [
                ['DATA EDITOR', 'Grid, column types, groups and levels, cleaning and transforming, import, export, projects'],
                ['ANALYSIS & OUTPUT', 'Analysis panels, CI level, Run Analysis, the output console and its exports'],
                ['SETTINGS', 'Import/export defaults and output preferences'],
                ['HELP', 'This guide, organised by tab with step-by-step examples'],
              ],
            },
          },
          {
            title: 'The golden path',
            steps: [
              'Open DATA EDITOR and press New to start from an empty grid, or Import to load a file.',
              'Check the type dropdown under each header (num, int, cat, str, ...) so validation and the pickers behave.',
              'Use Clean (find/replace, missing values, tidy) and Transform (sort, recode, split/merge, compute) to prepare the data.',
              'For grouping columns, open the levels editor and set labels, order and a reference level.',
              'Switch to ANALYSIS & OUTPUT, pick the analysis, set the parameters, press Run Analysis.',
              'Read the "Report di lettura" card that closes every run and export what you need.',
            ],
          },
          {
            title: 'How one run works',
            steps: [
              'The CI level (90/95/99%) at the top of ANALYSIS & OUTPUT applies to every table of the run.',
              'The panel of the selected analysis shows only the parameters it needs.',
              'Run Analysis appends one block to the output console: tables first, charts in the middle, the written report last.',
              'Running again appends a new block; nothing is overwritten, so you can compare two specifications.',
              'Each block can be removed on its own with the ✕ button next to it; Clear empties the whole console.',
            ],
            tip: 'Analysis parameters are not autosaved between reloads: after reopening a project the panel restarts from grid defaults. The data, the levels and the console survive.',
          },
          {
            title: 'Where your work lives',
            steps: [
              'A silent autosave keeps grid, settings, parameters and the output console in this browser; the toolbar shows the time of the last one.',
              'Save project writes a .lzs file (JSON) with the dataset, settings and parameters.',
              'Open project replaces the current session with the file content; bad or newer files are refused with a message.',
              'The output console is stored as static snapshots (max 20 runs / 1.5 MB): after a reload they are read-only, but Copy, Charts PNG, Report HTML and Results XLSX still work.',
            ],
          },
        ],
      },
    ],
  },
  /* ------------------------------------------------------------------ */
  {
    id: 'editor',
    label: 'Data Editor',
    title: 'Enter, check and organise data',
    blurb:
      'The grid behaves like a spreadsheet: type, navigate with the keyboard, paste whole blocks, sort, filter and validate.',
    sections: [
      {
        id: 'editing',
        title: 'Editing cells',
        summary: 'Typing, navigating and moving blocks of cells around.',
        blocks: [
          {
            title: 'Type in a cell',
            steps: [
              'Click a cell, or move with the arrow keys / Tab, and start typing.',
              'Values are validated as soon as you leave the cell: an invalid value is highlighted and counted in the INVALID field of the status bar.',
              'Empty cells show a small italic "null" hint and are treated as missing by the analyses.',
              'A categorical column shows a dropdown with its declared levels instead of a free text box.',
            ],
            example: {
              title: 'Enter four measurements',
              steps: [
                'Press New to get a 1-column grid (Var1).',
                'Click the first cell and type 12, then Enter: the cursor moves down.',
                'Repeat with 15, 9, 13.',
                'The status bar shows ROWS: 4 / 20 and COLS: 1.',
              ],
            },
          },
          {
            title: 'Keyboard inside the grid',
            table: {
              head: ['Key', 'Effect'],
              rows: [
                ['Enter / Shift+Enter', 'Move one row down / up'],
                ['Tab / Shift+Tab', 'Move one column right / left'],
                ['Arrow keys', 'Move the active cell'],
                ['Shift + click', 'Extend the selection from the anchor cell'],
                ['Ctrl+C', 'Copy the selected range as TSV'],
                ['Ctrl+Backspace or Ctrl+Delete', 'Clear the selected range'],
                ['Esc', 'Leave the cell without moving'],
                ['Ctrl+Z / Ctrl+Y', 'Undo / redo the last grid operation'],
              ],
            },
          },
          {
            title: 'Paste a block and let the grid grow',
            steps: [
              'Copy a rectangular block from a spreadsheet (tab-separated).',
              'Click the top-left destination cell and press Ctrl+V.',
              'Rows and columns are added automatically when the block is larger than the grid.',
              'When a single value is pasted, only the active cell is filled.',
            ],
            example: {
              title: 'Paste 20 rows with 4 columns',
              steps: [
                'Select A1:D20 in your spreadsheet and copy it.',
                'In LazStats, click cell 1 of Var1 and paste.',
                'The grid expands to 4 columns and 20 rows; each header is named Var1...Var4 until you rename it.',
              ],
            },
          },
          {
            title: 'Work with a selection',
            steps: [
              'Click a cell, then Shift+click another one to select a rectangle (or Shift+arrow keys).',
              'A bar appears under the grid showing the range, for example SEL: R1-R10 C2-C3.',
              'Fill down copies the top row of the selection into the rows below.',
              'Clear selection empties the selected cells; Copy writes them to the clipboard.',
            ],
          },
        ],
      },
      {
        id: 'structure',
        title: 'Columns, rows and types',
        summary: 'Renaming, adding, moving and typing the columns of the grid.',
        blocks: [
          {
            title: 'Column types',
            intro:
              'The dropdown under each header declares what the column contains. It drives per-cell validation, Auto-fix and which columns appear in the pickers.',
            table: {
              head: ['Type', 'Meaning'],
              rows: [
                ['num', 'Numeric auto-detect, decimal comma accepted'],
                ['int', 'Whole numbers'],
                ['dec', 'Floating point numbers'],
                ['cat', 'Categorical: group codes with labels and dropdown cells'],
                ['str', 'Free text, numbers included'],
                ['id', 'Identifier: unique key, excluded from statistics'],
                ['bol', 'Boolean: 0/1, yes/no, true/false'],
                ['dat', 'Date, YYYY-MM-DD'],
                ['dtm', 'Date-time, YYYY-MM-DD HH:MM[:SS]'],
                ['tim', 'Time, HH:MM[:SS]'],
                ['alp', 'Alphabetic only'],
                ['chr', 'A single character'],
              ],
            },
          },
          {
            title: 'Rename a column',
            steps: [
              'Double-click the header, or click the pencil that appears on hover, or right-click the header and choose Rename column.',
              'Type the new name and press Enter (or click away).',
              'Names are trimmed and kept unique: a duplicate becomes Score_2, Score_3 and so on.',
            ],
            example: {
              title: 'Rename Var1 to Weight',
              steps: [
                'Hover the Var1 header: the pencil appears.',
                'Double-click the name, type Weight, press Enter.',
                'The header shows Weight and all pickers now list Weight.',
              ],
            },
          },
          {
            title: 'Add, duplicate, move and delete columns and rows',
            steps: [
              'Column / Row at the bottom of the grid append a new empty column or row.',
              'Right-click a header for Insert column left / right, Duplicate column, Move left / right and Delete column.',
              'Right-click a row number for Insert row above / below and Delete row.',
              'Clear (red, bottom right) empties every cell but keeps the grid shape; confirm the dialog.',
              'Every one of these operations is undoable with Ctrl+Z.',
            ],
            tip: 'Delete column and Delete row ask for confirmation because they remove data. Duplicating a column keeps its type but not its declared levels.',
          },
        ],
      },
      {
        id: 'view',
        title: 'Sorting, filtering and validating',
        summary: 'View tools that do not change what the analyses use (filter) and tools that do (sort, Auto-fix).',
        blocks: [
          {
            title: 'Sort by a column',
            steps: [
              'Right-click the header and choose Sort ascending or Sort descending.',
              'Numbers are compared numerically and text alphabetically; empty cells go last and the original order is kept for ties.',
              'Transform → Sort does the same with an explicit Asc/Desc selector.',
              'Sorting rewrites the row order, so it is part of the data and undoable.',
            ],
            example: {
              title: 'Order by Score_Post',
              steps: [
                'Right-click the Score_Post header.',
                'Choose Sort descending.',
                'The block appears at the top of the grid; Ctrl+Z restores the previous order.',
              ],
            },
          },
          {
            title: 'Filter the rows you see',
            steps: [
              'Press Filter in the toolbar to open the filter bar.',
              'Choose a column, an operator (contains, =, ≠, >, ≥, <, ≤, is empty, is not empty) and, when needed, a value.',
              'The bar shows visible / total rows, for example 8 / 20 rows.',
              'Clear filter resets the operator and the value; press Filter again to close the bar.',
            ],
            tip: 'The filter is view-only: analyses and exports always use every row, including the ones hidden on screen.',
          },
          {
            title: 'Validate and Auto-fix',
            steps: [
              'Validate scans every cell against its column type and lists the invalid ones in an alert panel.',
              'Jump to first focus the first offending cell; Dismiss closes the panel.',
              'Auto-fix coerces what can be safely coerced: trims spaces, converts decimal commas, normalises booleans (true/yes → 1, false/no → 0) and rounds whole numbers declared as int.',
              'The toast reports how many cells changed; the INVALID counter in the status bar is the check.',
            ],
            example: {
              title: 'Fix a column of numbers written with commas',
              steps: [
                'Type 12,5 and 13,75 in a column declared num and run Validate: no error, the comma is accepted.',
                'Declare the column dec and type 12,5 again.',
                'Press Auto-fix: the cell becomes 12.5 and the toast says "1 cells coerced".',
              ],
            },
          },
          {
            title: 'Freeze the first column',
            steps: [
              'Press Freeze col: the row numbers and the first column stay visible while you scroll horizontally.',
              'Press it again to release the freeze.',
              'The header row is always sticky, with or without the freeze.',
            ],
          },
          {
            title: 'Undo and redo',
            steps: [
              'Undo (Ctrl+Z) and Redo (Ctrl+Y or Ctrl+Shift+Z) cover every grid change: typing, paste, sort, transforms, recoding and level edits.',
              'Rapid typing in the same cell is coalesced into one history step so Undo restores the value you started from.',
              'The history keeps up to 50 steps and lives in the session: reloading the page resets it.',
            ],
          },
        ],
      },
    ],
  },
  /* ------------------------------------------------------------------ */
  {
    id: 'prep',
    label: 'Data prep',
    title: 'Clean, transform, import and export',
    blurb:
      'The Clean and Transform panels sit under the grid toolbar; Import and Export open dialogs over the DATA EDITOR tab.',
    sections: [
      {
        id: 'clean',
        title: 'Clean panel',
        summary: 'Find and replace, fill missing values, tidy the grid up.',
        blocks: [
          {
            title: 'Find and replace',
            steps: [
              'Press Clean in the toolbar to open the panel; the button stays highlighted while it is open.',
              'Type the Find and Replace text.',
              'Choose the scope: All cols or a single column.',
              'Tick Regex to use a regular expression and Aa to match the case.',
              'Press Apply; the toast reports how many replacements were made.',
            ],
            example: {
              title: 'Replace the codes "M" and "F" in one column',
              steps: [
                'Find: M, Replace: 1, scope: the Sex column.',
                'Press Apply → "3 replacements made".',
                'Repeat with Find: F, Replace: 0.',
              ],
              note: 'Turn on Aa when you want "m" left untouched.',
            },
          },
          {
            title: 'Fill missing values',
            steps: [
              'Choose the column in the Missing row.',
              'Choose the strategy: Mean, Median, Mode or Value.',
              'With Value, type the replacement text in the field that appears.',
              'Press Fill; the toast names the value used, for example "4 cells filled with 12.5".',
            ],
            tip: 'Mean and median need numeric cells: if the column holds text, use Mode or Value.',
          },
          {
            title: 'Tidy up',
            steps: [
              'Trim spaces removes leading/trailing blanks and collapses repeated inner spaces.',
              'Drop empty rows removes rows where every cell is blank.',
              'Drop duplicates removes rows that repeat another row exactly (the first one is kept).',
              'Each button reports the number of rows or cells it changed.',
            ],
          },
        ],
      },
      {
        id: 'transform',
        title: 'Transform panel',
        summary: 'Sort, recode with a text mapping, split or merge columns, compute a new column.',
        blocks: [
          {
            title: 'Recode with a text mapping',
            intro:
              'The quick way to rewrite arbitrary values. For group columns prefer the levels editor, which also updates labels and the reference.',
            steps: [
              'Choose the column in the Recode (old=new per line) group.',
              'Write one mapping per line in the text area, for example 1=Yes and 2=No.',
              'Press Recode; the toast reports the number of cells changed ("No values recoded" when nothing matched).',
            ],
            example: {
              title: 'Turn 0/1 into No/Yes',
              steps: [
                'Select the column, write 0=No and 1=Yes on two lines.',
                'Press Recode → "20 cells recoded".',
              ],
            },
          },
          {
            title: 'Split a column on a separator',
            steps: [
              'Choose the source column in Split / Merge.',
              'Type the separator in the small box, for example ; or a comma.',
              'Press Split: the left part stays in place and the right part goes to a new column named <name>_2.',
              'Only the first separator is used.',
            ],
            example: {
              title: 'Split "A;12" into two columns',
              steps: [
                'Separator ;, column Address, press Split.',
                'The grid gains Address_2 with the part after the separator.',
              ],
            },
          },
          {
            title: 'Merge two columns',
            steps: [
              'Choose the two columns and the separator (default _).',
              'Press Merge: the rightmost of the two is removed and the text is joined into the left one.',
              'The resulting header is named after the two originals unless you rename it afterwards.',
            ],
          },
          {
            title: 'Compute a new column from an expression',
            steps: [
              'Write the formula with the column names, for example Score_Post - Score_Pre.',
              'Type the new column name (default Diff).',
              'Press Compute: a numeric column is appended; the toast says "Computed Diff".',
              'Allowed operators: + - * / ( ) ^ % and column names; numbers with a decimal comma are read as decimals.',
            ],
            example: {
              title: 'Difference between two measurements',
              steps: [
                'Expression: Score_Post - Score_Pre, name: Diff.',
                'Press Compute, then rename or declare the new column as needed.',
                'Use Diff straight away in T-Test → One-Sample to test whether the change differs from 0.',
              ],
              note: 'Rows where a name cannot be parsed produce an empty cell instead of an error.',
            },
          },
        ],
      },
      {
        id: 'io',
        title: 'Import, export and projects',
        summary: 'Getting files in and out, plus save/open of the whole session.',
        blocks: [
          {
            title: 'Smart Import',
            steps: [
              'Press Import: CSV, TSV, TXT, PSV, JSON and Excel (.xlsx/.xls/.xlsm) are all accepted.',
              'The Smart Import dialog shows what was detected and a preview with a type dropdown per column.',
              'Adjust Worksheet (for workbooks), Delimiter, Header, Decimals and the per-column types if the guess is wrong.',
              'Choose Apply as: Overwrite grid, Append rows or Merge columns (match by name).',
              'Press Import to apply; the dialog reports skipped empty lines, renamed duplicate headers and a stripped BOM.',
            ],
            example: {
              title: 'Import an Excel sheet with a header',
              steps: [
                'Press Import and choose the .xlsx file.',
                'Pick the worksheet in the Worksheet selector.',
                'Check Header: "First row is header (95%)" and set any column that must be categorical to cat.',
                'Apply as Overwrite grid → Import.',
              ],
            },
            tip: 'Dates and times are recognised as dat/dtm/tim; identifiers can be set to id so they stay out of the statistics.',
          },
          {
            title: 'Export',
            steps: [
              'Press Export in the DATA EDITOR toolbar (the same file also has a default format in SETTINGS).',
              'Choose the Format: CSV (Excel, R), TSV (tab), Pipe TXT, JSON (records), SPSS (CSV + .sps syntax) or Excel workbook (.xlsx).',
              'For text formats choose the Delimiter (comma, semicolon, tab, pipe) and the Decimals (dot or comma).',
              'The options to include the header row and quoted fields are checked by default.',
              'Press Export: the file is downloaded, and for SPSS a second lazstats.sps file with the syntax is added.',
            ],
          },
          {
            title: 'Projects and autosave',
            steps: [
              'Save project writes a .lzs file with dataset, settings, analysis parameters and the output snapshots.',
              'Open project loads such a file and replaces the current session (it asks via the file picker only, never silently).',
              'Autosave runs by default and shows its time in the toolbar; restored sessions come back with the grid and the console.',
              'New resets the grid to a single empty column; it is undoable.',
            ],
            tip: '.lzs files are versioned: a file written by a newer version is refused instead of half-read.',
          },
        ],
      },
    ],
  },
  /* ------------------------------------------------------------------ */
  {
    id: 'groups',
    label: 'Groups & levels',
    title: 'Turn codes into readable, ordered groups',
    blurb:
      'A group column is any column with a small set of recurring values. Declaring levels gives the codes a label, an order and a reference level for the models.',
    sections: [
      {
        id: 'levels',
        title: 'Declare levels',
        summary: 'The levels editor under the column type, and the same editor inside the analysis panels.',
        blocks: [
          {
            title: 'What a group column is',
            intro:
              'Pick a column with recurring values: groups in ANOVA and t-tests, series in repeated measures, classes in contingency tables, strata in survival.',
            table: {
              head: ['Column type', 'Offered as a group when'],
              rows: [
                ['cat', 'always (explicit declaration)'],
                ['bol', 'always (binary by definition)'],
                ['int / num', 'the values are whole numbers and there are 2 to 12 distinct ones'],
                ['str / dat / dtm / tim / alp / chr', 'there are 2 to 12 distinct values'],
                ['id', 'never (a unique key is not a grouping variable)'],
                ['any column with declared levels', 'always, so it stays editable after a recode'],
              ],
            },
          },
          {
            title: 'Open the levels editor',
            steps: [
              'In DATA EDITOR, find the small "N levels" button under the type dropdown of a group column.',
              'In any analysis panel, press "Modifica livelli" next to a group selector — it is the same editor.',
              'For a plain integer column with 2–12 codes, the button appears as soon as it qualifies.',
            ],
          },
          {
            title: 'Set labels, order and reference',
            steps: [
              'In the Levels mode each row shows the stored code, an editable Label, the number of rows with that code and a ref toggle.',
              'Type the Label you want to see in tables, charts and reports (for example 1 → Controllo).',
              'Move rows with the up/down arrows: this is the display order in the outputs.',
              'Tick ref on the level that must be the reference of the model-based analyses (ANCOVA).',
              'Add appends a level by code and label; the bin icon removes a level without touching the data.',
              'Read data pulls in every value present in the column, so you do not have to type the codes.',
              'Apply levels saves everything as one undo step.',
            ],
            example: {
              title: 'Label two groups of the demo data',
              steps: [
                'Open the levels editor on the Group column.',
                'Set Label of 1 to Controllo and of 2 to Trattamento.',
                'Tick ref on 1 so ANCOVA uses Controllo as reference.',
                'Apply levels; run ANOVA → the tables now say Controllo and Trattamento.',
              ],
              note: 'Labels are unique per column: a duplicate label gets a numeric suffix, and if two labels would collide the analysis falls back to the codes rather than merging groups.',
            },
          },
          {
            title: 'Cells become dropdowns',
            steps: [
              'Once a `cat` column has levels, each cell shows a dropdown with the declared levels plus an em dash for empty.',
              'Choosing an entry stores the code, never the label: the label is presentation only.',
              'A value that is not in the list stays visible in italic yellow and marked "not in list"; it is never deleted by the editor.',
            ],
          },
        ],
      },
      {
        id: 'recode',
        title: 'Recode values',
        summary: 'Rename, merge or clear the codes of a group column, with a preview and a single undo step.',
        blocks: [
          {
            title: 'Open the recode mode',
            steps: [
              'Open the levels editor from the grid header or from any panel.',
              'Press Recode values in the modal header: every code of the column is listed with its current label and row count.',
              'The preview under the list updates as you type.',
            ],
          },
          {
            title: 'Rename, merge or clear a code',
            steps: [
              'Type the new code in the field right of a value: that code is rewritten everywhere in the column.',
              'Type the same target for two values to merge them into one group; the label of the first one is kept.',
              'Tick clear to empty the cells that hold a code; the level is dropped from the list.',
              'Read the preview: "N cells change · M groups merged · K cells cleared", plus a warning when the new codes force the column type to cat.',
              'Press Apply recode. Undo (Ctrl+Z) restores cells, labels, reference and type in one step.',
            ],
            example: {
              title: 'Merge a rare third group into the second one',
              steps: [
                'Open Recode values on a column with codes 1, 2 and 3.',
                'Set the new code of 3 to 2.',
                'Preview: "6 cells change · 1 group merged · 0 cells cleared".',
                'Apply recode, then run ANOVA: the factor now has two levels with the merged rows counted together.',
              ],
            },
            tip: 'The match is done against the original value, so a swap such as 1→2 together with 2→1 works as expected. A renamed code that is no longer valid for the column type makes the column categorical.',
          },
        ],
      },
      {
        id: 'analysis-labels',
        title: 'How levels reach the results',
        summary: 'Where labels and the reference level show up.',
        blocks: [
          {
            title: 'Labels everywhere in the output',
            steps: [
              'Descriptives, post-hoc comparisons, charts, contingency margins and survival curves use the labels.',
              'The written report names the levels too, so the prose reads "Controllo" instead of "1".',
              'Exports (Results XLSX, Report HTML, Charts PNG) carry the same labels.',
              'The Wizard profiles the columns using the labels, so its recommendation speaks your language.',
            ],
          },
          {
            title: 'The reference level',
            steps: [
              'ANCOVA uses the reference level as the baseline of the model and says so in the report.',
              'Change the reference and re-run: the coefficients change, the group means do not.',
              'Other analyses use the natural or declared order of the levels.',
            ],
            tip: 'Removing or recoding a level never edits the cells silently: unmatched values stay in the data and appear as "not in list" until you recode or fix them.',
          },
        ],
      },
    ],
  },
  /* ------------------------------------------------------------------ */
  {
    id: 'analyses',
    label: 'Analyses',
    title: 'Every analysis panel, step by step',
    blurb:
      'All panels follow the same rhythm: choose the CI level, fill the selectors, press Run Analysis, read tables → charts → written report.',
    sections: [
      {
        id: 'model',
        title: 'The common run model',
        summary: 'What is identical in all nineteen panels.',
        blocks: [
          {
            title: 'Running an analysis',
            steps: [
              'Open ANALYSIS & OUTPUT and click the analysis tab you need (they scroll horizontally).',
              'Set CI Level (90/95/99%): it applies to every confidence interval and to the written report.',
              'Fill the selectors of the panel; group selectors accept only group columns, and "Modifica livelli" opens the levels editor.',
              'Press Run Analysis.',
              'The run is appended to the output console as one block: tables, then charts, then the "Report di lettura" card.',
            ],
            tip: 'A red toast appears when the inputs are wrong (for example two groups with complete data are required, or the response equals the factor). Nothing is appended in that case.',
          },
          {
            title: 'What every block contains',
            steps: [
              'Tables with a TSV button in their header to copy that table alone.',
              'Charts (where relevant) drawn with Victory; hovering gives tooltips on live runs.',
              'A written report: headline, what the test does, the reading of each result, effect size, assumptions, non-parametric counterpart, glossary and caveats.',
              'A ✕ button to remove that single run from the console.',
            ],
          },
        ],
      },
      {
        id: 'wizard',
        title: 'Wizard',
        summary: 'Guided choice of the test, with the assumption checks that matter.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Answer section 1 — "Che domanda vuoi rispondere?": Descrivere i dati, Confrontare gruppi, Studiare un’associazione, Prevedere un esito, Tempo fino a un evento, Prevedere una serie, Pianificare lo studio.',
              'Fill the selectors it asks for: Variabile di esito, Gruppi (optional), Seconda variabile, Disegno.',
              'Read the Raccomandazione card: it names the test, explains why and lists the checks it ran (normality, Levene, paired differences).',
              'Press Apri <test> to jump to the real panel, then Run Analysis there.',
              'Press Run Analysis in the Wizard to print the recommendation itself as a block in the console.',
            ],
            example: {
              title: 'Two groups, one numeric outcome',
              steps: [
                'Goal: Confrontare gruppi; outcome Score_Pre; Gruppi Group; Disegno Gruppi indipendenti.',
                'The card recommends a two-sample test and reports Lilliefors and Levene results.',
                'Press Apri T-Test, set Variances to Unequal (Welch) if Levene was significant, then Run Analysis.',
              ],
            },
          },
        ],
      },
      {
        id: 'descriptive',
        title: 'Descriptive',
        summary: 'Distribution of one or more numeric columns.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Tick the variables in Select Variables (checkboxes, any number of columns).',
              'Press Run Analysis.',
              'Tables: N/missing, mean with CI, SE, median with distribution-free CI, trimmed mean, SD, variance, CV, quartiles, IQR, MAD, outliers, skewness/kurtosis with SE and z, quantiles.',
              'Charts: histogram and Q-Q plot; normality tests (Jarque–Bera, Lilliefors-corrected KS, D’Agostino–Pearson) in the assumptions section.',
            ],
            example: {
              title: 'Describe the two scores',
              steps: [
                'Tick Score_Pre and Score_Post.',
                'Run Analysis and read the means with their 95% CIs.',
                'Check the Q-Q plot and the Lilliefors p before choosing a parametric test.',
              ],
            },
          },
        ],
      },
      {
        id: 'ttest',
        title: 'T-Test',
        summary: 'One sample, two independent samples or paired samples, with non-parametric counterparts.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Choose Test Type: Independent Samples, Paired Samples or One-Sample.',
              'Independent: pick Variable 1 and Variable 2 — two numeric columns holding the two groups — and choose Variances: Equal (pooled) or Unequal (Welch).',
              'Paired: pick the two numeric columns measured on the same rows.',
              'One-Sample: pick Variable 1 and type the reference in Test Mean (μ₀).',
              'Press Run Analysis: mean difference with CI, Cohen’s d, Hedges g, Glass Δ, point-biserial r, Levene/Brown–Forsythe, plus Wilcoxon, Mann–Whitney, CLES and Hodges–Lehmann when they apply.',
            ],
            example: {
              title: 'Two groups stored in two columns',
              steps: [
                'Test Type: Independent Samples.',
                'Variable 1: the first group column (for example Score_Pre); Variable 2: the second one (Score_Post).',
                'Run Analysis, read the Levene/Brown–Forsythe p, then set Variances to Unequal (Welch) and run again if it is small.',
              ],
              note: 'When both groups share one column and a second column holds the group code, use ANOVA with the response as Dependent Var and the code column as Group Var: a single factor with two levels gives the same comparison plus the non-parametric counterpart.',
            },
          },
        ],
      },
      {
        id: 'anova',
        title: 'ANOVA',
        summary: 'One-way ANOVA with post-hoc comparisons and the Kruskal–Wallis alternative.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Pick Dependent Var (the numeric response).',
              'Pick Group Var; press Modifica livelli to label the levels or set the reference.',
              'Choose Post-Hoc: None, Tukey–Kramer (approx.), Bonferroni, Holm or Games–Howell.',
              'Tick Kruskal-Wallis H under Non-Parametric to add the rank test; then choose K-W Post-Hoc (Dunn with Holm or Bonferroni).',
              'Press Run Analysis: group descriptives, ANOVA table, η²/ω²/ε²/f, Levene, Welch ANOVA, post-hoc table, charts and report.',
            ],
            example: {
              title: 'Compare Score_Pre across the two groups',
              steps: [
                'Dependent Var: Score_Pre; Group Var: Group (labels Controllo/Trattamento).',
                'Post-Hoc: Holm; tick Kruskal-Wallis H.',
                'Run Analysis: the descriptives and the post-hoc table speak in labels; the report states F, p and η².',
              ],
            },
          },
        ],
      },
      {
        id: 'regression',
        title: 'Regression',
        summary: 'Ordinary least squares with diagnostics, plus the Theil–Sen robust line.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Pick Dependent (Y).',
              'Tick one or more Independents (X); categorical predictors must be coded numerically (or use ANCOVA with a factor).',
              'Tick Theil-Sen Robust Line to add the non-parametric slope and its bootstrap CI.',
              'Press Run Analysis: model F, ANOVA table, coefficients with CIs, standardised β, VIF/tolerance, AIC/BIC, Durbin–Watson, Breusch–Pagan, White, RESET2, DFBETAS, Belsley condition index, Cook’s D, residual diagnostics.',
            ],
            example: {
              title: 'Predict the second score from the first',
              steps: [
                'Y: Score_Post; X: Score_Pre.',
                'Run Analysis, then read the coefficient with its CI and the Durbin–Watson value.',
                'Tick Theil-Sen Robust Line and run again to compare the robust slope with the OLS one.',
              ],
            },
          },
        ],
      },
      {
        id: 'correlation',
        title: 'Correlation',
        summary: 'Pairwise correlations, matrices and partial correlations.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Tick two or more columns in Variables.',
              'Choose Primary Method: Pearson or Spearman.',
              'Tick Spearman (ρ) and Kendall’s Tau (τ) under Non-Parametric to add those coefficients.',
              'Press Run Analysis: pairwise table with N, p, Fisher-z CI and r², the significance matrix, partial correlations and the rank alternatives.',
            ],
            example: {
              title: 'Are the two scores related?',
              steps: [
                'Variables: Score_Pre and Score_Post; Primary Method Pearson; tick Kendall’s Tau.',
                'Run Analysis and read r, its CI and p; the report explains what a significant r does and does not mean.',
              ],
            },
          },
        ],
      },
      {
        id: 'multivariate',
        title: 'Multivariate',
        summary: 'PCA and reliability for a set of numeric columns.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Tick the variables in Select Variables (at least two).',
              'Press Run Analysis.',
              'Read: eigenvalues/variance explained and cumulative, scree plot, loadings, component scores, KMO and Bartlett for sampling adequacy.',
              'Tick the reliability section to get Cronbach α with item-total statistics and α if an item is removed.',
            ],
            example: {
              title: 'Check reliability of three items',
              steps: [
                'Tick Score_Pre, Score_Post and Age (or your real items).',
                'Run Analysis and read Cronbach α; if α rises when an item is removed, reconsider that item.',
              ],
            },
          },
        ],
      },
      {
        id: 'chisquare',
        title: 'Chi-Square (χ²)',
        summary: 'Association between two binary variables typed directly into the table.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Fill the 2×2 table: counts in the four cells and the row/column labels (they appear in the output).',
              'Press Run Analysis.',
              'Read: Pearson χ², likelihood-ratio G², Yates correction, standardized and adjusted residuals, cell contributions, φ, Cramér’s V, odds ratio, relative risk, risk difference with CIs.',
              'Fisher’s Exact is shown when it applies; check the expected counts note before trusting χ².',
            ],
            example: {
              title: 'Treatment vs outcome',
              steps: [
                'Rows: Controllo / Trattamento; Columns: Guarito / Non guarito.',
                'Type the four counts, for example 18/32 and 27/23.',
                'Run Analysis and read Cramér’s V and the odds ratio with its CI.',
              ],
            },
          },
        ],
      },
      {
        id: 'contingency',
        title: 'Contingency (R×C)',
        summary: 'Any table size, with Monte Carlo p-values for sparse tables.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Either press Preset: trial or Preset: survey to start from a ready table, or build your own.',
              'Rename rows and columns in the label fields and extend the table with + Row / − Row and + Col / − Col.',
              'Tick Fisher (2x2) for the exact test on two-by-two tables.',
              'Tick Monte Carlo if E < 5 to get a simulated p-value with fixed margins when expected counts are small.',
              'Press Run Analysis: Pearson χ², likelihood-ratio G², expected counts, standardized/adjusted residuals, cell contributions, Cramér’s V, contingency coefficient.',
            ],
            example: {
              title: 'Three sites, three outcomes',
              steps: [
                'Add a third row and a third column.',
                'Fill the nine counts and the labels.',
                'Tick Monte Carlo if E < 5, then Run Analysis and read the adjusted residuals to see which cells drive the association.',
              ],
            },
          },
        ],
      },
      {
        id: 'nonparamrm',
        title: 'Non-parametric RM',
        summary: 'Friedman, McNemar, Cochran Q and the Jonckheere–Terpstra trend test.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Choose Test: Friedman + Nemenyi, McNemar, Cochran Q or Jonckheere–Terpstra.',
              'Friedman: tick three or more measures (Within-subject conditions) taken on the same rows.',
              'McNemar: pick First measure and Second measure, two binary columns.',
              'Cochran Q: tick the binary measures.',
              'Jonckheere–Terpstra: pick Numeric outcome and Ordered groups (2–10); the test uses the order of the group levels, so set it with Modifica livelli.',
              'Press Run Analysis for the statistic, the post-hoc (Nemenyi with studentized-range critical values for Friedman) and the effect size.',
            ],
            example: {
              title: 'Three conditions measured on the same subjects',
              steps: [
                'Test Friedman; tick the three condition columns.',
                'Run Analysis and read Kendall’s W and the Nemenyi comparisons.',
              ],
            },
          },
        ],
      },
      {
        id: 'repeatedanova',
        title: 'Repeated ANOVA',
        summary: 'One-way within-subject design with sphericity corrections.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Tick at least three numeric columns in Within-subject conditions (≥ 3); they must be measured on the same rows.',
              'Press Run Analysis.',
              'Read: SS decomposition, partial and generalized η², Mauchly sphericity test with second-order correction, Greenhouse–Geisser and Huynh–Feldt ε with corrected p-values, descriptive means with CI.',
            ],
            example: {
              title: 'Before / after / follow-up',
              steps: [
                'Tick the three measurement columns.',
                'Run Analysis and read the corrected p-values when Mauchly is significant.',
              ],
            },
            tip: 'Rows with any missing condition are dropped for that analysis; check the N printed in the tables.',
          },
        ],
      },
      {
        id: 'samplesize',
        title: 'Sample Size / Power',
        summary: 'Required N and power curves for six designs.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Choose Design: Two independent means, One mean, Paired means, Two proportions, Correlation or One-way ANOVA.',
              'Enter the inputs the design asks for (effect size or the two estimates, SD, proportions, correlation).',
              'Optionally enter CI half-width for a precision-based N and Groups (k) for ANOVA.',
              'Set Alpha (0.10/0.05/0.01) and Power (80/85/90/95%).',
              'Press Run Analysis: parameter table, required n per group with total N, and the power curve.',
            ],
            example: {
              title: 'Two independent means, d = 0.5',
              steps: [
                'Design: Two independent means, α 0.05, power 90%, effect size 0.5.',
                'Run Analysis: the result table gives n per group and the total N.',
                'Read the power curve to see what you lose by lowering n.',
              ],
            },
          },
        ],
      },
      {
        id: 'distfit',
        title: 'Distribution Fit',
        summary: 'Which theoretical distribution fits a column best.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Choose the Variable (one numeric column).',
              'Tick the Distributions to fit: Normal, Lognormal, Exponential, Gamma, Weibull.',
              'Press Run Analysis: MLE parameters, AIC/BIC ranking, KS and Anderson–Darling, percentiles and the probability plot.',
            ],
            example: {
              title: 'Is the response normal?',
              steps: [
                'Variable: Score_Post; tick Normal and Gamma.',
                'Run Analysis and compare AIC/BIC; check the KS p and the probability plot before assuming normality.',
              ],
            },
          },
        ],
      },
      {
        id: 'factorial',
        title: 'Factorial ANOVA',
        summary: 'Two factors, optional interaction, with cell and marginal means.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Pick Response (Y), Factor A and Factor B (two different group columns).',
              'Tick Include A × B interaction in the Model row to add the interaction.',
              'Press Run Analysis: sequential SS/Type I (Type III when balanced), partial η², ω², cell and marginal means, interaction plot, R²/RMSE.',
            ],
            example: {
              title: 'Group × Age on the response',
              steps: [
                'Response Score_Pre, Factor A Group, Factor B Age.',
                'Tick the interaction and Run Analysis; read the interaction plot to see whether the lines cross.',
              ],
              note: 'With unbalanced cells the sums of squares are sequential: state that in the report.',
            },
          },
        ],
      },
      {
        id: 'ancova',
        title: 'ANCOVA',
        summary: 'Group comparison adjusted for numeric covariates.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Pick Response (Y).',
              'Pick Factor; press Modifica livelli to choose the reference level the model will use.',
              'Tick one or more numeric Covariates (≥ 1).',
              'Press Run Analysis: Type III sums of squares, adjusted group means at the covariate mean, coefficients, slope homogeneity test, Holm-adjusted pairwise comparisons.',
            ],
            example: {
              title: 'Compare groups after adjusting for age',
              steps: [
                'Response Score_Post, Factor Group (reference Controllo), Covariate Age.',
                'Run Analysis; read the adjusted means and the slope homogeneity test (‘F interazione’).',
                'If slopes are not homogeneous, say so in the report instead of quoting the adjusted means alone.',
              ],
            },
          },
        ],
      },
      {
        id: 'logistic',
        title: 'Logistic Regression',
        summary: 'Binary outcome predicted by one or more variables.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Pick Outcome (0/1): the binary column.',
              'Tick Predictors (X).',
              'Optionally set Cut-off to change the classification threshold (default 0.5).',
              'Press Run Analysis: IRLS estimates, odds ratios with Wald CIs, LR test, McFadden/Cox–Snell/Nagelkerke R², AIC/BIC, classification table, sensitivity/specificity, AUC, probability curve.',
              'Watch for the separation warning: it means the model is not estimable as specified.',
            ],
            example: {
              title: 'Which variables predict the binary outcome?',
              steps: [
                'Outcome: the 0/1 column; Predictors: Score_Pre and Age.',
                'Run Analysis and read the odds ratios with CIs and the AUC.',
                'Move the Cut-off and run again to see the trade-off between sensitivity and specificity.',
              ],
            },
          },
        ],
      },
      {
        id: 'timeseries',
        title: 'Time Series',
        summary: 'Trend, seasonality, benchmarks and ARIMA/SARIMA forecasts.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Choose Series (Y): the numeric column, in time order (no date column is required).',
              'Set Seasonal period when the data have a cycle (for example 12).',
              'Set Forecast horizon (how many future points to predict).',
              'Leave Differencing d and Seasonal D on Auto (ADF) or force 0/1/2 to compare models.',
              'Press Run Analysis: ACF/PACF with confidence bands, Mann–Kendall trend, runs test, Ljung–Box, moving average, seasonal decomposition, holdout benchmarks (SES, linear trend, seasonal naive) and the ARIMA/SARIMA forecast with ψ-weight intervals and residual diagnostics.',
            ],
            example: {
              title: 'Forecast 6 months of a monthly series',
              steps: [
                'Series: Sales; Seasonal period 12; Forecast horizon 6; Differencing Auto.',
                'Run Analysis and read the chosen order, the AICc and the forecast table.',
                'Compare the benchmark errors on the holdout before trusting the ARIMA forecast.',
              ],
            },
          },
        ],
      },
      {
        id: 'survival',
        title: 'Survival (KM)',
        summary: 'Time to event with censoring, by group.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Pick Time (the follow-up duration) and Event (0/1), where 1 means the event occurred.',
              'Optionally pick a Group; press Modifica livelli to label the strata (leave None for a single curve).',
              'Press Run Analysis: Kaplan–Meier curve with Greenwood log-log CIs, median survival with CI, restricted mean survival time, life table, log-rank test with Mantel–Haenszel hazard ratio.',
            ],
            example: {
              title: 'Compare survival between two groups',
              steps: [
                'Time: Time; Event: Status; Group: Group.',
                'Run Analysis and read the median survival per group and the log-rank p.',
                'The curves use the group labels, so Controllo/Trattamento are shown instead of 1/2.',
              ],
            },
          },
        ],
      },
      {
        id: 'cox',
        title: 'Cox (PH)',
        summary: 'Proportional hazards regression with several covariates.',
        blocks: [
          {
            title: 'Steps',
            steps: [
              'Pick Time, Event (0/1) and one or more Covariates (X); small categorical covariates are dummy-coded automatically.',
              'Press Run Analysis: partial likelihood with Breslow ties, hazard ratios with CIs, LR/Wald/score tests, Harrell’s C, Breslow baseline hazard, a time-interaction test for proportional hazards and a forest plot.',
              'Read the proportional-hazards test before quoting the hazard ratios.',
            ],
            example: {
              title: 'Effect of treatment adjusted for age',
              steps: [
                'Time: Time; Event: Status; Covariates: Group and Age.',
                'Run Analysis and read the hazard ratios with CIs and Harrell’s C.',
                'If the time-interaction test is significant, report the violation.',
              ],
            },
          },
        ],
      },
    ],
  },
  /* ------------------------------------------------------------------ */
  {
    id: 'output',
    label: 'Output & reports',
    title: 'Reading and exporting the results',
    blurb:
      'Every run lands in the output console as a block of tables, charts and a written report. Each block can be copied, exported or removed on its own.',
    sections: [
      {
        id: 'console',
        title: 'The output console',
        summary: 'The ribbon above the results and what its buttons do.',
        blocks: [
          {
            title: 'What a block looks like',
            steps: [
              'A heading naming the analysis and the columns it used.',
              'Result tables, each with a TSV button in its header.',
              'Charts where the analysis produces them (boxplots, forest plots, curves, forecasts, scree plots...).',
              'The written "Report di lettura" card, generated from the very tables above it.',
            ],
          },
          {
            title: 'Console buttons',
            table: {
              head: ['Button', 'Effect'],
              rows: [
                ['Data Editor', 'Switch back to the grid (useful on narrow screens)'],
                ['Clear', 'Empty the whole console (asks nothing, the runs are gone)'],
                ['Copy', 'Copy the console text to the clipboard'],
                ['Charts PNG', 'Download every chart as its own 2× PNG on a dark background'],
                ['Report HTML', 'Download a self-contained printable HTML report'],
                ['Results XLSX', 'Download an Excel workbook with the dataset and every result table'],
                ['✕ next to a block', 'Remove just that run'],
                ['TSV in a table header', 'Copy that single table, formatted as shown'],
              ],
            },
          },
          {
            title: 'Restored sessions',
            steps: [
              'After a reload or after opening a .lzs file the console shows static snapshots of the previous runs.',
              'In snapshots, Copy, Charts PNG, Report HTML and Results XLSX keep working.',
              'Per-table TSV buttons and chart tooltips exist only on live runs of the current session.',
              'Snapshots are capped at 20 runs or about 1.5 MB; older ones are dropped first.',
            ],
          },
        ],
      },
      {
        id: 'exports',
        title: 'Exports in detail',
        summary: 'How to turn a console into a document or a dataset.',
        blocks: [
          {
            title: 'Printable report → PDF',
            steps: [
              'Run every analysis you need.',
              'Press Report HTML: a single file with tables, inline SVG charts and the written reports is downloaded.',
              'Open it in the browser and use Print → Save as PDF; the print styles hide the interface.',
            ],
            example: {
              title: 'One-page summary for a colleague',
              steps: [
                'Run Descriptive and T-Test.',
                'Press Report HTML, open the file, Print → Save as PDF.',
                'Send the PDF: tables, charts and prose are all there and self-contained.',
              ],
            },
          },
          {
            title: 'Excel workbook of results',
            steps: [
              'Press Results XLSX.',
              'The workbook contains the dataset and each result table of the console on its own sheet.',
              'Use it to keep numbers in a spreadsheet without retyping them.',
            ],
          },
          {
            title: 'Charts as files',
            steps: [
              'Press Charts PNG.',
              'Every chart of every run is rendered at 2× and downloaded as its own PNG, named after the run and the chart.',
              'Use them in slides or reports; the dark background matches the app theme.',
            ],
          },
          {
            title: 'Copying a single table',
            steps: [
              'Hover the header of the table you want.',
              'Press TSV: the table goes to the clipboard tab-separated, exactly as displayed (same rounding).',
              'Paste into Excel, Sheets or a document.',
            ],
          },
        ],
      },
    ],
  },
  /* ------------------------------------------------------------------ */
  {
    id: 'recipes',
    label: 'Recipes',
    title: 'End-to-end examples',
    blurb: 'Common questions, each as a short sequence of clicks.',
    sections: [
      {
        id: 'recipes-common',
        title: 'The most frequent workflows',
        summary: `Examples use a grid like the demo one (${DEMO}).`,
        blocks: [
          {
            title: 'Two groups, one numeric outcome',
            steps: [
              'DATA EDITOR: declare the group column as cat (or leave it int with 2–12 codes).',
              'Open the levels editor, label the codes and apply.',
              'ANALYSIS & OUTPUT → ANOVA with Dependent Var = the response and Group Var = the group.',
              'Tick Kruskal-Wallis H if the distributions are far from normal.',
              'Run Analysis; read the post-hoc table and the report.',
            ],
          },
          {
            title: 'Same subjects, before and after',
            steps: [
              'Keep the two measurements in two columns (Score_Pre, Score_Post).',
              'T-Test → Test Type Paired Samples → Variable 1 and Variable 2.',
              'Add a Diff column with Transform → Compute (Score_Post - Score_Pre) if you prefer the one-sample view on the change.',
              'Run Analysis: mean difference with CI, Cohen’s d and the Wilcoxon counterpart.',
            ],
          },
          {
            title: 'Three or more conditions on the same subjects',
            steps: [
              'Put one column per condition.',
              'Non-parametric RM → Test Friedman: tick the three columns.',
              'For the parametric route use Repeated ANOVA with the same selection and check Mauchly.',
            ],
          },
          {
            title: 'Trend across ordered groups',
            steps: [
              'Open Non-parametric RM and choose Jonckheere–Terpstra.',
              'Set Ordered groups to the ordered factor; fix the order with the levels editor if the natural order is wrong.',
              'Pick the Numeric outcome and run: the report gives the trend statistic and the effect size.',
            ],
          },
          {
            title: 'Association between two categorical variables',
            steps: [
              'Contingency (R×C) if the counts are already a table (or Chi-Square (χ²) for a 2×2).',
              'Fill or extend the table, label rows and columns.',
              'Tick Monte Carlo if E < 5 and Run Analysis; read adjusted residuals to see which cells matter.',
            ],
          },
          {
            title: 'Predict a numeric outcome',
            steps: [
              'Regression → Dependent (Y) and Independents (X).',
              'Run Analysis and check the residual diagnostics and Durbin–Watson.',
              'Add the Theil-Sen Robust Line to compare the OLS slope with the robust one.',
              'ANCOVA instead of Regression when the predictor is a group plus covariates.',
            ],
          },
          {
            title: 'Predict a binary outcome',
            steps: [
              'Make sure the outcome column holds 0/1.',
              'Logistic Regression → Outcome (0/1) and Predictors (X).',
              'Run Analysis and read the AUC and the classification table; move the Cut-off to inspect the trade-off.',
            ],
          },
          {
            title: 'Correlation matrix',
            steps: [
              'Correlation → tick the variables.',
              'Primary Method Pearson (or Spearman for ranks); tick Kendall’s Tau for a second robust view.',
              'Run Analysis: pairwise table, significance matrix and partial correlations.',
            ],
          },
          {
            title: 'Forecast a series',
            steps: [
              'Order the rows by time (Transform → Sort on the time column).',
              'Time Series → Series (Y), Seasonal period, Forecast horizon.',
              'Run Analysis; compare the ARIMA forecast with the holdout benchmarks before using it.',
            ],
          },
          {
            title: 'Survival by group',
            steps: [
              'Prepare Time and Event (0/1) columns.',
              'Survival (KM) → Time, Event, Group (optional).',
              'Run Analysis: median survival per group, log-rank p and the hazard ratio; use Cox (PH) to adjust for covariates.',
            ],
          },
          {
            title: 'Plan the study before collecting data',
            steps: [
              'Sample Size / Power → choose the design that matches the future test.',
              'Enter the expected effect size, α and power.',
              'Read n per group and the total N, then check the power curve for the cost of a smaller sample.',
            ],
          },
          {
            title: 'When you are not sure which test to use',
            steps: [
              'Wizard → answer the question and fill the selectors.',
              'Read the recommendation, the reasons and the assumption checks.',
              'Press Apri <test> to land on the real panel with the columns already chosen, then Run Analysis.',
            ],
          },
        ],
      },
    ],
  },
  /* ------------------------------------------------------------------ */
  {
    id: 'reference',
    label: 'Shortcuts & settings',
    title: 'Keyboard, preferences and troubleshooting',
    blurb: 'The small print: keys, defaults and the questions that come up most often.',
    sections: [
      {
        id: 'keys',
        title: 'Keyboard and toolbar reference',
        summary: 'Everything available without a menu.',
        blocks: [
          {
            title: 'Shortcuts',
            table: {
              head: ['Shortcut', 'Effect'],
              rows: [
                ['Ctrl+Z', 'Undo'],
                ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
                ['Ctrl+C in a cell', 'Copy the selected range as TSV'],
                ['Ctrl+Backspace / Ctrl+Delete', 'Clear the selected range'],
                ['Enter / Shift+Enter', 'Move down / up'],
                ['Tab / Shift+Tab', 'Move right / left'],
                ['Shift+click', 'Extend the selection'],
                ['Esc', 'Leave the cell'],
              ],
            },
          },
          {
            title: 'Toolbar of the DATA EDITOR',
            table: {
              head: ['Control', 'What it does'],
              rows: [
                ['File: New / Import / Export', 'Reset the grid, open the Smart Import dialog, open the Export dialog'],
                ['Save project / Open project', 'Write or read a .lzs project file'],
                ['Autosave time', 'When the browser last saved your session'],
                ['Undo / Redo', 'Grid history (50 steps)'],
                ['Validate / Auto-fix', 'Check cells against their type and coerce what is safe'],
                ['Clean / Transform', 'Open the cleaning and transformation panels'],
                ['Freeze col', 'Keep row numbers and the first column visible'],
                ['Filter', 'Show the view-only row filter'],
                ['Column / Row / Clear', 'Append a column or a row, or empty every cell'],
              ],
            },
          },
        ],
      },
      {
        id: 'settings',
        title: 'Settings tab',
        summary: 'Defaults that apply to import, export and the output console.',
        blocks: [
          {
            title: 'Import / Export preferences',
            steps: [
              'Default delimiter: Auto-detect or a fixed comma/semicolon/tab/pipe.',
              'Decimal separator: what the exported numbers use (Period 12.5 or Comma 12,5).',
              'Assume first row is header: the default answer of the Smart Import header question.',
              'Default export format: CSV, TSV, Pipe TXT, JSON, SPSS or Excel.',
              'These preferences are stored in the browser and are also written into the .lzs project.',
            ],
          },
          {
            title: 'General preferences',
            steps: [
              'Decimal Separator: how numbers are displayed.',
              'Significant Digits: the precision used in the printed numbers.',
              'Output Settings: Show Summary Interpretation and Include Plots in Output are on by default; turn them off for a leaner console.',
            ],
            tip: 'The CI level is not here: it belongs to the analysis toolbar, so it is part of the analysis parameters and not of the display preferences.',
          },
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Troubleshooting',
        summary: 'The questions that come up most often.',
        blocks: [
          {
            title: 'My column does not appear in a group selector',
            steps: [
              'Check its type: id and continuous num/dec columns are never offered as groups.',
              'For int columns, the values must be whole numbers with 2 to 12 distinct codes.',
              'Free text or dates with more than 12 distinct values are treated as identifiers, not groups.',
              'Declaring levels in the levels editor makes the column selectable again, whatever the type.',
            ],
          },
          {
            title: 'A cell shows "not in list"',
            steps: [
              'The value is not among the declared levels of a cat column; the data is intact.',
              'Press Read data in the levels editor to import the value as a level, or use Recode values to map it.',
            ],
          },
          {
            title: 'Numbers came out with a different separator',
            steps: [
              'The display uses the Decimal Separator of SETTINGS; the export uses the Decimals option of the Export dialog.',
              'Analysis tables always use dots internally, so a CSV with comma decimals is a display choice only.',
            ],
          },
          {
            title: 'The report says a condition is not met',
            steps: [
              'Read the "Limiti e cautele" list at the end of the card: it names the assumption that failed.',
              'The non-parametric counterpart is reported where one exists (Welch instead of pooled, Kruskal–Wallis instead of ANOVA, Spearman instead of Pearson).',
              'Rerun with the alternative and compare: if the two agree, the conclusion is robust.',
            ],
          },
          {
            title: 'Nothing happens when I press Run Analysis',
            steps: [
              'A red toast lists the missing input (for example "Select at least one numeric covariate").',
              'Group analyses need at least two groups with complete data; check the missing cells and the filter is view-only.',
              'Parameters reset to grid defaults after a reload: re-select the columns, then run.',
            ],
          },
        ],
      },
    ],
  },
];

/** Every analysis panel documented in the Analyses tab, in tab order. */
export const DOCUMENTED_ANALYSES = [
  'Wizard',
  'Descriptive',
  'T-Test',
  'ANOVA',
  'Regression',
  'Correlation',
  'Multivariate',
  'Chi-Square (χ²)',
  'Contingency (R×C)',
  'Non-parametric RM',
  'Repeated ANOVA',
  'Sample Size / Power',
  'Distribution Fit',
  'Factorial ANOVA',
  'ANCOVA',
  'Logistic Regression',
  'Time Series',
  'Survival (KM)',
  'Cox (PH)',
];
