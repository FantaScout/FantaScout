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
più onesto, con un'etichetta "⚠️ provvisorio" ovunque compaiano, perché saranno
riprogettati nello Sprint 3.

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

## 9. Come funziona il modello prezzi

Non è una formula segreta: è in `js/scouting.js` → `computePricing()`, con tutti i
coefficienti centralizzati in `js/config.js` (e modificabili dalle Impostazioni in-app).

**Punto di partenza**: la quotazione ufficiale del giocatore. Da lì si applicano
moltiplicatori **solo per i dati realmente disponibili**:

- scostamento del FantaIndex Rating dalla media di riferimento (6.00);
- scostamento della FantaIndex Titolarità dalla soglia di riferimento (60%), con uno sconto
  di rischio aggiuntivo sotto una soglia minima (titolarità bassa = rischio panchina);
- scarsità di ruolo (coefficiente per P/D/C/A — pensato per una lega da 8 partecipanti,
  dove la profondità di rosa disponibile per ogni ruolo è alta: il coefficiente non
  esaspera la scarsità come farebbe in una lega da 10-12 squadre);
- bonus se l'Indice Rivelazione supera una soglia (potenziale rendimento sopra il prezzo,
  **non** "è giovane quindi rivelazione" — vedi sotto);
- sconto di rischio per i giocatori delle neopromosse (incognita di adattamento alla
  categoria superiore).

Il **Prezzo Massimo** è il Prezzo Ideale + un margine percentuale (di default 28%); lo
**Stop** è il Prezzo Massimo + un ulteriore margine (di default 6%). Tutti i margini sono
modificabili dalle Impostazioni. Il budget di lega (8 partecipanti × 500 crediti = 4000
crediti totali) non entra come costante rigida nella formula per-giocatore — la sua funzione
è più che altro di controllo a valle: la Dashboard e la vista Asta mostrano budget residuo e
slot di rosa liberi in tempo reale, così puoi confrontare quanto stai spendendo con quanto ti
resta e per quanti giocatori.

In tabella, il pulsante `?` accanto al Prezzo Massimo mostra la spiegazione riga per riga di
come è stato calcolato per quel giocatore specifico.

Se manca la quotazione, l'app non calcola nulla e mostra N/D.

### Importante: cosa NON è il Prezzo Massimo

L'asta della tua lega è **a rilancio**: il prezzo reale pagato dipende da quanto rilanciano
gli altri 7 partecipanti, non da una formula. Il modello **non dice** "questo giocatore vale
23": dice "con le impostazioni della tua lega, 23 è il limite oltre il quale, secondo questo
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
- **Indice FantaScout** (ex "Valore"): la vecchia etichetta era ambigua — sembrava un
  prezzo, ma è un punteggio sintetico 0-100 calcolato da `Scouting.computeValueIndex()`
  per confrontare rapidamente i giocatori tra loro (rating + titolarità + quotazione).
  **Non è un prezzo e non rappresenta crediti.**
- **Prezzo Ideale / Prezzo Massimo**: sempre accompagnati dal badge ⚠️, che indica
  valutazione **provvisoria** (vedi "Importante" sopra e nota nel pannello `?`).

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
Squadra, RAT, POT, Titolarità, Età, Bonus attesi, Quotazione, Indice FantaScout, Prezzo
Ideale, Prezzo Massimo, Preferito, Neopromossa, Disponibilità — sono centralizzati in
`js/config.js` → `FILTER_FIELDS`, con la logica di valutazione in `js/filters.js`.

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
/js/scouting.js       modello di pricing + indici (rivelazione, modificatore, affare)
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
22. **`?` sul prezzo di un giocatore** (es. Lautaro Martinez): il pannello deve mostrare dati
    utilizzati, fattori in linguaggio semplice, risultato con badge "PROVVISORIO" — mai la
    formula grezza come prima cosa (quella resta in "Dettagli tecnici", collassata).
23. **`?` su RAT, POT, Titolarità, Bonus attesi** nell'intestazione: deve comparire una
    spiegazione chiara in linguaggio semplice.
24. **Stella ⭐**: verifica che si mantenga cliccando/filtrando/ordinando e dopo un
    reset dei filtri.

Questi scenari sono stati verificati anche con uno script di test automatico della logica di
import/merge/matching, usato in fase di sviluppo (non incluso nel bundle dell'app perché non
serve all'utente finale). Per lo Sprint 2.5, lo script ha usato dati costruiti a partire dagli
esempi reali forniti nel brief (Nome/RAT/POT/IS %/ETA'/Ruolo standard/Ruolo trequartista/
Ruolo Fantacalcio.it/Posizione/Squadra/Kapitals/Bonus), perché il file xlsx reale non era
allegato in questa conversazione: se lo alleghi in un turno successivo verificherò l'import
sul file vero.
