/* ============================================================
   FANTASCOUT 2026/27 - app.js
   Controller UI principale.
   ============================================================ */

const App = (() => {
  let config = Storage.getConfig();
  let players = []; // enriched: remoto + personale + indici calcolati
  let playersFilterState = { role: '', team: '', qMin: '', qMax: '', ownMin: '', ratingMin: '', search: '', favOnly: false, promotedOnly: false, revelationOnly: false };
  let auctionFilterState = { role: '', hideBought: true, search: '' };
  let sortState = { players: { col: 'quotation', dir: 'desc' }, favorites: { col: 'quotation', dir: 'desc' }, auction: { col: 'quotation', dir: 'desc' } };
  let currentScoutingTab = 'revelations';
  let buyModalPlayerId = null;

  function init() {
    seedIfEmpty();
    rebuildPlayers();
    bindNav();
    bindUpdateButtons();
    bindModals();
    renderAll();
  }

  function seedIfEmpty() {
    if (Storage.getRemotePlayers().length === 0) {
      // Nessun dato ancora: non inventiamo nulla, l'utente decide se
      // caricare il set DEMO (chiaramente etichettato come non reale)
      // dal modale di importazione, oppure importare subito il CSV vero.
    }
  }

  function rebuildPlayers() {
    config = Storage.getConfig();
    const remote = DataModel.applyPromotedFlag(Storage.getRemotePlayers(), config.promotedTeams);
    const personal = Storage.getPersonalData();
    const joined = DataModel.joinWithPersonal(remote, personal);
    players = joined.map(p => Scouting.enrichPlayer(p, config));
  }

  function renderAll() {
    renderDashboard();
    renderPlayersView();
    renderFavoritesView();
    renderScoutingView();
    renderAuctionView();
    renderSettingsView();
  }

  /* ---------------- NAVIGATION ---------------- */
  function bindNav() {
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', () => goTo(el.dataset.nav));
    });
  }
  function goTo(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + viewName).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === viewName));
  }

  /* ---------------- DASHBOARD ---------------- */
  function renderDashboard() {
    const budgetStatus = Auction.getBudgetStatus(players, config);
    document.getElementById('statBudget').textContent = budgetStatus.budget;
    document.getElementById('statSpent').textContent = budgetStatus.spent;
    document.getElementById('statRemaining').textContent = budgetStatus.remaining;
    document.getElementById('statCount').textContent = budgetStatus.playersCount;
    const meta = Storage.getMeta();
    document.getElementById('statLastUpdate').textContent = meta.lastSuccessfulUpdate ? formatDateTime(meta.lastSuccessfulUpdate) : 'Mai';
  }

  /* ---------------- PLAYERS TABLE (shared renderer) ---------------- */
  function playerRow(p, opts) {
    opts = opts || {};
    const c = p.calc;
    const valueBadge = valueBadgeHtml(c.valueIndex);
    return `<tr data-id="${escapeAttr(p.id)}">
      <td><button class="star-btn" data-fav="${escapeAttr(p.id)}">${p.personal.favorite ? '⭐' : '☆'}</button></td>
      <td>${escapeHtml(p.fullName)}${p.isPromoted ? ' <span class="badge" style="background:#333;color:#9fe6a0">NEO</span>' : ''}${p.missingFromLastUpdate ? ' <span class="badge badge-missing" title="Non presente nell\'ultimo aggiornamento importato">⚠️ non presente</span>' : ''}</td>
      <td><span class="badge badge-role-${p.role}">${p.role}</span></td>
      <td>${escapeHtml(p.team)}</td>
      <td class="num">${fmtNum(p.quotation)}</td>
      <td class="num">${fmtNum(p.rating)}</td>
      <td class="num">${p.ownership !== null ? p.ownership + '%' : '<span class="na">N/D</span>'}</td>
      <td class="num">${fmtNum(c.idealPrice)}</td>
      <td class="num">${fmtNum(c.maxBid)}
        <button class="btn-tooltip" data-tooltip="${escapeAttr(p.id)}" title="Come viene calcolato?">?</button>
      </td>
      <td>${valueBadge}</td>
      <td class="num">${p.personal.personalNote ? '📝' : ''}</td>
      ${opts.showBuy ? `<td>${p.personal.purchased ? '✅ Tuo' : `<button class="btn-buy" data-buy="${escapeAttr(p.id)}">💰 Acquista</button>`}</td>` : ''}
    </tr>`;
  }

  function tableHeader(opts) {
    opts = opts || {};
    const cols = [
      ['', ''], ['Giocatore', 'fullName'], ['Ruolo', 'role'], ['Squadra', 'team'],
      ['Quot.', 'quotation'], ['Rating', 'rating'], ['Titol.', 'ownership'],
      ['Ideale', 'idealPrice'], ['Massimo', 'maxBid'], ['Valore', 'valueIndex'], ['Note', '']
    ];
    if (opts.showBuy) cols.push(['Asta', '']);
    return '<tr>' + cols.map(([label, key]) => `<th ${key ? `data-sort="${key}"` : ''}>${label}</th>`).join('') + '</tr>';
  }

  function valueBadgeHtml(v) {
    if (v === null) return '<span class="badge-value v-nd">N/D</span>';
    let cls = 'v-rosso';
    if (v >= 70) cls = 'v-verde'; else if (v >= 50) cls = 'v-giallo'; else if (v >= 30) cls = 'v-arancio';
    return `<span class="badge-value ${cls}">${v}</span>`;
  }

  function applySort(list, key, tableId) {
    const state = sortState[tableId];
    if (key) {
      if (state.col === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else { state.col = key; state.dir = 'desc'; }
    }
    const col = state.col, dir = state.dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const va = resolveSortValue(a, col), vb = resolveSortValue(b, col);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
  }
  function resolveSortValue(p, col) {
    if (col in p) return p[col];
    if (p.calc && col in p.calc) return p.calc[col];
    return null;
  }

  /* ---------------- GIOCATORI VIEW ---------------- */
  function renderPlayersFilters() {
    const wrap = document.getElementById('playersFilters');
    const teams = Array.from(new Set(players.map(p => p.team).filter(Boolean))).sort();
    wrap.innerHTML = `
      <label>Cerca<input type="text" id="fSearch" placeholder="Nome giocatore..." value="${escapeAttr(playersFilterState.search)}"></label>
      <label>Ruolo<select id="fRole"><option value="">Tutti</option>${['P','D','C','A'].map(r => `<option value="${r}" ${playersFilterState.role===r?'selected':''}>${ROLE_LABELS[r]}</option>`).join('')}</select></label>
      <label>Squadra<select id="fTeam"><option value="">Tutte</option>${teams.map(t => `<option value="${escapeAttr(t)}" ${playersFilterState.team===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select></label>
      <label>Quot. min<input type="number" id="fQMin" value="${playersFilterState.qMin}"></label>
      <label>Quot. max<input type="number" id="fQMax" value="${playersFilterState.qMax}"></label>
      <label>Titol. min %<input type="number" id="fOwnMin" value="${playersFilterState.ownMin}"></label>
      <label>Rating min<input type="number" step="0.1" id="fRatingMin" value="${playersFilterState.ratingMin}"></label>
      <div class="chip-toggle ${playersFilterState.favOnly?'on':''}" id="fFavOnly">⭐ Preferiti</div>
      <div class="chip-toggle ${playersFilterState.promotedOnly?'on':''}" id="fPromotedOnly">🆙 Neopromosse</div>
      <div class="chip-toggle ${playersFilterState.revelationOnly?'on':''}" id="fRevelationOnly">🚀 Rivelazioni</div>
    `;
    wrap.querySelector('#fSearch').addEventListener('input', e => { playersFilterState.search = e.target.value; renderPlayersTable(); });
    wrap.querySelector('#fRole').addEventListener('change', e => { playersFilterState.role = e.target.value; renderPlayersTable(); });
    wrap.querySelector('#fTeam').addEventListener('change', e => { playersFilterState.team = e.target.value; renderPlayersTable(); });
    wrap.querySelector('#fQMin').addEventListener('input', e => { playersFilterState.qMin = e.target.value; renderPlayersTable(); });
    wrap.querySelector('#fQMax').addEventListener('input', e => { playersFilterState.qMax = e.target.value; renderPlayersTable(); });
    wrap.querySelector('#fOwnMin').addEventListener('input', e => { playersFilterState.ownMin = e.target.value; renderPlayersTable(); });
    wrap.querySelector('#fRatingMin').addEventListener('input', e => { playersFilterState.ratingMin = e.target.value; renderPlayersTable(); });
    wrap.querySelector('#fFavOnly').addEventListener('click', () => { playersFilterState.favOnly = !playersFilterState.favOnly; renderPlayersView(); });
    wrap.querySelector('#fPromotedOnly').addEventListener('click', () => { playersFilterState.promotedOnly = !playersFilterState.promotedOnly; renderPlayersView(); });
    wrap.querySelector('#fRevelationOnly').addEventListener('click', () => { playersFilterState.revelationOnly = !playersFilterState.revelationOnly; renderPlayersView(); });
  }

  function filteredPlayers(state) {
    return players.filter(p => {
      if (state.role && p.role !== state.role) return false;
      if (state.team && p.team !== state.team) return false;
      if (state.qMin !== '' && (p.quotation === null || p.quotation < parseFloat(state.qMin))) return false;
      if (state.qMax !== '' && (p.quotation === null || p.quotation > parseFloat(state.qMax))) return false;
      if (state.ownMin !== '' && (p.ownership === null || p.ownership < parseFloat(state.ownMin))) return false;
      if (state.ratingMin !== '' && (p.rating === null || p.rating < parseFloat(state.ratingMin))) return false;
      if (state.favOnly && !p.personal.favorite) return false;
      if (state.promotedOnly && !p.isPromoted) return false;
      if (state.revelationOnly && !(p.calc.revelationIndex !== null && p.calc.revelationIndex >= config.pricing.revelationThreshold)) return false;
      if (state.search) {
        const s = state.search.toLowerCase();
        if (!p.fullName.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }

  function renderPlayersView() {
    renderPlayersFilters();
    renderPlayersTable();
  }

  function renderPlayersTable(sortKey) {
    const list = applySort(filteredPlayers(playersFilterState), sortKey, 'players');
    const wrap = document.getElementById('playersTableWrap');
    wrap.innerHTML = `<table><thead>${tableHeader()}</thead><tbody>${list.map(p => playerRow(p)).join('') || emptyRow(10)}</tbody></table>`;
    wrap.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => renderPlayersTable(th.dataset.sort)));
    bindRowActions(wrap);
  }

  /* ---------------- PREFERITI VIEW ---------------- */
  function renderFavoritesView() {
    const list = players.filter(p => p.personal.favorite);
    document.getElementById('favoritesTitle').textContent = `⭐ Preferiti (${list.length})`;
    renderFavoritesTable();
  }
  function renderFavoritesTable(sortKey) {
    const list = applySort(players.filter(p => p.personal.favorite), sortKey, 'favorites');
    const wrap = document.getElementById('favoritesTableWrap');
    wrap.innerHTML = `<table><thead>${tableHeader()}</thead><tbody>${list.map(p => playerRow(p)).join('') || emptyRow(10, 'Nessun preferito ancora. Clicca la stella ☆ nella tabella Giocatori.')}</tbody></table>`;
    wrap.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => renderFavoritesTable(th.dataset.sort)));
    bindRowActions(wrap);
  }

  /* ---------------- SCOUTING VIEW ---------------- */
  function renderScoutingView() {
    document.querySelectorAll('.scouting-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.scouting === currentScoutingTab);
      btn.onclick = () => { currentScoutingTab = btn.dataset.scouting; renderScoutingView(); };
    });
    const wrap = document.getElementById('scoutingTableWrap');

    if (currentScoutingTab === 'revelations') {
      const list = players.filter(p => p.calc.revelationIndex !== null)
        .sort((a, b) => b.calc.revelationIndex - a.calc.revelationIndex).slice(0, 100);
      wrap.innerHTML = scoutingTable(list, 'revelationIndex', '🚀 Indice Rivelazione');
    } else if (currentScoutingTab === 'promoted') {
      const list = players.filter(p => p.isPromoted)
        .sort((a, b) => (b.calc.valueIndex ?? -1) - (a.calc.valueIndex ?? -1));
      wrap.innerHTML = `<p class="priority-note">Squadre neopromosse in Serie A 2026/27: ${config.promotedTeams.join(', ')}.</p>` +
        scoutingTable(list, 'valueIndex', '💎 Miglior Affare');
    } else if (currentScoutingTab === 'deals') {
      const list = players.filter(p => p.calc.valueIndex !== null)
        .sort((a, b) => b.calc.valueIndex - a.calc.valueIndex).slice(0, 100);
      wrap.innerHTML = scoutingTable(list, 'valueIndex', '💎 Indice Affare', true);
    } else if (currentScoutingTab === 'modifier') {
      const list = players.filter(p => p.role === 'D' && p.calc.modifierIndex !== null)
        .sort((a, b) => b.calc.modifierIndex - a.calc.modifierIndex).slice(0, 100);
      wrap.innerHTML = modifierTable(list);
    }
    bindRowActions(wrap);
  }

  function scoutingTable(list, idxKey, idxLabel, withMotivo) {
    if (!list.length) return emptyState('Nessun dato sufficiente per questa classifica ancora. Importa il listone da Impostazioni / Aggiorna Dati.');
    const rows = list.map((p, i) => `<tr data-id="${escapeAttr(p.id)}">
      <td>${i + 1}</td>
      <td><button class="star-btn" data-fav="${escapeAttr(p.id)}">${p.personal.favorite ? '⭐' : '☆'}</button></td>
      <td>${escapeHtml(p.fullName)}</td>
      <td><span class="badge badge-role-${p.role}">${p.role}</span></td>
      <td>${escapeHtml(p.team)}</td>
      <td class="num">${fmtNum(p.quotation)}</td>
      <td class="num">${fmtNum(p.rating)}</td>
      <td class="num">${p.ownership !== null ? p.ownership + '%' : '<span class="na">N/D</span>'}</td>
      <td class="num">${fmtNum(p.calc.idealPrice)}</td>
      <td class="num">${fmtNum(p.calc.maxBid)}</td>
      <td>${valueBadgeHtml(p.calc[idxKey])}</td>
      ${withMotivo ? `<td>${escapeHtml(p.calc.affareMotivo || '')}</td>` : ''}
    </tr>`).join('');
    return `<table><thead><tr>
      <th>#</th><th></th><th>Giocatore</th><th>Ruolo</th><th>Squadra</th>
      <th>Quot.</th><th>Rating</th><th>Titol.</th><th>Ideale</th><th>Massimo</th><th>${idxLabel}</th>
      ${withMotivo ? '<th>Motivo</th>' : ''}
    </tr></thead><tbody>${rows}</tbody></table>`;
  }

  function modifierTable(list) {
    if (!list.length) return emptyState('Nessun difensore con dati sufficienti (servono rating e/o titolarità).');
    const rows = list.map((p, i) => `<tr data-id="${escapeAttr(p.id)}">
      <td>${i + 1}</td>
      <td><button class="star-btn" data-fav="${escapeAttr(p.id)}">${p.personal.favorite ? '⭐' : '☆'}</button></td>
      <td>${escapeHtml(p.fullName)}</td>
      <td>${escapeHtml(p.team)}</td>
      <td class="num">${fmtNum(p.quotation)}</td>
      <td class="num">${fmtNum(p.rating)}</td>
      <td class="num">${p.ownership !== null ? p.ownership + '%' : '<span class="na">N/D</span>'}</td>
      <td>${valueBadgeHtml(p.calc.modifierIndex)}</td>
    </tr>`).join('');
    return `<table><thead><tr>
      <th>#</th><th></th><th>Giocatore</th><th>Squadra</th><th>Quot.</th><th>Rating</th><th>Titol.</th><th>🛡️ Indice Modificatore</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  }

  /* ---------------- ASTA VIEW ---------------- */
  function renderAuctionView() {
    const budget = Auction.getBudgetStatus(players, config);
    document.getElementById('auctionHeader').innerHTML = `
      <div class="stat-card"><span class="stat-label">Budget iniziale</span><span class="stat-value">${budget.budget}</span></div>
      <div class="stat-card"><span class="stat-label">Speso</span><span class="stat-value">${budget.spent}</span></div>
      <div class="stat-card"><span class="stat-label">Residuo</span><span class="stat-value">${budget.remaining}</span></div>
    `;
    const roster = Auction.getRosterStatus(players, config);
    document.getElementById('auctionRoster').innerHTML = Object.keys(roster).map(role =>
      `<div class="roster-pill">${ROLE_LABELS[role]}: ${roster[role].bought}/${roster[role].slots} <b>${roster[role].remaining} liberi</b></div>`
    ).join('');

    const wrap = document.getElementById('auctionFilters');
    wrap.innerHTML = `
      <label>Cerca<input type="text" id="aSearch" value="${escapeAttr(auctionFilterState.search)}"></label>
      <label>Ruolo<select id="aRole"><option value="">Tutti</option>${['P','D','C','A'].map(r => `<option value="${r}" ${auctionFilterState.role===r?'selected':''}>${ROLE_LABELS[r]}</option>`).join('')}</select></label>
      <div class="chip-toggle ${auctionFilterState.hideBought?'on':''}" id="aHideBought">Nascondi già presi</div>
    `;
    wrap.querySelector('#aSearch').addEventListener('input', e => { auctionFilterState.search = e.target.value; renderAuctionTable(); });
    wrap.querySelector('#aRole').addEventListener('change', e => { auctionFilterState.role = e.target.value; renderAuctionTable(); });
    wrap.querySelector('#aHideBought').addEventListener('click', () => { auctionFilterState.hideBought = !auctionFilterState.hideBought; renderAuctionView(); });

    renderAuctionTable();
  }

  function renderAuctionTable(sortKey) {
    let list = players.filter(p => {
      if (auctionFilterState.role && p.role !== auctionFilterState.role) return false;
      if (auctionFilterState.hideBought && p.personal.purchased) return false;
      if (auctionFilterState.search && !p.fullName.toLowerCase().includes(auctionFilterState.search.toLowerCase())) return false;
      return true;
    });
    list = applySort(list, sortKey, 'auction');
    const wrap = document.getElementById('auctionTableWrap');
    wrap.innerHTML = `<table><thead>${tableHeader({ showBuy: true })}</thead><tbody>${list.map(p => playerRow(p, { showBuy: true })).join('') || emptyRow(12)}</tbody></table>`;
    wrap.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => renderAuctionTable(th.dataset.sort)));
    bindRowActions(wrap);
  }

  /* ---------------- SETTINGS VIEW ---------------- */
  function renderSettingsView() {
    const grid = document.getElementById('settingsGrid');
    grid.innerHTML = `
      <div class="settings-card">
        <h3>Lega</h3>
        <label>Partecipanti <input type="number" id="sParticipants" value="${config.league.participants}"></label>
        <label>Budget per squadra <input type="number" id="sBudget" value="${config.league.budget}"></label>
        <label>Modificatore difesa
          <select id="sModifier"><option value="true" ${config.league.defenseModifier?'selected':''}>Sì</option><option value="false" ${!config.league.defenseModifier?'selected':''}>No</option></select>
        </label>
      </div>
      <div class="settings-card">
        <h3>Rosa (slot per ruolo)</h3>
        <label>Portieri (P) <input type="number" id="sRoleP" value="${config.roster.P}"></label>
        <label>Difensori (D) <input type="number" id="sRoleD" value="${config.roster.D}"></label>
        <label>Centrocampisti (C) <input type="number" id="sRoleC" value="${config.roster.C}"></label>
        <label>Attaccanti (A) <input type="number" id="sRoleA" value="${config.roster.A}"></label>
      </div>
      <div class="settings-card">
        <h3>Coefficienti modello di prezzo</h3>
        <label>Peso rating <input type="number" step="0.01" id="cRatingWeight" value="${config.pricing.ratingWeight}"></label>
        <label>Peso titolarità <input type="number" step="0.001" id="cOwnershipWeight" value="${config.pricing.ownershipWeight}"></label>
        <label>Margine prezzo massimo <input type="number" step="0.01" id="cMaxMargin" value="${config.pricing.maxBidMargin}"></label>
        <label>Margine stop <input type="number" step="0.01" id="cStopMargin" value="${config.pricing.stopMargin}"></label>
        <label>Soglia indice rivelazione <input type="number" id="cRevelationThreshold" value="${config.pricing.revelationThreshold}"></label>
        <label>Bonus rivelazione <input type="number" step="0.01" id="cRevelationBonus" value="${config.pricing.revelationBonus}"></label>
        <label>Sconto rischio neopromossa <input type="number" step="0.01" id="cPromotedDiscount" value="${config.pricing.promotedRiskDiscount}"></label>
      </div>
      <div class="settings-card">
        <h3>Neopromosse Serie A 2026/27</h3>
        <label>Squadre (separate da virgola) <input type="text" id="sPromoted" value="${escapeAttr(config.promotedTeams.join(', '))}"></label>
        <h3>Fonte dati</h3>
        <p class="priority-note">${escapeHtml(config.dataSource.url)}</p>
      </div>
      <div class="settings-card">
        <h3>Salva</h3>
        <div class="settings-actions">
          <button id="settingsSave" class="btn-primary">Salva impostazioni</button>
          <button id="settingsReset" class="btn-secondary">Ripristina default</button>
        </div>
        <p class="priority-note">Salvare ricalcola tutti gli indici e i prezzi. Preferiti, note e acquisti non vengono mai toccati.</p>
      </div>
    `;
    document.getElementById('settingsSave').addEventListener('click', saveSettings);
    document.getElementById('settingsReset').addEventListener('click', () => {
      config = Storage.resetConfig();
      rebuildPlayers();
      renderAll();
      showToast('Impostazioni ripristinate ai valori di default.');
    });
  }

  function saveSettings() {
    const newConfig = JSON.parse(JSON.stringify(config));
    newConfig.league.participants = intVal('sParticipants', newConfig.league.participants);
    newConfig.league.budget = intVal('sBudget', newConfig.league.budget);
    newConfig.league.defenseModifier = document.getElementById('sModifier').value === 'true';
    newConfig.roster.P = intVal('sRoleP', newConfig.roster.P);
    newConfig.roster.D = intVal('sRoleD', newConfig.roster.D);
    newConfig.roster.C = intVal('sRoleC', newConfig.roster.C);
    newConfig.roster.A = intVal('sRoleA', newConfig.roster.A);
    newConfig.pricing.ratingWeight = floatVal('cRatingWeight', newConfig.pricing.ratingWeight);
    newConfig.pricing.ownershipWeight = floatVal('cOwnershipWeight', newConfig.pricing.ownershipWeight);
    newConfig.pricing.maxBidMargin = floatVal('cMaxMargin', newConfig.pricing.maxBidMargin);
    newConfig.pricing.stopMargin = floatVal('cStopMargin', newConfig.pricing.stopMargin);
    newConfig.pricing.revelationThreshold = intVal('cRevelationThreshold', newConfig.pricing.revelationThreshold);
    newConfig.pricing.revelationBonus = floatVal('cRevelationBonus', newConfig.pricing.revelationBonus);
    newConfig.pricing.promotedRiskDiscount = floatVal('cPromotedDiscount', newConfig.pricing.promotedRiskDiscount);
    newConfig.promotedTeams = document.getElementById('sPromoted').value.split(',').map(s => s.trim()).filter(Boolean);

    Storage.saveConfig(newConfig);
    config = newConfig;
    rebuildPlayers();
    renderAll();
    showToast('Impostazioni salvate.');
  }
  function intVal(id, fallback) { const v = parseInt(document.getElementById(id).value, 10); return isNaN(v) ? fallback : v; }
  function floatVal(id, fallback) { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? fallback : v; }

  /* ---------------- ROW ACTIONS (star, buy, tooltip) shared across tables ---------------- */
  function bindRowActions(container) {
    container.querySelectorAll('[data-fav]').forEach(btn => {
      btn.addEventListener('click', () => toggleFavorite(btn.dataset.fav));
    });
    container.querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => openBuyModal(btn.dataset.buy));
    });
    container.querySelectorAll('[data-tooltip]').forEach(btn => {
      btn.addEventListener('click', () => showPriceExplanation(btn.dataset.tooltip));
    });
  }

  function toggleFavorite(id) {
    const current = Storage.getPlayerPersonal(id);
    Storage.setPlayerPersonal(id, { favorite: !current.favorite });
    rebuildPlayers();
    renderAll();
  }

  function showPriceExplanation(id) {
    const p = players.find(pl => pl.id === id);
    if (!p) return;
    alert(`Come viene calcolato il prezzo di ${p.fullName}:\n\n` + (p.calc.priceExplanation || []).join('\n') +
      `\n\nPrezzo ideale: ${fmtNum(p.calc.idealPrice)}\nPrezzo massimo: ${fmtNum(p.calc.maxBid)}\nStop: ${fmtNum(p.calc.stopPrice)}+`);
  }

  /* ---------------- BUY MODAL ---------------- */
  function bindModals() {
    document.getElementById('buyCancelBtn').addEventListener('click', closeBuyModal);
    document.getElementById('buyConfirmBtn').addEventListener('click', confirmBuy);
    document.getElementById('buyPriceInput').addEventListener('input', updateSemaforoLive);
    document.getElementById('importCancelBtn').addEventListener('click', closeImportModal);
    document.getElementById('importFileInput').addEventListener('change', handleImportFile);
    document.getElementById('loadDemoBtn').addEventListener('click', handleLoadDemo);
    bindImportModeTabs();
  }

  function openBuyModal(id) {
    buyModalPlayerId = id;
    const p = players.find(pl => pl.id === id);
    if (!p) return;
    document.getElementById('buyModalTitle').textContent = `💰 Acquista ${p.fullName}`;
    document.getElementById('buyModalGuidance').innerHTML =
      `🟢 Prezzo ideale: <b>${fmtNum(p.calc.idealPrice)}</b><br>` +
      `🟡 Prezzo massimo: <b>${fmtNum(p.calc.maxBid)}</b><br>` +
      `🔴 Stop: <b>${fmtNum(p.calc.stopPrice)}+</b>`;
    document.getElementById('buyPriceInput').value = p.calc.idealPrice || '';
    document.getElementById('buyNoteInput').value = p.personal.personalNote || '';
    updateSemaforoLive();
    document.getElementById('buyModal').classList.remove('hidden');
  }
  function closeBuyModal() { document.getElementById('buyModal').classList.add('hidden'); buyModalPlayerId = null; }

  function updateSemaforoLive() {
    const p = players.find(pl => pl.id === buyModalPlayerId);
    const box = document.getElementById('semaforoLive');
    if (!p) { box.textContent = ''; return; }
    const bid = parseFloat(document.getElementById('buyPriceInput').value) || 0;
    const status = Scouting.auctionStatus(bid, p.calc.idealPrice, p.calc.maxBid, p.calc.stopPrice);
    box.textContent = status.label;
    box.style.background = status.color;
    box.style.color = '#111';
  }

  function confirmBuy() {
    if (!buyModalPlayerId) return;
    const price = parseFloat(document.getElementById('buyPriceInput').value);
    if (isNaN(price) || price <= 0) { showToast('Inserisci un prezzo valido.'); return; }
    const note = document.getElementById('buyNoteInput').value;
    Auction.buyPlayer(buyModalPlayerId, price, note);
    closeBuyModal();
    rebuildPlayers();
    renderAll();
    showToast('Giocatore acquistato e aggiunto alla tua rosa.');
  }

  /* ---------------- IMPORT / UPDATE ---------------- */
  let importMode = 'listone'; // 'listone' | 'indices'
  let pendingPreview = null;  // risultato di Importer.buildPreview() in attesa di conferma

  function bindUpdateButtons() {
    document.getElementById('btnUpdateData').addEventListener('click', openImportModal);
    document.getElementById('btnUpdateData2').addEventListener('click', openImportModal);
  }
  function openImportModal() {
    document.getElementById('importResult').innerHTML = '';
    document.getElementById('importPreview').innerHTML = '';
    document.getElementById('importFileInput').value = '';
    pendingPreview = null;
    document.getElementById('importModal').classList.remove('hidden');
  }
  function closeImportModal() { document.getElementById('importModal').classList.add('hidden'); }

  function bindImportModeTabs() {
    document.querySelectorAll('.import-mode-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        importMode = btn.dataset.mode;
        document.querySelectorAll('.import-mode-tab').forEach(b => b.classList.toggle('active', b === btn));
        document.getElementById('importModeExplainer').textContent = importMode === 'indices'
          ? 'Un file con almeno nome+cognome (o id) e rating e/o titolarità. Verrà unito ai giocatori già presenti, senza toccare quotazione o squadra.'
          : 'Un file con anagrafica, quotazione e (se disponibili) rating/titolarità. Le colonne vengono riconosciute automaticamente.';
        document.getElementById('importFileInput').value = '';
        document.getElementById('importPreview').innerHTML = '';
        document.getElementById('importResult').innerHTML = '';
        pendingPreview = null;
      });
    });
  }

  function setUpdateStatus(state, message) {
    const bar = document.getElementById('updateStatusBar');
    bar.classList.remove('hidden', 'ok', 'error');
    if (state) bar.classList.add(state);
    bar.textContent = message;
  }

  async function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('importResult').innerHTML = '';
    document.getElementById('importPreview').innerHTML = '<div class="preview-box">🔎 Analisi del file in corso...</div>';
    try {
      const preview = await Importer.buildPreview(file, importMode);
      pendingPreview = preview;
      renderImportPreview(preview);
    } catch (err) {
      document.getElementById('importPreview').innerHTML =
        `<div class="preview-box err">⚠️ Impossibile leggere il file: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderImportPreview(preview) {
    const wrap = document.getElementById('importPreview');
    const fields = importMode === 'indices' ? ['id', 'name', 'surname', 'team', 'rating', 'ownership'] : Object.keys(Importer.FIELD_LABELS);
    const colsHtml = fields.map(f => {
      const found = preview.columnMap[f] !== null && preview.columnMap[f] !== undefined;
      const label = Importer.FIELD_LABELS[f];
      return `<span class="${found ? 'preview-col-ok' : 'preview-col-missing'}">${found ? '✓' : '⚠️'} ${label}${found ? '' : ' (non trovata)'}</span>`;
    }).join('');

    const sampleCols = fields.filter(f => preview.columnMap[f] !== null);
    const sampleHtml = preview.sampleRows.length ? `
      <div class="preview-sample-wrap"><table><thead><tr>${sampleCols.map(f => `<th>${Importer.FIELD_LABELS[f]}</th>`).join('')}</tr></thead>
      <tbody>${preview.sampleRows.map(r => `<tr>${sampleCols.map(f => `<td>${escapeHtml(r[f] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';

    const warningHtml = preview.missingRequired.length
      ? `<p class="err">⚠️ Colonna${preview.missingRequired.length > 1 ? 'e' : ''} "${preview.missingRequired.map(f => Importer.FIELD_LABELS[f]).join(', ')}" non trovata. ${
          importMode === 'indices'
            ? 'Serve almeno rating o titolarità per un import Indici utile.'
            : 'Se mancano rating/titolarità l\'app mostrerà N/D e non inventerà valori; se mancano nome/squadra/ruolo/quotazione controlla le intestazioni del file.'
        }</p>`
      : '';

    wrap.innerHTML = `
      <div class="preview-box">
        <strong>ANTEPRIMA IMPORTAZIONE</strong> — ${preview.fileName}<br>
        Trovati: <strong>${preview.totalCount} giocatori</strong>
        <div class="preview-cols">${colsHtml}</div>
        ${warningHtml}
        ${sampleHtml}
        <div class="modal-actions">
          <button id="previewCancelBtn" class="btn-secondary">ANNULLA</button>
          <button id="previewConfirmBtn" class="btn-primary">${importMode === 'indices' ? 'IMPORTA INDICI' : `IMPORTA ${preview.totalCount} GIOCATORI`}</button>
        </div>
      </div>`;

    document.getElementById('previewCancelBtn').addEventListener('click', () => {
      pendingPreview = null;
      wrap.innerHTML = '';
      document.getElementById('importFileInput').value = '';
    });
    document.getElementById('previewConfirmBtn').addEventListener('click', confirmPendingImport);
  }

  function confirmPendingImport() {
    if (!pendingPreview) return;
    setUpdateStatus(null, '🔄 Aggiornamento in corso...');
    if (importMode === 'indices') {
      const result = Importer.commitIndicesImport(pendingPreview.mappedRecords);
      finishIndicesImport(result);
    } else {
      const result = Importer.commitListoneImport(pendingPreview.mappedRecords, config);
      finishImport(result);
    }
    pendingPreview = null;
    document.getElementById('importPreview').innerHTML = '';
    document.getElementById('importFileInput').value = '';
  }

  function handleLoadDemo() {
    setUpdateStatus(null, '🔄 Aggiornamento in corso...');
    const result = Importer.loadDemoData(config);
    finishImport(result, true);
  }

  function finishImport(result, isDemo) {
    rebuildPlayers();
    renderAll();
    const meta = Storage.getMeta();
    setUpdateStatus('ok', `✅ Dati aggiornati — Ultimo aggiornamento: ${formatDateTime(meta.lastSuccessfulUpdate)}`);
    document.getElementById('importResult').innerHTML =
      `<div class="ok">${isDemo ? 'Dati DEMO caricati' : 'Import completato'}: ${result.count} giocatori.</div>` +
      (result.errors.length ? `<div class="err">${result.errors.length} righe con problemi:<br>${result.errors.slice(0, 10).map(escapeHtml).join('<br>')}</div>` : '');
    showToast('Dati aggiornati.');
    setTimeout(() => document.getElementById('updateStatusBar').classList.add('hidden'), 4000);
  }

  function finishIndicesImport(result) {
    rebuildPlayers();
    renderAll();
    const meta = Storage.getMeta();
    setUpdateStatus('ok', `✅ Indici aggiornati — Ultimo aggiornamento: ${formatDateTime(meta.lastSuccessfulUpdate)}`);
    document.getElementById('importResult').innerHTML =
      `<div class="ok">Indici importati: ${result.matchedCount} giocatori abbinati.</div>` +
      (result.unmatched.length ? `<div class="err">${result.unmatched.length} righe non abbinate a nessun giocatore esistente (importa prima il Listone completo):<br>${result.unmatched.slice(0, 10).map(u => escapeHtml(`${u.name} ${u.surname} (${u.team || 'squadra n/d'})`)).join('<br>')}</div>` : '');
    showToast('Indici aggiornati.');
    setTimeout(() => document.getElementById('updateStatusBar').classList.add('hidden'), 4000);
  }

  /* ---------------- UTIL ---------------- */
  function emptyRow(colspan, msg) {
    return `<tr><td colspan="${colspan}" style="text-align:center;color:var(--text-dim);padding:24px">${msg || 'Nessun giocatore. Usa 🔄 Aggiorna Dati per importare il listone.'}</td></tr>`;
  }
  function emptyState(msg) {
    return `<div style="padding:24px;text-align:center;color:var(--text-dim)">${msg}</div>`;
  }
  function fmtNum(v) { return (v === null || v === undefined) ? '<span class="na">N/D</span>' : v; }
  function escapeHtml(s) { return (s || '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(s) { return escapeHtml(s); }
  function formatDateTime(iso) {
    if (!iso) return 'Mai';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.add('hidden'), 2500);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
