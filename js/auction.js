/* ============================================================
   FANTASCOUT 2026/27 - auction.js
   Stato dell'asta live: budget, rosa acquistata, acquisto giocatore.
   La "rosa" (numero di slot per ruolo) e' sempre letta da CONFIG,
   mai hardcodata.
   ============================================================ */

const Auction = (() => {

  function getPurchasedPlayers(allPlayersWithPersonal) {
    return allPlayersWithPersonal.filter(p => p.personal && p.personal.purchased);
  }

  function getBudgetStatus(allPlayersWithPersonal, config) {
    const purchased = getPurchasedPlayers(allPlayersWithPersonal);
    const spent = purchased.reduce((sum, p) => sum + (p.personal.purchasePrice || 0), 0);
    const budget = config.league.budget;
    return {
      budget,
      spent,
      remaining: budget - spent,
      playersCount: purchased.length
    };
  }

  function getRosterStatus(allPlayersWithPersonal, config) {
    const purchased = getPurchasedPlayers(allPlayersWithPersonal);
    const status = {};
    Object.keys(config.roster).forEach(role => {
      const bought = purchased.filter(p => p.role === role).length;
      status[role] = { bought, slots: config.roster[role], remaining: config.roster[role] - bought };
    });
    return status;
  }

  // Acquista un giocatore: aggiorna solo i dati PERSONALI (mai i dati remoti)
  function buyPlayer(playerId, price, note) {
    return Storage.setPlayerPersonal(playerId, {
      purchased: true,
      purchasePrice: price,
      personalNote: note !== undefined ? note : (Storage.getPlayerPersonal(playerId).personalNote || '')
    });
  }

  function undoPurchase(playerId) {
    return Storage.setPlayerPersonal(playerId, { purchased: false, purchasePrice: null });
  }

  // Registra che un giocatore e' stato acquistato da un'altra squadra (per tracciamento)
  function markTakenByOpponent(playerId, teamName, price) {
    return Storage.setPlayerPersonal(playerId, { purchased: false, buyerTeam: teamName, purchasePrice: price || null });
  }

  return { getPurchasedPlayers, getBudgetStatus, getRosterStatus, buyPlayer, undoPurchase, markTakenByOpponent };
})();
