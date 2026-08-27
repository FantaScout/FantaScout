/* ============================================================
   FANTASCOUT 2026/27 - config.js
   Configurazione centralizzata: lega, rosa, coefficienti modello.
   NON disseminare numeri magici altrove: tutto passa da qui.
   ============================================================ */

// Etichetta di versione mostrata nei metadata degli export (es. Preferiti).
// Solo informativa/di compatibilita' futura: non influisce sul funzionamento.
const FANTASCOUT_VERSION = 'Sprint 3C';

const DEFAULT_CONFIG = {
  league: {
    participants: 8,
    budget: 500,
    mode: 'classic',
    auctionType: 'rilancio',
    defenseModifier: true
  },
  roster: {
    P: 3,
    D: 8,
    C: 8,
    A: 6
  },
  dataSource: {
    name: 'Fantacalcio Online',
    url: 'https://www.fantacalcio-online.com/it/serie-a/2026-2027/quotazioni',
    lastUpdate: null,
    lastSuccessfulUpdate: null
  },
  // Squadre neopromosse in Serie A 2026/27 (da Serie B 2025/26).
  // Verificato per lo Sprint 2 (agosto 2026): Venezia e Frosinone promossi
  // direttamente, Monza promosso tramite playoff (finale vs Catanzaro).
  // Questo valore resta comunque modificabile da Impostazioni: se la Lega
  // Serie A dovesse rettificare qualcosa, basta cambiarlo qui o in-app,
  // senza toccare il codice.
  promotedTeams: ['Venezia', 'Frosinone', 'Monza'],
  // ============================================================
  // SPRINT 3 - FANTASCOUT INTELLIGENCE ENGINE
  // Coefficienti del nuovo motore (js/scouting.js). MODIFICABILI dalle
  // Impostazioni (i piu' rilevanti) o qui per un accesso completo.
  // Nessun numero magico nel motore: tutto passa da qui.
  // ============================================================
  pricing: {
    // Pesi dell'Indice FantaScout (0-1, devono sommare a ~1 per ruolo).
    // 'C_OFF' = centrocampisti offensivi (trequartisti/ali), pesati come
    // profili piu' vicini agli attaccanti sui Bonus attesi.
    fantaScoutWeights: {
      P:     { rating: 0.45, potential: 0.15, ownership: 0.30, bonusAttesi: 0.05, age: 0.05 },
      D:     { rating: 0.35, potential: 0.15, ownership: 0.25, bonusAttesi: 0.15, age: 0.10 },
      C:     { rating: 0.30, potential: 0.15, ownership: 0.20, bonusAttesi: 0.25, age: 0.10 },
      C_OFF: { rating: 0.25, potential: 0.15, ownership: 0.15, bonusAttesi: 0.35, age: 0.10 },
      A:     { rating: 0.25, potential: 0.15, ownership: 0.15, bonusAttesi: 0.35, age: 0.10 }
    },
    // Pesi dell'Indice Modificatore Difesa (solo D): nessun dato difensivo
    // non presente nella fonte (clean sheet, xG contro...) viene inventato.
    modifierWeights: { rating: 0.50, potential: 0.20, ownership: 0.30 },
    // Pesi dell'Indice Rivelazione.
    revelation: {
      ageWeight: 0.20,
      potentialWeight: 0.25,
      ratingWeight: 0.15,
      bonusVsPriceWeight: 0.40,
      // sotto questa titolarita' (%) l'indice viene compresso proporzionalmente
      ownershipGateThreshold: 35
    },
    // Modello di mercato per Prezzo Ideale/Massimo/Stop (vedi scouting.js).
    market: {
      // quota del budget totale di lega (partecipanti x budget) riservata
      // a ciascun ruolo - convenzione di mercato generale, NON legata alla
      // rosa che l'utente comprera' effettivamente.
      roleBudgetShare: { P: 0.08, D: 0.20, C: 0.32, A: 0.40 },
      // quanto la quotazione (oltre all'Indice FantaScout) pesa nel
      // determinare la "desiderabilita'" relativa di un giocatore nel
      // proprio ruolo (0 = ignora la quotazione, 1 = solo quotazione)
      quotationInfluence: 0.12,
      // decadimento geometrico del prezzo lungo il ranking di ruolo
      // (peso(rank) = e^(-rankDecay * rank), rank 0-based): piu' alto =
      // differenze di prezzo piu' marcate tra i primi posti e il resto,
      // indipendentemente da quanti giocatori ha il listone importato.
      rankDecay: 0.045
    },
    // margine base dal Prezzo Ideale al Prezzo Massimo (poi modulato
    // dall'Indice Affare, vedi computeMargin in scouting.js)
    maxBidMargin: 0.20,
    // margine dal Prezzo Massimo allo Stop
    stopMargin: 0.08,
    // soglia dell'Indice Rivelazione oltre cui il filtro rapido "🚀
    // Rivelazioni" mostra il giocatore
    revelationThreshold: 65
  }
};

// Etichette e soglie semaforiche per la UI durante l'asta
const SEMAFORO = {
  verde: { max: 1.0, label: '🟢 CONTINUA', color: '#1fbf5c' },
  giallo: { max: 1.15, label: '🟡 ANCORA OK', color: '#f4b400' },
  arancio: { max: 1.30, label: '🟠 ULTIMO RILANCIO', color: '#ff8c1a' },
  rosso: { max: Infinity, label: '🔴 LASCIA', color: '#e03131' }
};

const ROLE_LABELS = { P: 'Portiere', D: 'Difensore', C: 'Centrocampista', A: 'Attaccante' };

/* ============================================================
   SPRINT 2.6 - DEFINIZIONI CENTRALIZZATE
   Colonne delle tabelle giocatore e spiegazioni "?" (tooltip).
   Centralizzato qui cosi' tabelle diverse (Giocatori, Preferiti,
   Asta) restano coerenti e non duplicano etichette/testi.
   ============================================================ */

// Colonne condivise dalla tabella giocatori (Giocatori / Preferiti / Asta).
// key: chiave dato (usata anche per l'ordinamento, vedi resolveSortValue in app.js)
// info: chiave in TOOLTIPS per il pulsante "?" nell'intestazione
// secondary: colonna meno prioritaria, nascosta sugli schermi molto piccoli
const COLUMN_DEFS = [
  { key: '',            label: '',                    sort: null },
  { key: 'fullName',    label: 'Giocatore',            sort: 'fullName' },
  { key: 'role',        label: 'Ruolo',                sort: 'role',        info: 'role' },
  { key: 'team',        label: 'Squadra',              sort: 'team' },
  { key: 'quotation',   label: 'Quot.',                sort: 'quotation',   info: 'quotation' },
  { key: 'rating',      label: 'Rating',               sort: 'rating',      info: 'rating' },
  { key: 'potential',   label: 'Pot.',                 sort: 'potential',   info: 'potential',   secondary: true },
  { key: 'ownership',   label: 'Titol.',               sort: 'ownership',   info: 'ownership' },
  { key: 'age',         label: 'Età',                  sort: 'age',         info: 'age',         secondary: true },
  { key: 'bonusAttesi', label: 'Bonus',                sort: 'bonusAttesi', info: 'bonusAttesi', secondary: true },
  { key: 'idealPrice',  label: 'Ideale',                sort: 'idealPrice',  info: 'idealPrice' },
  { key: 'maxBid',      label: 'Massimo',               sort: 'maxBid',      info: 'maxBid' },
  { key: 'fantaScoutIndex', label: 'Indice FantaScout', sort: 'fantaScoutIndex', info: 'fantaScoutIndex' },
  { key: 'affareIndex', label: 'Indice Affare',        sort: 'affareIndex', info: 'affareIndex', secondary: true },
  { key: 'note',        label: 'Note',                 sort: null,          secondary: true }
];

// Testi delle spiegazioni "?" - linguaggio semplice, niente formule qui
// (le formule/i dettagli tecnici restano nel pannello "Come viene
// calcolato", sezione secondaria collassabile).
const TOOLTIPS = {
  role: {
    title: 'Ruolo',
    body: 'Ruolo Classic utilizzato da FantaScout: Portiere (P), Difensore (D), Centrocampista (C), Attaccante (A).'
  },
  posizione: {
    title: 'Posizione',
    body: 'Posizione specifica fornita dalla fonte (es. AC = Attaccante Centrale, TQ = Trequartista, AD = Ala Destra, CC = Centrocampista Centrale).'
  },
  quotation: {
    title: 'Quotazione (Kapitals)',
    body: 'Quotazione di riferimento del listone Fantacalcio-Online. È il valore di partenza indicato dalla fonte: non è il prezzo che FantaScout consiglia di pagare (per quello vedi Prezzo Ideale/Massimo).'
  },
  rating: {
    title: 'Rating (RAT)',
    body: 'Rating del giocatore secondo Fantacalcio-Online. Scala 0-100: più è alto, più la fonte valuta positivamente il giocatore.'
  },
  potential: {
    title: 'Potenziale (POT)',
    body: 'Potenziale stimato del giocatore secondo Fantacalcio-Online (0-100). Contribuisce all\'Indice FantaScout e all\'Indice Rivelazione (vedi il pannello "Come viene calcolato" per i pesi usati per questo giocatore).'
  },
  ownership: {
    title: 'Titolarità (IS %)',
    body: "Indice di titolarità secondo Fantacalcio-Online: quanto è probabile che il giocatore sia titolare fisso, in percentuale (0-100%)."
  },
  age: {
    title: 'Età',
    body: 'Età del giocatore.'
  },
  bonusAttesi: {
    title: 'Bonus attesi',
    body: 'Numero di bonus attesi nella stagione secondo Fantacalcio-Online (gol, assist e altri bonus previsti).'
  },
  idealPrice: {
    title: 'Prezzo Ideale',
    body: 'Quanto ha senso offrire per questo giocatore in condizioni normali d\'asta, calibrato sulla configurazione della tua lega (partecipanti, budget, asta a chiamata, strategia equilibrata). Non è "quotazione x coefficiente": nasce dal confronto tra tutti i giocatori dello stesso ruolo nel listone importato.'
  },
  maxBid: {
    title: 'Prezzo Massimo',
    body: 'Soglia oltre la quale conviene iniziare a essere cauti nei rilanci. Il margine rispetto al Prezzo Ideale si allarga per i giocatori che l\'Indice Affare segnala come sottovalutati, e si stringe per quelli già vicini al loro valore.'
  },
  stopPrice: {
    title: 'Stop',
    body: 'Il vero limite operativo: oltre questa cifra il modello consiglia di lasciar andare il giocatore, indipendentemente da quanto sembri interessante.'
  },
  fantaScoutIndex: {
    title: 'Indice FantaScout',
    body: 'Punteggio sintetico da 0 a 100 che misura quanto è interessante il PROFILO del giocatore, sulla base dei dati disponibili (rating, potenziale, titolarità, bonus attesi ed età, pesati in modo diverso per ruolo). NON dipende dalla quotazione e NON rappresenta crediti: serve per capire "quanto è forte", non "quanto conviene pagarlo" (per quello vedi Indice Affare).'
  },
  affareIndex: {
    title: 'Indice Affare',
    body: 'Punteggio da 0 a 100 che misura quanto il giocatore è sottovalutato ECONOMICAMENTE: confronta il suo Indice FantaScout con la sua quotazione, entrambi rispetto agli altri giocatori dello stesso ruolo. Un valore alto segnala un profilo forte a una quotazione bassa per il ruolo.'
  },
  modifierIndex: {
    title: 'Indice Modificatore Difesa',
    body: 'Solo per i difensori: punteggio 0-100 basato su rating e titolarità, pensato per le leghe con modificatore difesa attivo.'
  },
  revelationIndex: {
    title: 'Indice Rivelazione',
    body: 'Punteggio 0-100 che segnala giocatori con rating/titolarità interessanti rispetto a una quotazione bassa.'
  }
};

// Campi disponibili per il pannello "Filtri" avanzati (combinabili con AND).
// type: 'select' | 'select-dynamic' | 'number' | 'bool'
// operators: sottoinsieme di OPERATORS (vedi js/filters.js)
const FILTER_FIELDS = [
  { key: 'role', label: 'Ruolo', type: 'select', calc: false,
    options: () => ['P', 'D', 'C', 'A'].map(r => ({ value: r, label: ROLE_LABELS[r] })),
    operators: ['eq', 'neq'], getValue: p => p.role },
  { key: 'team', label: 'Squadra', type: 'select-dynamic', calc: false,
    operators: ['eq', 'neq'], getValue: p => p.team },
  { key: 'rating', label: 'RAT', type: 'number', calc: false,
    operators: ['gt', 'lt', 'eq', 'between'], getValue: p => p.rating },
  { key: 'potential', label: 'POT', type: 'number', calc: false,
    operators: ['gt', 'lt', 'eq', 'between'], getValue: p => p.potential },
  { key: 'ownership', label: 'Titolarità (%)', type: 'number', calc: false,
    operators: ['gt', 'lt', 'between'], getValue: p => p.ownership },
  { key: 'age', label: 'Età', type: 'number', calc: false,
    operators: ['gt', 'lt', 'between'], getValue: p => p.age },
  { key: 'bonusAttesi', label: 'Bonus attesi', type: 'number', calc: false,
    operators: ['gt', 'lt', 'between'], getValue: p => p.bonusAttesi },
  { key: 'quotation', label: 'Quotazione', type: 'number', calc: false,
    operators: ['gt', 'lt', 'between'], getValue: p => p.quotation },
  { key: 'fantaScoutIndex', label: 'Indice FantaScout', type: 'number', calc: true,
    operators: ['gt', 'lt', 'between'], getValue: p => p.calc.fantaScoutIndex },
  { key: 'affareIndex', label: 'Indice Affare', type: 'number', calc: true,
    operators: ['gt', 'lt', 'between'], getValue: p => p.calc.affareIndex },
  { key: 'idealPrice', label: 'Prezzo Ideale', type: 'number', calc: true,
    operators: ['gt', 'lt', 'between'], getValue: p => p.calc.idealPrice },
  { key: 'maxBid', label: 'Prezzo Massimo', type: 'number', calc: true,
    operators: ['gt', 'lt', 'between'], getValue: p => p.calc.maxBid },
  { key: 'favorite', label: 'Preferito', type: 'bool', calc: false,
    operators: ['eq'], getValue: p => !!(p.personal && p.personal.favorite) },
  { key: 'isPromoted', label: 'Neopromossa', type: 'bool', calc: false,
    operators: ['eq'], getValue: p => !!p.isPromoted },
  { key: 'availability', label: 'Disponibilità', type: 'select', calc: false,
    options: () => [{ value: 'present', label: 'Presente' }, { value: 'missing', label: 'Non presente nell\'ultimo listone' }],
    operators: ['eq'], getValue: p => p.missingFromLastUpdate ? 'missing' : 'present' }
];

// Operatori disponibili per i filtri avanzati.
const OPERATORS = {
  gt:  { label: 'maggiore di (>)',  arity: 1 },
  lt:  { label: 'minore di (<)',    arity: 1 },
  eq:  { label: 'uguale a (=)',     arity: 1 },
  neq: { label: 'diverso da (≠)',   arity: 1 },
  between: { label: 'tra (intervallo)', arity: 2 }
};
