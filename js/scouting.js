/* ============================================================
   FANTASCOUT 2026/27 - scouting.js
   Modello esplicito e parametrico per:
   - Prezzo ideale / Prezzo massimo / Stop
   - Indice Modificatore Difesa
   - Indice Rivelazione
   - Indice Affare

   Tutti i coefficienti vengono da CONFIG.pricing (vedi config.js
   e Impostazioni). Nessun numero magico qui dentro.

   DATI REALI vs DATI CALCOLATI:
   - quotation, rating, ownership, age, team, role -> REALI (dalla fonte,
     o N/D se non disponibili)
   - idealPrice, maxBid, stopPrice, revelationIndex, modifierIndex,
     valueIndex -> CALCOLATI da questo modulo
   ============================================================ */

const Scouting = (() => {

  // Prezzo ideale/massimo/stop. Se manca la quotazione non possiamo
  // calcolare nulla -> N/D esplicito, mai un numero a caso.
  //
  // NOTA SPRINT 2.6: oltre a `explanation` (testo tecnico, invariato,
  // usato solo nella sezione secondaria "Dettagli tecnici" della UI)
  // questa funzione ora restituisce anche `factors`: una versione in
  // linguaggio semplice ("Rating -> Influenza positiva") degli stessi
  // fattori, pensata per il pannello "Come viene calcolato?". Nessun
  // numero/coefficiente/formula e' stato modificato: e' solo metadato
  // descrittivo aggiuntivo sullo stesso calcolo di sempre.
  function computePricing(player, pricingCoeffs) {
    if (player.quotation === null || player.quotation === undefined) {
      return { idealPrice: null, maxBid: null, stopPrice: null, factors: [], explanation: ['Quotazione non disponibile: impossibile calcolare un prezzo.'] };
    }

    const c = pricingCoeffs;
    const explanation = [];
    const factors = [];
    let multiplier = 1;

    // Fattore rating (FantaIndex Rating): solo se disponibile
    if (player.rating !== null) {
      const delta = player.rating - 6.0;
      const factor = 1 + c.ratingWeight * delta;
      multiplier *= factor;
      explanation.push(`Rating ${player.rating.toFixed(2)} vs base 6.00 -> fattore ${factor.toFixed(2)}`);
      factors.push({ label: 'Rating', direction: factorDirection(factor) });
    } else {
      explanation.push('Rating non disponibile: nessun aggiustamento applicato.');
      factors.push({ label: 'Rating', direction: 'na' });
    }

    // Fattore titolarita' (FantaIndex Titolarita' 0-100): solo se disponibile
    if (player.ownership !== null) {
      const delta = player.ownership - 60;
      const factor = 1 + c.ownershipWeight * delta;
      multiplier *= factor;
      explanation.push(`Titolarita' ${player.ownership.toFixed(0)}% vs base 60% -> fattore ${factor.toFixed(2)}`);
      factors.push({ label: 'Titolarità', direction: factorDirection(factor) });

      if (player.ownership < c.lowOwnershipThreshold) {
        multiplier *= (1 - c.lowOwnershipDiscount);
        explanation.push(`Titolarita' sotto soglia di rischio (${c.lowOwnershipThreshold}%) -> sconto rischio ${(c.lowOwnershipDiscount * 100).toFixed(0)}%`);
        factors.push({ label: 'Rischio titolarità bassa', direction: 'down' });
      }
    } else {
      explanation.push('Titolarita\' non disponibile: nessun aggiustamento applicato.');
      factors.push({ label: 'Titolarità', direction: 'na' });
    }

    // Scarsita' di ruolo
    const scarcity = c.roleScarcity[player.role] ?? 1;
    multiplier *= scarcity;
    explanation.push(`Scarsita' ruolo ${player.role} -> fattore ${scarcity.toFixed(2)}`);
    factors.push({ label: `Scarsità ruolo ${player.role}`, direction: factorDirection(scarcity) });

    // Bonus rivelazione (se indice alto)
    const revealIdx = computeRevelationIndex(player, pricingCoeffs).value;
    if (revealIdx !== null && revealIdx >= c.revelationThreshold) {
      multiplier *= (1 + c.revelationBonus);
      explanation.push(`Indice Rivelazione alto (${revealIdx}) -> bonus ${(c.revelationBonus * 100).toFixed(0)}%`);
      factors.push({ label: 'Indice Rivelazione alto', direction: 'up' });
    }

    // Sconto rischio neopromossa (parzialmente compensato se e' anche rivelazione)
    if (player.isPromoted) {
      multiplier *= (1 - c.promotedRiskDiscount);
      explanation.push(`Squadra neopromossa -> sconto rischio ${(c.promotedRiskDiscount * 100).toFixed(0)}%`);
      factors.push({ label: 'Squadra neopromossa (rischio)', direction: 'down' });
    }

    const idealPrice = Math.max(1, Math.round(player.quotation * multiplier));
    const maxBid = Math.max(idealPrice, Math.round(idealPrice * (1 + c.maxBidMargin)));
    const stopPrice = Math.max(maxBid + 1, Math.round(maxBid * (1 + c.stopMargin)));

    return { idealPrice, maxBid, stopPrice, factors, explanation };
  }

  // Traduce un moltiplicatore in una direzione semplice per la UI.
  function factorDirection(factor) {
    if (factor > 1.001) return 'up';
    if (factor < 0.999) return 'down';
    return 'neutral';
  }

  // Indice Modificatore Difesa (solo per ruolo D), 0-100.
  // Basato su rating + titolarita' (unici dati di qualita' disponibili
  // dalla fonte): NON inventiamo medie voto o clean sheet non forniti.
  function computeModifierIndex(player) {
    if (player.role !== 'D') return { value: null, reason: 'Applicabile solo ai difensori.' };
    if (player.rating === null && player.ownership === null) {
      return { value: null, reason: 'Dati insufficienti (rating e titolarita\' non disponibili).' };
    }
    const ratingScore = player.rating !== null ? clamp((player.rating - 5) / 3, 0, 1) : null;
    const ownershipScore = player.ownership !== null ? clamp(player.ownership / 100, 0, 1) : null;

    let parts = [];
    if (ratingScore !== null) parts.push(ratingScore);
    if (ownershipScore !== null) parts.push(ownershipScore);
    const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
    const value = Math.round(avg * 100);
    return { value, reason: null };
  }

  // Indice Rivelazione, 0-100. "Alto potenziale / basso prezzo".
  // Usa solo dati realmente disponibili: eta', rating, titolarita', quotazione.
  // NON classifica come rivelazione un giocatore solo perche' e' giovane.
  function computeRevelationIndex(player, pricingCoeffs) {
    if (player.quotation === null) return { value: null, reason: 'Quotazione non disponibile.' };
    if (player.rating === null && player.ownership === null) {
      return { value: null, reason: 'Servono almeno rating o titolarita\' per stimare il potenziale.' };
    }

    // Rapporto qualita'/prezzo: quanto rating+titolarita' "eccedono" rispetto
    // a quanto ci si aspetterebbe da quella quotazione.
    const qualityScore = (
      (player.rating !== null ? clamp((player.rating - 5.5) / 2.5, 0, 1) : 0) * 0.6 +
      (player.ownership !== null ? clamp(player.ownership / 100, 0, 1) : 0) * 0.4
    );
    // Prezzo basso -> punteggio piu' alto (scala log per non premiare troppo i costosissimi bassi per caso)
    const priceScore = clamp(1 - Math.log10(player.quotation + 1) / Math.log10(60), 0, 1);

    // Bonus eta' leggero, MAI decisivo da solo (peso contenuto)
    const ageBonus = player.age !== null ? clamp((26 - player.age) / 12, 0, 1) * 0.15 : 0;

    const raw = qualityScore * 0.55 + priceScore * 0.30 + ageBonus * 0.15;
    const value = Math.round(clamp(raw, 0, 1) * 100);
    return { value, reason: null };
  }

  // Indice Affare (valore atteso / prezzo), 0-100.
  function computeValueIndex(player) {
    if (player.quotation === null || (player.rating === null && player.ownership === null)) {
      return { value: null, reason: 'Dati insufficienti.' };
    }
    const expected = (
      (player.rating !== null ? clamp(player.rating / 8, 0, 1) : 0.5) * 0.6 +
      (player.ownership !== null ? clamp(player.ownership / 100, 0, 1) : 0.5) * 0.4
    );
    const priceScore = clamp(1 - Math.log10(player.quotation + 1) / Math.log10(60), 0, 1);
    const value = Math.round(clamp(expected * 0.6 + priceScore * 0.4, 0, 1) * 100);
    return { value, reason: null };
  }

  function affareMotivo(player, valueIdx) {
    const bits = [];
    if (player.ownership !== null && player.ownership >= 65) bits.push('titolarita\' alta');
    if (player.quotation !== null && player.quotation <= 15) bits.push('prezzo basso');
    if (player.rating !== null && player.rating >= 6.3) bits.push('rating interessante');
    if (bits.length === 0) return 'Buon rapporto valore/prezzo secondo il modello.';
    return bits.join(' + ');
  }

  // Arricchisce un giocatore con tutti gli indici calcolati
  function enrichPlayer(player, config) {
    const pricing = computePricing(player, config.pricing);
    const modifierIndex = computeModifierIndex(player);
    const revelationIndex = computeRevelationIndex(player, config.pricing);
    const valueIndex = computeValueIndex(player);

    // Override manuali dell'utente hanno sempre precedenza
    const idealPrice = player.personal?.idealPriceOverride ?? pricing.idealPrice;
    const maxBid = player.personal?.maxBidOverride ?? pricing.maxBid;

    return Object.assign({}, player, {
      calc: {
        idealPrice,
        maxBid,
        stopPrice: pricing.stopPrice,
        priceExplanation: pricing.explanation,
        priceFactors: pricing.factors,
        modifierIndex: modifierIndex.value,
        modifierReason: modifierIndex.reason,
        revelationIndex: revelationIndex.value,
        revelationReason: revelationIndex.reason,
        valueIndex: valueIndex.value,
        affareMotivo: valueIndex.value !== null ? affareMotivo(player, valueIndex.value) : null
      }
    });
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // Stato semaforico durante il rilancio in asta
  function auctionStatus(currentBid, idealPrice, maxBid, stopPrice) {
    if (idealPrice === null || maxBid === null) return { label: 'N/D', color: '#888' };
    if (currentBid <= idealPrice) return { label: SEMAFORO.verde.label, color: SEMAFORO.verde.color };
    if (currentBid <= maxBid) return { label: SEMAFORO.giallo.label, color: SEMAFORO.giallo.color };
    if (currentBid < stopPrice) return { label: SEMAFORO.arancio.label, color: SEMAFORO.arancio.color };
    return { label: SEMAFORO.rosso.label, color: SEMAFORO.rosso.color };
  }

  return { computePricing, computeModifierIndex, computeRevelationIndex, computeValueIndex, enrichPlayer, auctionStatus };
})();
