/* ============================================================
   FANTASCOUT 2026/27 - config.js
   Configurazione centralizzata: lega, rosa, coefficienti modello.
   NON disseminare numeri magici altrove: tutto passa da qui.
   ============================================================ */

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
  // Coefficienti del modello di prezzo - MODIFICABILI dalle Impostazioni.
  // Tutti i moltiplicatori sono relativi (1 = neutro).
  pricing: {
    // quanto pesa il FantaIndex Rating sul prezzo ideale (per punto sopra/sotto 6.00)
    ratingWeight: 0.18,
    // quanto pesa il FantaIndex Titolarita' (0-100) sul prezzo ideale (scostamento da 60)
    ownershipWeight: 0.010,
    // margine percentuale dal prezzo ideale al prezzo massimo
    maxBidMargin: 0.28,
    // margine percentuale dal prezzo massimo allo stop (soglia oltre cui lasciar andare)
    stopMargin: 0.06,
    // scarsita' di ruolo: moltiplicatore applicato al prezzo ideale
    roleScarcity: { P: 0.85, D: 0.95, C: 1.05, A: 1.10 },
    // bonus moltiplicativo per indice rivelazione alto (0-100 scala, applicato oltre soglia)
    revelationThreshold: 65,
    revelationBonus: 0.12,
    // bonus per giocatori di neopromosse ritenuti sottovalutati (indice affare alto)
    promotedRiskDiscount: 0.06,
    // sconto di rischio se titolarita' bassa o assente
    lowOwnershipThreshold: 45,
    lowOwnershipDiscount: 0.15
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
  { key: 'idealPrice',  label: 'Ideale ⚠️',            sort: 'idealPrice',  info: 'idealPrice' },
  { key: 'maxBid',      label: 'Massimo ⚠️',           sort: 'maxBid',      info: 'maxBid' },
  { key: 'valueIndex',  label: 'Indice FantaScout',    sort: 'valueIndex',  info: 'valueIndex' },
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
    body: 'Potenziale stimato del giocatore secondo Fantacalcio-Online (0-100). È un dato informativo: al momento non entra nel calcolo di Prezzo Ideale/Massimo (vedi il pannello "Come viene calcolato" per i fattori realmente usati).'
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
    body: '⚠️ Valutazione provvisoria. Stima di quanto pagare per aggiudicarsi il giocatore in condizioni normali d\'asta, secondo il modello attualmente in uso. Il modello dei prezzi verrà riprogettato nello Sprint 3: fino ad allora questi numeri possono risultare fuori scala rispetto al tuo budget.'
  },
  maxBid: {
    title: 'Prezzo Massimo',
    body: '⚠️ Valutazione provvisoria. Soglia oltre la quale il modello consiglia cautela nei rilanci. Vale la stessa nota del Prezzo Ideale: il modello verrà riprogettato nello Sprint 3.'
  },
  stopPrice: {
    title: 'Stop',
    body: '⚠️ Valutazione provvisoria. Soglia oltre la quale il modello consiglia di lasciar andare il giocatore. Vale la stessa nota del Prezzo Ideale.'
  },
  valueIndex: {
    title: 'Indice FantaScout',
    body: 'Punteggio sintetico da 0 a 100 usato dall\'app per confrontare rapidamente i giocatori tra loro, sulla base dei dati disponibili (rating, titolarità e quotazione). NON rappresenta crediti e NON corrisponde al prezzo d\'asta: serve solo per ordinare/confrontare, non per decidere quanto spendere.'
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
  { key: 'valueIndex', label: 'Indice FantaScout', type: 'number', calc: true,
    operators: ['gt', 'lt', 'between'], getValue: p => p.calc.valueIndex },
  { key: 'idealPrice', label: 'Prezzo Ideale ⚠️', type: 'number', calc: true,
    operators: ['gt', 'lt', 'between'], getValue: p => p.calc.idealPrice },
  { key: 'maxBid', label: 'Prezzo Massimo ⚠️', type: 'number', calc: true,
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
