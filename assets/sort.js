/* ==========================================================================
   FRISBEING UF - tonight's game

   PLAYERS see one big message about tonight:
     no game          "No Current Scheduled Games For Tonight"
     game, no answer  "TONIGHT" with Join / I'll pass
     answered         "You're In!" or "It's alr, Cya another day!"
     teams drawn      a disc to spin - "See Your TEAM!!!" - then their team

   LEADERS AND ADMINS also get the calendar (every Tuesday and Thursday by
   default; tap a day to add a session or call one off) and, for tonight,
   who joined and who passed. A leader or admin spins the disc to draw the
   teams; the server balances size, tier, gender and positions and
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
      toggleEl = el("tiersToggle"), indexToggleEl = el("indexToggle"), todayParticipantsEl = el("todayParticipants"),
      upcomingEl = el("upcoming"), upcomingBandEl = el("upcomingBand");
  var reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];
  var DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  var DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var LETTERS = "ABCDEFGHIJKL";
  var SPIN_MS = 1900;                       /* matches the throw animation in brand.css */
  var REVEAL_KEY = "frisbeing.revealed.v1";
  var TIERS_KEY = "frisbeing.showTiers.v1";
  var INDEX_KEY = "frisbeing.showIndex.v1";

  var DISC = '<span class="disc-inner"><span class="disc-mark" aria-hidden="true"></span></span><span class="disc-ring"></span>';
  var BARS = "<i></i><i></i><i></i><i></i><i></i><i></i>";

  var state = {
    tonight: null,      /* the server's view of today, for whoever is asking */
    upcoming: null,     /* tomorrow has its own attendance and answer */
    changingUpcoming: false,
    loadRequest: 0,
    games: null,        /* last seen sessions counter - polling compares it */
    rosterVersion: null,
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
  var simulateBeforeStart = false;
  var simulateAfterStart = false;

  /* Local visual preview only. Never expose the switch on the live domain. */
  if (location.protocol === "file:" || ["localhost", "127.0.0.1", "::1"].indexOf(location.hostname) >= 0) {
    var timePreviews = document.createElement("div");
    timePreviews.className = "dev-time-controls";
    [
      { label: "Simulate before 20:10", get: function () { return simulateBeforeStart; }, set: function (v) { simulateBeforeStart = v; simulateAfterStart = false; } },
      { label: "Simulate after 20:10", get: function () { return simulateAfterStart; }, set: function (v) { simulateAfterStart = v; simulateBeforeStart = false; } }
    ].forEach(function (preview) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "dev-time-toggle";
      button.setAttribute("aria-pressed", "false");
      button.textContent = preview.label;
      button.addEventListener("click", function () {
        preview.set(!preview.get());
        timePreviews.querySelectorAll("button").forEach(function (item, index) {
          var active = index === 0 ? simulateBeforeStart : simulateAfterStart;
          item.setAttribute("aria-pressed", String(active));
          item.textContent = active ? (index === 0 ? "Exit before preview" : "Exit after preview") :
            (index === 0 ? "Simulate before 20:10" : "Simulate after 20:10");
        });
        renderTonight();
      });
      timePreviews.appendChild(button);
    });
    var pairPreview = document.createElement("button");
    var pairActive = !!(window.FBPreview && FBPreview.hasSessionPair && FBPreview.hasSessionPair());
    pairPreview.type = "button";
    pairPreview.className = "dev-time-toggle";
    pairPreview.setAttribute("aria-pressed", String(pairActive));
    pairPreview.textContent = pairActive ? "Exit teammate pair preview" : "Simulate teammate pair";
    pairPreview.addEventListener("click", function () {
      if (!window.FBPreview || !FBPreview.simulateTeammates) return;
      FBPreview.simulateTeammates(pairActive ? "session-pair-reset" : "session-pair");
      window.location.reload();
    });
    timePreviews.appendChild(pairPreview);
    document.body.appendChild(timePreviews);
  }

  /* ------------------------------------------------------------ basics -- */

  function serverMode() { return !isPreview() && !!(SRV.apiBase && String(SRV.apiBase).trim()); }
  function isPreview() { return !!(window.FBPreview && FBPreview.active()); }
  function signedIn() { return isPreview() ? (FBPreview.signedIn ? FBPreview.signedIn() : true) : !!(window.FBAuth && FBAuth.user()); }
  function isAdmin() { return !!(window.FBAuth && FBAuth.isAdmin()); }
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
    if (isPreview()) return FBPreview.request(method, path, body);
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
    return '<h2 class="tn-big">No session for tonight</h2>' +
      '<p class="tn-small">' + (state.upcoming && state.upcoming.isGame
        ? 'Tomorrow’s session is open for sign-ups below.' : 'Stay tuned next day!') + '</p>' +
      '<div class="tn-discs" aria-hidden="true"><span class="emoji">🥏</span>' +
      '<span class="emoji">🥏</span><span class="emoji">🥏</span></div>';
  }

  function gameHtml() {
    return '<h2 class="tn-big tn-fire"><span class="emoji">🔥</span> TONIGHT ' +
      '<span class="emoji">🔥</span></h2>' +
      '<p class="tn-game">Game Scheduled 20:00 @sportsfield</p>';
  }

  function sessionStarted(t) {
    if (simulateBeforeStart) return false;
    if (simulateAfterStart) return true;
    if (!t || !t.isGame || t.date !== t.today) return false;
    if (!t.canJoin) return true;
    var now = new Date();
    var zone = t.tz || "Asia/Shanghai";
    var today = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    if (today > t.date) return true;
    if (today < t.date) return false;
    var parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    var hour = Number(parts.find(function (part) { return part.type === "hour"; }).value);
    var minute = Number(parts.find(function (part) { return part.type === "minute"; }).value);
    return hour * 60 + minute >= 20 * 60 + 10;
  }

  function startedHtml() { return '<h2 class="tn-big tn-answer">Session Started</h2>'; }

  function choiceHtml(tomorrow) {
    return '<div class="tn-actions">' +
      '<button class="btn solid big" data-act="join" type="button"><span>' + (tomorrow ? 'Join tomorrow' : 'Join') + '</span></button>' +
      '<button class="btn big" data-act="pass" type="button"><span>I’ll pass</span></button>' +
      '</div><p class="tn-error" id="' + (tomorrow ? 'upcomingError' : 'tnError') + '"></p>';
  }

  function participantsHtml(v, heading) {
    var people = v.participants || [];
    return '<h3 class="attendance-heading">' + esc(heading) + ' <span class="attendance-count">' + people.length + '</span></h3>' +
      (people.length ? '<ul class="participant-list">' + people.map(function (p) {
        return '<li>' + esc(p.name) + '</li>';
      }).join('') + '</ul>' : '<p class="tn-note">Nobody has joined yet. Be the first!</p>');
  }

  function changeAnswerHtml() {
    return '<div class="tn-actions"><button class="btn session-secondary" data-act="change" type="button"><span>Change my answer</span></button></div>';
  }

  function renderUpcoming() {
    var v = state.upcoming;
    upcomingBandEl.hidden = (!serverMode() && !isPreview()) || !v || !v.isGame;
    if (upcomingBandEl.hidden) { upcomingEl.innerHTML = ''; return; }
    var h = '<h2 class="tn-big tn-answer">' + esc(longDate(v.date)) + '</h2>';
    if (!v.signedIn || state.changingUpcoming || !v.me || !v.me.rsvp) h += '<p class="tn-small">Sign up a day ahead.</p>';
    if (!v.signedIn) h += signInHtml();
    else if (state.changingUpcoming || !v.me || !v.me.rsvp) h += choiceHtml(true);
    else {
      h += '<p class="upcoming-answer">' + (v.me.rsvp === 'in' ? 'Session Joined' : 'Passed') + '</p>' +
        changeAnswerHtml() + '<p class="tn-error" id="upcomingError"></p>';
    }
    upcomingEl.innerHTML = h + '<div class="session-attendance">' + participantsHtml(v, 'Player List') + '</div>';
  }

  function inHtml() {
    return '<h2 class="tn-big tn-answer">You’re in!</h2>' +
      '<p class="tn-small">Stay tuned for the team selection!</p>' +
      bellHtml() +
      changeAnswerHtml() +
      '<p class="tn-error" id="tnError"></p>';
  }

  function outHtml(canChange) {
    return '<h2 class="tn-big tn-answer">Passed</h2>' +
      (canChange ? changeAnswerHtml() : '') +
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
    var names = (mine.players || mine.members.map(function (n) { return { name: n, position: "c" }; })).slice().sort(function (a, b) {
      return (b.name === me) - (a.name === me) || a.name.localeCompare(b.name);
    });
    /* Same sizes as the "See Your / TEAM!!!" screen it replaces, so the
       words land where the last ones were and the letter drops in below. */
    /* The spaces between the spans are invisible but make screen readers say
       "You are on Team A" rather than "You are onTeamA". */
    return '<h2 class="reveal-head"><span class="see-your">You are on</span> ' +
      '<span class="see-team">Team</span> ' +
      '<span class="team-letter">' + esc(mine.letter) + '</span></h2>' +
      '<ul class="mates">' + names.map(function (p, i) {
        return '<li' + (p.name === me ? ' class="me"' : '') + ' style="animation-delay:' +
          (reduce ? 0 : 750 + i * 60) + 'ms"><span>' + esc(p.name) + '</span></li>';
      }).join("") + '</ul>' + (sessionStarted(state.tonight) ? '' : '<button class="tn-link" data-act="pass" type="button">Leave this session</button>') +
      '<p class="tn-error" id="tnError"></p>';
  }

  function signInHtml() {
    return '<div class="tn-actions"><a class="btn solid big" href="admin.html"><span>Sign in to join</span></a></div>' +
      '<p class="tn-note">Use your Tsinglan Microsoft account &mdash; the same one as Outlook and Teams.</p>';
  }

  function renderTonight() {
    if (state.spinning) return;
    var t = state.tonight;
    if (simulateBeforeStart && t && t.isGame) t = Object.assign({}, t, { canJoin: true });
    state.sessionStartedShown = sessionStarted(t);
    todayParticipantsEl.hidden = (!serverMode() && !isPreview()) || !t || !t.isGame;
    todayParticipantsEl.innerHTML = todayParticipantsEl.hidden ? '' : participantsHtml(t, 'Player List');
    if (simulateAfterStart && (!t || !t.isGame)) return paint(startedHtml());
    if (!serverMode() && !isPreview()) {
      return paint('<p class="eyebrow dim tn-eyebrow">Tonight</p>' +
        '<h2 class="tn-big">Sessions are switched off</h2>' +
        '<p class="tn-small">Game nights need the club server, which this copy of the site is running without.</p>');
    }
    if (!t) return paint('<p class="tn-small">Checking tonight&hellip;</p>');
    if (!t.isGame) return paint(noGameHtml());
    if (t.needsRedraw && t.me && t.me.rsvp === "in" && !t.mine) {
      return paint('<h2 class="tn-big tn-answer">You’re in!</h2><p class="tn-small">Waiting for the updated teams.</p>' + (t.canJoin ? changeAnswerHtml() : ''));
    }
    if (state.sessionStartedShown) {
      if (t.drawn && t.mine) return paint(revealedAlready(t) ? revealHtml(t.mine) : seeYourTeamHtml());
      return paint(startedHtml());
    }
    if (!t.signedIn) return paint(gameHtml() + signInHtml());

    if (t.drawn) {
      if (!t.mine) return paint(gameHtml() + choiceHtml());
      return paint(revealedAlready(t) ? revealHtml(t.mine) : seeYourTeamHtml());
    }
    if (state.changing || !t.me || !t.me.rsvp) return paint(gameHtml() + choiceHtml());
    return paint(t.me.rsvp === "in" ? inHtml() : outHtml(true));
  }

  function showError(msg, upcoming) {
    var e = el(upcoming ? "upcomingError" : "tnError");
    if (e) e.textContent = msg;
  }

  /* Per person as well as per draw, so a second account on the same phone
     still gets its own spin. */
  function revealId(t) {
    var u = window.FBAuth && FBAuth.user();
    return (u ? u.email : "") + "|" + t.date + ":" + t.draw.at + ":" + (t.mine ? t.mine.letter : "");
  }
  function revealedAlready(t) { return readPref(REVEAL_KEY) === revealId(t); }
  function rememberReveal(t) { writePref(REVEAL_KEY, revealId(t)); }

  function loadTonight() {
    var request = ++state.loadRequest;
    return api("GET", "/game").then(function (v) {
      if (request !== state.loadRequest) return;
      var before = state.tonight && state.tonight.today;
      state.tonight = v;
      state.upcoming = v.upcoming || null;
      state.games = v.games;
      state.loadedAt = Date.now();
      /* Past midnight "tonight" is a new day. A leader who was looking at
         tonight moves on with it instead of staring at yesterday. */
      if (before && v.today !== before) {
        state.changing = false;
        state.changingUpcoming = false;
        if (isAdmin() && state.selected === before) {
          state.selected = v.today;
          state.month = v.today.slice(0, 7);
          refreshLeader();
        }
      }
      renderTonight();
      renderUpcoming();
    }, function (err) {
      if (request !== state.loadRequest) return;
      if (!state.tonight) {
        paint('<h2 class="tn-big">Can’t reach the club</h2><p class="tn-small">' + esc(err.message) + '</p>');
      }
    });
  }

  function answer(status, upcoming) {
    var t = upcoming ? state.upcoming : state.tonight;
    if (!t || !t.canJoin || (!upcoming && sessionStarted(t))) return;
    ++state.loadRequest;   /* discard any read started before this answer */
    /* Asking for notification permission has to start inside the tap itself,
       so it is kicked off before the answer goes to the server. */
    var asking = status === "in" && !isPreview() ? turnOnPush(true) : null;
    state.busy = true;
    api("PUT", "/game/" + t.date + "/rsvp", { status: status }).then(function (v) {
      state.busy = false;
      if (upcoming) { state.changingUpcoming = false; state.upcoming = v; }
      else { state.changing = false; state.tonight = v; }
      state.games = v.games;
      renderTonight();
      renderUpcoming();
      if (asking) asking.then(function () { renderTonight(); });
      loadTonight();  /* update both lists, including any simultaneous joins */
      if (isAdmin()) refreshLeader();
    }, function (err) {
      state.busy = false;
      showError(err.message, upcoming);
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

  upcomingEl.addEventListener("click", function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || b.disabled || state.busy || state.spinning) return;
    var act = b.getAttribute('data-act');
    if (act === 'join') answer('in', true);
    else if (act === 'pass') answer('out', true);
    else if (act === 'change') { state.changingUpcoming = true; renderUpcoming(); }
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
    return '<div class="tn-actions notify-actions"><button class="btn session-secondary" data-act="notify" type="button">' +
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
    var name = FB.TIER_NAME[t];
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
    return (Array.isArray(teams) ? teams : []).map(function (team, i) {
      team = Array.isArray(team) ? team.filter(function (player) { return player && typeof player === "object"; }) : [];
      var ordered = team.slice().sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
      var groups = new Map(), used = new Set(), units = [];
      ordered.forEach(function (p) {
        if (!p.teammateGroupId) return;
        if (!groups.has(p.teammateGroupId)) groups.set(p.teammateGroupId, []);
        groups.get(p.teammateGroupId).push(p);
      });
      ordered.forEach(function (p) {
        if (used.has(p.id)) return;
        var group = p.teammateGroupId && groups.get(p.teammateGroupId);
        var unit = group && group.length > 1 ? group : [p];
        unit.forEach(function (member) { used.add(member.id); });
        units.push(unit);
      });
      var rows = units.map(function (unit) {
        var grouped = unit.length > 1;
        return '<li class="assignment-row' + (grouped ? ' teammate-unit' : '') + '"' + (isAdmin()
          ? ' data-drag-player-id="' + esc(unit[0].id) + '" data-source-team="' + i + '"'
          : '') + '>' + unit.map(function (p) {
            return '<div class="assignment-name">' + tierHtml(p.tier) + nameHtml(p) + '</div>';
          }).join("") + '</li>';
      }).join("");
      var score = isAdmin() ? FB.frisIndex(team) : 0;
      return '<div class="team"' + (isAdmin() ? ' data-team-index="' + i + '"' : '') + ' style="animation-delay:' + (reduce ? 0 : i * 70) + 'ms">' +
        '<div class="team-hd"><span class="nm">Team ' + LETTERS[i] + '</span><span class="team-index" aria-label="Fris Index ' + score + '">Index ' + score + '</span></div>' +
        '<ol>' + rows + '</ol></div>';
    }).join("");
  }

  /* The step buttons offer 2 to 8, so the suggestion never goes past them. */
  function suggestedTeams(joined) { return joined >= 20 ? 4 : 2; }

  function teamCount(joined) {
    var n = state.teamsWanted || suggestedTeams(joined);
    return n === 4 ? 4 : 2;
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
    var hasTeams = !!(v.drawn || v.hasDraft);

    if (!isAdmin()) {
      if (v.drawn && v.teams) {
        return h + '<p class="eyebrow">Tonight’s teams</p><div class="teams-grid">' + teamsHtml(v.teams) + '</div></div>';
      }
      return h + '<p class="day-msg">An admin spins the disc to draw tonight’s teams. ' +
        'Everyone who joined gets a notification when they do.</p></div>';
    }

    var n = teamCount(joined);
    h += '<div class="sort-label">' + (hasTeams ? "Reshuffle" : "Sort teams") + '</div>' +
      '<button class="fdisc' + (state.landed ? " landed" : "") + '" data-act="draw" type="button" aria-label="' +
      (hasTeams ? "Create a new draft of " : "Draw ") + n + ' teams"' + (joined < n ? " disabled" : "") + '>' + DISC + '</button>' +
      '<div class="progress" id="drawProg" aria-hidden="true">' + BARS + '</div>' +
      '<p class="draw-preview">' + esc(previewText(joined, n)) + '</p>' +
      '<div class="steps" role="group" aria-label="Choose 2 or 4 teams">';
    [2, 4].forEach(function (k) {
      h += '<button type="button" data-act="n" data-n="' + k + '" aria-pressed="' + (k === n) + '"' + (joined < k ? ' disabled' : '') + '><span>' + k + '</span></button>';
    });
    h += '</div><p class="tn-error" id="drawError"></p>';

    if (hasTeams && v.teams) {
      if (v.needsRedraw) h += '<p class="tn-error" role="status">Attendance changed. Draw teams again. Previous teams are kept until then. ' + esc(v.redrawReason || '') + '</p>';
      if (v.hasDraft) {
        h += '<p class="shared-banner"><b>Unpublished draft.</b> Only admins can see these teams. Publish when ready to notify players.</p>';
      } else {
        h += '<p class="shared-banner"><b>Teams are published.</b> ' +
          (state.notified == null ? "Players can see their teams"
            : state.notified === 0 ? "No player devices were notified"
            : state.notified + " device" + (state.notified === 1 ? "" : "s") + " notified") + '</p>';
      }
      h += '<div class="teams-grid">' + teamsHtml(v.teams) + '</div><div class="row draw-actions">';
      if (v.hasDraft) {
        h += '<button class="btn solid" data-act="publish" type="button"' + (v.needsRedraw ? ' disabled' : '') + '><span>Publish teams</span></button>';
      } else {
        h += '<button class="btn danger" data-act="undraw" type="button"><span>Take teams back</span></button>';
      }
      h += '</div>';
    }
    return h + '</div>';
  }

  function renderDay() {
    if (state.spinning) return;
    if (memberDrag) { pendingDayRender = true; return; }
    pendingDayRender = false;
    var v = state.day;
    if (!v) return;
    var past = v.date < v.today, isToday = v.date === v.today;
    var tag = !v.isGame ? '<span class="stag">No session</span>'
      : v.kind === "extra" ? '<span class="stag extra">Extra session</span>'
      : '<span class="stag regular">Tue / Thu</span>';
    if (v.drawn) tag += ' <span class="stag">Teams out</span>';
    else if (v.hasDraft) tag += ' <span class="stag">Draft</span>';
    var h = '<div class="day-hd"><h3 class="day-title">' + (isToday ? "Tonight &middot; " : "") + esc(longDate(v.date)) +
      '</h3><div>' + tag + '</div></div>';

    if (!v.isGame) {
      if (!past) h += '<div class="row day-actions"><button class="btn solid" data-act="add" type="button"><span>Schedule a session</span></button></div>';
    } else {
      h += '<div class="day-cols">' + whoHtml("Joined", v.joined || [], false) + whoHtml("Passing", v.passed || [], true) + '</div>';
      if (isToday) h += drawZoneHtml(v);
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
    if ((v.drawn || v.hasDraft) && !window.confirm("Create a new unpublished draft of " + n + " teams? Players will only see the teams after you publish.")) return;
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
        state.notified = null;
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

  function publishTeams() {
    if (!isAdmin() || state.busy || state.spinning || !state.day || !state.day.hasDraft) return;
    state.busy = true;
    api("POST", "/game/" + state.day.date + "/publish", {}).then(function (v) {
      state.busy = false;
      state.day = v;
      state.games = v.games;
      state.notified = v.notifying;
      renderDay();
      loadMonth(state.month);
      loadTonight();
    }, function (err) {
      state.busy = false;
      loadDay().then(function () {
        var error = el("drawError");
        if (error) error.textContent = err.message;
      });
    });
  }

  function takeBack() {
    var isDraft = !!(state.day && state.day.hasDraft);
    if (!window.confirm(isDraft ? "Discard this unpublished draft? Players have not been notified." : "Take tonight’s teams back? Join / I’ll pass opens again for everyone.")) return;
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
    else if (act === "publish") publishTeams();
    else if (act === "undraw") takeBack();
    else if (act === "n") { state.teamsWanted = +b.getAttribute("data-n"); renderDay(); }
  });

  function updateAssignment(body) {
    if (!isAdmin() || state.busy || state.spinning || !state.day) return;
    var date = state.day.date;
    state.busy = true;
    dayEl.querySelectorAll('[data-assignment]').forEach(function (button) { button.disabled = true; });
    api("PUT", "/game/" + date + "/assignment", body).then(function (v) {
      state.busy = false;
      if (state.selected === date) { state.day = v; renderDay(); }
      state.games = v.games;
      loadTonight();
    }, function (err) {
      state.busy = false;
      loadDay().then(function () {
        var error = el("drawError");
        if (error) error.textContent = err.message;
      });
    });
  }

  dayEl.addEventListener("click", function (e) {
    var button = e.target.closest('button[data-assignment="position"]');
    if (!button || button.disabled) return;
    if (button.getAttribute("aria-pressed") === "true") return;
    updateAssignment({ id: button.getAttribute("data-id"), position: button.getAttribute("data-position") });
  });

  var memberDrag = null, pendingDayRender = false;
  function clearDropTargets() {
    dayEl.querySelectorAll(".team.drop-target").forEach(function (node) {
      node.classList.remove("drop-target");
    });
  }
  function finishMemberDrag() {
    var drag = memberDrag;
    memberDrag = null;
    clearDropTargets();
    if (!drag) return null;
    drag.row.classList.remove("dragging");
    if (drag.ghost) drag.ghost.remove();
    try {
      if (drag.row.hasPointerCapture && drag.row.hasPointerCapture(drag.pointer)) drag.row.releasePointerCapture(drag.pointer);
    } catch (ignore) { /* Pointer may already have been released by the browser. */ }
    return drag;
  }
  function teamAtPoint(x, y) {
    var hit = document.elementFromPoint(x, y);
    var team = hit && hit.closest(".team[data-team-index]");
    return team && dayEl.contains(team) ? Number(team.getAttribute("data-team-index")) : null;
  }
  function cancelMemberDrag(e) {
    if (e && memberDrag && e.pointerId !== undefined && e.pointerId !== memberDrag.pointer) return;
    finishMemberDrag();
    if (pendingDayRender) renderDay();
  }
  // Pointer events work in embedded browsers and on touch screens without native drag conflicts.
  dayEl.addEventListener("dragstart", function (e) {
    if (e.target.closest(".assignment-row")) e.preventDefault();
  });
  dayEl.addEventListener("pointerdown", function (e) {
    var row = e.target.closest('.assignment-row[data-drag-player-id]');
    if (!row || e.button !== 0 || !e.isPrimary || !isAdmin() || state.busy || state.spinning) return;
    e.preventDefault();
    finishMemberDrag();
    memberDrag = { row: row, pointer: e.pointerId, id: row.getAttribute("data-drag-player-id"),
      source: Number(row.getAttribute("data-source-team")), x: e.clientX, y: e.clientY, target: null };
    try { if (row.setPointerCapture) row.setPointerCapture(e.pointerId); } catch (ignore) { /* Window listeners still track the drag. */ }
  });
  window.addEventListener("pointermove", function (e) {
    var drag = memberDrag;
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.ghost = document.createElement("div");
      drag.ghost.className = "assignment-drag-preview";
      drag.ghost.textContent = Array.from(drag.row.querySelectorAll(".assignment-name > span:last-child"))
        .map(function (name) { return name.textContent; }).join(" + ");
      drag.ghost.setAttribute("aria-hidden", "true");
      document.body.appendChild(drag.ghost);
      drag.row.classList.add("dragging");
    }
    e.preventDefault();
    drag.ghost.style.left = (e.clientX + 12) + "px";
    drag.ghost.style.top = (e.clientY + 12) + "px";
    clearDropTargets();
    drag.target = teamAtPoint(e.clientX, e.clientY);
    if (drag.target === drag.source) drag.target = null;
    if (drag.target !== null) {
      var targetTeam = dayEl.querySelector('.team[data-team-index="' + drag.target + '"]');
      if (targetTeam) targetTeam.classList.add("drop-target");
    }
  });
  window.addEventListener("pointerup", function (e) {
    if (!memberDrag || e.pointerId !== memberDrag.pointer) return;
    var target = teamAtPoint(e.clientX, e.clientY);
    var drag = finishMemberDrag();
    if (target !== null && target !== drag.source) updateAssignment({ id: drag.id, team: target });
    else if (pendingDayRender) renderDay();
  });
  window.addEventListener("pointercancel", cancelMemberDrag);
  window.addEventListener("blur", cancelMemberDrag);

  /* "Show skill levels" - a leader's own choice, remembered on this device. */
  function applyTiers(on) {
    bandEl.classList.toggle("tiers-on", on);
    toggleEl.setAttribute("aria-pressed", String(on));
  }
  function applyIndex(on) {
    bandEl.classList.toggle("indexes-on", on);
    indexToggleEl.setAttribute("aria-pressed", String(on));
  }
  function syncTierVisibility() {
    var allowed = isAdmin();
    toggleEl.hidden = !allowed;
    indexToggleEl.hidden = !allowed;
    applyTiers(allowed && readPref(TIERS_KEY) === "1");
    applyIndex(allowed && readPref(INDEX_KEY) === "1");
  }
  toggleEl.addEventListener("click", function () {
    if (!isAdmin()) { syncTierVisibility(); return; }
    var on = toggleEl.getAttribute("aria-pressed") !== "true";
    writePref(TIERS_KEY, on ? "1" : "0");
    applyTiers(on);
  });
  indexToggleEl.addEventListener("click", function () {
    if (!isAdmin()) { syncTierVisibility(); return; }
    var on = indexToggleEl.getAttribute("aria-pressed") !== "true";
    writePref(INDEX_KEY, on ? "1" : "0");
    applyIndex(on);
  });
  syncTierVisibility();

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
    if (state.tonight && sessionStarted(state.tonight) !== state.sessionStartedShown) {
      renderTonight();
      if (serverMode()) loadTonight();
    }
    if (!serverMode() || document.hidden) return;
    /* Past midnight, "tonight" is a different day even if nothing changed. */
    if (Date.now() - state.loadedAt > 5 * 60 * 1000) return refreshAll();
    api("GET", "/version").then(function (d) {
      if (d.games !== state.games || d.version !== state.rosterVersion) {
        state.games = d.games;
        state.rosterVersion = d.version;
        refreshAll();
      }
    }, function () { /* offline: try again next time */ });
  }

  /* --------------------------------------------------------------- start -- */

  function boot() {
    syncTierVisibility();
    if (isPreview()) {
      bandEl.hidden = !isAdmin();
      loadTonight().then(function () {
        if (!isAdmin() || !state.tonight) return;
        state.selected = state.selected || state.tonight.today;
        state.month = state.month || state.tonight.today.slice(0, 7);
        refreshLeader();
      });
      return;
    }
    var leader = serverMode() && isAdmin();
    bandEl.hidden = !leader;
    if (!serverMode()) { renderTonight(); renderUpcoming(); return; }
    state.changing = false;
    state.changingUpcoming = false;
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
