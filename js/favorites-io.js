/* ============================================================
   FANTASCOUT 2026/27 - favorites-io.js
   SPRINT 3C - IMPORT / EXPORT PREFERITI

   Nessun backend, nessuna sincronizzazione automatica: i Preferiti
   restano dati personali salvati solo nel browser (fs_players_personal).
   Questo modulo serve solo a CONSERVARE/TRASFERIRE quella lista:

   - Esporta Preferiti (.xlsx): fotografia completa dei dati attuali
     dei giocatori preferiti (listone + prezzi/indici calcolati) +
     un secondo foglio METADATA, solo informativo.
   - Esporta Nomi (.txt): solo l'elenco dei nomi, un giocatore per
     riga, pensato per la riselezione manuale in un nuovo listone.
   - Importa Preferiti (.xlsx esportato da FantaScout): rimette la ⭐
     sui giocatori corrispondenti nella base dati ATTUALE. Modifica
     ESCLUSIVAMENTE il flag "favorite": non tocca mai nome, squadra,
     quotazione, RAT/POT/IS%, prezzi, indici, note o acquisti, che
     restano sempre quelli del listone attualmente importato.

   MATCHING (in ordine di priorita', mai per squadra: il giocatore
   potrebbe averla cambiata tra un export e l'altro):
     1. ID stabile, se presente e corrispondente a un giocatore
        della base dati attuale;
     2. Nome + Cognome come fallback (via DataModel.nameSlug).
   Se una riga non trova corrispondenza (giocatore uscito dal
   listone, omonimo ambiguo, ecc.) NON e' un errore bloccante: viene
   solo segnalata nel riepilogo finale.
   ============================================================ */

const FavoritesIO = (() => {

  // Colonne dell'export Excel, nell'ordine richiesto. "get" legge il
  // valore dal giocatore arricchito (remoto + personale + calc).
  const EXPORT_COLUMNS = [
    { key: 'Preferito', get: () => '⭐' },
    { key: 'Giocatore', get: p => p.fullName },
    { key: 'Nome', get: p => p.name },
    { key: 'Cognome', get: p => p.surname },
    { key: 'ID stabile', get: p => p.id },
    { key: 'Ruolo', get: p => p.role },
    { key: 'Squadra', get: p => p.team },
    { key: 'Quotazione / Kapitals', get: p => p.quotation },
    { key: 'RAT', get: p => p.rating },
    { key: 'POT', get: p => p.potential },
    { key: 'IS %', get: p => p.ownership },
    { key: 'Età', get: p => p.age },
    { key: 'Bonus attesi', get: p => p.bonusAttesi },
    { key: 'Indice FantaScout', get: p => p.calc ? p.calc.fantaScoutIndex : null },
    { key: 'Indice Affare', get: p => p.calc ? p.calc.affareIndex : null },
    { key: 'Prezzo Ideale', get: p => p.calc ? p.calc.idealPrice : null },
    { key: 'Prezzo Massimo', get: p => p.calc ? p.calc.maxBid : null },
    { key: 'STOP', get: p => p.calc ? p.calc.stopPrice : null }
  ];

  function todayStr() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function requireXLSX() {
    if (typeof XLSX === 'undefined') {
      throw new Error('Libreria Excel non disponibile (serve una connessione internet al primo avvio della pagina).');
    }
  }

  function triggerBlobDownload(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ------------------------------------------------------------
     EXPORT — Excel (fotografia completa dei Preferiti)
     ------------------------------------------------------------ */
  function exportExcel(favoritePlayers, config) {
    requireXLSX();

    const rows = favoritePlayers.map(p => {
      const row = {};
      EXPORT_COLUMNS.forEach(c => { row[c.key] = c.get(p); });
      return row;
    });
    const sheetPreferiti = XLSX.utils.json_to_sheet(rows, { header: EXPORT_COLUMNS.map(c => c.key) });

    const metaRows = [
      { Campo: 'FantaScout version', Valore: FANTASCOUT_VERSION },
      { Campo: 'Data export', Valore: todayStr() },
      { Campo: 'Numero preferiti', Valore: favoritePlayers.length },
      { Campo: 'Stagione', Valore: '2026/27' }
    ];
    const sheetMeta = XLSX.utils.json_to_sheet(metaRows, { header: ['Campo', 'Valore'] });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetPreferiti, 'Preferiti');
    XLSX.utils.book_append_sheet(wb, sheetMeta, 'METADATA');

    XLSX.writeFile(wb, `FantaScout_Preferiti_${todayStr()}.xlsx`);
  }

  /* ------------------------------------------------------------
     EXPORT — solo nomi, TXT (un giocatore per riga)
     ------------------------------------------------------------ */
  function exportNamesTxt(favoritePlayers) {
    const lines = favoritePlayers.map(p => p.fullName || `${p.surname} ${p.name}`.trim());
    const content = lines.join('\r\n') + (lines.length ? '\r\n' : '');
    triggerBlobDownload(content, 'text/plain;charset=utf-8', `FantaScout_Preferiti_Nomi_${todayStr()}.txt`);
  }

  /* ------------------------------------------------------------
     IMPORT — legge il file e riapplica lo stato preferito
     ------------------------------------------------------------ */
  async function readRecords(file) {
    // Riusa il lettore gia' presente in Importer (xlsx/csv/json), cosi'
    // l'import tollera anche un CSV esportato/adattato a mano.
    const { records } = await Importer.readFile(file);
    return records;
  }

  // Applica l'import ai dati gia' salvati in Storage: modifica SOLO il
  // flag `favorite` dei giocatori riconosciuti. Non scrive nient'altro.
  function applyImport(records) {
    const currentRemote = Storage.getRemotePlayers();
    const byId = new Map(currentRemote.map(p => [p.id, p]));
    const byNameSlug = new Map();
    currentRemote.forEach(p => {
      const key = DataModel.nameSlug(p.name, p.surname);
      if (!byNameSlug.has(key)) byNameSlug.set(key, []);
      byNameSlug.get(key).push(p);
    });

    const matchedIds = [];
    const notFound = [];

    records.forEach(r => {
      const idVal = (r['ID stabile'] ?? r['id'] ?? r['ID'] ?? '').toString().trim();
      let name = (r['Nome'] ?? '').toString().trim();
      let surname = (r['Cognome'] ?? '').toString().trim();
      const rawDisplay = (r['Giocatore'] ?? '').toString().trim();
      const displayName = rawDisplay || [surname, name].filter(Boolean).join(' ');

      // Se non abbiamo Nome/Cognome separati ma abbiamo "Giocatore" (es.
      // export .txt riadattato o file con una sola colonna nome), proviamo
      // a scomporlo con la stessa euristica usata in importazione listone.
      if (!name && !surname && rawDisplay) {
        const split = DataModel.splitNameFromFull(rawDisplay);
        surname = split.surname;
        name = split.name;
      }

      let matched = null;
      if (idVal && byId.has(idVal)) {
        matched = byId.get(idVal);
      } else {
        const key = DataModel.nameSlug(name, surname);
        const candidates = byNameSlug.get(key) || [];
        // Omonimi (>1 candidato) non sono disambiguabili in modo sicuro
        // senza usare la squadra come identificatore: per non rischiare
        // di segnare come preferito il giocatore sbagliato, li lasciamo
        // "non trovati" (l'utente potra' riselezionarli a mano).
        if (candidates.length === 1) matched = candidates[0];
      }

      if (matched) {
        matchedIds.push(matched.id);
      } else {
        notFound.push(displayName || idVal || '(riga senza nome)');
      }
    });

    // Regola d'oro: tocchiamo solo `favorite`, mai gli altri dati.
    matchedIds.forEach(id => {
      const current = Storage.getPlayerPersonal(id);
      if (!current.favorite) Storage.setPlayerPersonal(id, { favorite: true });
    });

    return {
      total: records.length,
      foundCount: matchedIds.length,
      notFound
    };
  }

  async function importFromFile(file) {
    const records = await readRecords(file);
    return applyImport(records);
  }

  return { exportExcel, exportNamesTxt, importFromFile };
})();
