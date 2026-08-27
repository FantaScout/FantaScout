/* ============================================================
   FANTASCOUT 2026/27 - app.js
   Controller UI principale.
   ============================================================ */

const App = (() => {
  let config = Storage.getConfig();
  let players = []; // enriched: remoto + personale + indici calcolati
  // playersFilterState.filters: elenco di filtri avanzati combinabili (AND),
  // vedi FILTER_FIELDS/OPERATORS in config.js e la logica in filters.js.
  // I filtri rapidi (Ruolo, ⭐ Preferiti) scrivono/tolgono voci in questo
  // stesso elenco, cosi' restano sempre compatibili con quelli avanzati.
  let playersFilterState = { search: '', filters: [], quickPromoted: false, quickRevelation: false };
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
    bindGlobalInfoButtons();
    bindFavoritesIoButtons();
    renderAll();
  }

  // Delega globale per i pulsanti "?" di spiegazione colonna (tooltip):
  // le tabelle vengono ricreate ad ogni render, quindi conviene un unico
  // listener sul documento invece di ri-bindare ogni volta.
  function bindGlobalInfoButtons() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-info]');
      if (!btn) return;
      e.stopPropagation();
      showInfo(btn.dataset.info);
    });
  }

  function showInfo(key) {
    const t = TOOLTIPS[key];
    if (!t) return;
    document.getElementById('infoTitle').textContent = t.title;
    document.getElementById('infoBody').innerHTML = `<p>${escapeHtml(t.body)}</p>`;
    document.getElementById('infoModal').classList.remove('hidden');
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
    players = Scouting.enrichAll(joined, config);
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
    const fsBadge = valueBadgeHtml(c.fantaScoutIndex);
    const affareBadge = valueBadgeHtml(c.affareIndex);
    return `<tr data-id="${escapeAttr(p.id)}">
      <td><button class="star-btn" data-fav="${escapeAttr(p.id)}">${p.personal.favorite ? '⭐' : '☆'}</button></td>
      <td>${escapeHtml(p.fullName)}${p.isPromoted ? ' <span class="badge" style="background:#333;color:#9fe6a0">NEO</span>' : ''}${p.missingFromLastUpdate ? ' <span class="badge badge-missing" title="Non presente nell\'ultimo aggiornamento importato">⚠️ non presente</span>' : ''}</td>
      <td><span class="badge badge-role-${p.role}">${p.role}</span></td>
      <td>${escapeHtml(p.team)}</td>
      <td class="num">${fmtNum(p.quotation)}</td>
      <td class="num">${fmtNum(p.rating)}</td>
      <td class="num col-secondary">${fmtNum(p.potential)}</td>
      <td class="num">${p.ownership !== null ? p.ownership + '%' : '<span class="na">N/D</span>'}</td>
      <td class="num col-secondary">${fmtNum(p.age)}</td>
      <td class="num col-secondary">${fmtNum(p.bonusAttesi)}</td>
      <td class="num">${fmtNum(c.idealPrice)}</td>
      <td class="num">${fmtNum(c.maxBid)}
        <button class="btn-tooltip" data-tooltip="${escapeAttr(p.id)}" title="Come viene calcolato?">?</button>
      </td>
      <td>${fsBadge}</td>
      <td class="num col-secondary">${affareBadge}</td>
      <td class="num col-secondary">${p.personal.personalNote ? '📝' : ''}</td>
      ${opts.showBuy ? `<td>${p.personal.purchased ? '✅ Tuo' : `<button class="btn-buy" data-buy="${escapeAttr(p.id)}">💰 Acquista</button>`}</td>` : ''}
    </tr>`;
  }

  // tableId: chiave in sortState ('players' | 'favorites' | 'auction'),
  // usata per mostrare la freccia ↑/↓ sulla colonna attualmente ordinata.
  function tableHeader(tableId, opts) {
    opts = opts || {};
    const cols = COLUMN_DEFS.slice();
    if (opts.showBuy) cols.push({ key: 'auction', label: 'Asta', sort: null });
    const state = sortState[tableId] || {};
    return '<tr>' + cols.map(c => {
      let label = escapeHtml(c.label);
      if (c.sort && state.col === c.sort) label += state.dir === 'asc' ? ' ↑' : ' ↓';
      const infoBtn = c.info ? ` <button class="info-btn" data-info="${c.info}" title="Cosa significa?">?</button>` : '';
      const cls = c.secondary ? ' class="col-secondary"' : '';
      return `<th ${c.sort ? `data-sort="${c.sort}"` : ''}${cls}>${label}${infoBtn}</th>`;
    }).join('') + '</tr>';
  }

  function valueBadgeHtml(v) {
    if (v === null) return '<span class="badge-value v-nd">N/D</span>';
    let cls = 'v-rosso';
    if (v >= 70) cls = 'v-verde'; else if (v >= 50) cls = 'v-giallo'; else if (v >= 30) cls = 'v-arancio';
    return `<span class="badge-value ${cls}">${v}</span>`;
  }

  // Ciclo a 3 stati sulla stessa colonna: decrescente -> crescente ->
  // nessun ordinamento (col=null). Cliccando una colonna diversa si
  // riparte sempre da decrescente. "Nessun ordinamento" mostra i
  // giocatori nell'ordine naturale della lista filtrata (non ordinata).
  function applySort(list, key, tableId) {
    const state = sortState[tableId];
    if (key) {
      if (state.col === key) {
        if (state.dir === 'desc') state.dir = 'asc';
        else { state.col = null; state.dir = null; }
      } else {
        state.col = key; state.dir = 'desc';
      }
    }
    if (!state.col) return list.slice();
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
  // Lega il click sulle intestazioni ordinabili a `rerenderFn(sortKey)`,
  // ignorando i click sul pulsante "?" di spiegazione colonna (che apre
  // il tooltip invece di cambiare l'ordinamento).
  function bindSortableHeaders(wrap, rerenderFn) {
    wrap.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', (e) => {
        if (e.target.closest('[data-info]')) return;
        rerenderFn(th.dataset.sort);
      });
    });
  }
  function resolveSortValue(p, col) {
    if (col in p) return p[col];
    if (p.calc && col in p.calc) return p.calc[col];
    return null;
  }

  /* ---------------- GIOCATORI VIEW ---------------- */

  // Un filtro rapido di ruolo e' semplicemente un filtro avanzato con
  // field:'role' — cosi' "clicco Attaccanti" e poi aggiungo "Titolarità
  // > 75%" nel pannello avanzato producono lo stesso identico elenco di
  // filtri combinati (requisito Sprint 2.6, sezione 8).
  function quickRoleFilter() {
    return playersFilterState.filters.find(f => f.field === 'role') || null;
  }
  function setQuickRole(role) {
    playersFilterState.filters = playersFilterState.filters.filter(f => f.field !== 'role');
    if (role) playersFilterState.filters.push({ field: 'role', operator: 'eq', value: role });
    renderPlayersView();
  }
  function toggleQuickFavorite() {
    const idx = playersFilterState.filters.findIndex(f => f.field === 'favorite');
    if (idx >= 0) playersFilterState.filters.splice(idx, 1);
    else playersFilterState.filters.push({ field: 'favorite', operator: 'eq', value: true });
    renderPlayersView();
  }

  function renderPlayersFilters() {
    const wrap = document.getElementById('playersFilters');
    const teams = Array.from(new Set(players.map(p => p.team).filter(Boolean))).sort();
    const activeRole = quickRoleFilter();
    const favActive = playersFilterState.filters.some(f => f.field === 'favorite' && f.value === true);
    const activeCount = playersFilterState.filters.length;
    const resultsCount = filteredPlayers(playersFilterState).length;

    wrap.innerHTML = `
      <div class="filters-top">
        <label class="search-box">🔎 Cerca<input type="text" id="fSearch" placeholder="Nome giocatore..." value="${escapeAttr(playersFilterState.search)}"></label>
        <div class="quick-filters">
          <div class="chip-toggle ${!activeRole ? 'on' : ''}" data-quick-role="">Tutti</div>
          <div class="chip-toggle ${activeRole && activeRole.value === 'P' ? 'on' : ''}" data-quick-role="P">Portieri</div>
          <div class="chip-toggle ${activeRole && activeRole.value === 'D' ? 'on' : ''}" data-quick-role="D">Difensori</div>
          <div class="chip-toggle ${activeRole && activeRole.value === 'C' ? 'on' : ''}" data-quick-role="C">Centrocampisti</div>
          <div class="chip-toggle ${activeRole && activeRole.value === 'A' ? 'on' : ''}" data-quick-role="A">Attaccanti</div>
          <div class="chip-toggle ${favActive ? 'on' : ''}" id="fFavOnly">⭐ Preferiti</div>
          <div class="chip-toggle ${playersFilterState.quickPromoted ? 'on' : ''}" id="fPromotedOnly">🆙 Neopromosse</div>
          <div class="chip-toggle ${playersFilterState.quickRevelation ? 'on' : ''}" id="fRevelationOnly">🚀 Rivelazioni</div>
        </div>
      </div>
      <div class="advanced-filters">
        <div class="advanced-filters-header">
          <span class="filters-count">${activeCount ? `Filtri (${activeCount})` : 'Filtri'}</span>
          <div class="advanced-filters-actions">
            <button id="btnAddFilter" class="btn-secondary btn-sm" type="button">+ Aggiungi filtro</button>
            ${activeCount ? '<button id="btnClearFilters" class="btn-secondary btn-sm" type="button">Cancella filtri</button>' : ''}
          </div>
        </div>
        <div class="filter-rows">
          ${playersFilterState.filters.map((f, i) => filterRowHtml(f, i, teams)).join('') || '<p class="filters-empty">Nessun filtro avanzato attivo. Usa "+ Aggiungi filtro" per combinare più criteri (es. Ruolo = A AND Titolarità ≥ 75).</p>'}
        </div>
        <div class="filters-summary">Risultati: <b>${resultsCount}</b> giocatori</div>
      </div>
    `;

    wrap.querySelector('#fSearch').addEventListener('input', e => { playersFilterState.search = e.target.value; renderPlayersTable(); });
    wrap.querySelectorAll('[data-quick-role]').forEach(el => {
      el.addEventListener('click', () => setQuickRole(el.dataset.quickRole || null));
    });
    wrap.querySelector('#fFavOnly').addEventListener('click', toggleQuickFavorite);
    wrap.querySelector('#fPromotedOnly').addEventListener('click', () => { playersFilterState.quickPromoted = !playersFilterState.quickPromoted; renderPlayersView(); });
    wrap.querySelector('#fRevelationOnly').addEventListener('click', () => { playersFilterState.quickRevelation = !playersFilterState.quickRevelation; renderPlayersView(); });

    wrap.querySelector('#btnAddFilter').addEventListener('click', () => {
      playersFilterState.filters.push(Filters.newFilter('role'));
      renderPlayersView();
    });
    const clearBtn = wrap.querySelector('#btnClearFilters');
    if (clearBtn) clearBtn.addEventListener('click', () => { playersFilterState.filters = []; renderPlayersView(); });

    bindFilterRowEvents(wrap, teams);
  }

  // Costruisce una riga [Campo] [Operatore] [Valore] [🗑] del pannello
  // filtri avanzati. Il tipo di controllo Valore dipende dal tipo di
  // campo (select / select-dynamic / number / bool) e dall'operatore
  // (between richiede due valori).
  function filterRowHtml(filter, index, teams) {
    const def = Filters.fieldDef(filter.field) || FILTER_FIELDS[0];
    const fieldOptions = FILTER_FIELDS.map(f => `<option value="${f.key}" ${f.key === filter.field ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('');
    const opOptions = def.operators.map(op => `<option value="${op}" ${op === filter.operator ? 'selected' : ''}>${OPERATORS[op].label}</option>`).join('');

    let valueHtml;
    if (def.type === 'select' || def.type === 'select-dynamic') {
      const opts = def.type === 'select-dynamic'
        ? teams.map(t => ({ value: t, label: t }))
        : def.options();
      valueHtml = `<select class="fr-value" data-idx="${index}">
        <option value="">-</option>
        ${opts.map(o => `<option value="${escapeAttr(o.value)}" ${String(filter.value) === String(o.value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
      </select>`;
    } else if (def.type === 'bool') {
      valueHtml = `<select class="fr-value" data-idx="${index}">
        <option value="">-</option>
        <option value="true" ${filter.value === true ? 'selected' : ''}>Sì</option>
        <option value="false" ${filter.value === false ? 'selected' : ''}>No</option>
      </select>`;
    } else if (filter.operator === 'between') {
      valueHtml = `<input type="number" class="fr-value" data-idx="${index}" value="${escapeAttr(filter.value)}" placeholder="min">
        <span class="fr-between-sep">e</span>
        <input type="number" class="fr-value2" data-idx="${index}" value="${escapeAttr(filter.value2)}" placeholder="max">`;
    } else {
      valueHtml = `<input type="number" class="fr-value" data-idx="${index}" value="${escapeAttr(filter.value)}" placeholder="valore">`;
    }

    return `<div class="filter-row" data-idx="${index}">
      <select class="fr-field" data-idx="${index}">${fieldOptions}</select>
      <select class="fr-op" data-idx="${index}">${opOptions}</select>
      ${valueHtml}
      <button class="fr-remove" data-idx="${index}" title="Rimuovi filtro">🗑</button>
    </div>`;
  }

  function bindFilterRowEvents(wrap, teams) {
    wrap.querySelectorAll('.fr-field').forEach(el => el.addEventListener('change', () => {
      const i = parseInt(el.dataset.idx, 10);
      playersFilterState.filters[i] = Filters.newFilter(el.value);
      renderPlayersView();
    }));
    wrap.querySelectorAll('.fr-op').forEach(el => el.addEventListener('change', () => {
      const i = parseInt(el.dataset.idx, 10);
      playersFilterState.filters[i].operator = el.value;
      if (el.value !== 'between') playersFilterState.filters[i].value2 = '';
      renderPlayersView();
    }));
    wrap.querySelectorAll('.fr-value').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      const i = parseInt(el.dataset.idx, 10);
      const def = Filters.fieldDef(playersFilterState.filters[i].field);
      playersFilterState.filters[i].value = def && def.type === 'bool' ? (el.value === '' ? '' : el.value === 'true') : el.value;
      renderPlayersView();
    }));
    wrap.querySelectorAll('.fr-value2').forEach(el => el.addEventListener('input', () => {
      const i = parseInt(el.dataset.idx, 10);
      playersFilterState.filters[i].value2 = el.value;
      renderPlayersView();
    }));
    wrap.querySelectorAll('.fr-remove').forEach(el => el.addEventListener('click', () => {
      const i = parseInt(el.dataset.idx, 10);
      playersFilterState.filters.splice(i, 1);
      renderPlayersView();
    }));
  }

  function filteredPlayers(state) {
    return players.filter(p => {
      if (state.search) {
        const s = state.search.toLowerCase();
        if (!p.fullName.toLowerCase().includes(s)) return false;
      }
      if (state.quickPromoted && !p.isPromoted) return false;
      if (state.quickRevelation && !(p.calc.revelationIndex !== null && p.calc.revelationIndex >= config.pricing.revelationThreshold)) return false;
      return Filters.playerPassesAll(p, state.filters);
    });
  }

  function renderPlayersView() {
    renderPlayersFilters();
    renderPlayersTable();
  }

  function renderPlayersTable(sortKey) {
    const list = applySort(filteredPlayers(playersFilterState), sortKey, 'players');
    const wrap = document.getElementById('playersTableWrap');
    wrap.innerHTML = `<table><thead>${tableHeader('players')}</thead><tbody>${list.map(p => playerRow(p)).join('') || emptyRow(15)}</tbody></table>`;
    bindSortableHeaders(wrap, renderPlayersTable);
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
    wrap.innerHTML = `<table><thead>${tableHeader('favorites')}</thead><tbody>${list.map(p => playerRow(p)).join('') || emptyRow(15, 'Nessun preferito ancora. Clicca la stella ☆ nella tabella Giocatori.')}</tbody></table>`;
    bindSortableHeaders(wrap, renderFavoritesTable);
    bindRowActions(wrap);
  }

  /* ---------------- PREFERITI — IMPORT/EXPORT (Sprint 3C) ---------------- */
  function bindFavoritesIoButtons() {
    document.getElementById('btnExportFavoritesXlsx').addEventListener('click', handleExportFavoritesXlsx);
    document.getElementById('btnExportFavoritesTxt').addEventListener('click', handleExportFavoritesTxt);
    document.getElementById('btnImportFavorites').addEventListener('click', () => {
      document.getElementById('favoritesImportInput').click();
    });
    document.getElementById('favoritesImportInput').addEventListener('change', handleImportFavoritesFile);
  }

  function currentFavorites() {
    return players.filter(p => p.personal.favorite);
  }

  function handleExportFavoritesXlsx() {
    const list = currentFavorites();
    if (!list.length) { showToast('Nessun preferito da esportare.'); return; }
    try {
      FavoritesIO.exportExcel(list, config);
      showToast('Excel Preferiti esportato.');
    } catch (e) {
      showToast(e.message);
    }
  }

  function handleExportFavoritesTxt() {
    const list = currentFavorites();
    if (!list.length) { showToast('Nessun preferito da esportare.'); return; }
    FavoritesIO.exportNamesTxt(list);
    showToast('Elenco nomi esportato.');
  }

  async function handleImportFavoritesFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const resultBox = document.getElementById('favoritesIoResult');
    resultBox.innerHTML = '<div class="preview-box">🔎 Lettura del file in corso...</div>';
    try {
      const result = await FavoritesIO.importFromFile(file);
      rebuildPlayers();
      renderAll();
      renderFavoritesImportResult(result);
      showToast('Preferiti importati.');
    } catch (err) {
      resultBox.innerHTML = `<div class="preview-box err">⚠️ Impossibile leggere il file: ${escapeHtml(err.message)}</div>`;
    }
    document.getElementById('favoritesImportInput').value = '';
  }

  function renderFavoritesImportResult(result) {
    const resultBox = document.getElementById('favoritesIoResult');
    const notFoundHtml = result.notFound.length
      ? `<div class="not-found-list">Non trovati:<br>${result.notFound.map(n => `• ${escapeHtml(n)}`).join('<br>')}</div>`
      : '';
    resultBox.innerHTML = `<div class="preview-box">
      <strong>⭐ IMPORTAZIONE PREFERITI</strong><br>
      ${result.total} giocatori presenti nel file<br>
      <span class="ok">✓ ${result.foundCount} riconosciuti nella base dati attuale</span>
      ${result.notFound.length ? `<br><span class="err">⚠️ ${result.notFound.length} non presenti nella base dati attuale</span>` : ''}
      ${notFoundHtml}
    </div>`;
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
        .sort((a, b) => (b.calc.affareIndex ?? -1) - (a.calc.affareIndex ?? -1));
      wrap.innerHTML = `<p class="priority-note">Squadre neopromosse in Serie A 2026/27: ${config.promotedTeams.join(', ')}.</p>` +
        scoutingTable(list, 'affareIndex', '💎 Miglior Affare');
    } else if (currentScoutingTab === 'deals') {
      const list = players.filter(p => p.calc.affareIndex !== null)
        .sort((a, b) => b.calc.affareIndex - a.calc.affareIndex).slice(0, 100);
      wrap.innerHTML = scoutingTable(list, 'affareIndex', '💎 Indice Affare', true);
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
    wrap.innerHTML = `<table><thead>${tableHeader('auction', { showBuy: true })}</thead><tbody>${list.map(p => playerRow(p, { showBuy: true })).join('') || emptyRow(16)}</tbody></table>`;
    bindSortableHeaders(wrap, renderAuctionTable);
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
        <h3>Modello di prezzo (Sprint 3)</h3>
        <label>Margine prezzo massimo <input type="number" step="0.01" id="cMaxMargin" value="${config.pricing.maxBidMargin}"></label>
        <label>Margine stop <input type="number" step="0.01" id="cStopMargin" value="${config.pricing.stopMargin}"></label>
        <label>Soglia indice rivelazione <input type="number" id="cRevelationThreshold" value="${config.pricing.revelationThreshold}"></label>
        <label>Peso quotazione nel ranking <input type="number" step="0.05" min="0" max="1" id="cQuotationInfluence" value="${config.pricing.market.quotationInfluence}"></label>
        <label>Concentrazione prezzi (decadimento per rank) <input type="number" step="0.005" id="cRankDecay" value="${config.pricing.market.rankDecay}"></label>
        <p class="priority-note">Quote del budget totale di lega per ruolo (devono sommare a 1):</p>
        <label>Portieri <input type="number" step="0.01" id="cShareP" value="${config.pricing.market.roleBudgetShare.P}"></label>
        <label>Difensori <input type="number" step="0.01" id="cShareD" value="${config.pricing.market.roleBudgetShare.D}"></label>
        <label>Centrocampisti <input type="number" step="0.01" id="cShareC" value="${config.pricing.market.roleBudgetShare.C}"></label>
        <label>Attaccanti <input type="number" step="0.01" id="cShareA" value="${config.pricing.market.roleBudgetShare.A}"></label>
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
    newConfig.pricing.maxBidMargin = floatVal('cMaxMargin', newConfig.pricing.maxBidMargin);
    newConfig.pricing.stopMargin = floatVal('cStopMargin', newConfig.pricing.stopMargin);
    newConfig.pricing.revelationThreshold = intVal('cRevelationThreshold', newConfig.pricing.revelationThreshold);
    newConfig.pricing.market.quotationInfluence = floatVal('cQuotationInfluence', newConfig.pricing.market.quotationInfluence);
    newConfig.pricing.market.rankDecay = floatVal('cRankDecay', newConfig.pricing.market.rankDecay);
    newConfig.pricing.market.roleBudgetShare.P = floatVal('cShareP', newConfig.pricing.market.roleBudgetShare.P);
    newConfig.pricing.market.roleBudgetShare.D = floatVal('cShareD', newConfig.pricing.market.roleBudgetShare.D);
    newConfig.pricing.market.roleBudgetShare.C = floatVal('cShareC', newConfig.pricing.market.roleBudgetShare.C);
    newConfig.pricing.market.roleBudgetShare.A = floatVal('cShareA', newConfig.pricing.market.roleBudgetShare.A);
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

  // Pannello "Come viene calcolato?" (Sprint 2.6): sostituisce il vecchio
  // alert() con formule grezze. Mostra prima una spiegazione semplice
  // (dati usati + direzione dell'influenza di ciascun fattore + badge
  // "provvisorio"), e solo in una sezione secondaria collassabile le
  // righe tecniche originali (invariate, per chi le vuole vedere).
  function showPriceExplanation(id) {
    const p = players.find(pl => pl.id === id);
    if (!p) return;
    const c = p.calc;

    const dataRow = (label, val) => `<div class="explain-data-row"><span>${escapeHtml(label)}</span><b>${val}</b></div>`;
    const factorIcon = (d) => ({ up: '⬆️ Influenza positiva', down: '⬇️ Influenza negativa', neutral: '➖ Nessuna influenza', na: 'ℹ️ Dato non disponibile' }[d] || '');
    const factorRow = (f) => `<div class="explain-factor-row"><span>${escapeHtml(f.label)}</span><span>${factorIcon(f.direction)}</span></div>`;

    document.getElementById('explainTitle').textContent = `Come viene calcolato: ${p.fullName}`;

    let body = `<div class="explain-section">
      <h3>Dati utilizzati</h3>
      ${dataRow('Quotazione', fmtNum(p.quotation))}
      ${dataRow('Rating', p.rating !== null ? p.rating + ' / 100' : 'N/D')}
      ${dataRow('Potenziale', p.potential !== null ? p.potential + ' / 100' : 'N/D')}
      ${dataRow('Titolarità', p.ownership !== null ? p.ownership + '%' : 'N/D')}
      ${dataRow('Bonus attesi', fmtNum(p.bonusAttesi))}
      ${dataRow('Età', fmtNum(p.age))}
      ${dataRow('Ruolo', ROLE_LABELS[p.role] || p.role)}
      ${p.posizione ? dataRow('Posizione', escapeHtml(p.posizione)) : ''}
    </div>`;

    if (c.idealPrice === null) {
      body += `<div class="explain-section"><p>${escapeHtml(c.priceReason || (c.priceExplanation || [])[0] || 'Dati insufficienti per calcolare un prezzo.')}</p></div>`;
    } else {
      body += `<div class="explain-section">
        <h3>Fattori che influenzano la valutazione</h3>
        ${(c.priceFactors || []).map(factorRow).join('')}
      </div>
      <div class="explain-section explain-result">
        <h3>Risultato attuale</h3>
        ${dataRow('Indice FantaScout', fmtNum(c.fantaScoutIndex) + '/100')}
        ${dataRow('Indice Affare', fmtNum(c.affareIndex) + '/100')}
        ${dataRow('🟢 Prezzo Ideale', fmtNum(c.idealPrice))}
        ${dataRow('🟡 Prezzo Massimo', fmtNum(c.maxBid))}
        ${dataRow('🔴 Stop', fmtNum(c.stopPrice) + '+')}
      </div>
      <p class="explain-note">La stima tiene conto della qualità del giocatore (Indice FantaScout), della sua titolarità, dei bonus attesi, della sua quotazione e del valore relativo degli altri giocatori dello stesso ruolo nel listone. È calibrata sulla configurazione della tua lega: ${config.league.participants} partecipanti, ${config.league.budget} crediti a testa, asta a chiamata, strategia equilibrata.</p>`;
    }

    body += `<details class="explain-tech">
      <summary>Dettagli tecnici</summary>
      <ul>${(c.priceExplanation || []).map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
    </details>`;

    document.getElementById('explainBody').innerHTML = body;
    document.getElementById('explainModal').classList.remove('hidden');
  }

  /* ---------------- BUY MODAL ---------------- */
  function bindModals() {
    document.getElementById('buyCancelBtn').addEventListener('click', closeBuyModal);
    document.getElementById('buyConfirmBtn').addEventListener('click', confirmBuy);
    document.getElementById('buyPriceInput').addEventListener('input', updateSemaforoLive);
    document.getElementById('importCancelBtn').addEventListener('click', closeImportModal);
    document.getElementById('importFileInput').addEventListener('change', handleImportFile);
    document.getElementById('loadDemoBtn').addEventListener('click', handleLoadDemo);
    document.getElementById('explainCloseBtn').addEventListener('click', () => document.getElementById('explainModal').classList.add('hidden'));
    document.getElementById('infoCloseBtn').addEventListener('click', () => document.getElementById('infoModal').classList.add('hidden'));
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
            : 'Se mancano rating/titolarità/potenziale/età/bonus attesi l\'app mostrerà N/D e non inventerà valori; se mancano nome/squadra/ruolo/quotazione controlla le intestazioni del file.'
        }</p>`
      : '';

    const countsHtml = (importMode !== 'indices' && preview.totalHeadersCount)
      ? `<div class="preview-counts">
           Colonne riconosciute: <strong>${preview.recognizedHeadersCount} / ${preview.totalHeadersCount}</strong><br>
           Record validi: <strong>${preview.validCount} / ${preview.totalCount}</strong>
           ${preview.invalidCount ? ` <span class="err">(${preview.invalidCount} scartati: mancano nome/squadra/ruolo/quotazione)</span>` : ''}
         </div>`
      : '';

    wrap.innerHTML = `
      <div class="preview-box">
        <strong>ANTEPRIMA IMPORTAZIONE</strong> — ${preview.fileName}<br>
        Trovati: <strong>${preview.totalCount} giocatori</strong>
        <div class="preview-cols">${colsHtml}</div>
        ${countsHtml}
        ${warningHtml}
        ${sampleHtml}
        <div class="modal-actions">
          <button id="previewCancelBtn" class="btn-secondary">ANNULLA</button>
          <button id="previewConfirmBtn" class="btn-primary">${importMode === 'indices' ? 'IMPORTA INDICI' : `IMPORTA ${preview.validCount ?? preview.totalCount} GIOCATORI`}</button>
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
