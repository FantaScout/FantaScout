# FantaScout 2026/27

Webapp personale di scouting e supporto decisionale per l'asta del Fantacalcio 2026/27.
Non è un semplice listone: calcola Prezzo Ideale / Prezzo Massimo / Stop per ogni giocatore
e propone classifiche di scouting (rivelazioni, neopromosse, affari, modificatore difesa).

**Sprint 2** ha reso l'importazione più semplice (Excel diretto, riconoscimento automatico
delle colonne, anteprima), l'app utilizzabile da smartphone e ha verificato/documentato il
modello di prezzo. Non è stata riscritta: tutte le funzionalità della v1 restano.

**Sprint 2.5** ha risolto l'importazione del vero export Excel di Fantacalcio-Online
("Quotazioni Fantacalcio-Online.xlsx"), che usa intestazioni diverse da quelle attese in
precedenza (`Nome`, `RAT`, `POT`, `IS %`, `ETA'`, `Ruolo standard`, `Ruolo trequartista`,
`Ruolo Fantacalcio.it`, `Posizione`, `Squadra`, `Kapitals`, `Bonus` — vedi punto 3bis). Non ha
toccato il modello di prezzo/scouting.

**Sprint 2.6** ha reso le tabelle comprensibili e utilizzabili: ogni colonna ha ora un nome
chiaro e un tooltip `?` che ne spiega il significato, la colonna "Valore" è stata rinominata
"Indice FantaScout" (era ambigua — vedi punto 9bis), la tabella Giocatori ha un pannello di
filtri avanzati combinabili con AND, l'ordinamento delle colonne mostra chiaramente la
freccia ↑/↓ ed è a 3 stati (decrescente → crescente → nessun ordinamento), e il pannello
"Come viene calcolato?" del prezzo è stato riscritto in linguaggio semplice (le formule
restano disponibili in una sezione secondaria "Dettagli tecnici"). **Non ha toccato** il
modello matematico dei prezzi (stessi coefficienti, stessi numeri): li mostra solo in modo
più onesto, con un'etichetta "⚠️ provvisorio" ovunque compaiano, perché sarebbero stati
riprogettati nello Sprint 3.

**Sprint 3C** ha aggiunto a ⭐ Preferiti tre funzioni, senza alcun backend: **📥 Importa
Preferiti**, **📊 Esporta Preferiti** (.xlsx, fotografia completa dei dati attuali dei
preferiti + foglio METADATA) e **📄 Esporta Nomi** (.txt, un nome per riga). L'import
modifica **esclusivamente** il flag preferito dei giocatori riconosciuti nella base dati
attuale (matching per ID stabile, poi Nome+Cognome — mai per squadra, perché il mercato è
ancora aperto): non tocca mai anagrafica, quotazioni, indici o prezzi, che restano sempre
quelli dell'ultimo listone importato. Mostra sempre un riepilogo (trovati/non trovati) senza
bloccare l'import per i giocatori non più presenti nel listone.

**Sprint 3** ha riprogettato **da zero** il motore di scouting/pricing (vedi punto 9): il
vecchio modello trattava il Rating come se fosse su scala 6-9 invece che 0-100, producendo
prezzi assurdi ("Lautaro → Prezzo Ideale 1137" con budget personale 500). Il nuovo motore
introduce l'**Indice FantaScout** (qualità del profilo, separato dal prezzo) e l'**Indice
Affare** (sottovalutazione economica, prima confuso con l'Indice FantaScout), normalizza i
Bonus attesi sulla distribuzione reale del listone invece che su una scala arbitraria, e
calcola Prezzo Ideale/Massimo/Stop con un modello di mercato calibrato su budget e
partecipanti della lega (non più "quotazione × coefficiente"). Tutte le funzionalità degli
sprint precedenti (import, filtri, ordinamento, preferiti, asta) restano invariate.

---

## 1. Come avviare FantaScout

Nessuna build, nessuna installazione. Serve solo un piccolo server statico (vedi punto 11
sul perché **non basta** aprire il file direttamente da smartphone):

```bash
cd fantascout
python3 -m http.server 8000
# poi apri http://localhost:8000 dal computer, oppure http://<ip-del-pc>:8000 dal telefono
# (stessa rete Wi-Fi)
```

In alternativa, qualunque hosting statico va bene (vedi punto 12): GitHub Pages, Netlify,
un semplice spazio web. Basta caricare la cartella così com'è.

---

## 2. Come importare i dati

Dal pulsante **🔄 Aggiorna Dati** si apre il modale di importazione, con due modalità:

### 📋 Listone completo
Il file principale con l'anagrafica dei giocatori: nome, cognome, squadra, ruolo,
quotazione, età e — se disponibili — rating e titolarità.

### 📊 Solo Indici (Rating/Titolarità)
Un file più piccolo, da usare **dopo** aver importato il listone, se ottieni rating e
titolarità da una fonte/pagina diversa. Fa un merge sui giocatori già presenti (per id, o
per nome+cognome+squadra) senza toccare quotazione, squadra o ruolo. Le righe non
abbinabili a nessun giocatore esistente vengono segnalate, non inventate né perse in
silenzio.

Qualunque sia la modalità, dopo aver scelto il file compare sempre una **schermata di
anteprima** prima di importare davvero:

```
ANTEPRIMA IMPORTAZIONE
Trovati: 574 giocatori
✓ Nome completo  ✓ Squadra  ✓ Ruolo Classic  ✓ Quotazione  ✓ Rating  ✓ Potenziale
✓ Titolarità  ✓ Età  ✓ Bonus attesi  ✓ Posizione  ✓ Ruolo trequartista  ✓ Ruolo Fantacalcio.it
Colonne riconosciute: 12 / 12
Record validi: 574 / 574
[righe di esempio]
[ANNULLA]   [IMPORTA 574 GIOCATORI]
```

Se una colonna non viene riconosciuta, appare `⚠️ Colonna "X" non trovata`, con la
spiegazione di cosa manca — l'importazione resta comunque possibile: i campi mancanti
saranno mostrati come **N/D**, mai inventati.

I tuoi ⭐ preferiti, 📝 note, acquisti e prezzi personalizzati **non vengono mai toccati**
da un import: vivono in uno storage separato (vedi punto 8).

---

## 3bis. Formato reale Fantacalcio-Online e come viene mappato

Il listone scaricato da Fantacalcio-Online **non** ha colonne "Nome"/"Cognome" separate né
si chiama "Rating"/"Titolarità"/"Quotazione": ha queste 12 colonne, riconosciute
automaticamente (tollerando maiuscole/minuscole, spazi in più, apostrofi diversi):

| Colonna nel file        | Campo interno FantaScout | Significato |
|--------------------------|---------------------------|-------------|
| `Nome`                   | nome completo (poi diviso in nome+cognome) | cognome + nome, es. "MARTINEZ Lautaro" |
| `RAT`                    | rating                    | Rating Fantacalcio-Online (⚠️ vedi nota scala sotto) |
| `POT`                    | potenziale                | Potenziale |
| `IS %`                   | titolarità                | Indice di titolarità |
| `ETA'`                   | età                       | Età |
| `Ruolo standard`         | ruolo Classic (P/D/C/A)   | usato per il ruolo principale |
| `Ruolo trequartista`     | ruolo trequartista        | conservato, non usato per il ruolo Classic |
| `Ruolo Fantacalcio.it`   | ruolo Fantacalcio.it      | conservato, non usato per il ruolo Classic |
| `Posizione`              | posizione                 | es. AC, TQ, AD, CC — conservata per il futuro Intelligence Engine |
| `Squadra`                | squadra                   | squadra attuale |
| `Kapitals`                | quotazione                | quotazione ufficiale di riferimento |
| `Bonus`                   | **bonus attesi**          | non è un bonus già maturato: è una stima attesa |

**Nome e cognome**: la colonna `Nome` contiene cognome+nome insieme (es. "RAMOS Goncalo
Matias", "KOLO MUANI Randal"). FantaScout li separa in automatico riconoscendo che il
cognome è la sequenza di parole in MAIUSCOLO a inizio stringa (anche se composta da più
parole, come "KOLO MUANI"), mentre il resto è il nome. Il testo originale completo viene
**sempre preservato** come nome giocatore visualizzato, indipendentemente da come va lo
split — nessun dato viene perso anche nei rari casi limite.

**⚠️ Nota importante sulla scala del Rating**: il modello di prezzo attuale (punto 9, non
toccato in questo sprint) è stato tarato per un "FantaIndex Rating" su scala ~6.00-9.00
(scostamento dal 6.00). Il `RAT` di Fantacalcio-Online è invece su scala diversa, molto più
ampia (es. 84, 77, 69). Il valore viene importato e conservato correttamente nel campo
`rating`, ma **finché il modello di prezzo non viene aggiornato allo Sprint 3, il suo
contributo al Prezzo Ideale/Massimo sarà distorto per i dati reali** (moltiplicatori fuori
scala). Non è stato corretto in questo sprint perché la consegna era "non toccare il modello
di prezzo/scouting" — sarà uno dei primi punti dello Sprint 3 (Intelligence Engine).

---

## 3. Come importare un file XLSX (Excel)

Dallo Sprint 2, il selettore file accetta direttamente `.xlsx` (oltre a `.csv` e `.json`),
con priorità perché è il formato che più probabilmente scarichi da Fantacalcio-Online se sei
abbonato/loggato. La lettura avviene interamente nel browser tramite la libreria
[SheetJS](https://sheetjs.com/) (`xlsx.full.min.js`), caricata via CDN in `index.html`: **non
c'è nessun server, nessun upload dei tuoi dati altrove**, tutto resta sul dispositivo.

Limite pratico: la libreria va scaricata dal CDN al **primo caricamento della pagina**, quindi
serve una connessione internet in quel momento (non per ogni import successivo, se il browser
la mette in cache). Se non è disponibile, l'app te lo dice chiaramente invece di fallire in
silenzio, e puoi comunque esportare il file come CSV e importarlo così.

---

## 4. Quali dati sono necessari

Per il **Listone completo**, servono almeno: nome (completo), squadra, ruolo, quotazione.
Un record a cui manca uno di questi viene segnalato come problematico e **non importato**
come giocatore valido (l'anteprima mostra quanti record sono validi su quanti trovati).
Senza quotazione l'app non può calcolare nessun prezzo per quel giocatore.

## 5. Quali dati sono opzionali

`id` (se assente, l'app ne genera uno stabile — vedi punto 7), rating, potenziale,
titolarità, età, bonus attesi, posizione, ruolo trequartista, ruolo Fantacalcio.it.
Se rating e/o titolarità mancano, gli indici che ne dipendono (Prezzo Ideale/Massimo,
Modificatore Difesa, Rivelazione, Affare) si adattano usando solo i dati realmente
disponibili, e mostrano N/D dove i dati non bastano — **mai stimati o inventati**.

---

## 6. Come ottenere Rating/Titolarità

FantaIndex Rating e FantaIndex Titolarità sono dati che Fantacalcio-Online riserva agli
utenti registrati (e l'export Excel del listone è dietro login). Non esiste un endpoint
pubblico documentato, e un fetch diretto da una webapp locale verso il sito verrebbe quasi
certamente bloccato da CORS: per questo l'app **non prova scraping automatico nascosto**.

Il flusso pratico resta:
1. registrati gratuitamente sul sito (se non l'hai già fatto);
2. copia/esporta i dati a cui hai accesso;
3. importali in FantaScout con **Listone completo** (se il file li contiene già) oppure con
   **Solo Indici** (se li hai in un file/pagina separata) — vedi punto 2.

Se non li hai proprio, l'app funziona comunque: userà solo quotazione, ruolo ed età dove
disponibili e mostrerà N/D per il resto.

---

## 7. Come funziona il matching (id dei giocatori)

Problema risolto nello Sprint 2: in v1 l'id era generato da nome+cognome+**squadra**, quindi
un giocatore che cambiava squadra durante il mercato "perdeva" il suo id e con esso i dati
personali (⭐, note...).

Ora, per ogni giocatore in importazione:
1. se il file fornisce un **id esplicito**, quello ha sempre priorità;
2. altrimenti si cerca tra i giocatori già salvati uno con lo **stesso nome+cognome**: se
   c'è un solo candidato, il suo id viene riutilizzato **anche se la squadra è cambiata**;
3. in caso di **omonimi** (due giocatori diversi con lo stesso nome, già presenti con
   squadre diverse), si disambigua per nome+cognome+squadra, per non fondere per errore
   due persone diverse;
4. se non c'è nessun giocatore esistente con quel nome, l'id è un nuovo slug
   nome+cognome (con squadra aggiunta solo se serve a evitare collisioni nello stesso file).

Risultato: un cambio squadra normale viene riconosciuto come lo stesso giocatore; un vero
omonimo non "eredita" per sbaglio i dati di un altro.

---

## 8. Come vengono preservati i preferiti (e gli altri dati personali)

I dati vivono in **due storage separati** (in `localStorage`, chiavi `fs_players_remote` e
`fs_players_personal`):

- **REMOTI** (sovrascrivibili da un import): nome, cognome, squadra, ruolo, quotazione,
  rating, potenziale, titolarità, età, bonus attesi, posizione, ruolo trequartista, ruolo
  Fantacalcio.it.
- **PERSONALI** (mai sovrascritti da un import): ⭐ preferito, 📝 nota, acquistato, prezzo
  pagato, squadra avversaria acquirente, override manuali di prezzo ideale/massimo.

Un import aggiorna solo lo storage REMOTO, indicizzato per id stabile (punto 7): i dati
PERSONALI restano intoccati perché vivono altrove e non fanno mai parte dell'oggetto scritto
durante un import.

**Giocatori usciti dal listone**: se un giocatore non compare più in un nuovo import, non
viene cancellato. Resta con tutti i suoi dati personali, marcato internamente
`missingFromLastUpdate` e mostrato in tabella con il badge **⚠️ non presente**, così non perdi
la cronologia della tua asta (es. un giocatore che avevi già segnato come acquistato da un
avversario, o messo tra i preferiti).

---

## 9. Come funziona il motore di scouting/prezzi (Sprint 3)

Riprogettato da zero in `js/scouting.js` (modulo `Scouting.enrichAll()`). Tutti i
coefficienti sono centralizzati in `js/config.js` → `DEFAULT_CONFIG.pricing` (i più
rilevanti sono modificabili anche dalle Impostazioni in-app). **Nessun numero magico nel
motore.**

Il vecchio modello (Sprint 2.x) trattava il Rating come se fosse su una scala 6-9 (tipica di
altre fonti), mentre RAT/POT di Fantacalcio-Online sono su scala 0-100: il risultato erano
prezzi assurdi (es. "Lautaro → Prezzo Ideale 1137" con un budget personale di 500). Il nuovo
motore non "corregge il numero 6.00": è un modello diverso, spiegato qui sotto.

### 9.1 Normalizzazione dei dati grezzi

- **RAT, POT, Titolarità (IS %)**: sono già scale 0-100 fornite dalla fonte → si
  normalizzano per **divisione diretta** (`84 → 0.84`).
- **Bonus attesi**: **non** è una scala 0-100, è un conteggio senza limite superiore noto.
  Si normalizza calcolando il suo **percentile all'interno della distribuzione reale del
  listone importato** (per ruolo): un bonus atteso di 20 vale molto se la maggior parte dei
  giocatori del ruolo ha valori molto inferiori, poco altrimenti. Questo evita di inventare
  una scala arbitraria — vedi `computeDatasetStats()`, che calcola min/max/media/mediana e
  percentili 25/50/75/90/95 per RAT, POT, Titolarità, Bonus attesi e Quotazione, complessivi
  e per ruolo, PRIMA di qualunque normalizzazione.
- **Età**: curva morbida (`(33 - età) / 20`, troncata 0-1): pesa sempre poco e non decide mai
  da sola nulla.

### 9.2 Dati mancanti

Un fattore N/D **non entra nel calcolo**, non viene mai trattato come 0 né stimato: i pesi
dei fattori rimasti vengono ricalibrati proporzionalmente (`weightedAverage()` in
`scouting.js`). La UI mostra quanti fattori sono stati effettivamente usati (es. "4/5"). Se
**nessun** fattore è disponibile, l'Indice è esplicitamente N/D — mai 0.

### 9.3 Indice FantaScout (0-100)

Misura **quanto è forte il profilo** del giocatore, indipendentemente dal prezzo. Combina,
con pesi diversi per ruolo (`fantaScoutWeights` in config.js), Rating, Potenziale,
Titolarità, Bonus attesi ed Età:

| Ruolo | Rating | Potenziale | Titolarità | Bonus attesi | Età |
|---|---|---|---|---|---|
| P | 45% | 15% | 30% | 5% | 5% |
| D | 35% | 15% | 25% | 15% | 10% |
| C | 30% | 15% | 20% | 25% | 10% |
| C offensivo* | 25% | 15% | 15% | 35% | 10% |
| A | 25% | 15% | 15% | 35% | 10% |

\* Centrocampisti con `Posizione`/`Ruolo trequartista` che indicano un profilo offensivo
(trequartista, ala) vengono pesati come attaccanti sui Bonus attesi, senza cambiare il loro
Ruolo Classic (restano "C" in tutta l'app).

### 9.4 Indice Modificatore Difesa (0-100, solo D)

Separato dall'Indice FantaScout. Usa solo Rating, Potenziale e Titolarità (pesi 50/20/30%):
**nessuna statistica difensiva non presente nel dataset viene inventata** (niente clean
sheet, niente xG contro — non sono nel listone importato).

### 9.5 Indice Rivelazione (0-100)

Combina età (peso 20%), percentile del Potenziale nel ruolo (25%), Rating (15%) e un
rapporto **Bonus attesi / Quotazione** confrontato con la distribuzione del ruolo (40% —
"bonus attesi interessanti rispetto alla quotazione"). Un **cancello sulla titolarità**
comprime fortemente il punteggio sotto una soglia (default 35%): un ventiduenne con POT alto
ma titolarità 15% **non** risulta automaticamente una grande rivelazione (verificato nei test
automatici, vedi punto 14).

### 9.6 Indice Affare (0-100)

Distinto dall'Indice FantaScout: misura **quanto il giocatore è sottovalutato
economicamente**. Confronta il percentile di qualità (Indice FantaScout) con il percentile
di quotazione, **entrambi calcolati all'interno dello stesso ruolo**: qualità sopra la media
del ruolo + quotazione sotto la media del ruolo = affare. Un giocatore fortissimo ma già
quotato alto avrà un Indice FantaScout alto ma un Indice Affare medio; un giocatore meno
forte ma quotato pochissimo può avere un Affare più alto di un top player costoso.

### 9.7 Prezzo Ideale / Prezzo Massimo / Stop

**Non è mai "quotazione × coefficiente".** È un modello di mercato in tre passi:

1. Il budget totale della lega (**partecipanti × budget**, es. 8 × 500 = 4000 crediti) viene
   ripartito **tra i ruoli** secondo una convenzione economica generale
   (`market.roleBudgetShare`: P 8%, D 20%, C 32%, A 40% di default) — **non** legata alla
   composizione della rosa dell'utente, che questo sprint non usa e non chiede.
2. All'interno di ogni ruolo, i giocatori vengono **ordinati** per "desiderabilità"
   (soprattutto Indice FantaScout, per una piccola parte — default 12% — la quotazione come
   punto di riferimento economico, non come determinante).
3. Il pool di budget del ruolo viene distribuito lungo quell'ordine con una **curva a
   decadimento geometrico sul ranking** (`market.rankDecay`): il rank 1 del ruolo riceve la
   quota maggiore, poi si scende. La coda (giocatori marginali il cui peso sarebbe
   trascurabile) si distribuisce comunque su una piccola fascia di prezzi bassi ma distinti,
   per evitare che centinaia di giocatori finiscano tutti allo stesso prezzo minimo.

Il **Prezzo Massimo** parte dal Prezzo Ideale con un margine base (`maxBidMargin`, default
20%) **modulato dall'Indice Affare**: un vero affare (sottovalutato) merita un margine di
inseguimento più ampio, un giocatore già vicino al proprio valore (o sopravvalutato) un
margine più stretto. Lo **Stop** è il Prezzo Massimo + un margine ulteriore (`stopMargin`,
default 8%). Tutti e tre sono sempre vincolati a **1 ≤ prezzo ≤ budget personale**.

Se manca la quotazione, o non c'è abbastanza dato per calcolare l'Indice FantaScout, il
prezzo resta esplicitamente N/D (mai un numero inventato).

Il pulsante `?` accanto al Prezzo Massimo mostra, per quel giocatore, quali fattori hanno
influenzato il calcolo, la sua posizione nel ranking di ruolo e la quota di budget assegnata.

### Importante: cosa NON è il Prezzo Massimo

L'asta della tua lega è **a chiamata**: il prezzo reale pagato dipende da quanto rilanciano
gli altri 7 partecipanti, non da una formula. Il modello **non dice** "questo giocatore vale
71": dice "con le impostazioni della tua lega, 71 è il limite oltre il quale, secondo questo
modello, rischi di pagarlo più di quanto valga per te". È uno strumento di supporto
decisionale, non una previsione matematica certa.

---

## 9bis. Utilizzo delle tabelle (Sprint 2.6)

### Cosa significa ogni colonna

Ogni intestazione con un pulsante `?` apre una spiegazione in linguaggio semplice (cosa
rappresenta il dato, da quale fonte viene, su quale scala). Le spiegazioni sono
centralizzate in `js/config.js` → `TOOLTIPS`, cosi' restano coerenti in tutte le tabelle
(Giocatori, Preferiti, Asta). In particolare:

- **RAT / POT / Titol. / Bonus / Età**: dati che arrivano cosi' come sono da
  Fantacalcio-Online (vedi punto 3bis). "N/D" quando la fonte non li fornisce — mai un
  valore inventato o messo a 0.
- **Indice FantaScout**: punteggio sintetico 0-100 che misura quanto è forte il PROFILO del
  giocatore (rating, potenziale, titolarità, bonus attesi, età — vedi punto 9.3). **Non
  dipende dalla quotazione e non rappresenta crediti.**
- **Indice Affare**: punteggio 0-100 che misura quanto il giocatore è sottovalutato
  economicamente rispetto al proprio Indice FantaScout (vedi punto 9.6). Colonna secondaria,
  nascosta sugli schermi piccoli.
- **Prezzo Ideale / Prezzo Massimo**: calcolati dal motore descritto al punto 9. Il pulsante
  `?` accanto al Prezzo Massimo apre la spiegazione dettagliata per quel giocatore.

### Filtri combinabili

Nella vista Giocatori, il pannello **Filtri** permette di aggiungere più condizioni con
**"+ Aggiungi filtro"**: ogni riga è `[Campo] [Operatore] [Valore] [🗑]` e tutte le righe
attive vengono combinate con **AND** (es. `Ruolo = A` **e** `Titolarità ≥ 75` **e**
`RAT ≥ 75` mostra solo i giocatori che rispettano tutte e tre le condizioni). Il numero di
filtri attivi e il conteggio dei risultati sono sempre visibili ("Filtri (3)" — "Risultati:
N giocatori"). **Cancella filtri** rimuove tutti i filtri avanzati in un colpo solo.

I filtri rapidi (Tutti / Portieri / Difensori / Centrocampisti / Attaccanti / ⭐ Preferiti)
sono lo stesso identico meccanismo: cliccarli aggiunge/toglie un filtro dal pannello, quindi
sono sempre compatibili con i filtri avanzati (es. clicco "Attaccanti", poi aggiungo
"Titolarità ≥ 75%": il sistema applica entrambe le condizioni). I campi disponibili — Ruolo,
Squadra, RAT, POT, Titolarità, Età, Bonus attesi, Quotazione, Indice FantaScout, Indice
Affare, Prezzo Ideale, Prezzo Massimo, Preferito, Neopromossa, Disponibilità — sono
centralizzati in `js/config.js` → `FILTER_FIELDS`, con la logica di valutazione in
`js/filters.js`.

### Ordinamento

Ogni colonna ordinabile mostra lo stato direttamente nell'intestazione (`RAT ↓` = ordinata
per RAT decrescente). Il click è a **3 stati**: primo click → decrescente, secondo click →
crescente, terzo click → nessun ordinamento. Cliccare una colonna diversa riparte sempre da
decrescente. Cambiare i filtri non azzera l'ordinamento e viceversa: sono stati indipendenti
(`sortState` e `playersFilterState` in `js/app.js`).

---

## 10. Limitazioni note

- **Nessun aggiornamento realmente automatico**: il "vivo" è l'importazione manuale di un
  file, non un cron nascosto. Fantacalcio-Online non espone un'API pubblica e i dati
  esclusivi (Rating/Titolarità, Excel ufficiale) richiedono login — uno scraper
  automatico violerebbe i termini d'uso e sarebbe fragile.
- **Excel richiede una libreria caricata da CDN al primo avvio**: se non hai connessione in
  quel momento, importa un CSV/JSON nel frattempo.
- **Il matching per nome+cognome** (punto 7) può, in rari casi limite con più di due
  omonimi identici nella stessa squadra o typo tra un import e l'altro, non riconoscere
  correttamente un giocatore: in quel caso usa un id esplicito nel file, se la tua fonte
  lo fornisce.
- **Import Indici**: se il file indici non contiene nome+cognome coerenti con quelli già
  importati (es. abbreviazioni diverse), le righe risultano "non abbinate" e vengono
  segnalate, non applicate a caso.
- **Il modello di prezzo è di supporto decisionale**, non una previsione oggettiva: usa
  solo i dati che la fonte fornisce davvero (mai medie voto, clean sheet o minutaggio
  storico non disponibili pubblicamente) e lo dichiara onestamente con N/D quando i dati
  non bastano.
- **Dataset demo integrato**: è fittizio (nomi come "Esempio Bomberoni"), utile solo per
  provare l'interfaccia prima di importare il listone vero.

---

## 11. Uso da smartphone / Android

**Non aprire `index.html` direttamente dal file manager del telefono.** Il sintomo tipico
(layout anomalo, pulsanti che non rispondono) **non è un problema di CSS**: è una
limitazione di come Android/Chrome gestiscono i file aperti da storage locale.

Cosa succede tecnicamente:
- il codice **non usa** `fetch()`, non fa chiamate di rete, non usa `<script type="module">`
  (che avrebbe problemi reali con `file://`): tutti gli script sono `<script src="...">`
  classici, quindi non è un problema di CORS o di moduli;
- il problema più probabile è che il file manager/Chrome su Android apra l'HTML tramite un
  URI `content://` (non un vero `file://`), attraverso il quale i percorsi relativi
  (`css/style.css`, `js/*.js`) spesso **non vengono risolti correttamente** — la pagina si
  carica senza stile e senza JavaScript funzionante, il che spiega esattamente "layout
  anomalo e pulsanti non cliccabili";
- inoltre Chrome per Android blocca `localStorage` per pagine aperte da `file://`/`content://`
  (origine "opaca"): anche se i file si caricassero, i tuoi dati non verrebbero salvati tra
  una sessione e l'altra.

**Soluzione**: servire la pagina con un vero URL `http(s)://`, anche in locale:

```bash
cd fantascout
python3 -m http.server 8000
```

e poi, dallo smartphone (stessa rete Wi-Fi del PC), aprire `http://<ip-del-pc>:8000`. In
alternativa, pubblicare l'app come sito statico (punto 12) e aprirla da un vero URL HTTPS: è
la soluzione definitiva per l'uso quotidiano da telefono.

Non sono stati introdotti workaround fragili per aggirare `file://`/`content://`: non
sarebbero affidabili. La soluzione corretta è usare un server, anche minimo.

---

## 12. Pubblicazione futura come sito statico

Il progetto non ha dipendenze da percorsi assoluti locali, filesystem del PC o API
`localhost`: è HTML/CSS/JS puro con percorsi relativi, più un'unica dipendenza esterna
(SheetJS via CDN, che è già pensata per essere servita da un URL pubblico). Può quindi
essere pubblicato così com'è su un hosting statico (GitHub Pages, Netlify, Vercel, un
qualunque spazio web) senza modifiche, ottenendo un vero URL HTTPS utilizzabile da
smartphone in mobilità.

---

## 13. Architettura e file

```
/index.html          struttura delle viste (dashboard, giocatori, preferiti, scouting, asta, impostazioni)
/css/style.css        stile scuro, leggibile, mobile-first, badge semaforici
/js/config.js         configurazione di default e coefficienti (nessun numero magico altrove)
/js/storage.js        persistenza localStorage, dati REMOTI separati dai dati PERSONALI
/js/data.js           normalizzazione giocatore, matching/risoluzione ID, merge remoto/personale/indici
/js/filters.js         motore filtri avanzati combinabili (AND) - Sprint 2.6, usa FILTER_FIELDS/OPERATORS di config.js
/js/scouting.js       motore Sprint 3: statistiche dataset, Indice FantaScout, Indice
                      Affare, Indice Modificatore Difesa, Indice Rivelazione, Prezzo
                      Ideale/Massimo/Stop (vedi punto 9)
/js/importer.js       lettura XLSX/CSV/JSON, riconoscimento colonne, anteprima, import listone/indici
/js/auction.js        stato asta live: budget, rosa per ruolo, acquisto giocatori
/js/app.js            controller UI: navigazione, tabelle, filtri, modali, flusso di import
```

---

## 14. Test manuali consigliati dopo un aggiornamento

1. **Import dataset completo**: verifica che compaia l'anteprima con il conteggio corretto e
   le colonne riconosciute, poi conferma e controlla che la tabella Giocatori si popoli.
2. **Import senza Rating**: colonna Rating segnalata come non trovata in anteprima (o i
   giocatori mostrano N/D su Rating); nessun valore inventato.
3. **Import senza Titolarità**: stesso comportamento sulla colonna Titolarità.
4. **Doppia importazione dello stesso file**: nessun duplicato in tabella.
5. **⭐ Preferito → nuovo import**: la stella resta impostata dopo l'aggiornamento.
6. **📝 Nota → nuovo import**: la nota resta impostata dopo l'aggiornamento.
7. **Giocatore che cambia squadra**: importa lo stesso giocatore con una squadra diversa
   (stesso nome+cognome); verifica che resti un solo giocatore con id invariato e dati
   personali intatti.
8. **Giocatore non più presente**: importa un file senza un giocatore già salvato; verifica
   che non sparisca ma compaia con il badge "⚠️ non presente" e dati personali intatti.
9. **Budget asta**: acquista due giocatori dalla vista Asta e controlla in Dashboard che
   Residuo = Budget iniziale − Speso.
10. **File errato**: prova a importare un file corrotto/non valido; deve comparire un errore
    leggibile in anteprima, senza alterare i dati già salvati.
11. **Listone reale Fantacalcio-Online**: importa "Quotazioni Fantacalcio-Online.xlsx"; in
    anteprima devono comparire "Colonne riconosciute: 12 / 12" e "Record validi: 574 / 574"
    (o il numero reale del file che stai usando).
12. **Nome composto**: cerca un giocatore con cognome multi-parola (es. "KOLO MUANI") e uno
    con nome multi-parola (es. "RAMOS Goncalo Matias"); il nome visualizzato deve essere
    completo e corretto.
13. **Riga senza quotazione**: se nel file reale manca la quotazione per qualche giocatore,
    verifica che compaia nell'elenco errori sotto "Record validi" e non finisca in tabella.

### Test Sprint 2.6 (tabelle, filtri, ordinamento, spiegazioni)

14. **Filtro singolo**: `Ruolo = A` → solo attaccanti.
15. **Filtri multipli**: `Ruolo = A` + `Titolarità ≥ 75` + `RAT ≥ 75` → solo giocatori che
    rispettano tutte e tre le condizioni contemporaneamente.
16. **Filtro squadra**: `Squadra = Inter` (e verifica anche `Squadra ≠ Inter`).
17. **Filtro numerico**: `Bonus attesi ≥ 15`.
18. **Filtri + ordinamento insieme**: `Ruolo = A` + `Titolarità ≥ 75`, ordinamento `Bonus
    attesi ↓` → solo attaccanti con titolarità ≥75%, dal più prolifico in bonus attesi.
19. **Click sulla colonna RAT**: primo click → `RAT ↓`; secondo click → `RAT ↑`; terzo click →
    nessun ordinamento (torna l'ordine non ordinato).
20. **Cambiare filtro senza perdere l'ordinamento** e viceversa.
21. **Reset filtri**: "Cancella filtri" rimuove tutti i filtri avanzati/rapidi in un colpo.
22. **`?` sul prezzo di un giocatore** (es. Lautaro Martinez): il pannello deve mostrare
    Indice FantaScout, Indice Affare, fattori in linguaggio semplice e il risultato
    (Ideale/Massimo/Stop) — mai la formula grezza come prima cosa (quella resta in "Dettagli
    tecnici", collassata).
23. **`?` su RAT, POT, Titolarità, Bonus attesi** nell'intestazione: deve comparire una
    spiegazione chiara in linguaggio semplice.
24. **Stella ⭐**: verifica che si mantenga cliccando/filtrando/ordinando e dopo un
    reset dei filtri.

### Test Sprint 3 (motore di scouting/prezzi)

25. **Nessun prezzo fuori scala**: dopo un import completo, ordina per Prezzo Massimo
    decrescente: il primo valore non deve mai superare il budget di lega (500 di default).
26. **Nessun prezzo sotto 1**: ordina per Prezzo Ideale crescente: il minimo deve essere 1,
    mai 0 o negativo.
27. **Rating N/D**: importa/modifica un giocatore senza Rating; il pannello `?` deve mostrare
    "dataUsed" inferiore a 5/5 e continuare a calcolare un Indice FantaScout, mai a 0.
28. **Tutti i dati N/D tranne la quotazione**: l'Indice FantaScout e i prezzi devono
    risultare esplicitamente N/D, con un motivo leggibile, non un numero a caso.
29. **Rivelazioni**: filtra 🚀 Rivelazioni e verifica che non compaiano giovani con
    titolarità molto bassa (es. <20%) in cima alla lista, anche se POT è molto alto.
30. **Affari**: nella scheda 💎 Affari, il primo giocatore deve avere una quotazione
    relativamente bassa rispetto al proprio Indice FantaScout, non semplicemente la
    quotazione più bassa in assoluto.
31. **Modificatore Difesa**: solo i difensori compaiono nella scheda 🛡️; un attaccante deve
    mostrare "Applicabile solo ai difensori" se interrogato.
32. **Coerenza**: confronta due giocatori dello stesso ruolo con Indice FantaScout molto
    diverso (es. differenza ≥15 punti): a parità di quotazione, quello con indice più alto
    deve avere Prezzo Ideale più alto.

Questi scenari sono stati verificati anche con script di test automatico della logica di
import/merge/matching e, per lo Sprint 3, con un motore di test dedicato (12 test di sanità
sul prezzo + 12 test unitari sulla normalizzazione/gestione dati mancanti + test di
robustezza su dati fortemente incompleti), eseguiti su un dataset sintetico di 615
giocatori costruito rispettando le distribuzioni plausibili di un vero listone
Fantacalcio-Online e includendo i 3 giocatori reali forniti nel brief (Lautaro Martinez,
Nico Paz, McTominay) — non inclusi nel bundle dell'app perché servono solo in fase di
sviluppo. Il file xlsx reale non era allegato in questa conversazione: se lo alleghi in un
turno successivo verificherò l'import e i risultati sul listone vero.
