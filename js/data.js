/* ============================================================
   FANTASCOUT 2026/27 - data.js
   Struttura dati giocatore, normalizzazione, matching ID e merge.

   DATI REMOTI (sovrascrivibili da un aggiornamento):
     id, name, surname, team, role, quotation, rating, ownership,
     age, isPromoted, sourceUpdatedAt, missingFromLastUpdate, lastSeenAt

   DATI PERSONALI (mai sovrascritti da un aggiornamento remoto):
     favorite, personalNote, purchased, purchasePrice, buyerTeam,
     idealPriceOverride, maxBidOverride, tags

   GESTIONE ID (Sprint 2):
   L'ID stabile e' fondamentale: se un giocatore cambia squadra durante
   il mercato, i suoi dati personali (preferito, note, acquisto...) non
   devono andare persi. La v1 generava l'id da nome+cognome+squadra: un
   cambio squadra creava quindi un id nuovo e "perdeva" il giocatore.

   Nuova strategia (in ordine di priorita'):
   1. Se la fonte fornisce un id stabile, usiamo quello.
   2. Altrimenti calcoliamo uno slug SOLO da nome+cognome (senza
      squadra) e cerchiamo tra i giocatori remoti gia' salvati uno con
      lo stesso slug: se lo troviamo, riusiamo il suo id anche se la
      squadra e' cambiata (questo e' il caso "Mario Rossi cambia
      squadra" del requisito).
   3. Se lo slug nome+cognome e' ambiguo (piu' di un giocatore diverso
      con lo stesso nome gia' salvato, es. due omonimi), disambiguiamo
      con nome+cognome+squadra come fallback per non unire per errore
      due persone diverse.
   4. Se non troviamo nulla, il nuovo id e' lo slug nome+cognome (con
      squadra aggiunta solo se serve per evitare collisioni interne al
      file appena importato).
   ============================================================ */

const DataModel = (() => {

  function clean(s) {
    return (s || '').toString().trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  // Slug "di persona": nome+cognome, senza squadra. Usato per il matching
  // che deve sopravvivere a un cambio squadra.
  function nameSlug(name, surname) {
    return `${clean(surname)}-${clean(name)}`;
  }

  // Vecchio slug (nome+cognome+squadra), mantenuto solo come fallback di
  // disambiguazione e per compatibilita' con id gia' salvati in v1.
  function slugId(name, surname, team) {
    return `${clean(surname)}-${clean(name)}-${clean(team)}`;
  }

  // Costruisce un indice { nameSlug -> [ {id, team, role} ] } a partire
  // dai giocatori remoti gia' salvati, per poter risolvere l'id durante
  // un nuovo import (matching by nome+cognome, tollerante al cambio squadra).
  function buildExistingIndex(existingRemote) {
    const idx = new Map();
    (existingRemote || []).forEach(p => {
      const key = nameSlug(p.name, p.surname);
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key).push({ id: p.id, team: p.team, role: p.role });
    });
    return idx;
  }

  // Risolve l'id di un giocatore in importazione.
  // - id esplicito nel file -> sempre priorita' massima
  // - altrimenti prova il matching per nome+cognome contro l'esistente
  // - in caso di ambiguita' (omonimi con squadre diverse gia' presenti)
  //   disambigua con nome+cognome+squadra
  function resolvePlayerId(name, surname, team, explicitId, existingIndex, seenInThisBatch) {
    if (explicitId) return String(explicitId).trim();

    const key = nameSlug(name, surname);
    const candidates = existingIndex ? (existingIndex.get(key) || []) : [];

    if (candidates.length === 1) {
      // Unico giocatore esistente con questo nome: e' lui, anche se ha
      // cambiato squadra. Questo e' il caso "Mario Rossi cambia squadra".
      return candidates[0].id;
    }
    if (candidates.length > 1) {
      // Omonimi: prova a disambiguare con la squadra attuale o quella
      // gia' salvata in precedenza.
      const sameTeam = candidates.find(c => clean(c.team) === clean(team));
      if (sameTeam) return sameTeam.id;
      // Nessuna corrispondenza sicura: usa lo slug con squadra per non
      // fondere per errore due persone diverse.
      return slugId(name, surname, team);
    }

    // Nessun esistente con questo nome: nuovo giocatore. Usiamo lo slug
    // "di persona" cosi' un futuro cambio squadra sara' gia' gestito.
    // Se pero' nello stesso file ci sono gia' omonimi, disambighiamo con
    // la squadra per evitare che due righe diverse collassino sullo
    // stesso id.
    if (seenInThisBatch && seenInThisBatch.has(key)) {
      return slugId(name, surname, team);
    }
    if (seenInThisBatch) seenInThisBatch.add(key);
    return key;
  }

  // ------------------------------------------------------------
  // SPLIT NOME/COGNOME (Sprint 2.5)
  // Fantacalcio-Online fornisce un'unica colonna "Nome" con
  // COGNOME + spazio + NOME (es. "RAMOS Goncalo Matias",
  // "KOLO MUANI Randal"). Non possiamo assumere "prima parola =
  // cognome": alcuni cognomi sono composti da piu' parole, tutte
  // in maiuscolo. Euristica: i token iniziali interamente in
  // MAIUSCOLO fanno parte del cognome; il primo token che contiene
  // una lettera minuscola segna l'inizio del nome, e tutto il resto
  // (anche se maiuscolo) va nel nome. Se nessun token e' "misto",
  // l'intera stringa resta cognome e il nome resta vuoto: non e'
  // un errore, il testo originale e' comunque preservato altrove.
  // ------------------------------------------------------------
  function isAllUpperToken(t) {
    const letters = t.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
    if (!letters) return true;
    return letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  }

  function splitNameFromFull(full) {
    const raw = (full || '').toString().trim();
    if (!raw) return { surname: '', name: '' };
    const tokens = raw.split(/\s+/);
    let i = 0;
    while (i < tokens.length && isAllUpperToken(tokens[i])) i++;
    if (i === 0) i = 1; // almeno il primo token resta cognome
    const surnameTokens = tokens.slice(0, i);
    const nameTokens = tokens.slice(i);
    return { surname: surnameTokens.join(' '), name: nameTokens.join(' ') };
  }

  // Un record e' valido per il listone Classic solo se ha nome
  // completo, squadra, ruolo riconosciuto e quotazione. Rating,
  // potenziale, titolarita', eta' e bonus attesi possono mancare
  // (restano null -> "N/D" in UI).
  function computeValidity(p) {
    return !!(p.fullName && p.team && p.role && p.role !== 'N/D' && p.quotation !== null);
  }

  // Normalizza un record grezzo (da CSV/XLSX/JSON, gia' rimappato sulle
  // chiavi interne dall'Importer) nello schema interno.
  // Campi non disponibili restano null -> in UI verranno mostrati come "N/D".
  // `existingIndex` e `seenInThisBatch` sono opzionali: se non passati si
  // ricade sul vecchio comportamento (slug nome+cognome+squadra).
  function normalize(raw, existingIndex, seenInThisBatch) {
    let name = (raw.name || raw.nome || '').toString().trim();
    let surname = (raw.surname || raw.cognome || '').toString().trim();
    let displayName;
    if (surname) {
      // Formato "vecchio": colonne Nome e Cognome separate.
      displayName = `${name} ${surname}`.trim();
    } else if (name) {
      // Formato Fantacalcio-Online: "Nome" contiene nome+cognome insieme.
      // Il testo originale va SEMPRE preservato in displayName/fullName,
      // anche se lo split nome/cognome non e' perfetto.
      displayName = name;
      const split = splitNameFromFull(name);
      surname = split.surname;
      name = split.name;
    } else {
      displayName = '';
    }

    const team = (raw.team || raw.squadra || '').toString().trim();
    const role = normalizeRole(raw.role || raw.ruolo || '');
    const roleTrequartista = (raw.roleTrequartista || '').toString().trim();
    const roleFantacalcioIt = (raw.roleFantacalcioIt || '').toString().trim();
    const posizione = (raw.posizione || '').toString().trim();
    const explicitId = raw.id && String(raw.id).trim();
    const id = existingIndex !== undefined
      ? resolvePlayerId(name, surname, team, explicitId, existingIndex, seenInThisBatch)
      : (explicitId || slugId(name, surname, team));

    const quotation = toNumberOrNull(raw.quotation ?? raw.quotazione);
    const rating = toNumberOrNull(raw.rating ?? raw.fantaindex_rating ?? raw.rating_fantaindex);
    const potential = toNumberOrNull(raw.potential);
    const ownership = toNumberOrNull(raw.ownership ?? raw.titolarita ?? raw.fantaindex_titolarita);
    const age = toNumberOrNull(raw.age ?? raw.eta);
    const bonusAttesi = toNumberOrNull(raw.bonusAttesi);

    return {
      id,
      name,
      surname,
      fullName: displayName,
      team,
      role,                      // 'P' | 'D' | 'C' | 'A'
      roleTrequartista,          // valore grezzo conservato, non normalizzato
      roleFantacalcioIt,         // valore grezzo conservato, non normalizzato
      posizione,                 // es. AC, TQ, AD, CC - conservata per il futuro Intelligence Engine
      quotation,                 // numero o null (fonte: Kapitals)
      rating,                    // numero o null (fonte: RAT) - vedi nota scala in README
      potential,                 // numero o null (fonte: POT)
      ownership,                 // 0-100 o null (fonte: IS %)
      age,                       // anni, o null
      bonusAttesi,                // numero o null (fonte: Bonus = bonus attesi)
      isPromoted: null,          // calcolato dopo, in base a config.promotedTeams
      sourceUpdatedAt: raw.sourceUpdatedAt || null,
      missingFromLastUpdate: false,
      lastSeenAt: new Date().toISOString()
    };
  }

  function normalizeRole(r) {
    const v = (r || '').toString().trim().toUpperCase();
    if (['P', 'POR', 'PORTIERE', 'GK'].includes(v)) return 'P';
    if (['D', 'DIF', 'DIFENSORE', 'DC', 'DD', 'DS'].includes(v)) return 'D';
    if (['C', 'CEN', 'CENTROCAMPISTA', 'CC', 'CD', 'CS', 'TQ'].includes(v)) return 'C';
    if (['A', 'ATT', 'ATTACCANTE', 'AC', 'AD', 'AS'].includes(v)) return 'A';
    return v || 'N/D';
  }

  function toNumberOrNull(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // Applica il flag neopromossa in base alla config corrente
  function applyPromotedFlag(players, promotedTeams) {
    const set = new Set((promotedTeams || []).map(t => t.toLowerCase().trim()));
    return players.map(p => Object.assign({}, p, {
      isPromoted: set.has((p.team || '').toLowerCase().trim())
    }));
  }

  // Unisce un nuovo dataset REMOTO con quello esistente.
  // - i giocatori presenti nel nuovo import vengono aggiornati e marcati
  //   come "presenti" (missingFromLastUpdate: false);
  // - i giocatori NON piu' presenti nel nuovo import NON vengono
  //   cancellati: restano con i loro dati personali intatti e vengono
  //   marcati missingFromLastUpdate: true, cosi' la UI puo' mostrare
  //   "Non presente nell'ultimo aggiornamento" senza perdere la
  //   cronologia dell'asta.
  function mergeRemote(existingRemote, incomingRemote) {
    const byId = new Map(existingRemote.map(p => [p.id, p]));
    const incomingIds = new Set();
    incomingRemote.forEach(p => {
      byId.set(p.id, Object.assign({}, p, { missingFromLastUpdate: false }));
      incomingIds.add(p.id);
    });
    byId.forEach((p, id) => {
      if (!incomingIds.has(id)) {
        byId.set(id, Object.assign({}, p, { missingFromLastUpdate: true }));
      }
    });
    return Array.from(byId.values());
  }

  // Applica un secondo dataset (es. file INDICI: rating/titolarita') sopra
  // ai giocatori remoti esistenti, SENZA toccare gli altri campi remoti
  // (nome, squadra, quotazione...) e senza creare nuovi giocatori: se un
  // record del file indici non trova corrispondenza, viene segnalato come
  // "non abbinato" e ignorato (nessun dato inventato).
  function mergeIndices(existingRemote, incomingIndexRecords) {
    const existingIndex = buildExistingIndex(existingRemote);
    const byId = new Map(existingRemote.map(p => [p.id, p]));
    const matched = [];
    const unmatched = [];

    incomingIndexRecords.forEach(raw => {
      const name = (raw.name || raw.nome || '').toString().trim();
      const surname = (raw.surname || raw.cognome || '').toString().trim();
      const team = (raw.team || raw.squadra || '').toString().trim();
      const explicitId = raw.id && String(raw.id).trim();
      const rating = toNumberOrNull(raw.rating ?? raw.fantaindex_rating ?? raw.rating_fantaindex);
      const ownership = toNumberOrNull(raw.ownership ?? raw.titolarita ?? raw.fantaindex_titolarita);

      let targetId = explicitId && byId.has(explicitId) ? explicitId : null;
      if (!targetId) {
        const key = nameSlug(name, surname);
        const candidates = existingIndex.get(key) || [];
        if (candidates.length === 1) targetId = candidates[0].id;
        else if (candidates.length > 1) {
          const sameTeam = candidates.find(c => clean(c.team) === clean(team));
          if (sameTeam) targetId = sameTeam.id;
        }
      }

      if (!targetId || !byId.has(targetId)) {
        unmatched.push({ name, surname, team });
        return;
      }
      const current = byId.get(targetId);
      byId.set(targetId, Object.assign({}, current, {
        rating: rating !== null ? rating : current.rating,
        ownership: ownership !== null ? ownership : current.ownership
      }));
      matched.push(targetId);
    });

    return { players: Array.from(byId.values()), matchedCount: matched.length, unmatched };
  }

  // Combina dati remoti + dati personali in un unico oggetto per la UI
  function joinWithPersonal(remotePlayers, personalMap) {
    return remotePlayers.map(p => {
      const personal = personalMap[p.id] || {
        favorite: false, personalNote: '', purchased: false,
        purchasePrice: null, buyerTeam: null,
        idealPriceOverride: null, maxBidOverride: null, tags: []
      };
      return Object.assign({}, p, { personal });
    });
  }

  return {
    slugId, nameSlug, buildExistingIndex, resolvePlayerId,
    normalize, normalizeRole, applyPromotedFlag,
    mergeRemote, mergeIndices, joinWithPersonal,
    splitNameFromFull, computeValidity
  };
})();

/* ------------------------------------------------------------
   DATASET DEMO
   Questi NON sono dati reali di Fantacalcio Online: sono record
   di esempio (nomi generici) usati solo per mostrare come
   funziona l'app finche' non importi il listone vero tramite
   "IMPORTA DATI" o "AGGIORNA DATI". Vengono caricati SOLO se non
   esiste ancora nessun dato remoto salvato.
   ------------------------------------------------------------ */
const DEMO_PLAYERS_CSV =
`id,nome,cognome,squadra,ruolo,quotazione,rating,titolarita,eta
demo-por-1,Esempio,Portierini,Squadra Demo A,P,12,6.2,72,27
demo-dif-1,Esempio,Difensorelli,Squadra Demo B,D,8,6.0,65,24
demo-dif-2,Esempio,Baluardi,Squadra Demo C,D,15,6.4,80,29
demo-cen-1,Esempio,Regista,Squadra Demo A,C,20,6.6,78,26
demo-cen-2,Esempio,Mezzalini,Squadra Demo B,C,6,6.1,55,22
demo-att-1,Esempio,Bomberoni,Squadra Demo C,A,35,7.0,85,28
demo-att-2,Esempio,Rivelazio,Squadra Demo B,A,9,6.3,60,21
`;
