/* ==========================================================================
   FRISBEING UF - sign-in (Microsoft Entra / Tsinglan 365)

   HOW IT WORKS
   "Sign in with Microsoft" runs the standard OAuth2 authorization-code flow
   with PKCE, by hand - no library. Microsoft signs the person in, redirects
   back with a code, the browser swaps the code for an ID token, and that
   token is handed to the club server. The SERVER verifies the token's
   signature against Microsoft's public keys and turns the school address into
   a role. So nothing here is trusted: the role kept in this browser only
   chooses what to draw, and every write and every tier is checked again on
   the server with the session token it issued.

   Accounts need the server. Without one (file mode) there is nobody to verify
   a Microsoft token, so signing in is switched off and the site is read-only -
   which is all a static copy could ever safely offer anyway.
   ========================================================================== */
(function (root) {
  "use strict";

  var CFG = root.FBAuthConfig || {};
  var ENTRA = CFG.entra || {};
  var SRV = root.FBServer || { apiBase: "" };
  var KEY = "frisbeing.session.v1";
  var PKCE = "frisbeing.pkce.v1";
  var listeners = [];

  var ROLE_NAME = { leader: "Supreme leader", admin: "Admin", player: "Player" };
  var SCOPE = "openid profile email";

  function serverMode() { return !!(SRV.apiBase && String(SRV.apiBase).trim()); }
  function api(path) { return String(SRV.apiBase || "").replace(/\/$/, "") + path; }
  function now() { return Date.now(); }
  function lasts() { return (CFG.sessionDays || 30) * 86400000; }

  function configured() {
    return !!(ENTRA.clientId && String(ENTRA.clientId).trim() &&
              ENTRA.tenantId && String(ENTRA.tenantId).trim());
  }
  function authority() {
    /* Real Microsoft unless a local authority is set for testing. This only
       decides where the browser sends the person to sign in; the club server
       still verifies the returned token's signature, issuer, tenant and
       audience, so a wrong authority can never forge a sign-in - it just
       fails. Leave ENTRA.authority blank in production. */
    var override = ENTRA.authority && String(ENTRA.authority).trim();
    return override || "https://login.microsoftonline.com/" + encodeURIComponent(ENTRA.tenantId);
  }
  /* The redirect must be one exact URL registered in Entra. Sign-in always
     happens on this page, so the page's own address (without any query) is it,
     and it works at the site root or in a subfolder without changing config. */
  function redirectUri() {
    return location.origin + location.pathname;
  }

  /* ---------------------------------------------------------- session -- */

  function readSession() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.email || !s.until || s.until < now()) return null;
      return s;
    } catch (e) { return null; }
  }

  function writeSession(s) {
    try {
      if (s) window.localStorage.setItem(KEY, JSON.stringify(s));
      else window.localStorage.removeItem(KEY);
    } catch (e) { /* private browsing */ }
  }

  function rememberAccount(token, account) {
    writeSession({
      email: account.email,
      name: account.name,
      via: "microsoft",
      role: account.role,
      member: account.member || null,
      token: token,
      until: now() + lasts()
    });
    Auth._fire();
  }

  /* ------------------------------------------------------------ http -- */

  function post(path, body) {
    return fetch(api(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { ok: r.ok, status: r.status, data: d || {} };
      });
    });
  }

  var UNREACHABLE = "Could not reach the club server. Check your connection and try again.";
  var NO_SERVER = "Sign-in needs the club server, which is not switched on for this copy of the site.";
  var NOT_SET_UP = "Microsoft sign-in is not set up yet. A leader needs to add the app details in assets/auth-config.js.";

  /* -------------------------------------------------------------- pkce -- */

  function b64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function randomString(n) {
    var a = new Uint8Array(n);
    (root.crypto || root.msCrypto).getRandomValues(a);
    return b64url(a).slice(0, n);
  }
  function sha256url(text) {
    return root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
      .then(function (buf) { return b64url(new Uint8Array(buf)); });
  }

  /* ---------------------------------------------------------- exports -- */

  var Auth = {
    ROLE_NAME: ROLE_NAME,
    serverMode: serverMode,
    configured: configured,
    canSignIn: function () { return serverMode() && configured(); },

    user: function () {
      var s = readSession();
      if (!s) return null;
      return {
        email: s.email, name: s.name || s.email, via: s.via,
        role: Auth.role(), member: s.member || null
      };
    },

    /* "leader", "admin" or "player"; null when signed out. */
    role: function () {
      var s = readSession();
      if (!s) return null;
      return ROLE_NAME[s.role] ? s.role : "player";
    },

    isAdmin: function () {
      var r = Auth.role();
      return r === "leader" || r === "admin";
    },
    isSupremeLeader: function () { return Auth.role() === "leader"; },

    onChange: function (fn) { listeners.push(fn); },
    _fire: function () {
      var u = Auth.user();
      listeners.forEach(function (fn) { try { fn(u); } catch (e) { /* keep going */ } });
      Auth.applyBodyState();
    },

    applyBodyState: function () {
      var admin = Auth.isAdmin();
      document.body.classList.toggle("is-admin", admin);
      document.body.classList.toggle("is-public", !admin);
    },

    token: function () {
      var s = readSession();
      return s && s.token ? s.token : null;
    },

    /* ----------------------------------------------- microsoft sign-in -- */

    /* Kick off the redirect to Microsoft. Returns a rejected promise with a
       reason if the site is not ready for it. */
    signInWithMicrosoft: function () {
      if (!serverMode()) return Promise.reject(new Error(NO_SERVER));
      if (!configured()) return Promise.reject(new Error(NOT_SET_UP));
      var verifier = randomString(64);
      var state = randomString(24);
      var nonce = randomString(24);
      return sha256url(verifier).then(function (challenge) {
        try {
          window.sessionStorage.setItem(PKCE, JSON.stringify({ verifier: verifier, state: state, nonce: nonce }));
        } catch (e) { /* fall through; state check below will catch it */ }
        var q = new URLSearchParams({
          client_id: ENTRA.clientId,
          response_type: "code",
          redirect_uri: redirectUri(),
          response_mode: "query",
          scope: SCOPE,
          state: state,
          nonce: nonce,
          code_challenge: challenge,
          code_challenge_method: "S256",
          prompt: "select_account"
        });
        location.href = authority() + "/oauth2/v2.0/authorize?" + q.toString();
      });
    },

    /* Handle the redirect back from Microsoft. Call once on page load.
       Resolves with:
         { none: true }                 no sign-in response in the URL
         { ok: true, account }          signed in
         { ok: false, reason }          something went wrong                 */
    completeMicrosoft: function () {
      var params = new URLSearchParams(location.search);
      var err = params.get("error");
      var code = params.get("code");
      if (!err && !code) return Promise.resolve({ none: true });

      var saved = null;
      try { saved = JSON.parse(window.sessionStorage.getItem(PKCE) || "null"); } catch (e) { saved = null; }
      try { window.sessionStorage.removeItem(PKCE); } catch (e) { /* fine */ }
      cleanUrl();

      if (err) {
        return Promise.resolve({ ok: false, reason: params.get("error_description") || ("Microsoft sign-in was cancelled (" + err + ").") });
      }
      if (!saved || !saved.state || saved.state !== params.get("state")) {
        return Promise.resolve({ ok: false, reason: "That sign-in did not match this browser. Please try again." });
      }

      /* Swap the code for tokens. For a single-page app registration Microsoft
         answers this cross-origin request with CORS and needs no secret. */
      return fetch(authority() + "/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: ENTRA.clientId,
          grant_type: "authorization_code",
          code: code,
          redirect_uri: redirectUri(),
          code_verifier: saved.verifier,
          scope: SCOPE
        }).toString()
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (t) {
          if (!r.ok || !t.id_token) {
            return { ok: false, reason: t.error_description || "Microsoft would not complete the sign-in." };
          }
          /* Hand the ID token to the server, which verifies its signature and
             decides the role. The browser never gets to claim a role. */
          return post("/login/microsoft", { idToken: t.id_token }).then(function (res) {
            if (!res.ok || !res.data.token) {
              return { ok: false, reason: res.data.error || "The club server would not accept that sign-in." };
            }
            rememberAccount(res.data.token, res.data.account);
            return { ok: true, account: res.data.account };
          }, function () {
            return { ok: false, reason: UNREACHABLE };
          });
        });
      }, function () {
        return { ok: false, reason: "Could not reach Microsoft to finish signing in." };
      });
    },

    /* Ask the server who this sign-in is now: a leader may have linked the
       account to the squad, or the address may have joined the admin list,
       since it was stored. An unknown token ends the sign-in. Server
       unreachable changes nothing, so the sorter still works with no signal. */
    refreshAccount: function () {
      var s = readSession();
      if (!serverMode() || !s || !s.token) return Promise.resolve(null);
      return fetch(api("/me"), {
        headers: { "Accept": "application/json", "Authorization": "Bearer " + s.token },
        cache: "no-store"
      }).then(function (r) {
        if (r.status === 401) { writeSession(null); Auth._fire(); return null; }
        if (!r.ok) return null;
        return r.json().then(function (d) {
          var a = d.account || {};
          var cur = readSession();
          if (!cur || cur.token !== s.token) return null;
          if (cur.role !== d.role || cur.member !== (a.member || null) || cur.name !== a.name) {
            cur.role = d.role;
            cur.member = a.member || null;
            cur.name = a.name || cur.name;
            writeSession(cur);
            Auth._fire();
          }
          return d;
        });
      }).catch(function () { return null; });
    },

    signOut: function () {
      var t = Auth.token();
      if (serverMode() && t) {
        fetch(api("/logout"), {
          method: "POST",
          headers: { "Authorization": "Bearer " + t }
        }).catch(function () { /* the local session goes either way */ });
      }
      /* Local sign-out only. The person stays signed into Microsoft 365, which
         is what they expect - we are not their school's identity provider. */
      writeSession(null);
      Auth._fire();
    }
  };

  function cleanUrl() {
    try {
      history.replaceState(null, "", location.origin + location.pathname + location.hash);
    } catch (e) { /* fine */ }
  }

  root.FBAuth = Auth;

  if (document.body) Auth.applyBodyState();
  else document.addEventListener("DOMContentLoaded", function () { Auth.applyBodyState(); });

  Auth.refreshAccount();
})(window);
