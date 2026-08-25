/* ============================================================
   FANTASCOUT 2026/27 - scouting.js
   SPRINT 3 - FANTASCOUT INTELLIGENCE ENGINE

   Motore di scouting + pricing, RIPROGETTATO da zero rispetto al
   modello Sprint 2.x (che trattava RAT come se fosse su scala 6-9
   invece che 0-100, producendo prezzi assurdi tipo "Lautaro 1137").

   Fornisce, per ciascun giocatore:
   - Indice FantaScout   (0-100): quanto e' forte/interessante il
     PROFILO del giocatore secondo i dati disponibili. Non dipende
     dal prezzo.
   - Indice Affare       (0-100): quanto il giocatore e' sottovalutato
     ECONOMICAMENTE rispetto al proprio Indice FantaScout.
   - Indice Modificatore Difesa (0-100, solo D).
   - Indice Rivelazione  (0-100).
   - Prezzo Ideale / Prezzo Massimo / Stop, calibrati sul budget e sul
     numero di partecipanti della lega (CONFIG.league), non sulla
     composizione della rosa (che questo sprint NON usa e NON chiede).

   PRINCIPI (vedi anche README.md, sezione "Motore di scouting"):
   1. Nessun dato mancante viene mai trattato come 0 o stimato: un
      fattore N/D viene escluso e i pesi restanti vengono ricalibrati
      proporzionalmente (vedi weightedAverage()).
   2. RAT, POT e Titolarita' sono gia' scale 0-100 fornite dalla
      fonte: si normalizzano per divisione diretta (84 -> 0.84).
   3. Bonus attesi NON e' una scala 0-100: e' un conteggio senza
      limite superiore noto. Si normalizza calcolando il suo
      PERCENTILE all'interno della distribuzione reale del dataset
      importato (per ruolo), non con una scala arbitraria.
   4. Il Prezzo Ideale NON e' "quotazione x coefficiente": e' un
      modello di mercato che distribuisce il budget totale della lega
      (partecipanti x budget) tra i giocatori di ciascun ruolo, in
      proporzione alla loro "desiderabilita'" relativa (soprattutto
      Indice FantaScout, in piccola parte la quotazione come punto di
      riferimento). La quotazione NON viene mai moltiplicata per un
      coefficiente per produrre il prezzo.
   ============================================================ */

const Scouting = (() => {

  /* ============================================================
     UTILITY STATISTICHE
     ============================================================ */

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }

  // Percentile per interpolazione lineare (metodo comune, "percentile 90"
  // ecc. delle richieste dello sprint). `sorted` deve essere gia' ordinato asc.
  function percentileValue(sorted, p) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  // Percentile RANK di un valore all'interno di una distribuzione ordinata:
  // "che frazione del dataset ha un valore <= value" -> 0..1.
  // E' il cuore della normalizzazione "relativa al dataset" richiesta per
  // Bonus attesi e per il confronto qualita'/prezzo (Indice Affare, prezzo).
  function percentileRank(value, sorted) {
    if (!sorted || !sorted.length || value === null || value === undefined) return null;
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] <= value) lo = mid + 1; else hi = mid;
    }
    return clamp(lo / sorted.length, 0, 1);
  }

  function summarize(values) {
    const sorted = values.filter(v => v !== null && v !== undefined && !isNaN(v)).slice().sort((a, b) => a - b);
    if (!sorted.length) {
      return { n: 0, min: null, max: null, mean: null, median: null, p25: null, p50: null, p75: null, p90: null, p95: null, sorted: [] };
    }
    return {
      n: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: mean(sorted),
      median: percentileValue(sorted, 50),
      p25: percentileValue(sorted, 25),
      p50: percentileValue(sorted, 50),
      p75: percentileValue(sorted, 75),
      p90: percentileValue(sorted, 90),
      p95: percentileValue(sorted, 95),
      sorted
    };
  }

  // Media pesata che IGNORA i fattori mancanti e ricalibra i pesi
  // restanti (mai un default a 0/50 per un dato N/D).
  // `parts`: [{ score: 0..1, weight: number, key: string }]
  function weightedAverage(parts) {
    if (!parts.length) return null;
    const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
    if (totalWeight <= 0) return null;
    return parts.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight;
  }

  /* ============================================================
     ANALISI DEL DATASET (obbligatoria prima di ogni normalizzazione
     relativa: bonus attesi, ranking di ruolo, prezzo).
     ============================================================ */

  const ROLES = ['P', 'D', 'C', 'A'];
  const RAW_METRICS = ['rating', 'potential', 'ownership', 'bonusAttesi', 'quotation', 'age'];

  // Calcola min/max/media/mediana/percentili per RAT, POT, Titolarita',
  // Bonus attesi e Quotazione, complessivi e per ruolo. Questo e' il
  // presupposto obbligatorio richiesto dallo sprint prima di scegliere
  // qualunque formula (vedi README "Statistiche del dataset").
  function computeDatasetStats(players) {
    const byRole = {};
    ROLES.forEach(role => {
      const list = players.filter(p => p.role === role);
      const roleStats = { count: list.length };
      RAW_METRICS.forEach(m => { roleStats[m] = summarize(list.map(p => p[m])); });
      // Bonus attesi per credito di quotazione: usato dall'Indice Rivelazione
      // ("bonus attesi interessanti RISPETTO ALLA QUOTAZIONE").
      roleStats.bonusPerCredit = summarize(
        list.filter(p => p.bonusAttesi !== null && p.quotation !== null && p.quotation > 0)
          .map(p => p.bonusAttesi / p.quotation)
      );
      byRole[role] = roleStats;
    });
    const overall = { count: players.length };
    RAW_METRICS.forEach(m => { overall[m] = summarize(players.map(p => p[m])); });
    return { byRole, overall };
  }

  function statsForRole(datasetStats, role) {
    return (datasetStats.byRole && datasetStats.byRole[role]) || datasetStats.overall;
  }

  /* ============================================================
     RUOLO "EFFETTIVO" PER I PESI
     I centrocampisti offensivi (trequartisti, ali) vengono pesati
     come i profili offensivi per i Bonus attesi, senza cambiare il
     loro Ruolo Classic (restano 'C' ovunque nell'app).
     ============================================================ */
  function weightRoleKey(player) {
    if (player.role === 'C') {
      const pos = (player.posizione || '').toString().trim().toUpperCase();
      const isOffensive = pos === 'TQ' || pos === 'AD' || pos === 'AS' || pos === 'AC' ||
        !!(player.roleTrequartista && player.roleTrequartista.toString().trim());
      if (isOffensive) return 'C_OFF';
    }
    return player.role;
  }

  /* ============================================================
     NORMALIZZAZIONE DEI SINGOLI FATTORI (0..1)
     RAT/POT/Titolarita': divisione diretta (gia' scale 0-100).
     Bonus attesi: percentile nella distribuzione reale del ruolo.
     Eta': curva morbida, peso sempre basso, mai decisiva da sola.
     ============================================================ */
  function factorRating(player) {
    return player.rating !== null ? clamp(player.rating / 100, 0, 1) : null;
  }
  function factorPotential(player) {
    return player.potential !== null ? clamp(player.potential / 100, 0, 1) : null;
  }
  function factorOwnership(player) {
    return player.ownership !== null ? clamp(player.ownership / 100, 0, 1) : null;
  }
  function factorBonus(player, roleStats) {
    if (player.bonusAttesi === null || !roleStats.bonusAttesi || roleStats.bonusAttesi.n === 0) return null;
    return percentileRank(player.bonusAttesi, roleStats.bonusAttesi.sorted);
  }
  // 0-1, decrescente con l'eta': ~1 a 15 anni, ~0.5 a 23, ~0 a 33+.
  // Volutamente "morbida": l'eta' da sola non deve mai decidere nulla.
  function factorAge(player) {
    return player.age !== null ? clamp((33 - player.age) / 20, 0, 1) : null;
  }

  /* ============================================================
     1. INDICE FANTASCOUT (0-100) - qualita' del profilo, role-aware.
     ============================================================ */
  function computeFantaScoutIndex(player, datasetStats, weightsConfig) {
    const roleKey = weightRoleKey(player);
    const w = weightsConfig[roleKey] || weightsConfig[player.role] || weightsConfig.C;
    const roleStats = statsForRole(datasetStats, player.role);

    const parts = [];
    const ratingScore = factorRating(player);
    if (ratingScore !== null) parts.push({ key: 'rating', label: 'Rating (RAT)', score: ratingScore, weight: w.rating });

    const potScore = factorPotential(player);
    if (potScore !== null) parts.push({ key: 'potential', label: 'Potenziale (POT)', score: potScore, weight: w.potential });

    const ownScore = factorOwnership(player);
    if (ownScore !== null) parts.push({ key: 'ownership', label: 'Titolarità (IS %)', score: ownScore, weight: w.ownership });

    const bonusScore = factorBonus(player, roleStats);
    if (bonusScore !== null) parts.push({ key: 'bonusAttesi', label: 'Bonus attesi', score: bonusScore, weight: w.bonusAttesi });

    const ageScore = factorAge(player);
    if (ageScore !== null) parts.push({ key: 'age', label: 'Età', score: ageScore, weight: w.age });

    if (!parts.length) {
      return { value: null, raw: null, dataUsed: '0/5', parts: [], reason: 'Nessun dato disponibile (rating, potenziale, titolarità, bonus attesi ed età sono tutti N/D).' };
    }

    const raw = weightedAverage(parts);
    return {
      value: Math.round(clamp(raw, 0, 1) * 100),
      raw,
      dataUsed: `${parts.length}/5`,
      parts,
      reason: null
    };
  }

  /* ============================================================
     2. INDICE MODIFICATORE DIFESA (0-100, solo D)
     Separato dall'Indice FantaScout: usa solo rating/potenziale/
     titolarita' (nessuna statistica difensiva non presente nel
     dataset viene inventata: niente clean sheet, niente xG contro).
     ============================================================ */
  function computeModifierIndex(player, modifierWeights) {
    if (player.role !== 'D') return { value: null, reason: 'Applicabile solo ai difensori.' };
    const parts = [];
    const ratingScore = factorRating(player);
    if (ratingScore !== null) parts.push({ score: ratingScore, weight: modifierWeights.rating });
    const potScore = factorPotential(player);
    if (potScore !== null) parts.push({ score: potScore, weight: modifierWeights.potential });
    const ownScore = factorOwnership(player);
    if (ownScore !== null) parts.push({ score: ownScore, weight: modifierWeights.ownership });

    if (!parts.length) return { value: null, reason: 'Dati insufficienti (rating, potenziale e titolarità non disponibili).' };
    const raw = weightedAverage(parts);
    return { value: Math.round(clamp(raw, 0, 1) * 100), reason: null };
  }

  /* ============================================================
     3. INDICE RIVELAZIONE (0-100)
     Eta' bassa + POT alto (relativo al ruolo) + rating interessante +
     bonus attesi buoni RISPETTO ALLA QUOTAZIONE, con un "cancello" che
     penalizza fortemente titolarita' bassa (un 22enne di talento con
     il 15% di probabilita' di titolarita' NON e' automaticamente una
     rivelazione).
     ============================================================ */
  function computeRevelationIndex(player, datasetStats, revCfg) {
    const roleStats = statsForRole(datasetStats, player.role);
    const parts = [];

    const ageScore = factorAge(player);
    if (ageScore !== null) parts.push({ key: 'age', score: ageScore, weight: revCfg.ageWeight });

    if (player.potential !== null && roleStats.potential && roleStats.potential.n > 0) {
      parts.push({ key: 'potential', score: percentileRank(player.potential, roleStats.potential.sorted), weight: revCfg.potentialWeight });
    }
    const ratingScore = factorRating(player);
    if (ratingScore !== null) parts.push({ key: 'rating', score: ratingScore, weight: revCfg.ratingWeight });

    let bonusVsPriceScore = null;
    if (player.bonusAttesi !== null && player.quotation !== null && player.quotation > 0 &&
        roleStats.bonusPerCredit && roleStats.bonusPerCredit.n > 0) {
      bonusVsPriceScore = percentileRank(player.bonusAttesi / player.quotation, roleStats.bonusPerCredit.sorted);
      parts.push({ key: 'bonusVsPrice', score: bonusVsPriceScore, weight: revCfg.bonusVsPriceWeight });
    }

    // Servono almeno due segnali indipendenti: "solo giovane" non basta.
    if (parts.length < 2) {
      return { value: null, reason: 'Servono almeno due tra età, potenziale, rating e bonus attesi/quotazione per stimare una rivelazione.' };
    }

    let raw = weightedAverage(parts);

    // Cancello titolarita': sotto soglia, il punteggio viene compresso
    // proporzionalmente (mai azzerato di scatto, ma fortemente penalizzato).
    if (player.ownership !== null) {
      const gate = clamp(player.ownership / revCfg.ownershipGateThreshold, 0, 1);
      raw *= gate;
    } else {
      raw *= 0.7; // titolarita' sconosciuta -> cautela, non azzeramento
    }

    return { value: Math.round(clamp(raw, 0, 1) * 100), reason: null };
  }

  /* ============================================================
     4. INDICE AFFARE (0-100)
     "Quanto il giocatore e' sottovalutato economicamente rispetto
     alla qualita' del profilo." Confronta il PERCENTILE di qualita'
     (Indice FantaScout) con il PERCENTILE di prezzo (quotazione),
     entrambi calcolati all'interno dello stesso ruolo: un giocatore
     con qualita' sopra la media del ruolo ma quotazione sotto la
     media del ruolo e' un affare.
     ============================================================ */
  function computeAffareIndex(player, fantaScoutRaw, roleQualitySorted, roleQuotationSorted) {
    if (fantaScoutRaw === null || player.quotation === null) {
      return { value: null, reason: 'Dati insufficienti (serve un Indice FantaScout calcolabile e la quotazione).' };
    }
    const qualityPct = roleQualitySorted && roleQualitySorted.length ? percentileRank(fantaScoutRaw, roleQualitySorted) : 0.5;
    const pricePct = roleQuotationSorted && roleQuotationSorted.length ? percentileRank(player.quotation, roleQuotationSorted) : 0.5;
    // Centrato a 0.5: qualita' percentile > prezzo percentile -> affare.
    const raw = clamp(qualityPct - pricePct + 0.5, 0, 1);
    return { value: Math.round(raw * 100), qualityPct, pricePct, reason: null };
  }

  function affareMotivo(player, affare) {
    const bits = [];
    if (affare.qualityPct !== undefined && affare.qualityPct >= 0.7) bits.push('profilo tra i migliori del ruolo');
    if (affare.pricePct !== undefined && affare.pricePct <= 0.35) bits.push('quotazione bassa per il ruolo');
    if (player.ownership !== null && player.ownership >= 65) bits.push('titolarità alta');
    if (player.bonusAttesi !== null && player.bonusAttesi > 0) bits.push('bonus attesi interessanti');
    if (bits.length === 0) return 'Buon rapporto qualità/prezzo secondo il modello.';
    return bits.join(' + ');
  }

  /* ============================================================
     5. PREZZO IDEALE / MASSIMO / STOP
     Modello di mercato: il budget totale della lega (partecipanti x
     budget) viene ripartito TRA I RUOLI secondo pesi di scarsita' di
     mercato (config.pricing.market.roleBudgetShare - una convenzione
     economica generale, NON legata alla composizione della rosa
     dell'utente, che questo sprint non usa), e ALL'INTERNO di ogni
     ruolo tra i giocatori in base al loro RANKING relativo (soprattutto
     Indice FantaScout, in piccola parte la quotazione come punto di
     riferimento economico).

     Il prezzo NON e' mai "quotazione x coefficiente": i giocatori del
     ruolo vengono prima ORDINATI per "desiderabilita'", poi il pool di
     budget del ruolo viene distribuito lungo quell'ordine con una curva
     a decadimento geometrico (rank 1 = piu' desiderabile riceve la
     quota maggiore, poi si scende). Il decadimento e' basato sulla
     DISTANZA IN CLASSIFICA (non sul punteggio grezzo): questo rende la
     forma della curva stabile qualunque sia la dimensione del listone
     importato, ed e' cio' che produce la gerarchia richiesta (top
     assoluti / top di ruolo / titolari / scommesse / riserve /
     marginali) invece di prezzi tutti simili o tutti a 1.
     ============================================================ */
  function computeRolePrices(playersOfRole, marketCfg, league) {
    const totalMarket = (league.participants || 1) * (league.budget || 1);
    const poolBudget = totalMarket * (marketCfg.roleBudgetShare[playersOfRole.role] ?? 0.25);
    const budgetCap = league.budget || 500;
    const list = playersOfRole.list.filter(p => p.fantaScoutRaw !== null && p.quotation !== null);
    const result = new Map();
    if (!list.length) return result;

    const quotationSorted = list.map(p => p.quotation).slice().sort((a, b) => a - b);

    // Desiderabilita': soprattutto qualita' (Indice FantaScout), in parte
    // la quotazione come riferimento (peso configurabile, di default 25%).
    // Usata SOLO per determinare l'ORDINE, non direttamente come peso.
    const withDesire = list.map(p => {
      const qPct = percentileRank(p.quotation, quotationSorted);
      const desirability = (1 - marketCfg.quotationInfluence) * p.fantaScoutRaw + marketCfg.quotationInfluence * qPct;
      return { id: p.id, desirability };
    });
    withDesire.sort((a, b) => b.desirability - a.desirability);

    // Decadimento geometrico sul RANK (0-based): peso(rank) = e^(-beta*rank).
    // beta = marketCfg.rankDecay. Indipendente dalla dimensione del pool:
    // la forma della curva tra i primi N posti resta la stessa sia che il
    // listone ne contenga 80 o 300 (cambia solo quanto in basso la coda
    // converge verso il minimo di 1 credito).
    const beta = marketCfg.rankDecay;
    const weights = withDesire.map((w, rank) => Math.exp(-beta * rank));
    const sumWeights = weights.reduce((a, b) => a + b, 0);

    const priced = withDesire.map((w, i) => {
      const share = sumWeights > 0 ? weights[i] / sumWeights : 1 / withDesire.length;
      const price = clamp(Math.round(poolBudget * share), 1, budgetCap);
      return { id: w.id, desirability: w.desirability, share, rank: i + 1, price };
    });

    // La coda della curva (giocatori marginali) converge quasi tutta al
    // minimo di 1 credito: matematicamente corretto (il loro peso nel
    // pool e' trascurabile), ma produce un'unica fascia di prezzo
    // identica per centinaia di giocatori, che il test di sanita' dello
    // sprint vieta esplicitamente. Questi giocatori restano comunque
    // "quasi gratis": si distribuiscono su una piccola fascia 1-5 in
    // base alla loro posizione relativa nella coda stessa, cosi' che
    // "scommesse" leggermente migliori restino leggermente piu' care di
    // "riserve pure" senza alterare la gerarchia principale (che dipende
    // solo dal ranking sopra la coda).
    const tail = priced.filter(p => p.price <= 1);
    if (tail.length > 1) {
      const spread = clamp(Math.ceil(tail.length / 12), 5, 40);
      tail.forEach((p, i) => {
        const t = i / (tail.length - 1); // 0 = migliore della coda, 1 = peggiore
        p.price = clamp(Math.round(spread - t * (spread - 1)), 1, budgetCap);
      });
    }

    priced.forEach(p => {
      result.set(p.id, { price: p.price, desirability: p.desirability, share: p.share, rank: p.rank, poolSize: priced.length });
    });
    return result;
  }

  // Margine dal Prezzo Ideale al Prezzo Massimo, modulato dall'Indice
  // Affare: un vero affare (sottovalutato) merita un margine di
  // inseguimento piu' ampio; un giocatore gia' vicino al proprio valore
  // (o sopravvalutato) merita un margine piu' stretto.
  function computeMargin(baseMargin, affareValue) {
    if (affareValue === null) return baseMargin;
    const adj = (affareValue - 50) / 500; // +/-0.10 al massimo
    return clamp(baseMargin + adj, 0.05, baseMargin + 0.25);
  }

  /* ============================================================
     ORCHESTRAZIONE: arricchisce l'intero dataset in 2 passate.
     Passata 1: normalizza dati grezzi + calcola Indice FantaScout,
       Indice Modificatore, Indice Rivelazione per ogni giocatore.
     Passata 2 (richiede la distribuzione dei punteggi Passata 1 per
       ruolo): Indice Affare + Prezzo Ideale/Massimo/Stop.
     ============================================================ */
  function enrichAll(players, config) {
    const pricing = config.pricing;
    const datasetStats = computeDatasetStats(players);

    // ---- Passata 1 ----
    const pass1 = players.map(player => {
      const fs = computeFantaScoutIndex(player, datasetStats, pricing.fantaScoutWeights);
      const modifierIndex = computeModifierIndex(player, pricing.modifierWeights);
      const revelationIndex = computeRevelationIndex(player, datasetStats, pricing.revelation);
      return { player, fs, modifierIndex, revelationIndex };
    });

    // Distribuzione, per ruolo, dell'Indice FantaScout "grezzo" (0-1):
    // serve sia per l'Indice Affare (percentile qualita') sia come base
    // di "desiderabilita'" per il Prezzo Ideale.
    const qualityByRole = {};
    ROLES.forEach(role => {
      qualityByRole[role] = pass1
        .filter(x => x.player.role === role && x.fs.raw !== null)
        .map(x => x.fs.raw)
        .sort((a, b) => a - b);
    });
    const quotationByRole = {};
    ROLES.forEach(role => {
      quotationByRole[role] = pass1
        .filter(x => x.player.role === role && x.player.quotation !== null)
        .map(x => x.player.quotation)
        .sort((a, b) => a - b);
    });

    // ---- Prezzi: un ranking per ruolo, indipendente dalla rosa ----
    const priceByRole = {};
    ROLES.forEach(role => {
      const list = pass1
        .filter(x => x.player.role === role)
        .map(x => ({ id: x.player.id, fantaScoutRaw: x.fs.raw, quotation: x.player.quotation }));
      priceByRole[role] = computeRolePrices({ role, list }, pricing.market, config.league);
    });

    // ---- Passata 2: Indice Affare + prezzi + spiegazioni ----
    return pass1.map(({ player, fs, modifierIndex, revelationIndex }) => {
      const affare = computeAffareIndex(player, fs.raw, qualityByRole[player.role], quotationByRole[player.role]);

      const priceInfo = priceByRole[player.role] ? priceByRole[player.role].get(player.id) : null;
      let idealPrice = null, maxBid = null, stopPrice = null, priceReason = null;
      const budgetCap = config.league.budget || 500;

      if (priceInfo) {
        idealPrice = priceInfo.price;
        const margin = computeMargin(pricing.maxBidMargin, affare.value);
        maxBid = clamp(Math.round(idealPrice * (1 + margin)), idealPrice, budgetCap);
        const stopStep = Math.max(1, Math.round(maxBid * pricing.stopMargin));
        stopPrice = clamp(maxBid + stopStep, maxBid + (maxBid < budgetCap ? 1 : 0), budgetCap);
      } else if (player.quotation === null) {
        priceReason = 'Quotazione non disponibile: impossibile calcolare un prezzo.';
      } else {
        priceReason = 'Dati insufficienti per stimare l\'Indice FantaScout: impossibile calcolare un prezzo.';
      }

      const { factors, explanation } = buildExplanation(player, fs, affare, priceInfo, config);

      // Override manuali dell'utente hanno sempre precedenza
      const finalIdeal = player.personal?.idealPriceOverride ?? idealPrice;
      const finalMax = player.personal?.maxBidOverride ?? maxBid;

      return Object.assign({}, player, {
        calc: {
          fantaScoutIndex: fs.value,
          fantaScoutDataUsed: fs.dataUsed,
          affareIndex: affare.value,
          affareMotivo: affare.value !== null ? affareMotivo(player, affare) : null,
          modifierIndex: modifierIndex.value,
          modifierReason: modifierIndex.reason,
          revelationIndex: revelationIndex.value,
          revelationReason: revelationIndex.reason,
          idealPrice: finalIdeal,
          maxBid: finalMax,
          stopPrice,
          priceReason,
          priceFactors: factors,
          priceExplanation: explanation
        }
      });
    });
  }

  // Testo semplice ("Rating -> Influenza positiva") + log tecnico per il
  // pannello "Come viene calcolato?" della UI (invariato nello scopo
  // rispetto allo Sprint 2.6, aggiornato ai contenuti del nuovo modello).
  function buildExplanation(player, fs, affare, priceInfo, config) {
    const factors = [];
    const explanation = [];

    if (!fs.parts.length) {
      explanation.push(fs.reason || 'Dati insufficienti per calcolare l\'Indice FantaScout.');
      return { factors, explanation };
    }

    explanation.push(`Indice FantaScout calcolato con ${fs.dataUsed} fattori disponibili.`);
    fs.parts.forEach(p => {
      const dir = p.score > 0.55 ? 'up' : (p.score < 0.45 ? 'down' : 'neutral');
      factors.push({ label: p.label, direction: dir });
      explanation.push(`${p.label}: punteggio ${(p.score * 100).toFixed(0)}/100, peso ${(p.weight * 100).toFixed(0)}%`);
    });
    explanation.push(`Indice FantaScout finale: ${fs.value}/100`);

    if (affare.value !== null) {
      const dir = affare.value >= 60 ? 'up' : (affare.value <= 40 ? 'down' : 'neutral');
      factors.push({ label: 'Indice Affare (qualità vs quotazione)', direction: dir });
      explanation.push(`Indice Affare: ${affare.value}/100 (percentile qualità nel ruolo ${(affare.qualityPct * 100).toFixed(0)}% vs percentile quotazione ${(affare.pricePct * 100).toFixed(0)}%)`);
    }

    if (priceInfo) {
      const pctDesire = (priceInfo.share * 100).toFixed(1);
      factors.push({ label: `Posizione nel ranking di ruolo ${player.role}`, direction: priceInfo.rank <= priceInfo.poolSize * 0.2 ? 'up' : (priceInfo.rank > priceInfo.poolSize * 0.6 ? 'down' : 'neutral') });
      explanation.push(`Ranking di ruolo: #${priceInfo.rank} su ${priceInfo.poolSize} ${player.role} nel listone. Quota del budget di ruolo assegnata: ${pctDesire}% del pool ${player.role} (lega: ${config.league.participants} partecipanti x ${config.league.budget} crediti)`);
    }

    return { factors, explanation };
  }

  // Stato semaforico durante il rilancio in asta (invariato)
  function auctionStatus(currentBid, idealPrice, maxBid, stopPrice) {
    if (idealPrice === null || maxBid === null) return { label: 'N/D', color: '#888' };
    if (currentBid <= idealPrice) return { label: SEMAFORO.verde.label, color: SEMAFORO.verde.color };
    if (currentBid <= maxBid) return { label: SEMAFORO.giallo.label, color: SEMAFORO.giallo.color };
    if (currentBid < stopPrice) return { label: SEMAFORO.arancio.label, color: SEMAFORO.arancio.color };
    return { label: SEMAFORO.rosso.label, color: SEMAFORO.rosso.color };
  }

  return {
    computeDatasetStats, computeFantaScoutIndex, computeModifierIndex,
    computeRevelationIndex, computeAffareIndex, enrichAll, auctionStatus,
    // esposte per i test automatici (vedi test/)
    percentileRank, percentileValue, weightedAverage, summarize
  };
})();
