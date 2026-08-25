/* ============================================================
   FANTASCOUT 2026/27 - storage.js
   Livello di persistenza (localStorage).

   Chiavi usate:
   - fs_config        -> configurazione lega/rosa/coefficienti
   - fs_players_remote -> dati REMOTI dei giocatori (sovrascrivibili da AGGIORNA DATI)
   - fs_players_personal -> dati PERSONALI per giocatore, indicizzati per ID stabile
   - fs_meta           -> ultimo aggiornamento riuscito, ecc.

   REGOLA D'ORO: un aggiornamento dei dati REMOTI non tocca mai
   fs_players_personal.
   ============================================================ */

const Storage = (() => {
  const KEYS = {
    CONFIG: 'fs_config',
    REMOTE: 'fs_players_remote',
    PERSONAL: 'fs_players_personal',
    META: 'fs_meta'
  };

  function _get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error('Storage read error', key, e);
      return fallback;
    }
  }

  function _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage write error', key, e);
      return false;
    }
  }

  return {
    getConfig() {
      const stored = _get(KEYS.CONFIG, null);
      if (!stored) {
        _set(KEYS.CONFIG, DEFAULT_CONFIG);
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      }
      // merge con default per eventuali nuove chiavi introdotte in versioni successive
      return deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), stored);
    },
    saveConfig(config) {
      return _set(KEYS.CONFIG, config);
    },
    resetConfig() {
      _set(KEYS.CONFIG, DEFAULT_CONFIG);
      return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    },

    getRemotePlayers() {
      return _get(KEYS.REMOTE, []);
    },
    saveRemotePlayers(players) {
      return _set(KEYS.REMOTE, players);
    },

    getPersonalData() {
      // { [playerId]: { favorite, personalNote, purchased, purchasePrice, idealPriceOverride, maxBidOverride, buyerTeam, tags } }
      return _get(KEYS.PERSONAL, {});
    },
    savePersonalData(data) {
      return _set(KEYS.PERSONAL, data);
    },
    getPlayerPersonal(id) {
      const all = this.getPersonalData();
      return all[id] || {
        favorite: false,
        personalNote: '',
        purchased: false,
        purchasePrice: null,
        buyerTeam: null,
        idealPriceOverride: null,
        maxBidOverride: null,
        tags: []
      };
    },
    setPlayerPersonal(id, patch) {
      const all = this.getPersonalData();
      const current = all[id] || {
        favorite: false,
        personalNote: '',
        purchased: false,
        purchasePrice: null,
        buyerTeam: null,
        idealPriceOverride: null,
        maxBidOverride: null,
        tags: []
      };
      all[id] = Object.assign({}, current, patch);
      this.savePersonalData(all);
      return all[id];
    },

    getMeta() {
      return _get(KEYS.META, { lastUpdate: null, lastSuccessfulUpdate: null, lastUpdateStatus: null });
    },
    saveMeta(meta) {
      return _set(KEYS.META, meta);
    }
  };

  function deepMerge(base, override) {
    if (typeof base !== 'object' || base === null) return override;
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (Array.isArray(override)) return override;
    for (const k in override) {
      if (typeof override[k] === 'object' && override[k] !== null && !Array.isArray(override[k]) && typeof base[k] === 'object') {
        out[k] = deepMerge(base[k], override[k]);
      } else {
        out[k] = override[k];
      }
    }
    return out;
  }
})();
