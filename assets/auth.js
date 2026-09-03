/* ==========================================================================
   FRISBEING UF - admin access

   WHAT THIS IS HONESTLY DOING
   This site is static: there is no server, and the roster lives in each
   browser's own localStorage. So this check runs on the visitor's machine,
   and anyone who opens developer tools can switch it off.

   That is an acceptable trade here because there is nothing shared to
   protect: turning the gate off would only let someone sort teams in their
   own browser, using their own copy of the roster. It cannot expose or
   change anything for anybody else.

   What it does buy you: club members see a clean read-only site, skill
   levels stay private, and nobody edits the roster by wandering in.

   If the club ever wants access to be genuinely ENFORCED, the check has to
   move off the browser. The least-work route is Cloudflare Access in front
   of sort.html and roster.html, which gates on real Google Workspace login
   at the edge and needs no code. See README.md.
   ========================================================================== */
(function (root) {
  "use strict";

  var CFG = root.FBAuthConfig || {};
  var SRV = root.FBServer || { apiBase: "" };
  var KEY = "frisbeing.session.v1";
  var listeners = [];

  function serverMode() { return !!(SRV.apiBase && String(SRV.apiBase).trim()); }
  function api(path) { return String(SRV.apiBase || "").replace(/\/$/, "") + path; }

  function now() { return Date.now(); }

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

  function emailAllowed(email) {
    if (!email) return false;
    email = String(email).toLowerCase().trim();
    var domain = String(CFG.emailDomain || "").toLowerCase();
    if (domain && email.slice(-(domain.length + 1)) !== "@" + domain) return false;
    var allow = (CFG.adminEmails || []).map(function (e) { return String(e).toLowerCase().trim(); });
    /* An empty allow-list would make every account on the domain an admin,
       which is the whole school. Refuse rather than fail open. */
    if (!allow.length) return false;
    return allow.indexOf(email) !== -1;
  }

  /* Reads the payload of a Google ID token. This does NOT verify the
     signature - that needs a server. See the note at the top of the file. */
  function decodeToken(jwt) {
    try {
      var part = jwt.split(".")[1];
      if (!part) return null;
      var b64 = part.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder("utf-8").decode(bytes));
    } catch (e) { return null; }
  }

  var Auth = {
    serverMode: serverMode,
    configured: function () { return !!CFG.googleClientId; },
    passcodeEnabled: function () { return !!CFG.passcode; },

    user: function () {
      var s = readSession();
      return s ? { email: s.email, name: s.name || s.email, via: s.via } : null;
    },
    isAdmin: function () { return !!readSession(); },

    onChange: function (fn) { listeners.push(fn); },
    _fire: function () {
      var u = Auth.user();
      listeners.forEach(function (fn) { try { fn(u); } catch (e) { /* keep going */ } });
      Auth.applyBodyState();
    },

    /* Adds is-admin / is-public to <body> so CSS can present the right
       interface without every script re-checking. */
    applyBodyState: function () {
      var admin = Auth.isAdmin();
      document.body.classList.toggle("is-admin", admin);
      document.body.classList.toggle("is-public", !admin);
    },

    signInWithToken: function (jwt) {
      var p = decodeToken(jwt);
      if (!p) return { ok: false, reason: "That sign-in could not be read. Try again." };
      if (p.aud !== CFG.googleClientId) return { ok: false, reason: "That sign-in was issued for a different site." };
      if (["accounts.google.com", "https://accounts.google.com"].indexOf(p.iss) === -1) {
        return { ok: false, reason: "Unexpected sign-in issuer." };
      }
      if (p.exp && p.exp * 1000 < now()) return { ok: false, reason: "That sign-in has expired. Try again." };
      if (p.email_verified === false) return { ok: false, reason: "That Google account is not verified." };
      if (!emailAllowed(p.email)) {
        return {
          ok: false,
          reason: p.email
            ? p.email + " is not on the club leader list. Ask a leader to add it in assets/auth-config.js."
            : "No email came back from Google."
        };
      }
      writeSession({
        email: String(p.email).toLowerCase(),
        name: p.name || p.email,
        via: "google",
        until: now() + (CFG.sessionDays || 30) * 86400000
      });
      Auth._fire();
      return { ok: true };
    },

    /* The token the server issued, sent with every write. Empty in file
       mode, where there is no server to prove anything to. */
    token: function () {
      var s = readSession();
      return s && s.token ? s.token : null;
    },

    /* With a server the passcode is checked THERE, so a member cannot get
       past it by editing anything in their own browser. */
    signInWithServer: function (code) {
      return fetch(api("/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ passcode: String(code || "") })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok || !d.token) {
            return { ok: false, reason: d.error || "That passcode is not right." };
          }
          writeSession({
            email: d.name || "Club leader",
            name: d.name || "Club leader",
            via: "server",
            token: d.token,
            until: now() + (CFG.sessionDays || 30) * 86400000
          });
          Auth._fire();
          return { ok: true };
        });
      }).catch(function () {
        /* No signal at the field is the normal case, not a failure. Fall back
           to the passcode in this file so a leader can still sort tonight.
           Nothing is weakened: the server keeps refusing every write without
           a token, so an offline unlock changes only this device. */
        var local = Auth.signInWithPasscode(code);
        if (local.ok) {
          return { ok: true, offline: true,
                   note: "Signed in offline. Teams will not post to the server until you are back online." };
        }
        return { ok: false, reason: "Could not reach the server, and that passcode does not match the one saved on this device." };
      });
    },

    signInWithPasscode: function (code) {
      if (!CFG.passcode) return { ok: false, reason: "The passcode is switched off. Sign in with your school account." };
      if (String(code || "").trim() !== String(CFG.passcode)) return { ok: false, reason: "That passcode is not right." };
      writeSession({
        email: "passcode",
        name: "Club leader",
        via: "passcode",
        until: now() + (CFG.sessionDays || 30) * 86400000
      });
      Auth._fire();
      return { ok: true };
    },

    signOut: function () {
      if (serverMode()) {
        var t = Auth.token();
        if (t) {
          fetch(api("/logout"), {
            method: "POST",
            headers: { "Authorization": "Bearer " + t }
          }).catch(function () { /* the local session goes either way */ });
        }
      }
      writeSession(null);
      if (root.google && root.google.accounts && root.google.accounts.id) {
        try { root.google.accounts.id.disableAutoSelect(); } catch (e) { /* fine */ }
      }
      Auth._fire();
    },

    /* Draws the Google button into `target`. Calls back with a result. */
    mountGoogleButton: function (target, onResult) {
      if (!Auth.configured() || !target) return false;
      if (!(root.google && root.google.accounts && root.google.accounts.id)) return false;
      root.google.accounts.id.initialize({
        client_id: CFG.googleClientId,
        callback: function (resp) { onResult(Auth.signInWithToken(resp.credential)); },
        hd: CFG.emailDomain,
        auto_select: false,
        cancel_on_tap_outside: true
      });
      root.google.accounts.id.renderButton(target, {
        theme: "filled_black", size: "large", text: "signin_with",
        shape: "rectangular", width: 280
      });
      return true;
    }
  };

  root.FBAuth = Auth;

  /* Set the body state as early as possible so the page never flashes the
     admin interface at a member before the scripts settle. */
  if (document.body) Auth.applyBodyState();
  else document.addEventListener("DOMContentLoaded", function () { Auth.applyBodyState(); });
})(window);
