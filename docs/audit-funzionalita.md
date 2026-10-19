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

## Stato avanzamento

- **#2 Export risultati — fatto (2026-10-19):** cestino per singolo blocco, copia TSV
  da ogni tabella, download PNG di tutti i grafici (2×, sfondo scuro) e report
  HTML autonomo con CSS di stampa. Moduli `src/io/tableTsv.ts`,
  `src/io/chartExport.ts`, `src/io/reportExport.ts`, `src/io/clipboard.ts`.
- **#1 Persistenza progetto — fatto per dati+parametri (2026-10-19):** autosave
  debounced su `localStorage` con ripristino al primo render, file `.lzs`
  versionato con validazione (griglia, prefs IO, CI, analisi attiva e parametri
  App-level) in `src/io/project.ts`. L'output console resta escluso: contiene
  nodi React e richiede un modello serializzabile dei run (tabelle, grafici,
  report); al caricamento viene svuotato per non mostrare numeri del dataset
  precedente. Restano fuori anche i parametri interni dei pannelli in
  `src/analyses/`.

- **#7 UX griglia — fatto (2026-10-19):** freeze della prima colonna (con colonna
  numeri riga), filtro righe view-only con operatori type-aware e conteggio
  live, ordinamento asc/desc dal menu di colonna. Ricerca-sostituisci e sort
  esistevano già nei pannelli Clean/Transform; il filtro non tocca i dati usati
  dalle analisi (`rowMatchesFilter` in `src/grid/ops.ts`).

- **#8 Diagnostica regressione — fatto (2026-10-19):** VIF e Breusch–Pagan
  esistevano; aggiunti White (quadrati + prodotti incrociati), RESET2, DFBETAS
  (soglia 2/√n), condition index di Belsley e conteggi. Autovalori con Jacobi
  in `src/stats/linalg.ts`, reference test contro NumPy/SciPy.

- **#3 Test non-parametrici — fatto (2026-10-19):** Friedman con correzione
  per i ranghi uguali e W di Kendall, post-hoc Nemenyi con quantili del range
  studentizzato calcolati numericamente (niente tabelle hard-coded), McNemar
  esatto + Yates con odds ratio, Cochran Q e Jonckheere–Terpstra. Modulo puro
  `src/stats/repeated.ts`, pannello `src/analyses/NonParamRepeatedAnalysis.tsx`,
  report generati dalle tabelle e test contro SciPy.

- **#5 Misure ripetute parametriche — fatto (2026-10-19):** ANOVA within a una
  via con scomposizione SS, η²p/η²G, Mauchly (approssimazione χ² con termine
  del second'ordine come R/pingouin), ε GG/HF e p corretti, descrittive con CI.
  Modulo `src/stats/repeatedAnova.ts`, pannello dedicato e report; reference
  test contro NumPy/SciPy. ANCOVA resta non implementata (alternativa non scelta).

## Contratto per nuove analisi
Builder puro in `src/stats/` + reference test contro SciPy/R + `ReportSpec`
auto-generato. Verifica: `npm run lint` + `npm test` (copre stats+io+grid).

## Decisioni aperte
- Salvataggio: solo file `.lzs` o anche autosave silente? (tutto locale)
- Excel: dipendenza SheetJS (~800KB) accettabile per bundle browser-only?
- Friedman/Nemenyi vs ANCOVA: quale disegno serve davvero agli utenti?
- PNG export: `VictoryExport` in Victory 37 o fallback SVG→canvas manuale?
