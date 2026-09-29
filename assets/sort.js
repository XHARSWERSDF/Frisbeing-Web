/* ==========================================================================
   FRISBEING UF - tonight's game

   PLAYERS see one big message about tonight:
     no game          "No Current Scheduled Games For Tonight"
     game, no answer  "TONIGHT" with Join / I'll pass
     answered         "You're In!" or "It's alr, Cya another day!"
     teams drawn      a disc to spin - "See Your TEAM!!!" - then their team

   LEADERS AND ADMINS also get the calendar (every Tuesday and Thursday by
   default; tap a day to add a session or call one off) and, for tonight,
   who joined and who passed. The SUPREME LEADER spins the disc to draw the
   teams; the server sorts everyone who joined (gender first, then tier) and
   sends each of them a push notification.

   Everything here needs the club server. The server decides what "tonight"
   is and who may see what: a player's browser never receives a tier or
   anyone else's team.
   ========================================================================== */
(function () {
  "use strict";

  var SRV = window.FBServer || { apiBase: "", syncSeconds: 10 };
  var el = function (id) { return document.getElementById(id); };
  var tonightEl = el("tonight"), bandEl = el("leaderBand"), gridEl = el("calGrid"),
      monthEl = el("calMonth"), subEl = el("calSub"), dayEl = el("dayPanel"),
      toggleEl = el("tiersToggle");
  var reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];
  var DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  var DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var LETTERS = "ABCDEFGHIJKL";
  var SPIN_MS = 1900;                       /* matches the throw animation in brand.css */
  var REVEAL_KEY = "frisbeing.revealed.v1";
  var TIERS_KEY = "frisbeing.showTiers.v1";

  var DISC = '<span class="disc-inner"><img src="assets/monogram.png" alt=""></span><span class="disc-ring"></span>';
  var BARS = "<i></i><i></i><i></i><i></i><i></i><i></i>";

  var state = {
    tonight: null,      /* the server's view of today, for whoever is asking */
    games: null,        /* last seen sessions counter - polling compares it */
    loadedAt: 0,
    changing: false,    /* player asked to change their answer */
    month: null,        /* "YYYY-MM" in the calendar */
    schedule: null,
    selected: null,     /* "YYYY-MM-DD" picked in the calendar */
    day: null,          /* the server's view of the selected day */
    teamsWanted: null,  /* the leader's chosen number of teams */
    notified: null,     /* devices told about the last draw */
    landed: false,      /* play the landing pulse on the next render */
    busy: false,
    spinning: false     /* a throw is in the air - do not redraw under it */
  };
  var push = { subscribed: false, key: null };

  /* ------------------------------------------------------------ basics -- */

  function serverMode() { return !!(SRV.apiBase && String(SRV.apiBase).trim()); }
  function signedIn() { return !!(window.FBAuth && FBAuth.user()); }
  function isAdmin() { return !!(window.FBAuth && FBAuth.isAdmin()); }
  function isLeader() { return !!(window.FBAuth && FBAuth.isSupremeLeader()); }
  function myName() { var u = window.FBAuth && FBAuth.user(); return u ? u.name : ""; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function weekday(date) { return new Date(date + "T12:00:00Z").getUTCDay(); }
  function longDate(date) {
    var p = date.split("-");
    return DAY_LONG[weekday(date)] + " " + (+p[2]) + " " + MONTHS[+p[1] - 1];
  }
  function shiftMonth(month, n) {
    var p = month.split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1 + n, 1)).toISOString().slice(0, 7);
  }

  function readPref(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function writePref(key, v) { try { window.localStorage.setItem(key, v); } catch (e) { /* private mode */ } }

  function api(method, path, body) {
    var headers = { "Accept": "application/json" };
    var token = window.FBAuth && FBAuth.token();
    if (token) headers.Authorization = "Bearer " + token;
    if (body) headers["Content-Type"] = "application/json";
    return fetch(String(SRV.apiBase).replace(/\/$/, "") + path, {
      method: method, headers: headers, cache: "no-store",
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.ok) return d;
        /* A sign-in the server no longer knows: let auth.js end it here too. */
        if (r.status === 401 && token && window.FBAuth) FBAuth.refreshAccount();
        var e = new Error(d.error || "Something went wrong. Try again.");
        e.status = r.status;
        throw e;
      });
    }, function () {
      throw new Error("Could not reach the club server. Check your connection.");
    });
  }

  /* ------------------------------------------------------------ tonight -- */

  function paint(html) { tonightEl.innerHTML = html; }

  function noGameHtml() {
    return '<h2 class="tn-big">No Current Scheduled Games For Tonight</h2>' +
      '<p class="tn-small">Stay tuned next day!</p>' +
      '<div class="tn-discs" aria-hidden="true"><span class="emoji">🥏</span>' +
      '<span class="emoji">🥏</span><span class="emoji">🥏</span></div>';
  }

  function gameHtml() {
    return '<h2 class="tn-big tn-fire"><span class="emoji">🔥</span> TONIGHT ' +
      '<span class="emoji">🔥</span></h2>' +
      '<p class="tn-game">We shall have a GAME OF <span class="hot">“激情' +
      '<span class="emoji">❤️‍🔥</span>”</span> <span class="word">Frisbee</span></p>';
  }

  function choiceHtml() {
    return '<div class="tn-actions">' +
      '<button class="btn solid big" data-act="join" type="button"><span>Join</span></button>' +
      '<button class="btn big" data-act="pass" type="button"><span>I’ll pass</span></button>' +
      '</div><p class="tn-error" id="tnError"></p>';
  }

  function inHtml() {
    return '<h2 class="tn-big tn-answer">You’re In!</h2>' +
      '<p class="tn-small">Stay tuned for the team selection!</p>' +
      bellHtml() +
      '<button class="tn-link" data-act="change" type="button">Change my answer</button>' +
      '<p class="tn-error" id="tnError"></p>';
  }

  function outHtml(canChange) {
    return '<h2 class="tn-big tn-answer">It’s alr, Cya another day!</h2>' +
      (canChange ? '<button class="tn-link" data-act="change" type="button">Change my answer</button>' : '') +
      '<p class="tn-error" id="tnError"></p>';
  }

  function seeYourTeamHtml() {
    return '<h2 class="see-your">See Your</h2>' +
      '<button class="fdisc beckon" data-act="reveal" type="button" aria-label="Spin the disc to see your team">' +
      DISC + '</button>' +
      '<h2 class="see-team">TEAM!!!</h2>' +
      '<div class="progress" id="tnProg" aria-hidden="true">' + BARS + '</div>';
  }

  function revealHtml(mine) {
    var me = myName();
    var names = mine.members.slice().sort(function (a, b) {
      return (b === me) - (a === me) || a.localeCompare(b);
    });
    /* Same sizes as the "See Your / TEAM!!!" screen it replaces, so the
       words land where the last ones were and the letter drops in below. */
    /* The spaces between the spans are invisible but make screen readers say
       "You are on Team A" rather than "You are onTeamA". */
    return '<h2 class="reveal-head"><span class="see-your">You are on</span> ' +
      '<span class="see-team">Team</span> ' +
      '<span class="team-letter">' + esc(mine.letter) + '</span></h2>' +
      '<p class="eyebrow dim mates-hd">Your team &middot; ' + names.length + ' players</p>' +
      '<ul class="mates">' + names.map(function (n, i) {
        return '<li' + (n === me ? ' class="me"' : '') + ' style="animation-delay:' +
          (reduce ? 0 : 750 + i * 60) + 'ms"><span>' + esc(n) + '</span></li>';
      }).join("") + '</ul>';
  }

  function signInHtml() {
    return '<div class="tn-actions"><a class="btn solid big" href="admin.html"><span>Sign in to join</span></a></div>' +
      '<p class="tn-note">Use your Tsinglan Microsoft account &mdash; the same one as Outlook and Teams.</p>';
  }

  function renderTonight() {
    if (state.spinning) return;
    var t = state.tonight;
    if (!serverMode()) {
      return paint('<p class="eyebrow dim tn-eyebrow">Tonight</p>' +
        '<h2 class="tn-big">Sessions are switched off</h2>' +
        '<p class="tn-small">Game nights need the club server, which this copy of the site is running without.</p>');
    }
    if (!t) return paint('<p class="tn-small">Checking tonight&hellip;</p>');
    if (!t.isGame) return paint(noGameHtml());
    if (!t.signedIn) return paint(gameHtml() + signInHtml());

    if (t.drawn) {
      if (!t.mine) return paint(outHtml(false));
      return paint(revealedAlready(t) ? revealHtml(t.mine) : seeYourTeamHtml());
    }
    if (state.changing || !t.me || !t.me.rsvp) return paint(gameHtml() + choiceHtml());
    return paint(t.me.rsvp === "in" ? inHtml() : outHtml(true));
  }

  function showError(msg) {
    var e = el("tnError");
    if (e) e.textContent = msg;
  }

  /* Per person as well as per draw, so a second account on the same phone
     still gets its own spin. */
  function revealId(t) {
    var u = window.FBAuth && FBAuth.user();
    return (u ? u.email : "") + "|" + t.date + ":" + t.draw.at;
  }
  function revealedAlready(t) { return readPref(REVEAL_KEY) === revealId(t); }
  function rememberReveal(t) { writePref(REVEAL_KEY, revealId(t)); }

  function loadTonight() {
    return api("GET", "/game").then(function (v) {
      var before = state.tonight && state.tonight.today;
      state.tonight = v;
      state.games = v.games;
      state.loadedAt = Date.now();
      /* Past midnight "tonight" is a new day. A leader who was looking at
         tonight moves on with it instead of staring at yesterday. */
      if (before && v.today !== before) {
        state.changing = false;
        if (isAdmin() && state.selected === before) {
          state.selected = v.today;
          state.month = v.today.slice(0, 7);
          refreshLeader();
        }
      }
      renderTonight();
    }, function (err) {
      if (!state.tonight) {
        paint('<h2 class="tn-big">Can’t reach the club</h2><p class="tn-small">' + esc(err.message) + '</p>');
      }
    });
  }

  function answer(status) {
    var t = state.tonight;
    /* Asking for notification permission has to start inside the tap itself,
       so it is kicked off before the answer goes to the server. */
    var asking = status === "in" ? turnOnPush(true) : null;
    state.busy = true;
    api("PUT", "/game/" + t.date + "/rsvp", { status: status }).then(function (v) {
      state.busy = false;
      state.changing = false;
      state.tonight = v;
      state.games = v.games;
      renderTonight();
      if (asking) asking.then(function () { renderTonight(); });
      if (isAdmin()) refreshLeader();
    }, function (err) {
      state.busy = false;
      showError(err.message);
      if (err.status === 409) loadTonight();   /* the teams came out meanwhile */
    });
  }

  function spinReveal(disc) {
    var t = state.tonight;
    state.spinning = true;
    if (!reduce) {
      disc.classList.remove("beckon");
      disc.classList.add("spinning");
      var prog = el("tnProg");
      if (prog) prog.classList.add("on");
    }
    window.setTimeout(function () {
      state.spinning = false;
      rememberReveal(t);
      renderTonight();
      /* If a reshuffle landed mid-spin, the page is back on "See Your
         TEAM!!!" for the new draw - no rain over that. */
      var now = state.tonight;
      if (now && now.drawn && now.mine && revealedAlready(now)) discRain();
    }, reduce ? 0 : SPIN_MS);
  }

  /* ------------------------------------------------------------ disc rain --
     The reveal ends with frisbees raining over the whole screen. They pile
     up along the bottom; grab one and throw it, or tap it to flick it back
     into the air. Only the discs catch the pointer, so the page underneath
     stays usable, and after ten seconds they fade and are gone. */

  var raining = false;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function discRain() {
    if (reduce || raining) return;
    raining = true;
    var LIFE = 10000, FADE = 900, SPAWN_FOR = 4200, GRAVITY = 1900, BOUNCE = 0.42;
    var layer = document.createElement("div");
    layer.className = "rain";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);

    var W = window.innerWidth, H = window.innerHeight;
    var total = Math.round(clamp(W * H / 15000, 28, 70));
    var discs = [], t0 = performance.now(), last = t0;

    function spawn() {
      var size = 30 + Math.random() * 30;
      var d = {
        el: document.createElement("span"), size: size, r: size * 0.42,
        x: Math.random() * W, y: -size - Math.random() * 60,
        vx: (Math.random() - 0.5) * 160, vy: 150 + Math.random() * 250,
        rot: Math.random() * 360, spin: (Math.random() - 0.5) * 540, held: false
      };
      d.el.className = "rain-disc emoji";
      d.el.textContent = "🥏";
      d.el.style.fontSize = d.el.style.width = d.el.style.height = size + "px";
      handle(d);
      layer.appendChild(d.el);
      discs.push(d);
    }

    /* Drag to throw; a tap with no drag flicks it straight up. */
    function handle(d) {
      var trail = [], moved = 0, pid = null;
      d.el.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        pid = e.pointerId;
        try { d.el.setPointerCapture(pid); } catch (err) { /* old browsers */ }
        d.held = true;
        moved = 0;
        d.ox = e.clientX - d.x;
        d.oy = e.clientY - d.y;
        trail = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
        d.el.classList.add("held");
      });
      d.el.addEventListener("pointermove", function (e) {
        if (!d.held || e.pointerId !== pid) return;
        var p = trail[trail.length - 1];
        moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
        d.x = e.clientX - d.ox;
        d.y = e.clientY - d.oy;
        trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
        if (trail.length > 8) trail.shift();
      });
      function release(e) {
        if (!d.held || e.pointerId !== pid) return;
        d.held = false;
        d.el.classList.remove("held");
        if (moved < 8) {
          d.vy = -(1000 + Math.random() * 500);
          d.vx = (Math.random() - 0.5) * 500;
          d.spin = (Math.random() < 0.5 ? -1 : 1) * (720 + Math.random() * 720);
          return;
        }
        /* Throw speed from the last tenth of a second of the drag, so a
           drag that stops before letting go drops rather than flies. */
        var now = performance.now();
        var recent = trail.filter(function (p) { return now - p.t < 100; });
        if (recent.length < 2) { d.vx = d.vy = 0; return; }
        var a = recent[0], b = recent[recent.length - 1], dt = Math.max(16, b.t - a.t) / 1000;
        d.vx = clamp((b.x - a.x) / dt, -3200, 3200);
        d.vy = clamp((b.y - a.y) / dt, -3200, 3200);
        d.spin = d.vx * 0.6;
      }
      d.el.addEventListener("pointerup", release);
      d.el.addEventListener("pointercancel", release);
    }

    /* Discs knock into each other, so they stack instead of overlapping.
       A held disc does not move for anyone - it shoves. */
    function collide() {
      for (var i = 0; i < discs.length; i++) {
        var a = discs[i];
        for (var j = i + 1; j < discs.length; j++) {
          var b = discs[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 === 0) continue;
          var ia = a.held ? 0 : 1, ib = b.held ? 0 : 1, sum = ia + ib;
          if (!sum) continue;
          var dist = Math.sqrt(d2), nx = dx / dist, ny = dy / dist, overlap = min - dist;
          a.x -= nx * overlap * ia / sum; a.y -= ny * overlap * ia / sum;
          b.x += nx * overlap * ib / sum; b.y += ny * overlap * ib / sum;
          var rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            var imp = -1.35 * rel / sum;
            a.vx -= imp * ia * nx; a.vy -= imp * ia * ny;
            b.vx += imp * ib * nx; b.vy += imp * ib * ny;
          }
        }
      }
    }

    function step(now) {
      var dt = Math.min(0.033, (now - last) / 1000), age = now - t0;
      last = now;
      while (discs.length < total && age >= discs.length / total * SPAWN_FOR) spawn();

      discs.forEach(function (d) {
        if (d.held) { d.vx = d.vy = 0; return; }
        d.vy += GRAVITY * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.rot += d.spin * dt;
        if (d.y + d.r > H) {
          d.y = H - d.r;
          d.vy = Math.abs(d.vy) < 60 ? 0 : -d.vy * BOUNCE;
          d.vx *= 0.94;
          d.spin = d.vx / d.r * 57.3;          /* roll along the floor */
        }
        if (d.x - d.r < 0) { d.x = d.r; d.vx = Math.abs(d.vx) * 0.6; }
        if (d.x + d.r > W) { d.x = W - d.r; d.vx = -Math.abs(d.vx) * 0.6; }
      });
      collide();
      collide();

      discs.forEach(function (d) {
        /* A shove from a neighbour can push a disc through the floor or a
           wall; put it back before it is drawn there. */
        if (!d.held) {
          if (d.y + d.r > H) d.y = H - d.r;
          if (d.x - d.r < 0) d.x = d.r;
          if (d.x + d.r > W) d.x = W - d.r;
        }
        d.el.style.transform = "translate3d(" + (d.x - d.size / 2) + "px," + (d.y - d.size / 2) +
          "px,0) rotate(" + d.rot + "deg)";
      });
      layer.style.opacity = age > LIFE - FADE ? Math.max(0, (LIFE - age) / FADE) : 1;

      if (age >= LIFE) {
        window.removeEventListener("resize", onResize);
        layer.remove();
        raining = false;
        return;
      }
      window.requestAnimationFrame(step);
    }

    function onResize() { W = window.innerWidth; H = window.innerHeight; }
    window.addEventListener("resize", onResize);
    window.requestAnimationFrame(step);
  }

  tonightEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b || state.busy || state.spinning) return;
    var act = b.getAttribute("data-act");
    if (act === "join") answer("in");
    else if (act === "pass") answer("out");
    else if (act === "change") { state.changing = true; renderTonight(); }
    else if (act === "notify") turnOnPush(true).then(function () { renderTonight(); });
    else if (act === "reveal") spinReveal(b);
  });

  /* ------------------------------------------------------ notifications --
     Web Push: the browser gives us an address at its push service (Google's
     for Chrome, Apple's for Safari), we hand it to the club server, and the
     server pings it when the teams are drawn. On iPhone this only works once
     the site has been added to the Home Screen and opened from there. */

  function pushSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  function isIOS() {
    return /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function installedApp() {
    return !!((window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone);
  }

  function bellHtml() {
    if (!pushSupported()) {
      return isIOS() && !installedApp()
        ? '<p class="tn-note"><b>On iPhone:</b> tap Share &rarr; <b>Add to Home Screen</b>, open Frisbeing from your Home Screen, and turn notifications on there to get a buzz when the teams are out.</p>'
        : '<p class="tn-note">This browser can’t show notifications &mdash; check back here once the teams are drawn.</p>';
    }
    if (Notification.permission === "denied") {
      return '<p class="tn-note">Notifications are blocked for this site, so check back here once the teams are drawn.</p>';
    }
    if (Notification.permission === "granted" && push.subscribed) {
      return '<p class="tn-note">🔔 <b>Notifications are on.</b> This device will buzz when the teams are out.</p>';
    }
    return '<div class="tn-actions" style="margin-top:26px"><button class="btn" data-act="notify" type="button">' +
      '<span>🔔 Notify me when teams are out</span></button></div>';
  }

  function b64ToBytes(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function askPermission() {
    /* Older Safari takes a callback instead of returning a promise. */
    return new Promise(function (resolve) {
      var r = Notification.requestPermission(resolve);
      if (r && r.then) r.then(resolve);
    });
  }

  function workerReady() {
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise(function (_, reject) { window.setTimeout(function () { reject(new Error("no worker")); }, 8000); })
    ]);
  }

  function subscribePush() {
    var keyP = push.key ? Promise.resolve(push.key)
      : api("GET", "/push/key").then(function (d) { push.key = d.publicKey; return push.key; });
    return Promise.all([workerReady(), keyP]).then(function (r) {
      var reg = r[0], key = r[1];
      return reg.pushManager.getSubscription().then(function (sub) {
        /* A subscription made for an older server key would be refused by the
           push service, so swap it for a fresh one. */
        var k = sub && sub.options && sub.options.applicationServerKey;
        if (sub && k && bytesToB64(new Uint8Array(k)) !== key) {
          return sub.unsubscribe().then(function () { return null; });
        }
        return sub;
      }).then(function (sub) {
        return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      });
    }).then(function (sub) {
      return api("POST", "/push/subscribe", { subscription: sub.toJSON() });
    });
  }

  function turnOnPush(fromTap) {
    if (!pushSupported() || !serverMode() || !signedIn()) return Promise.resolve(false);
    var perm = Notification.permission;
    var ask = perm === "default" && fromTap ? askPermission() : Promise.resolve(perm);
    return ask.then(function (p) {
      if (p !== "granted") return false;
      return subscribePush().then(function () { push.subscribed = true; return true; });
    }).catch(function () { return false; });
  }

  /* ----------------------------------------------------------- calendar -- */

  function loadMonth(month) {
    state.month = month;
    return api("GET", "/schedule?month=" + month).then(function (s) {
      if (s.month !== state.month) return;         /* moved on meanwhile */
      state.schedule = s;
      renderCalendar();
    }, function (err) { subEl.textContent = err.message; });
  }

  function renderCalendar() {
    var s = state.schedule;
    if (!s) return;
    var p = s.month.split("-"), y = +p[0], m = +p[1];
    monthEl.textContent = MONTHS[m - 1] + " " + y;
    var count = s.sessions.length;
    subEl.textContent = count ? count + " session" + (count === 1 ? "" : "s") + " this month" : "No sessions this month";

    var byDate = {};
    s.sessions.forEach(function (x) { byDate[x.date] = x; });
    var first = weekday(s.month + "-01");
    var days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var prevDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
    var cells = Math.ceil((first + days) / 7) * 7;

    var html = DOW.map(function (d) { return '<div class="cal-dow" aria-hidden="true">' + d + '</div>'; }).join("");
    for (var i = 0; i < cells; i++) {
      var n = i - first + 1;
      if (n < 1 || n > days) {
        html += '<span class="cal-day out" aria-hidden="true">' + (n < 1 ? prevDays + n : n - days) + '</span>';
        continue;
      }
      var date = s.month + "-" + pad(n), sess = byDate[date], cls = ["cal-day"];
      if (sess) cls.push("s-" + sess.kind);
      if (sess && sess.drawn) cls.push("drawn");
      if (date === s.today) cls.push("today");
      if (date < s.today) cls.push("past");
      if (date === state.selected) cls.push("sel");
      var label = longDate(date) +
        (sess ? (sess.kind === "extra" ? ", extra session" : ", session") +
          (sess.joined ? ", " + sess.joined + " joined" : "") + (sess.drawn ? ", teams drawn" : "")
          : ", no session") + (date === s.today ? ", today" : "");
      html += '<button type="button" class="' + cls.join(" ") + '" data-date="' + date + '" aria-label="' +
        esc(label) + '" aria-pressed="' + (date === state.selected) + '">' + n + '</button>';
    }
    gridEl.innerHTML = html;
  }

  gridEl.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-date]");
    if (!b) return;
    state.selected = b.getAttribute("data-date");
    state.notified = null;
    renderCalendar();
    loadDay();
  });
  el("calPrev").addEventListener("click", function () { loadMonth(shiftMonth(state.month, -1)); });
  el("calNext").addEventListener("click", function () { loadMonth(shiftMonth(state.month, 1)); });
  el("calToday").addEventListener("click", function () {
    var today = state.tonight && state.tonight.today;
    if (!today) return;
    state.selected = today;
    loadMonth(today.slice(0, 7));
    loadDay();
  });

  /* -------------------------------------------------------- selected day -- */

  function loadDay() {
    if (!state.selected) return Promise.resolve();
    var date = state.selected;
    return api("GET", "/game?date=" + date).then(function (v) {
      if (v.date !== state.selected) return;
      state.day = v;
      renderDay();
    }, function (err) { dayEl.innerHTML = '<p class="day-msg">' + esc(err.message) + '</p>'; });
  }

  function refreshLeader() {
    if (!isAdmin() || !state.month) return;
    loadMonth(state.month);
    loadDay();
  }

  function genderMark(g) { return g === "f" ? "♀" : g === "m" ? "♂" : "·"; }

  /* Leaders see nicknames next to the real name on the squad list, so
     "Hustin Je" is still recognisably Justin He. */
  function nameHtml(p) {
    var real = p.member && FB.norm(p.member) !== FB.norm(p.name)
      ? ' <span class="real">' + esc(p.member) + '</span>' : '';
    return '<span>' + esc(p.name) + real + '</span>';
  }
  function tierHtml(t) {
    var name = t === "U" ? "Unclassified" : FB.TIER_NAME[t];
    return '<span class="tier ' + esc(t) + '" title="' + esc(name) + '">' + esc(FB.TIER_NAME[t] || t) + '</span>';
  }

  function whoHtml(title, list, passed) {
    var body = list.length
      ? '<ul class="who-list' + (passed ? " passed" : "") + '">' + list.map(function (p) {
          return '<li>' + (passed ? "" : '<span class="g" aria-hidden="true">' + genderMark(p.gender) + '</span>' + tierHtml(p.tier)) +
            nameHtml(p) +
            (!passed && !p.member ? '<span class="unl" title="Not linked to the squad list yet, so they play as unclassified">not on squad list</span>' : '') +
            '</li>';
        }).join("") + '</ul>'
      : '<p class="who-empty">Nobody yet.</p>';
    return '<div><p class="who-hd"><span>' + title + '</span><b>' + list.length + '</b></p>' + body + '</div>';
  }

  function teamsHtml(teams) {
    return teams.map(function (team, i) {
      var c = FB.counts(team);
      var rows = team.slice().sort(function (a, b) {
        return FB.TIERS.indexOf(a.tier) - FB.TIERS.indexOf(b.tier) || a.name.localeCompare(b.name);
      }).map(function (p) { return '<li>' + tierHtml(p.tier) + nameHtml(p) + '</li>'; }).join("");
      return '<div class="team" style="animation-delay:' + (reduce ? 0 : i * 70) + 'ms">' +
        '<div class="team-hd"><span class="nm">Team ' + LETTERS[i] + '</span><span class="ct">' + team.length + ' players</span></div>' +
        '<ol>' + rows + '</ol>' +
        '<div class="bal"><span>' + (c.f + c.m > 0 ? c.f + "♀ " + c.m + "♂ &middot; " : "") +
        c.A + " T1 &middot; " + c.I + " T2 &middot; " + c.B + " T3" + (c.U ? " &middot; " + c.U + " U" : "") +
        '</span><span>Score <b>' + FB.score(team) + '</b></span></div></div>';
    }).join("");
  }

  /* The step buttons offer 2 to 8, so the suggestion never goes past them. */
  var MAX_TEAMS = 8;
  function suggestedTeams(joined) { return Math.max(2, Math.min(MAX_TEAMS, Math.round(joined / 8))); }

  function teamCount(joined) {
    var max = Math.max(2, Math.min(MAX_TEAMS, joined));
    var n = state.teamsWanted || suggestedTeams(joined);
    return Math.min(Math.max(2, n), max);
  }

  function previewText(joined, n) {
    if (joined < n) return joined + " joined — not enough for " + n + " teams";
    var base = Math.floor(joined / n), extra = joined % n, sizes = [];
    for (var i = 0; i < n; i++) sizes.push(base + (i < extra ? 1 : 0));
    return joined + " joined → " + sizes.join(" / ") + " per team";
  }

  function drawZoneHtml(v) {
    var joined = (v.joined || []).length;
    var h = '<div class="draw-zone">';

    if (!isLeader()) {
      if (v.drawn && v.teams) {
        return h + '<p class="eyebrow">Tonight’s teams</p><div class="teams-grid">' + teamsHtml(v.teams) + '</div></div>';
      }
      return h + '<p class="day-msg">The supreme leader spins the disc to draw tonight’s teams. ' +
        'Everyone who joined gets a notification when they do.</p></div>';
    }

    var n = teamCount(joined), top = Math.min(MAX_TEAMS, Math.max(2, joined));
    h += '<div class="sort-label">' + (v.drawn ? "Reshuffle" : "Sort teams") + '</div>' +
      '<button class="fdisc' + (state.landed ? " landed" : "") + '" data-act="draw" type="button" aria-label="' +
      (v.drawn ? "Reshuffle into " : "Spin to draw ") + n + ' teams"' + (joined < 2 ? " disabled" : "") + '>' + DISC + '</button>' +
      '<div class="progress" id="drawProg" aria-hidden="true">' + BARS + '</div>' +
      '<p class="eyebrow count-label">Number of teams</p><div class="steps" role="group" aria-label="Number of teams">';
    for (var k = 2; k <= top; k++) {
      h += '<button type="button" data-act="n" data-n="' + k + '" aria-pressed="' + (k === n) + '"><span>' + k + '</span></button>';
    }
    h += '</div><p class="preview">' + esc(joined < 2 ? "At least 2 people need to join first" : previewText(joined, n)) + '</p>' +
      '<p class="tn-error" id="drawError"></p>';

    if (v.drawn && v.teams) {
      h += '<p class="shared-banner"><b>Teams are out.</b> ' +
        (state.notified == null ? "Everyone who joined can see their team"
          /* nobody turned notifications on - not a failure, but worth a nudge */
          : state.notified === 0 ? "Nobody who joined has notifications on, so tell the group chat"
          : state.notified + " device" + (state.notified === 1 ? "" : "s") + " notified") + '</p>' +
        '<div class="teams-grid">' + teamsHtml(v.teams) + '</div>' +
        '<div class="row draw-actions"><button class="btn danger" data-act="undraw" type="button"><span>Take teams back</span></button></div>';
    }
    return h + '</div>';
  }

  function renderDay() {
    if (state.spinning) return;
    var v = state.day;
    if (!v) return;
    var past = v.date < v.today, isToday = v.date === v.today;
    var tag = !v.isGame ? '<span class="stag">No session</span>'
      : v.kind === "extra" ? '<span class="stag extra">Extra session</span>'
      : '<span class="stag regular">Tue / Thu</span>';
    if (v.drawn) tag += ' <span class="stag">Teams out</span>';
    var h = '<div class="day-hd"><h3 class="day-title">' + (isToday ? "Tonight &middot; " : "") + esc(longDate(v.date)) +
      '</h3><div>' + tag + '</div></div>';

    if (!v.isGame) {
      h += '<p class="day-msg">' + (past ? "There was no session on this day." : "Nothing on. Add a session and it shows up for everyone as a game night.") + '</p>';
      if (!past) h += '<div class="row day-actions"><button class="btn solid" data-act="add" type="button"><span>Schedule a session</span></button></div>';
    } else {
      h += '<div class="day-cols">' + whoHtml("Joined", v.joined || [], false) + whoHtml("Passing", v.passed || [], true) + '</div>';
      if (isToday) h += drawZoneHtml(v);
      else if (!past) h += '<p class="day-msg">Players can answer Join or I’ll pass on the day itself.</p>';
      if (!past) h += '<div class="row day-actions"><button class="btn danger" data-act="remove" type="button"><span>Call off this session</span></button></div>';
    }
    dayEl.innerHTML = h;
    state.landed = false;
  }

  function scheduleChange(action) {
    var v = state.day;
    if (action === "remove") {
      var j = (v.joined || []).length;
      var msg = "Call off the session on " + longDate(v.date) + "?";
      if (j) msg += "\n\n" + j + (j === 1 ? " player has" : " players have") + " joined. Their answers" +
        (v.drawn ? " and the teams" : "") + " will be deleted.";
      if (!window.confirm(msg)) return;
    }
    state.busy = true;
    api("POST", "/schedule", { date: v.date, action: action }).then(function () {
      state.busy = false;
      refreshLeader();
      loadTonight();
    }, function (err) {
      state.busy = false;
      window.alert(err.message);
    });
  }

  function throwDisc(disc) {
    var v = state.day, joined = (v.joined || []).length, n = teamCount(joined);
    if (v.drawn && !window.confirm("Reshuffle into " + n + " new teams? Everyone who joined is notified again.")) return;
    state.busy = true;
    state.spinning = true;
    disc.classList.remove("landed");
    disc.classList.add("spinning");
    var prog = el("drawProg");
    if (prog) prog.classList.add("on");
    var started = Date.now();
    function settle() {
      var left = reduce ? 0 : SPIN_MS - (Date.now() - started);
      return new Promise(function (r) { window.setTimeout(r, Math.max(0, left)); });
    }
    api("POST", "/game/" + v.date + "/draw", { n: n }).then(function (res) {
      settle().then(function () {
        state.busy = false;
        state.spinning = false;
        state.day = res;
        state.games = res.games;
        state.notified = res.notifying;
        state.landed = true;             /* the disc lands with its pulse */
        renderDay();
        loadMonth(state.month);
        loadTonight();
      });
    }, function (err) {
      settle().then(function () {
        state.busy = false;
        state.spinning = false;
        renderDay();
        var e = el("drawError");
        if (e) e.textContent = err.message;
      });
    });
  }

  function takeBack() {
    if (!window.confirm("Take tonight’s teams back? Join / I’ll pass opens again for everyone.")) return;
    state.busy = true;
    api("DELETE", "/game/" + state.day.date + "/draw").then(function (v) {
      state.busy = false;
      state.day = v;
      state.games = v.games;
      state.notified = null;
      renderDay();
      loadMonth(state.month);
      loadTonight();
    }, function (err) {
      state.busy = false;
      window.alert(err.message);
    });
  }

  dayEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b || b.disabled || state.busy || state.spinning) return;
    var act = b.getAttribute("data-act");
    if (act === "add" || act === "remove") scheduleChange(act);
    else if (act === "draw") throwDisc(b);
    else if (act === "undraw") takeBack();
    else if (act === "n") { state.teamsWanted = +b.getAttribute("data-n"); renderDay(); }
  });

  /* "Show skill levels" - a leader's own choice, remembered on this device. */
  function applyTiers(on) {
    bandEl.classList.toggle("tiers-on", on);
    toggleEl.setAttribute("aria-pressed", String(on));
  }
  toggleEl.addEventListener("click", function () {
    var on = toggleEl.getAttribute("aria-pressed") !== "true";
    writePref(TIERS_KEY, on ? "1" : "0");
    applyTiers(on);
  });
  applyTiers(readPref(TIERS_KEY) === "1");

  /* ------------------------------------------------------------- polling --
     Every few seconds ask only for the counters. When the sessions counter
     moves - someone answered, the teams were drawn, a date changed - fetch
     the details again. A player looking at "You're In!" flips to the disc
     on their own, no reload needed. */

  function refreshAll() {
    loadTonight();
    if (isAdmin()) refreshLeader();
  }

  function poll() {
    if (!serverMode() || document.hidden) return;
    /* Past midnight, "tonight" is a different day even if nothing changed. */
    if (Date.now() - state.loadedAt > 5 * 60 * 1000) return refreshAll();
    api("GET", "/version").then(function (d) {
      if (d.games !== state.games) { state.games = d.games; refreshAll(); }
    }, function () { /* offline: try again next time */ });
  }

  /* --------------------------------------------------------------- start -- */

  function boot() {
    var leader = serverMode() && isAdmin();
    bandEl.hidden = !leader;
    if (!serverMode()) { renderTonight(); return; }
    loadTonight().then(function () {
      if (!leader || !state.tonight) return;
      if (!state.month) {
        state.selected = state.tonight.today;
        state.month = state.tonight.today.slice(0, 7);
      }
      refreshLeader();
    });
    /* Fetch the push key now, not after the tap: Safari only lets a page
       subscribe close to the tap itself, and a network wait in between can
       lose it. */
    if (signedIn() && pushSupported() && Notification.permission !== "denied" && !push.key) {
      api("GET", "/push/key").then(function (d) { push.key = d.publicKey; }, function () { /* fetched on tap instead */ });
    }
    /* Already allowed on this device: quietly make sure the server has it. */
    if (signedIn() && pushSupported() && Notification.permission === "granted") {
      turnOnPush(false).then(function () { renderTonight(); });
    }
  }

  if (window.FBAuth) FBAuth.onChange(boot);
  window.setInterval(poll, Math.max(3, SRV.syncSeconds || 10) * 1000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });
  boot();
})();
