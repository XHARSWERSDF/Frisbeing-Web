/* ==========================================================================
   FRISBEING UF - where the roster and the team draw live

   Two modes, decided by apiBase in server-config.js:

   FILE MODE   - roster.json ships with the site, edits stay in this browser,
                 team draws travel in a share link. No server needed.
   SERVER MODE - the server holds both. Every open page polls for changes, so
                 a leader adding a member shows up everywhere within seconds.

   In both modes the last known state is kept in localStorage, so the sorter
   still works on a field with no signal.
   ========================================================================== */
(function (root) {
  "use strict";

  var CFG = root.FBServer || { apiBase: "", syncSeconds: 10 };
  var KEY_CACHE = "frisbeing.cache.v2";
  var KEY_LOCAL = "frisbeing.roster.v1";   /* file-mode working copy */
  var KEY_PREFS = "frisbeing.prefs.v1";

  var state = { version: 0, roster: [], teams: null, mode: null, updatedAt: 0 };
  var listeners = [];
  var timer = null;
  var online = true;
  var lastSync = 0;

  /* ------------------------------------------------------------ helpers -- */

  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function clean(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (m) {
      return m && typeof m.name === "string" && ["A", "I", "B"].indexOf(m.tier) >= 0;
    }).map(function (m) {
      var g = (m.gender === "f" || m.gender === "m") ? m.gender : "";
      return { name: m.name, tier: m.tier, gender: g };
    });
  }

  function fire() {
    listeners.forEach(function (fn) { try { fn(Store.status()); } catch (e) { /* keep going */ } });
  }

  function api(path) { return String(CFG.apiBase || "").replace(/\/$/, "") + path; }

  function request(path, options) {
    options = options || {};
    var headers = options.headers || {};
    headers["Accept"] = "application/json";
    if (options.body) headers["Content-Type"] = "application/json";
    var token = root.FBAuth && FBAuth.token && FBAuth.token();
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch(api(path), {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store"
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          var err = new Error(d.error || ("Server said " + r.status));
          err.status = r.status;
          throw err;
        });
      }
      return r.json();
    });
  }

  /* -------------------------------------------------------------- state -- */

  function applyState(data, remember) {
    state.version = data.version || 0;
    state.roster = clean(data.roster);
    state.teams = data.teams && Array.isArray(data.teams.teams) ? data.teams : null;
    state.updatedAt = data.updatedAt || Date.now();
    if (remember) write(KEY_CACHE, state);
    fire();
  }

  var Store = {

    serverMode: function () { return !!(CFG.apiBase && String(CFG.apiBase).trim()); },

    status: function () {
      return {
        mode: Store.serverMode() ? "server" : "file",
        online: online,
        version: state.version,
        lastSync: lastSync,
        count: state.roster.length
      };
    },

    onChange: function (fn) { listeners.push(fn); },

    roster: function () { return state.roster.slice(); },
    teams: function () { return state.teams; },

    /* ---------------------------------------------------------- startup -- */

    init: function () {
      /* Show cached data immediately so a slow or absent network never leaves
         the page blank, then refresh from the real source. */
      var cached = read(KEY_CACHE, null);
      if (cached && Array.isArray(cached.roster)) {
        state = { version: cached.version || 0, roster: clean(cached.roster),
                  teams: cached.teams || null, updatedAt: cached.updatedAt || 0 };
      }

      if (Store.serverMode()) {
        return request("/state").then(function (data) {
          online = true; lastSync = Date.now();
          applyState(data, true);
          return state.roster;
        }).catch(function () {
          /* Server unreachable: carry on with whatever was cached. */
          online = false;
          fire();
          return state.roster;
        });
      }

      /* File mode: roster.json is the published squad, plus a local working
         copy for leaders who have edited on this device. */
      return fetch("roster.json", { cache: "no-cache" })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (d) {
          published = clean(d);
          var local = clean(read(KEY_LOCAL, []));
          state.roster = local.length ? local : published;
          state.version = 0;
          online = true; lastSync = Date.now();
          fire();
          return state.roster;
        })
        .catch(function () {
          published = [];
          state.roster = clean(read(KEY_LOCAL, []));
          online = false;
          fire();
          return state.roster;
        });
    },

    /* ------------------------------------------------------------ sync -- */

    startSync: function () {
      if (!Store.serverMode() || timer) return;
      var every = Math.max(3, CFG.syncSeconds || 10) * 1000;
      timer = window.setInterval(Store.checkNow, every);
      /* Catch up immediately when a phone comes back from sleep or a tab is
         brought forward - polling alone would leave it stale for a while. */
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") Store.checkNow();
      });
      window.addEventListener("online", Store.checkNow);
    },

    stopSync: function () {
      if (timer) { window.clearInterval(timer); timer = null; }
    },

    /* Cheap poll: ask only for the version number, fetch the whole state
       only when something actually changed. */
    checkNow: function () {
      if (!Store.serverMode()) return Promise.resolve();
      return request("/version").then(function (d) {
        online = true; lastSync = Date.now();
        if ((d.version || 0) === state.version) { fire(); return false; }
        return request("/state").then(function (data) {
          applyState(data, true);
          return true;
        });
      }).catch(function () {
        online = false;
        fire();
        return false;
      });
    },

    /* ----------------------------------------------------------- writes -- */

    saveRoster: function (list) {
      var cleaned = clean(list);
      if (!Store.serverMode()) {
        state.roster = cleaned;
        write(KEY_LOCAL, cleaned);
        fire();
        return Promise.resolve({ local: true });
      }
      return request("/roster", { method: "PUT", body: { roster: cleaned } })
        .then(function (d) {
          state.version = d.version || state.version + 1;
          state.roster = cleaned;
          write(KEY_CACHE, state);
          online = true; lastSync = Date.now();
          fire();
          return d;
        });
    },

    saveTeams: function (teams, mode) {
      var payload = {
        mode: mode,
        at: Date.now(),
        teams: teams.map(function (t) {
          return t.map(function (p) { return p.name; });
        })
      };
      if (!Store.serverMode()) {
        state.teams = payload;
        fire();
        return Promise.resolve({ local: true });
      }
      return request("/teams", { method: "PUT", body: payload }).then(function (d) {
        state.version = d.version || state.version + 1;
        state.teams = payload;
        write(KEY_CACHE, state);
        fire();
        return d;
      });
    },

    clearTeams: function () {
      if (!Store.serverMode()) { state.teams = null; fire(); return Promise.resolve({}); }
      return request("/teams", { method: "DELETE" }).then(function (d) {
        state.version = d.version || state.version + 1;
        state.teams = null;
        write(KEY_CACHE, state);
        fire();
        return d;
      });
    },

    /* ----------------------------------------- file-mode only leftovers -- */

    getPublished: function () { return published; },
    hasLocalEdits: function () {
      if (Store.serverMode()) return false;
      var local = clean(read(KEY_LOCAL, []));
      if (!local.length) return false;
      var a = local.map(function (m) { return m.name + "|" + m.tier; }).sort().join(",");
      var b = published.map(function (m) { return m.name + "|" + m.tier; }).sort().join(",");
      return a !== b;
    },

    /* -------------------------------------------------------- settings -- */

    getPref: function (name, fallback) {
      var p = read(KEY_PREFS, {});
      return Object.prototype.hasOwnProperty.call(p, name) ? p[name] : fallback;
    },
    setPref: function (name, value) {
      var p = read(KEY_PREFS, {});
      p[name] = value;
      return write(KEY_PREFS, p);
    },

    _request: request,

    DEMO: [
      ["Harry Xu","A"],["Michael Cheng","A"],["Justin He","A"],["Kevin Xiao","A"],
      ["Ryan Zhou","A"],["Cindy Lin","A"],["Eric Pan","A"],["Vivian Gao","A"],["Leo Tan","A"],
      ["Andy Wu","I"],["Sophie Ma","I"],["Daniel Ke","I"],["Chloe Deng","I"],["Jason Fu","I"],
      ["Grace Hu","I"],["Ivan Luo","I"],["Nina Qi","I"],["Tony Shen","I"],["Ellie Bai","I"],
      ["Marcus Yin","I"],["Fiona Cao","I"],["Peter Dai","I"],["Joyce Ren","I"],["Alan Mo","I"],
      ["Tina Guo","I"],
      ["Bruce Lai","B"],["Amy Zheng","B"],["Oscar Feng","B"],["Lily Tang","B"],["Sam Qiu","B"],
      ["Zoe Xie","B"],["Nathan Song","B"],["Coco Wei","B"],["Felix Jiang","B"],["Mia Duan","B"],
      ["Aaron Long","B"],["Hazel Yu","B"],["Toby Nie","B"],["Iris Kang","B"],["Simon Hou","B"]
    ].map(function (r) { return { name: r[0], tier: r[1] }; })
  };

  var published = [];

  /* Older code called getRoster(isAdmin); keep it working. */
  Store.getRoster = function () { return state.roster.slice(); };
  Store.setRoster = function (list) { return Store.saveRoster(list); };
  Store.loadPublished = function () { return Store.init(); };

  root.FBStore = Store;
})(window);
