# Audit funzionalità LazStats JS

Data: 2026-10-18. Stato codebase: 15 analisi, grid editor con undo/selezione/clipboard/validazione, Smart IO (CSV/TSV/pipe/JSON/SPSS-companion), 7 round di validazione committati.

## Gap funzionali (priorità suggerita)

### 1. Persistenza progetto — alto valore, sforzo M
Salvataggio/caricamento sessione completa (grid + outputs + params) in JSON `.lzs`;
autosave debounced su localStorage con ripristino all'avvio.
Tocca `App.tsx` + nuovo `src/io/project.ts`.

### 2. Export risultati — basso sforzo S
Per-output singolo (cestino per blocco, oggi solo Clear globale), copia TSV delle
tabelle, download PNG dei grafici Victory, report HTML stampabile.
Tocca `ResultTable.tsx`, console in `App.tsx`.

### 3. Test non-parametrici mancanti — medio M
Friedman + post-hoc Nemenyi, McNemar, Cochran Q, Jonckheere-Terpstra.
Riusano lo schema `TableSpec` + report esistente in `src/stats/`.
Buco reale: one-way c'è (Kruskal-Wallis) ma misure ripetute non-parametriche mancano.

### 4. Formati dati reali — medio M
Import Excel `.xlsx` (SheetJS) — il formato che gli utenti hanno davvero;
export `.xlsx` multi-foglio (dati + risultati).
SPSS `.sav` nativo e Stata: nice-to-have, sforzo alto senza librerie mature.

### 5. Misure ripetute parametriche — medio S-M
Repeated-measures ANOVA (Mauchly + Greenhouse-Geisser/Huynh-Feldt) oppure ANCOVA.
Il disegno within-subject oggi non esiste.

### 6. Multivariata base — medio M
PCA (autovalori, scree, loadings, scores) + Cronbach α per affidabilità scale.
Molto richieste in ambito psicometrico/sociale, riusano infrastruttura esistente.

### 7. UX griglia — basso S
Freeze prima colonna/riga, ricerca-sostituisci, ordinamento per colonna, filtro righe.
DataGrid ha già selezione e clipboard, manca navigazione su dataset grandi.

### 8. Diagnostica regressione — da verificare
VIF e Breusch-Pagan già presenti. Audit puntuale di `regression.ts` prima di decidere
(White test, RESET, DFBETAS, condition index).

## Contratto per nuove analisi
Builder puro in `src/stats/` + reference test contro SciPy/R + `ReportSpec`
auto-generato. Verifica: `npm run lint` + `npm test` (copre stats+io+grid).

## Decisioni aperte
- Salvataggio: solo file `.lzs` o anche autosave silente? (tutto locale)
- Excel: dipendenza SheetJS (~800KB) accettabile per bundle browser-only?
- Friedman/Nemenyi vs ANCOVA: quale disegno serve davvero agli utenti?
- PNG export: `VictoryExport` in Victory 37 o fallback SVG→canvas manuale?
