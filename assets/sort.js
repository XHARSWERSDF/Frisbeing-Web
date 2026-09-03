/* ==========================================================================
   FRISBEING UF - sorter page
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var el = function (id) { return document.getElementById(id); };
  var modesEl = el("modes"), blurbEl = el("modeBlurb"), stepsEl = el("steps"),
      previewEl = el("preview"), noticeEl = el("notice"), resultsEl = el("results"),
      metaEl = el("meta"), toggleEl = el("tiersToggle"), progEl = el("prog"),
      disc = el("disc"), sorterEl = el("sorter"), actionsEl = el("resultActions"),
      attInput = el("attendanceInput"), attReport = el("attendanceReport"),
      rosInput = el("rosterInput"), rosReport = el("rosterReport"),
      rosterCount = el("rosterCount"), rosterState = el("rosterState"),
      rosterPanel = el("rosterPanel"), publicMsg = el("publicMsg"),
      sharedBanner = el("sharedBanner");

  var isAdmin = function () { return window.FBAuth && FBAuth.isAdmin(); };

  var roster = [];
  var present = null;              /* null = attendance not read yet */
  var lastTeams = null;
  var mode = FBStore.getPref("mode", "fair");
  var count = FBStore.getPref("teams", 3);
  if (!FB.MODES[mode]) mode = "fair";
  if ([2, 3, 4, 5, 6].indexOf(count) < 0) count = 3;

  /* ------------------------------------------------------------ report -- */

  function say(target, entries) {
    target.innerHTML = "";
    entries.forEach(function (e) {
      var d = document.createElement("div");
      d.className = "rep " + (e.kind || "good");
      d.innerHTML = e.html;
      target.appendChild(d);
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function list(items, max) {
    max = max || 12;
    var shown = items.slice(0, max).map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("");
    if (items.length > max) shown += "<li>and " + (items.length - max) + " more</li>";
    return "<ul>" + shown + "</ul>";
  }

  /* ------------------------------------------------------------ roster -- */

  function rosterLabel() {
    var n = roster.length;
    rosterCount.textContent = n + (n === 1 ? " member" : " members");
    if (!n) {
      rosterState.textContent = "No roster yet";
    } else if (present) {
      rosterState.textContent = present.length + " of " + n + " in";
    } else {
      rosterState.textContent = n + " on the roster";
    }
  }

  function rosterToText(list_) {
    var word = { A: "advance", I: "intermediate", B: "beginner" };
    return list_.map(function (m) { return m.name + "_" + word[m.tier]; }).join("\n");
  }

  el("saveRoster").addEventListener("click", function () {
    var res = FB.parseRoster(rosInput.value);
    var out = [];

    if (!res.members.length) {
      out.push({ kind: "bad", html: "<b>Nothing saved.</b> No lines were in the <code>Name_level</code> format." });
      say(rosReport, out);
      return;
    }

    roster = res.members;
    FBStore.setRoster(roster);
    present = null;
    lastTeams = null;
    resultsEl.innerHTML = "";
    metaEl.textContent = "";
    actionsEl.hidden = true;

    var byTier = { A: 0, I: 0, B: 0 };
    roster.forEach(function (m) { byTier[m.tier]++; });
    out.push({
      kind: "good",
      html: "<b>Saved " + roster.length + " members.</b> " +
        byTier.A + " advanced, " + byTier.I + " intermediate, " + byTier.B + " beginner."
    });
    if (res.duplicates.length) {
      out.push({
        kind: "warn",
        html: "<b>" + res.duplicates.length + " duplicate name" + (res.duplicates.length === 1 ? "" : "s") +
          "</b> &mdash; the first entry was kept." + list(res.duplicates)
      });
    }
    if (res.errors.length) {
      out.push({
        kind: "warn",
        html: "<b>" + res.errors.length + " line" + (res.errors.length === 1 ? "" : "s") +
          " skipped.</b>" + list(res.errors.map(function (e) { return "Line " + e.line + ": " + e.text + " — " + e.reason; }))
      });
    }
    say(rosReport, out);
    rosterLabel();
    refresh();
  });

  el("loadCurrent").addEventListener("click", function () {
    rosInput.value = rosterToText(roster);
    say(rosReport, roster.length
      ? [{ html: "Loaded the current roster into the box. Edit it, then save." }]
      : [{ kind: "warn", html: "There is no roster saved yet." }]);
  });

  el("loadDemo").addEventListener("click", function () {
    rosInput.value = rosterToText(FBStore.DEMO);
    say(rosReport, [{ html: "<b>Demo squad loaded into the box.</b> Press <b>Save roster</b> to use it, or replace it with your real names first." }]);
  });

  /* -------------------------------------------------------- attendance -- */

  function readAttendance() {
    if (!roster.length) {
      say(attReport, [{ kind: "bad", html: "<b>Add the club roster first.</b> Open <b>Club roster</b> below and paste your members as <code>Name_level</code>." }]);
      return;
    }
    var res = FB.parseAttendance(attInput.value, roster);
    var out = [];

    if (!res.read) {
      say(attReport, [{ kind: "bad", html: "<b>No names found.</b> Paste the sign-up list, one name per line." }]);
      return;
    }

    present = res.present;
    lastTeams = null;
    resultsEl.innerHTML = "";
    metaEl.textContent = "";
    actionsEl.hidden = true;

    var byTier = { A: 0, I: 0, B: 0 };
    present.forEach(function (m) { byTier[m.tier]++; });

    out.push({
      kind: present.length ? "good" : "bad",
      html: "<b>" + present.length + " of " + roster.length + " playing.</b> " +
        byTier.A + " advanced, " + byTier.I + " intermediate, " + byTier.B + " beginner."
    });
    if (res.duplicates.length) {
      out.push({ kind: "warn", html: "<b>Listed twice, counted once:</b>" + list(res.duplicates) });
    }
    if (res.ambiguous.length) {
      out.push({
        kind: "warn",
        html: "<b>Too vague to place</b> &mdash; write the full name and read the list again." +
          list(res.ambiguous.map(function (a) { return a.input + " — could be " + a.options.join(" or "); }))
      });
    }
    if (res.unmatched.length) {
      out.push({
        kind: "warn",
        html: "<b>Not on the roster</b> &mdash; check the spelling, or add them under Members." +
          list(res.unmatched)
      });
    }
    say(attReport, out);
    rosterLabel();
    refresh();
  }

  el("readAttendance").addEventListener("click", readAttendance);

  el("allIn").addEventListener("click", function () {
    if (!roster.length) {
      say(attReport, [{ kind: "bad", html: "<b>Add the club roster first.</b>" }]);
      return;
    }
    present = roster.slice();
    lastTeams = null;
    resultsEl.innerHTML = "";
    actionsEl.hidden = true;
    var byTier = { A: 0, I: 0, B: 0 };
    present.forEach(function (m) { byTier[m.tier]++; });
    say(attReport, [{ html: "<b>All " + present.length + " members playing.</b> " +
      byTier.A + " advanced, " + byTier.I + " intermediate, " + byTier.B + " beginner." }]);
    rosterLabel();
    refresh();
  });

  el("clearAttendance").addEventListener("click", function () {
    attInput.value = "";
    present = null;
    lastTeams = null;
    resultsEl.innerHTML = "";
    metaEl.textContent = "";
    actionsEl.hidden = true;
    attReport.innerHTML = "";
    rosterLabel();
    refresh();
  });

  /* -------------------------------------------------------------- modes -- */

  Object.keys(FB.MODES).forEach(function (key) {
    var b = document.createElement("button");
    b.type = "button";
    b.innerHTML = "<span>" + FB.MODES[key].label + "</span>";
    b.setAttribute("aria-pressed", key === mode ? "true" : "false");
    b.addEventListener("click", function () {
      mode = key;
      FBStore.setPref("mode", key);
      Array.prototype.forEach.call(modesEl.children, function (c, i) {
        c.setAttribute("aria-pressed", Object.keys(FB.MODES)[i] === key ? "true" : "false");
      });
      clearResults();
      refresh();
    });
    modesEl.appendChild(b);
  });

  [2, 3, 4, 5, 6].forEach(function (n) {
    var b = document.createElement("button");
    b.type = "button";
    b.innerHTML = "<span>" + n + "</span>";
    b.setAttribute("aria-pressed", n === count ? "true" : "false");
    b.setAttribute("aria-label", n + " teams");
    b.addEventListener("click", function () {
      count = n;
      FBStore.setPref("teams", n);
      Array.prototype.forEach.call(stepsEl.children, function (c, i) {
        c.setAttribute("aria-pressed", [2, 3, 4, 5, 6][i] === n ? "true" : "false");
      });
      clearResults();
      refresh();
    });
    stepsEl.appendChild(b);
  });

  toggleEl.addEventListener("click", function () {
    var on = toggleEl.getAttribute("aria-pressed") !== "true";
    toggleEl.setAttribute("aria-pressed", on ? "true" : "false");
    sorterEl.classList.toggle("show-tiers", on);
    FBStore.setPref("showTiers", on);
  });
  if (FBStore.getPref("showTiers", false)) {
    toggleEl.setAttribute("aria-pressed", "true");
    sorterEl.classList.add("show-tiers");
  }

  /* ------------------------------------------------------------- state -- */

  function clearResults() {
    sharedBanner.hidden = true;
    if (location.hash) history.replaceState(null, "", location.pathname);
    resultsEl.innerHTML = "";
    metaEl.textContent = "";
    actionsEl.hidden = true;
    lastTeams = null;
  }

  function players() { return present || []; }

  function refresh() {
    blurbEl.textContent = FB.MODES[mode].blurb;

    /* Members can throw the disc; only leaders get teams out of it. */
    if (!isAdmin()) {
      disc.disabled = false;
      noticeEl.textContent = "";
      previewEl.textContent = "";
      return;
    }

    if (!roster.length) {
      noticeEl.textContent = "Add your club roster to get started — open Club roster above.";
      previewEl.textContent = "";
      disc.disabled = true;
      return;
    }
    if (!present) {
      noticeEl.textContent = "Read tonight's attendance list, or press “Everyone is in”.";
      previewEl.textContent = "";
      disc.disabled = true;
      return;
    }

    var built = FB.build(players(), mode, count);
    if (built.error) {
      noticeEl.textContent = built.error;
      previewEl.textContent = "";
      disc.disabled = true;
      return;
    }

    noticeEl.textContent = "";
    disc.disabled = false;
    var base = Math.floor(built.playing / count), rem = built.playing % count, sizes = [];
    for (var i = 0; i < count; i++) sizes.push(base + (i < rem ? 1 : 0));
    previewEl.textContent = built.playing + " playing → " + sizes.join(" / ") + " per team";
  }

  /* ------------------------------------------------------------ render -- */

  function render(built, shared) {
    resultsEl.innerHTML = "";
    built.teams.forEach(function (team, i) {
      var c = FB.counts(team);
      var card = document.createElement("div");
      card.className = "team";
      card.style.animationDelay = (reduce ? 0 : i * 70) + "ms";

      var hd = document.createElement("div");
      hd.className = "team-hd";
      hd.innerHTML = '<span class="nm">Team ' + String.fromCharCode(65 + i) + '</span>' +
                     '<span class="ct">' + team.length + ' players</span>';
      card.appendChild(hd);

      var ol = document.createElement("ol");
      team.slice().sort(function (a, b) {
        return FB.WEIGHT[b.tier] - FB.WEIGHT[a.tier] || a.name.localeCompare(b.name);
      }).forEach(function (p) {
        var li = document.createElement("li");
        if (!shared) {
          var sp = document.createElement("span");
          sp.className = "tier " + p.tier;
          sp.textContent = FB.TIER_NAME[p.tier];
          sp.title = FB.TIER_NAME[p.tier];
          li.appendChild(sp);
        }
        li.appendChild(document.createTextNode(p.name));
        ol.appendChild(li);
      });
      card.appendChild(ol);

      var bal = document.createElement("div");
      bal.className = "bal" + (shared ? " hidden-shared" : "");
      bal.innerHTML = '<span>' + (c.f + c.m > 0 ? c.f + '\u2640 ' + c.m + '\u2642 &middot; ' : '') + c.A + ' T1 &middot; ' + c.I + ' T2 &middot; ' + c.B + ' T3</span>' +
                      '<span>Score <b>' + FB.score(team) + '</b></span>';
      card.appendChild(bal);
      resultsEl.appendChild(card);
    });

    metaEl.textContent = built.benched > 0 ? built.benched + " not in this draw" : "";
    actionsEl.hidden = !!shared;
    lastTeams = built.teams;
  }

  function run() {
    var built = FB.sort(players(), mode, count);
    if (built.error) {
      noticeEl.textContent = built.error;
      clearResults();
      return;
    }
    noticeEl.textContent = "";
    if (reduce) { render(built); publishTeams(built.teams); return; }
    clearResults();
    disc.classList.remove("landed");
    disc.classList.add("spinning");
    progEl.classList.add("on");
    window.setTimeout(function () {
      disc.classList.remove("spinning");
      disc.classList.add("landed");
      progEl.classList.remove("on");
      render(built);
      publishTeams(built.teams);
    }, 1900);
  }

  /* Push the draw so every open page picks it up on its next check. */
  function publishTeams(teams) {
    if (!FBStore.serverMode()) return;
    FBStore.saveTeams(teams, mode).then(function () {
      sharedBanner.hidden = false;
      sharedBanner.innerHTML = "<b>Posted.</b> Everyone on the site sees these teams within a few seconds.";
    }, function (err) {
      sharedBanner.hidden = false;
      sharedBanner.innerHTML = "<b>Sorted, but not posted.</b> " +
        esc(err && err.message ? err.message : "The server did not respond.") +
        " Use Share link instead.";
    });
  }

  disc.addEventListener("click", function () {
    if (disc.disabled) return;
    if (!isAdmin()) { spinOnly(); return; }
    run();
  });

  /* The throw with no draw behind it. */
  function spinOnly() {
    publicMsg.hidden = true;
    if (reduce) { showPublicMsg(); return; }
    disc.classList.remove("landed");
    disc.classList.add("spinning");
    progEl.classList.add("on");
    window.setTimeout(function () {
      disc.classList.remove("spinning");
      disc.classList.add("landed");
      progEl.classList.remove("on");
      showPublicMsg();
    }, 1900);
  }

  function showPublicMsg() {
    publicMsg.innerHTML = "Nice throw. Teams are drawn by the club leaders \u2014 " +
      '<a href="admin.html">sign in</a> if that is you.';
    publicMsg.hidden = false;
  }
  el("reshuffle").addEventListener("click", run);

  el("copyText").addEventListener("click", function () {
    if (!lastTeams) return;
    var showTiers = toggleEl.getAttribute("aria-pressed") === "true";
    var btn = el("copyText");
    copyToClipboard(FB.toText(lastTeams, { tiers: showTiers }), function (ok) {
      btn.innerHTML = "<span>" + (ok ? "Copied" : "Copy failed") + "</span>";
      window.setTimeout(function () { btn.innerHTML = "<span>Copy teams</span>"; }, 1600);
    });
  });

  /* -------------------------------------------------------- share link --
     A static site has nowhere to keep tonight's draw, so it travels in the
     link. Anyone who opens it sees the teams, leader or not. */

  function shareUrl() {
    if (!lastTeams) return null;
    return location.origin + location.pathname + "#teams=" + FB.encodeTeams(lastTeams, mode);
  }

  el("shareLink").addEventListener("click", function () {
    var url = shareUrl();
    if (!url) return;
    var btn = el("shareLink");
    copyToClipboard(url, function (ok) {
      btn.innerHTML = "<span>" + (ok ? "Link copied" : "Copy it below") + "</span>";
      window.setTimeout(function () { btn.innerHTML = "<span>Share link</span>"; }, 2000);
      /* Clipboard access is refused in some mobile browsers, so never leave
         the leader with nothing - show the link to copy by hand. */
      if (!ok) {
        var box = el("shareFallback");
        box.hidden = false;
        box.value = url;
        box.focus();
        box.select();
      }
    });
  });

  function copyToClipboard(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      done(ok);
    }
  }

  /* Show teams carried in the link. Returns true if it handled the page. */
  function showSharedTeams() {
    var m = /[#&]teams=([A-Za-z0-9_-]+)/.exec(location.hash || "");
    if (!m) return false;
    var data = FB.decodeTeams(m[1]);
    if (!data) {
      sharedBanner.hidden = false;
      sharedBanner.innerHTML = "<b>That shared link could not be read.</b> Ask for a fresh one.";
      return true;
    }
    var when = data.d ? new Date(data.d) : null;
    var label = FB.MODES[data.m] ? FB.MODES[data.m].label : "Teams";
    sharedBanner.hidden = false;
    sharedBanner.innerHTML = "<b>" + label + "</b> shared by a club leader" +
      (when ? " &middot; " + when.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
        " " + when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");
    render({ teams: data.teams, benched: 0 }, true);
    publicMsg.hidden = true;
    return true;
  }

  window.addEventListener("hashchange", function () {
    if (!showSharedTeams()) { sharedBanner.hidden = true; resultsEl.innerHTML = ""; }
  });

  /* -------------------------------------------------------------- boot -- */

  if (window.FBAuth) {
    FBAuth.applyBodyState();
    FBAuth.onChange(function () {
      publicMsg.hidden = true;
      roster = FBStore.getRoster(isAdmin());
      rosterLabel();
      refresh();
    });
  }

  /* Load the published roster before painting, so a leader who has not edited
     anything on this device still starts from the club's real squad. */
  FBStore.init().then(function () {
    roster = FBStore.getRoster();
    if (roster.length) rosterPanel.removeAttribute("open");
    else rosterPanel.setAttribute("open", "");
    rosterLabel();
    refresh();
    /* A link in the address bar wins; otherwise show whatever draw the
       server currently holds, so a member just opening the page sees it. */
    if (!showSharedTeams()) showServerTeams();
    FBStore.startSync();
  });

  /* The server changed under us - a leader somewhere sorted, or edited the
     squad. Fold it in without stamping on a draw the leader is looking at. */
  FBStore.onChange(function () {
    var incoming = FBStore.getRoster();
    var a = roster.map(function (m) { return m.name + "|" + m.tier; }).sort().join(",");
    var b = incoming.map(function (m) { return m.name + "|" + m.tier; }).sort().join(",");
    if (a !== b) { roster = incoming; rosterLabel(); refresh(); }
    if (!lastTeams && !/[#&]teams=/.test(location.hash || "")) showServerTeams();
  });

  /* Draw the team list the server is holding, if any. */
  function showServerTeams() {
    var t = FBStore.teams();
    if (!t || !t.teams || !t.teams.length) return false;
    var built = {
      teams: t.teams.map(function (names) {
        return names.map(function (n) { return { name: String(n), tier: "I" }; });
      }),
      benched: 0
    };
    var when = t.at ? new Date(t.at) : null;
    var label = FB.MODES[t.mode] ? FB.MODES[t.mode].label : "Teams";
    sharedBanner.hidden = false;
    sharedBanner.innerHTML = "<b>" + label + "</b> \u00b7 tonight's draw" +
      (when ? " &middot; " + when.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
        " " + when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");
    render(built, true);
    publicMsg.hidden = true;
    return true;
  }
})();
