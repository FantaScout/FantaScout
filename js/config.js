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
