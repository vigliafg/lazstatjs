# Audit funzionalità LazStats JS

Data: 2026-10-18, aggiornato 2026-10-19. Stato codebase: 19 analisi, grid editor con undo/selezione/clipboard/validazione, Smart IO (CSV/TSV/pipe/JSON/XLSX/SPSS-companion), progetto `.lzs` con console output, 7 round di validazione committati.

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
- **#1 Persistenza progetto — fatto (2026-10-19):** autosave debounced su
  `localStorage` con ripristino al primo render, file `.lzs` versionato con
  validazione (griglia, prefs IO, CI, analisi attiva e parametri App-level) in
  `src/io/project.ts`. **Anche l'output console è persistito**: ogni run salva
  uno snapshot HTML statico (tabelle, grafici Victory come SVG inline, report)
  prodotto con `renderToStaticMarkup` in `src/io/outputs.ts`; al caricamento
  viene sanitizzato con DOMParser (tag/attributi eseguibili rimossi) e
  reiniettato. Limiti espliciti: massimo 20 blocchi / 1,5 MB, i blocchi
  ripristinati sono statici (tooltip Victory e pulsanti TSV per tabella non
  sono interattivi; Copy, Charts PNG, Report HTML e Results XLSX funzionano
  perché leggono il DOM). Restano fuori i parametri interni dei pannelli in
  `src/analyses/`: al reload ripartono dai default calcolati sulla griglia
  ripristinata.

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
  test contro NumPy/SciPy. **ANCOVA fatta (2026-10-19):** SS tipo III
  (modello completo vs ridotto), covariate centrate, medie aggiustate con CI,
  test di omogeneità delle pendenze, confronti a coppie con Holm;
  `src/stats/ancova.ts` + `AncovaAnalysis.tsx`, test a forma chiusa.

- **#4 Formati dati reali — fatto per Excel (2026-10-19):** import `.xlsx` /
  `.xls` multi-foglio con scelta del foglio nel wizard, tipi inferiti dallo
  stesso contratto CSV; export workbook con foglio `Dati` numerico e foglio
  `Risultati` costruito dalle tabelle del DOM. `src/io/xlsx.ts` + test.
  Restano fuori SPSS `.sav` nativo e Stata (nice-to-have).

- **#6 Multivariata base — fatto (2026-10-19):** PCA con standardizzazione,
  autovalori/autovettori (Jacobi), varianza spiegata e cumulata, scree plot,
  loadings, scores, KMO e test di Bartlett; Cronbach α con item-total e α se
  un item viene rimosso. `src/stats/multivariate.ts` + pannello + test.

- **Variabili di raggruppamento — fatto (2026-10-19):** le colonne `cat` hanno
  livelli dichiarati (codice + etichetta, ordine, riferimento) con editor sotto
  l'header e celle a tendina; i metadati sono versionati nel `.lzs` e
  nell'autosave. I picker di gruppo sono filtrati (`cat`, `bol`, stringhe/date
  con ≤ 12 livelli, interi 2–12; esclusi `id` e numeriche continue), tabelle e
  grafici mostrano le etichette e ANCOVA mette per prima il livello di
  riferimento. Puro in `src/grid/types.ts` + `ops.ts`; test in
  `src/grid/levels.test.ts` e `src/io/project.test.ts`.
- **Editor livelli riusabile — fatto (2026-10-19):** l'editor vive in
  `src/grid/LevelsEditor.tsx` ed è aperto sia dall'header della griglia (per
  `cat` e per ogni colonna ammessa come gruppo) sia dal pulsante **Modifica
  livelli** accanto al selettore di gruppo in Wizard, ANOVA, ANCOVA, Factorial
  ANOVA, Survival (quando un gruppo è scelto) e Non-parametric RM (Jonckheere);
  un Apply resta un solo passo di undo in entrambi i percorsi.
- **Ricodifica dei gruppi — fatto (2026-10-19):** bottone *Recode values*
  nella stessa modale: rinomina i codici, fonde più codici in un gruppo unico e
  "clear" svuota le celle, con anteprima di celle cambiate / gruppi fusi /
  celle svuotate prima di applicare. Il match avviene sul valore originale
  (gli scambi `1→2`/`2→1` sono corretti), le etichette seguono il codice, il
  riferimento migra con il proprio codice o viene rimosso, e se i nuovi codici
  non rispettano il tipo della colonna questa diventa `cat`. Puro in
  `recodeColumnValues` (`src/grid/ops.ts`); un Apply = un passo di undo.

- **Help in-app — fatto (2026-10-19):** nuova scheda HELP accanto a Data Editor /
  Analysis & Output / Settings, con otto tab interne (Overview, Data Editor, Data
  prep, Groups & levels, Analyses, Output & reports, Recipes, Shortcuts &
  settings). Ogni funzione è spiegata come sequenza numerata di passi sui
  controlli reali, con esempio svolto, tabelle di riferimento e note;
  la tab Analyses copre tutti i 19 pannelli (passi + esempio) e Recipes dodici
  percorsi end-to-end. Contenuto puro in `src/help/helpContent.ts` reso da
  `src/help/HelpPanel.tsx`; guardia in `src/help/helpContent.test.ts`
  (struttura, copertura dei pannelli, etichette principali). `ProjectTab`
  include ora `help`, quindi la tab resta selezionata dopo un reload o
  l'apertura di un progetto.

## Contratto per nuove analisi
Builder puro in `src/stats/` + reference test contro SciPy/R + `ReportSpec`
auto-generato. Verifica: `npm run lint` + `npm test` (copre stats+io+grid).

## Decisioni prese
- Salvataggio: file `.lzs` **e** autosave silente, tutto in locale.
- Excel: SheetJS accettato; il bundle cresce ma resta browser-only.
- Friedman/Nemenyi e ANCOVA: implementati entrambi.
- PNG export: serializzazione SVG→canvas manuale (`src/io/chartExport.ts`).

## Ancora aperti
- Parametri interni dei pannelli `src/analyses/` non persistiti (ripartono dai
  default sulla griglia ripristinata).
- SPSS `.sav` nativo e Stata: nessuna libreria matura, sforzo alto.
- I blocchi output ripristinati sono statici; valutare un modello serializzabile
  dei run al posto dello snapshot HTML se serve interattività dopo il reload.
