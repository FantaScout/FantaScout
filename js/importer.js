/* ============================================================
   FANTASCOUT 2026/27 - importer.js

   ANALISI TECNICA (vedi anche README.md):
   Fantacalcio-Online NON espone un endpoint pubblico documentato,
   ne' e' possibile leggere in modo affidabile da JavaScript lato
   browser i dati "esclusivi" (FantaIndex Rating / Titolarita' e il
   download Excel del listone), che il sito stesso riserva agli
   utenti registrati. Inoltre una webapp locale che provasse a fare
   fetch() diretto verso fantacalcio-online.com verrebbe quasi
   certamente bloccata dal browser per policy CORS.

   Il metodo di aggiornamento robusto e legale resta quindi:
     -> IMPORTAZIONE MANUALE del file (XLSX/CSV/JSON) che l'utente
        scarica/esporta dai dati a cui ha accesso.

   NOVITA' SPRINT 2:
   - lettura diretta di file .xlsx (oltre a .csv e .json), tramite la
     libreria client-side SheetJS (CDN, nessuna build);
   - riconoscimento automatico delle colonne (mapping intestazioni);
   - anteprima prima di importare (righe trovate, colonne riconosciute);
   - importazione separata "LISTONE" (dati anagrafici) e "INDICI"
     (rating/titolarita'), con merge sui giocatori esistenti;
   - risoluzione dell'id tramite DataModel (sopravvive a cambio squadra).
   ============================================================ */

const Importer = (() => {

  /* ------------------------------------------------------------
     MAPPING COLONNE
     Alias riconosciuti per ogni campo interno. Le chiavi dei file
     vengono confrontate in forma "pulita" (minuscolo, senza accenti,
     spazi/underscore normalizzati) contro questi alias.
     ------------------------------------------------------------ */
  // NOTA (Sprint 2.5): 'name' accetta sia una colonna "Nome" contenente
  // solo il nome proprio (formato vecchio, con "Cognome" separato) sia una
  // colonna "Nome" contenente nome+cognome insieme, come nel listone reale
  // di Fantacalcio-Online (es. "MARTINEZ Lautaro"). La distinzione avviene
  // a valle in DataModel.normalize, in base alla presenza o meno di una
  // colonna "surname" riconosciuta: se manca, "name" viene trattato come
  // nome completo e scomposto automaticamente (vedi splitNameFromFull).
  const COLUMN_ALIASES = {
    id: ['id', 'id esterno', 'codice', 'player id', 'code'],
    name: ['nome', 'name', 'nominativo', 'giocatore', 'player'],
    surname: ['cognome', 'surname', 'last name'],
    team: ['squadra', 'team', 'club'],
    role: ['ruolo standard', 'ruolo', 'role', 'r', 'ruolo classic', 'rm'],
    roleTrequartista: ['ruolo trequartista', 'trequartista'],
    roleFantacalcioIt: ['ruolo fantacalcio it', 'ruolo fantacalcioit'],
    posizione: ['posizione', 'position', 'pos'],
    quotation: ['kapitals', 'quotazione', 'qt', 'qta', 'quotazione classic', 'quotazione attuale', 'quotazione ufficiale', 'fvm', 'prezzo', 'valore', 'q'],
    rating: ['rat', 'rating', 'fantaindex rating', 'fantaindex_rating', 'rating fantaindex', 'fantaindex'],
    potential: ['pot', 'potenziale', 'potential'],
    ownership: ['is%', 'titolarita', 'titolarita fantaindex', 'fantaindex titolarita', 'fantaindex_titolarita', 'presenza', 'titolarita%'],
    age: ['eta', 'age', 'anni'],
    bonusAttesi: ['bonus', 'bonus attesi']
  };
  // Campi obbligatori per considerare valido un giocatore del listone
  // Classic. 'surname' NON e' qui: nel formato reale non esiste come
  // colonna separata, viene derivato da 'name' (vedi nota sopra).
  const REQUIRED_FIELDS = ['name', 'team', 'role', 'quotation'];
  // Ordine e etichette usate nell'anteprima di importazione.
  const FIELD_LABELS = {
    id: 'ID',
    name: 'Nome completo',
    team: 'Squadra',
    role: 'Ruolo Classic',
    quotation: 'Quotazione',
    rating: 'Rating',
    potential: 'Potenziale',
    ownership: 'Titolarità',
    age: 'Età',
    bonusAttesi: 'Bonus attesi',
    posizione: 'Posizione',
    roleTrequartista: 'Ruolo trequartista',
    roleFantacalcioIt: 'Ruolo Fantacalcio.it'
  };

  // Normalizza un'intestazione di colonna per il matching contro gli alias:
  // rimuove caratteri invisibili/NBSP tipici di export Excel, minuscolizza,
  // toglie accenti, uniforma varianti di apostrofo, sostituisce punti e
  // underscore con spazi, ed elimina lo spazio prima di "%" (cosi'
  // "IS %" e "IS%" diventano equivalenti). Questo permette di riconoscere
  // automaticamente intestazioni come "ETA'", "ETA’", "ETA" o "RUOLO
  // STANDARD" / "ruolo standard" come la stessa colonna.
  function cleanHeader(h) {
    return (h || '').toString()
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
      .trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/['’‘`´]/g, '')
      .replace(/[_.]+/g, ' ')
      .replace(/\s+%/g, '%')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Dato un elenco di intestazioni grezze (come appaiono nel file), calcola
  // la mappa { campoInterno: intestazioneOriginale|null }.
  function detectColumns(headers) {
    const cleanedHeaders = headers.map(h => ({ raw: h, clean: cleanHeader(h) }));
    const map = {};
    Object.keys(COLUMN_ALIASES).forEach(field => {
      const aliases = COLUMN_ALIASES[field];
      const found = cleanedHeaders.find(h => aliases.includes(h.clean));
      map[field] = found ? found.raw : null;
    });
    return map;
  }

  // Rimappa un array di record grezzi (chiavi = intestazioni originali del
  // file) sulle chiavi interne (name, surname, team, role, quotation, ...)
  // usando la colonMap calcolata da detectColumns.
  function applyColumnMap(records, columnMap) {
    return records.map(r => {
      const out = {};
      Object.keys(columnMap).forEach(field => {
        const originalHeader = columnMap[field];
        if (originalHeader !== null && originalHeader !== undefined) {
          out[field] = r[originalHeader];
        }
      });
      return out;
    });
  }

  /* ------------------------------------------------------------
     PARSER CSV (minimale ma robusto: gestisce virgolette e ; o ,)
     ------------------------------------------------------------ */
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',' || ch === ';') { row.push(field); field = ''; }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (ch === '\r') { /* skip */ }
        else field += ch;
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    if (!rows.length) return { headers: [], records: [] };
    const headers = rows[0].map(h => h.trim());
    const records = rows.slice(1)
      .filter(r => r.some(c => c && c.trim() !== ''))
      .map(r => {
        const obj = {};
        headers.forEach((h, idx) => obj[h] = r[idx] !== undefined ? r[idx].trim() : '');
        return obj;
      });
    return { headers, records };
  }

  function recordsFromJSON(text) {
    const parsed = JSON.parse(text);
    const records = Array.isArray(parsed) ? parsed : (parsed.players || []);
    const headers = records.length ? Object.keys(records[0]) : [];
    return { headers, records };
  }

  // Richiede la libreria globale XLSX (SheetJS), caricata via <script> in
  // index.html. Se non e' disponibile (es. nessuna connessione internet al
  // primo caricamento della pagina), avvisa chiaramente invece di fallire
  // in modo silenzioso.
  function recordsFromXLSX(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      throw new Error('Libreria di lettura Excel non disponibile (serve una connessione internet al primo avvio della pagina per caricarla). Puoi comunque esportare il file come CSV e importarlo.');
    }
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { headers, records: rows };
  }

  /* ------------------------------------------------------------
     LETTURA FILE (xlsx prioritario, poi csv, poi json)
     Ritorna una Promise<{ headers, records }>
     ------------------------------------------------------------ */
  function readFile(file) {
    const nameLower = file.name.toLowerCase();
    const isXLSX = nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls');
    const isJSON = nameLower.endsWith('.json');

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Impossibile leggere il file.'));
      reader.onload = () => {
        try {
          let result;
          if (isXLSX) {
            result = recordsFromXLSX(new Uint8Array(reader.result));
          } else if (isJSON) {
            result = recordsFromJSON(reader.result);
          } else {
            result = parseCSV(reader.result);
          }
          if (!result.records.length) {
            reject(new Error('Nessun record trovato nel file.'));
            return;
          }
          resolve(result);
        } catch (e) {
          reject(e);
        }
      };
      if (isXLSX) reader.readAsArrayBuffer(file);
      else reader.readAsText(file, 'UTF-8');
    });
  }

  /* ------------------------------------------------------------
     ANTEPRIMA
     Legge il file, riconosce le colonne e prepara i dati per la
     schermata di conferma. NON scrive nulla su Storage.
     ------------------------------------------------------------ */
  async function buildPreview(file, mode) {
    const { headers, records } = await readFile(file);
    const columnMap = detectColumns(headers);
    const mappedRecords = applyColumnMap(records, columnMap);

    const requiredForMode = mode === 'indices' ? ['rating', 'ownership'] : REQUIRED_FIELDS;
    const recognized = Object.keys(columnMap).filter(f => columnMap[f] !== null);
    const missingRequired = requiredForMode.filter(f => columnMap[f] === null);

    // Quante colonne SORGENTI del file (non campi interni) sono state
    // effettivamente riconosciute - es. "12 / 12" quando ogni intestazione
    // reale del listone e' stata mappata su un campo interno noto.
    const usedRawHeaders = new Set(Object.values(columnMap).filter(v => v !== null && v !== undefined));
    const recognizedHeadersCount = usedRawHeaders.size;
    const totalHeadersCount = headers.length;

    // Conteggio record validi/non validi (solo per il listone: nome
    // completo + squadra + ruolo + quotazione). Non persiste nulla,
    // serve solo a mostrare un'anteprima accurata prima della conferma.
    let validCount = records.length;
    let invalidCount = 0;
    if (mode !== 'indices') {
      validCount = 0;
      mappedRecords.forEach(r => {
        const p = DataModel.normalize(r);
        if (DataModel.computeValidity(p)) validCount++; else invalidCount++;
      });
    }

    return {
      fileName: file.name,
      totalCount: records.length,
      columnMap,
      recognized,
      missingRequired,
      recognizedHeadersCount,
      totalHeadersCount,
      validCount,
      invalidCount,
      sampleRows: mappedRecords.slice(0, 5),
      mappedRecords
    };
  }

  /* ------------------------------------------------------------
     IMPORT LISTONE (anagrafica completa) - dopo conferma anteprima
     ------------------------------------------------------------ */
  function commitListoneImport(mappedRecords, config) {
    const errors = [];
    const normalized = [];
    const existing = Storage.getRemotePlayers();
    const existingIndex = DataModel.buildExistingIndex(existing);
    const seenInThisBatch = new Set();

    mappedRecords.forEach((r, idx) => {
      try {
        const p = DataModel.normalize(r, existingIndex, seenInThisBatch);
        const rowIssues = [];
        if (!p.fullName) rowIssues.push('nome mancante');
        if (!p.team) rowIssues.push('squadra mancante');
        if (!p.role || p.role === 'N/D') rowIssues.push('ruolo mancante/non riconosciuto');
        if (p.quotation === null) rowIssues.push('quotazione mancante');
        if (rowIssues.length) {
          errors.push(`Riga ${idx + 2}: record non valido (${rowIssues.join(', ')}), saltata.`);
          return;
        }
        normalized.push(p);
      } catch (e) {
        errors.push(`Riga ${idx + 2}: errore di parsing (${e.message}).`);
      }
    });

    const withPromoted = DataModel.applyPromotedFlag(normalized, config.promotedTeams);
    const merged = DataModel.mergeRemote(existing, withPromoted);
    Storage.saveRemotePlayers(merged);

    const now = new Date().toISOString();
    Storage.saveMeta({ lastUpdate: now, lastSuccessfulUpdate: now, lastUpdateStatus: 'ok' });

    return { players: merged, count: withPromoted.length, errors };
  }

  /* ------------------------------------------------------------
     IMPORT INDICI (rating/titolarita') - merge su giocatori esistenti
     ------------------------------------------------------------ */
  function commitIndicesImport(mappedRecords) {
    const existing = Storage.getRemotePlayers();
    const result = DataModel.mergeIndices(existing, mappedRecords);
    Storage.saveRemotePlayers(result.players);

    const now = new Date().toISOString();
    Storage.saveMeta({ lastUpdate: now, lastSuccessfulUpdate: now, lastUpdateStatus: 'ok' });

    return result;
  }

  /* ------------------------------------------------------------
     Compatibilita': import diretto senza anteprima (usato dal
     dataset DEMO, dove non serve chiedere conferma).
     ------------------------------------------------------------ */
  function importFromRecords(rawRecords, config) {
    return commitListoneImport(rawRecords, config);
  }

  function loadDemoData(config) {
    const { records } = parseCSVWrapper(DEMO_PLAYERS_CSV);
    return importFromRecords(records, config);
  }
  function parseCSVWrapper(text) { return parseCSV(text); }

  return {
    detectColumns, applyColumnMap, parseCSV, recordsFromJSON, recordsFromXLSX,
    readFile, buildPreview, commitListoneImport, commitIndicesImport,
    importFromRecords, loadDemoData,
    COLUMN_ALIASES, FIELD_LABELS, REQUIRED_FIELDS
  };
})();
