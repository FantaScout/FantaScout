/* ============================================================
   FANTASCOUT 2026/27 - filters.js (Sprint 2.6)
   Motore generico di filtri combinabili (AND).
   Le definizioni dei campi/operatori vivono in config.js
   (FILTER_FIELDS, OPERATORS): qui c'e' solo la logica.
   ============================================================ */

const Filters = (() => {

  function fieldDef(key) {
    return FILTER_FIELDS.find(f => f.key === key) || null;
  }

  function defaultOperatorFor(def) {
    return def.operators[0];
  }

  // Crea un nuovo filtro "vuoto" pronto per essere completato dall'utente.
  function newFilter(fieldKey) {
    const def = fieldDef(fieldKey) || FILTER_FIELDS[0];
    return { field: def.key, operator: defaultOperatorFor(def), value: '', value2: '' };
  }

  function parseValue(def, raw) {
    if (raw === '' || raw === null || raw === undefined) return null;
    if (def.type === 'number') {
      const n = parseFloat(String(raw).replace(',', '.'));
      return isNaN(n) ? null : n;
    }
    if (def.type === 'bool') {
      return raw === true || raw === 'true';
    }
    return raw; // select / select-dynamic: stringa esatta
  }

  // Vero se il giocatore soddisfa UN filtro.
  function playerPasses(player, filter) {
    const def = fieldDef(filter.field);
    if (!def) return true;
    const val = def.getValue(player);

    if (filter.operator === 'between') {
      const a = parseValue(def, filter.value);
      const b = parseValue(def, filter.value2);
      if (a === null || b === null) return true; // filtro incompleto: non esclude nulla
      if (val === null || val === undefined) return false;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      return val >= lo && val <= hi;
    }

    const x = parseValue(def, filter.value);
    if (x === null) return true; // filtro incompleto: non esclude nulla

    switch (filter.operator) {
      case 'gt':  return val !== null && val !== undefined && val > x;
      case 'lt':  return val !== null && val !== undefined && val < x;
      case 'eq':  return val === x;
      case 'neq': return val !== x;
      default:    return true;
    }
  }

  // Vero se il giocatore soddisfa TUTTI i filtri (AND).
  function playerPassesAll(player, filters) {
    return (filters || []).every(f => playerPasses(player, f));
  }

  function applyAll(players, filters) {
    if (!filters || !filters.length) return players.slice();
    return players.filter(p => playerPassesAll(p, filters));
  }

  return { fieldDef, defaultOperatorFor, newFilter, parseValue, playerPasses, playerPassesAll, applyAll };
})();
