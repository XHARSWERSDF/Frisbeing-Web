/* ==========================================================================
   FRISBEING UF - members page
   ========================================================================== */
(function () {
  "use strict";

  if (!(window.FBAuth && FBAuth.user()) && !(window.FBPreview && FBPreview.active())) {
    window.location.replace("admin.html");
    return;
  }

  var el = function (id) { return document.getElementById(id); };
  var roster = [];
  var newTier = "I";
  var newGender = "";
  var newPosition = "c";
  var tierFilter = "all";
  var displayedTier = Object.create(null);

  var isAdmin = function () { return window.FBAuth && FBAuth.isAdmin(); };

  var listEl = el("memberList"),
      headingEl = el("squadHeading"),
      rosInput = el("rosterInput"),
      rosReport = el("rosterReport"),
      addReport = el("addReport"),
      backupReport = el("backupReport");

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function say(target, entries) {
    target.innerHTML = "";
    entries.forEach(function (e) {
      var d = document.createElement("div");
      d.className = "rep " + (e.kind || "good");
      d.innerHTML = e.html;
      target.appendChild(d);
    });
  }

  function list(items, max) {
    max = max || 12;
    var shown = items.slice(0, max).map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("");
    if (items.length > max) shown += "<li>and " + (items.length - max) + " more</li>";
    return "<ul>" + shown + "</ul>";
  }

  function rosterToText(list_) {
    var word = FB.TIER_NAME;
    var gword = { f: "girl", m: "boy" };
    return list_.map(function (m) {
      /* keep gender in the export so it round-trips through load / paste */
      return m.name + (m.gender && gword[m.gender] ? "_" + gword[m.gender] : "") + "_" + word[m.tier] + "_" + FB.POSITION_NAME[FB.position(m)];
    }).join("\n");
  }

  function memberKey(member) { return FB.norm(member.name); }

  /* Keep a row in its current tier group while its controls are being edited.
     Refresh list is the explicit point at which the visible order is updated. */
  function syncDisplayedTiers() {
    var present = Object.create(null);
    roster.forEach(function (member) {
      var key = memberKey(member);
      present[key] = true;
      if (!(key in displayedTier)) displayedTier[key] = member.tier;
    });
    Object.keys(displayedTier).forEach(function (key) {
      if (!present[key]) delete displayedTier[key];
    });
  }

  function refreshDisplayedTiers() {
    displayedTier = Object.create(null);
    syncDisplayedTiers();
  }

  function sortedMembers() {
    syncDisplayedTiers();
    var rank = { A: 0, I: 1, B: 2, U: 3 };
    return roster.filter(function (member) {
      return tierFilter === "all" || tierFilter === "tier" || displayedTier[memberKey(member)] === tierFilter;
    }).sort(function (a, b) {
      var tierOrder = tierFilter === "tier"
        ? (rank[displayedTier[memberKey(a)]] ?? 4) - (rank[displayedTier[memberKey(b)]] ?? 4)
        : 0;
      return tierOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }

  var filterEl = el("rosterFilters");
  filterEl.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-tier-filter]");
    if (!button) return;
    tierFilter = button.getAttribute("data-tier-filter");
    paint();
  });
  el("refreshMemberOrder").addEventListener("click", function () {
    refreshDisplayedTiers();
    paint();
  });

  function save(report) {
    paint();
    return FBStore.saveRoster(roster).then(function (r) {
      if (report && FBStore.serverMode()) {
        say(report, [{ html: "<b>Saved to the server.</b> Everyone sees it within a few seconds." }]);
      }
      paint();
      return r;
    }, function (err) {
      say(report || backupReport, [{ kind: "bad",
        html: "<b>Could not save.</b> " + esc(err && err.message ? err.message : "The server did not respond.") }]);
      throw err;
    });
  }

  /* ------------------------------------------------------------- paint -- */

  function paint() {
    var n = roster.length;

    /* A leader can edit all day and wonder why nobody else sees it. Say so. */
    var warn = el("unpublished");
    if (warn) {
      var pending = isAdmin() && !FBStore.serverMode() && FBStore.hasLocalEdits();
      warn.hidden = !pending;
      if (pending) {
        warn.innerHTML = '<div class="rep warn"><b>These changes are only on this device.</b> ' +
          'Press <b>Publish roster</b> below, then upload the downloaded file to the website ' +
          'so the squad list updates for everyone.</div>';
      }
    }

    var by = { A: 0, I: 0, B: 0, U: 0 };
    var gcount = { f: 0, m: 0, u: 0 };
    roster.forEach(function (m) {
      by[m.tier]++;
      gcount[m.gender === "f" ? "f" : m.gender === "m" ? "m" : "u"]++;
    });
    headingEl.textContent = n
      ? n + "+" + (n === 1 ? " member" : " members")
      : "Nobody yet";

    /* Tell the leader whether gender-balancing can actually run yet. */
    var gnote = el("genderNote");
    if (gnote) {
      if (!n || !isAdmin()) { gnote.hidden = true; }
      else if (gcount.u === 0) {
        gnote.hidden = false;
        gnote.innerHTML = '<div class="rep good">Gender is set for everyone (' +
          gcount.f + ' girls, ' + gcount.m + ' boys). The sorter balances size, skill, gender and position.</div>';
      } else if (gcount.u === n) {
        gnote.hidden = false;
        gnote.innerHTML = '<div class="rep warn"><b>No genders set yet.</b> ' +
          'Tap &#9792; or &#9794; on each member so the sorter can balance boys and girls. ' +
          'Until then it balances by skill only.</div>';
      } else {
        gnote.hidden = false;
        gnote.innerHTML = '<div class="rep warn"><b>' + gcount.u + ' of ' + n +
          ' still need a gender</b> (' + gcount.f + ' girls, ' + gcount.m + ' boys set). ' +
          'Members without one are spread evenly but not counted as boys or girls.</div>';
      }
    }

    listEl.innerHTML = "";
    if (!n) {
      var e = document.createElement("div");
      e.className = "empty";
      e.textContent = "No members yet. Paste your roster above, or load the demo squad to try the sorter.";
      listEl.appendChild(e);
      return;
    }

    Array.prototype.forEach.call(filterEl.querySelectorAll("button[data-tier-filter]"), function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-tier-filter") === tierFilter));
    });
    var shownMembers = sortedMembers();
    if (!shownMembers.length) {
      var empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No members in this tier.";
      listEl.appendChild(empty);
    }
    shownMembers.forEach(function (m) {
      var row = document.createElement("div");
      row.className = "member";

      var nm = document.createElement("span");
      nm.className = "nm";
      nm.textContent = m.name;
      row.appendChild(nm);
      if (isAdmin()) {
        var position = document.createElement("div");
        position.className = "position-buttons";
        position.setAttribute("role", "group");
        position.setAttribute("aria-label", m.name + ": position");
        [["h", "H", "Handle"], ["c", "C", "Cutter"]].forEach(function (spec) {
          var button = document.createElement("button");
          button.type = "button";
          button.innerHTML = "<span>" + spec[1] + "</span>";
          button.title = spec[2];
          button.setAttribute("aria-label", m.name + ": " + spec[2]);
          button.setAttribute("aria-pressed", FB.position(m) === spec[0] ? "true" : "false");
          button.addEventListener("click", function () {
            var target = roster.filter(function (x) { return FB.norm(x.name) === FB.norm(m.name); })[0];
            if (target && FB.position(target) !== spec[0]) { target.position = spec[0]; save(); }
          });
          position.appendChild(button);
        });
        row.appendChild(position);
      }

      /* Skill levels are a leader tool: members see names only. */
      if (!window.FBAuth || !FBAuth.isAdmin()) {
        listEl.appendChild(row);
        return;
      }

      /* Gender toggle: girl / boy. Click the active one again to clear it
         back to unknown. Used only to balance teams. */
      var gen = document.createElement("div");
      gen.className = "gen";
      [["f", "♀", "Girl"], ["m", "♂", "Boy"]].forEach(function (spec) {
        var b = document.createElement("button");
        b.type = "button";
        b.innerHTML = "<span>" + spec[1] + "</span>";
        b.title = spec[2];
        b.setAttribute("aria-label", m.name + ": " + spec[2]);
        b.setAttribute("aria-pressed", m.gender === spec[0] ? "true" : "false");
        b.addEventListener("click", function () {
          var target = roster.filter(function (x) { return FB.norm(x.name) === FB.norm(m.name); })[0];
          if (target) { target.gender = (target.gender === spec[0]) ? "" : spec[0]; save(); }
        });
        gen.appendChild(b);
      });
      row.appendChild(gen);

      var lvl = document.createElement("div");
      lvl.className = "lvl";
      ["A", "I", "B", "U"].forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button";
        b.innerHTML = "<span>" + FB.TIER_NAME[t] + "</span>";
        b.title = FB.TIER_NAME[t];
        b.setAttribute("aria-label", m.name + ": " + FB.TIER_NAME[t]);
        b.setAttribute("aria-pressed", m.tier === t ? "true" : "false");
        b.addEventListener("click", function () {
          var target = roster.filter(function (x) { return FB.norm(x.name) === FB.norm(m.name); })[0];
          if (target) { target.tier = t; save(); }
        });
        lvl.appendChild(b);
      });
      row.appendChild(lvl);

      var del = document.createElement("button");
      del.className = "del";
      del.type = "button";
      del.innerHTML = "&times;";
      del.title = "Remove " + m.name;
      del.setAttribute("aria-label", "Remove " + m.name);
      del.addEventListener("click", function () {
        roster = roster.filter(function (x) { return FB.norm(x.name) !== FB.norm(m.name); });
        save();
      });
      row.appendChild(del);

      listEl.appendChild(row);
    });
  }

  /* -------------------------------------------------------- paste save -- */

  el("saveRoster").addEventListener("click", function () {
    var res = FB.parseRoster(rosInput.value);
    if (!res.members.length) {
      say(rosReport, [{ kind: "bad", html: "<b>Nothing saved.</b> No lines were in the <code>Name_level</code> format." }]);
      return;
    }
    roster = res.members;
    refreshDisplayedTiers();
    save(rosReport);

    var by = { A: 0, I: 0, B: 0, U: 0 };
    roster.forEach(function (m) { by[m.tier]++; });
    var out = [{
      kind: "good",
      html: "<b>Saved " + roster.length + " members.</b> " +
        by.A + " T1, " + by.I + " T2, " + by.B + " T3" + (by.U ? ", " + by.U + " T4" : "") + "."
    }];
    if (res.duplicates.length) {
      out.push({ kind: "warn", html: "<b>" + res.duplicates.length + " duplicate name" +
        (res.duplicates.length === 1 ? "" : "s") + "</b> &mdash; the first entry was kept." + list(res.duplicates) });
    }
    if (res.errors.length) {
      out.push({ kind: "warn", html: "<b>" + res.errors.length + " line" +
        (res.errors.length === 1 ? "" : "s") + " skipped.</b>" +
        list(res.errors.map(function (e) { return "Line " + e.line + ": " + e.text + " — " + e.reason; })) });
    }
    say(rosReport, out);
  });

  el("loadCurrent").addEventListener("click", function () {
    rosInput.value = rosterToText(roster);
    say(rosReport, roster.length
      ? [{ html: "Loaded the current roster into the box. Edit it, then save." }]
      : [{ kind: "warn", html: "There is no roster saved yet." }]);
  });

  /* ----------------------------------------------------------- add one -- */

  var onePositionEl = el("onePosition");
  [["h", "H", "Handle"], ["c", "C", "Cutter"]].forEach(function (spec) {
    var b = document.createElement("button");
    b.type = "button";
    b.innerHTML = "<span>" + spec[1] + "</span>";
    b.title = spec[2];
    b.setAttribute("aria-label", spec[2]);
    b.setAttribute("aria-pressed", spec[0] === newPosition ? "true" : "false");
    b.addEventListener("click", function () {
      newPosition = spec[0];
      Array.prototype.forEach.call(onePositionEl.children, function (button, index) {
        button.setAttribute("aria-pressed", ["h", "c"][index] === newPosition ? "true" : "false");
      });
    });
    onePositionEl.appendChild(b);
  });

  var oneTierEl = el("oneTier");
  ["A", "I", "B", "U"].forEach(function (t) {
    var b = document.createElement("button");
    b.type = "button";
    b.innerHTML = "<span>" + FB.TIER_NAME[t] + "</span>";
    b.setAttribute("aria-pressed", t === newTier ? "true" : "false");
    b.addEventListener("click", function () {
      newTier = t;
      Array.prototype.forEach.call(oneTierEl.children, function (c, i) {
        c.setAttribute("aria-pressed", ["A", "I", "B", "U"][i] === t ? "true" : "false");
      });
    });
    oneTierEl.appendChild(b);
  });

  var oneGenEl = el("oneGender");
  if (oneGenEl) {
    [["f", "♀", "Girl"], ["m", "♂", "Boy"]].forEach(function (spec) {
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = "<span>" + spec[1] + "</span>";
      b.title = spec[2];
      b.setAttribute("aria-label", spec[2]);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        newGender = (newGender === spec[0]) ? "" : spec[0];
        Array.prototype.forEach.call(oneGenEl.children, function (c, i) {
          c.setAttribute("aria-pressed", ["f", "m"][i] === newGender ? "true" : "false");
        });
      });
      oneGenEl.appendChild(b);
    });
  }

  function addOne() {
    var name = el("oneName").value.replace(/\s+/g, " ").trim();
    if (!name) {
      say(addReport, [{ kind: "bad", html: "Type a name first." }]);
      return;
    }
    if (roster.some(function (m) { return FB.norm(m.name) === FB.norm(name); })) {
      say(addReport, [{ kind: "warn", html: "<b>" + esc(name) + "</b> is already on the roster." }]);
      return;
    }
    roster.push({ name: name, tier: newTier, gender: newGender, position: newPosition });
    el("oneName").value = "";
    say(addReport, [{ html: "Added <b>" + esc(name) + "</b> as " +
      (newGender ? FB.GENDER_NAME[newGender].toLowerCase() + ", " : "") +
      FB.TIER_NAME[newTier].toLowerCase() + "." }]);
    save(addReport);
  }

  el("addOne").addEventListener("click", addOne);
  el("oneName").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); addOne(); }
  });

  /* ------------------------------------------------------------ backup -- */

  el("exportJson").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(roster, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "roster.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    say(backupReport, [{ html: "<b>Downloaded a list with " + roster.length + " members.</b> " +
      "Upload this file to the website to make the update visible to everyone." }]);
  });

  el("importJson").addEventListener("change", function (ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      var data;
      try { data = JSON.parse(String(fr.result)); }
      catch (e) {
        say(backupReport, [{ kind: "bad", html: "<b>Could not read that file.</b> It is not valid JSON." }]);
        return;
      }
      if (!Array.isArray(data)) {
        say(backupReport, [{ kind: "bad", html: "<b>Unexpected file.</b> Expected a list of members." }]);
        return;
      }
      var clean = data.filter(function (m) {
        return m && typeof m.name === "string" && FB.TIERS.indexOf(m.tier) >= 0;
      }).map(function (m) { return { name: m.name, tier: m.tier, gender: FB.parseGender(m.gender), position: FB.position(m) }; });
      if (!clean.length) {
        say(backupReport, [{ kind: "bad", html: "<b>No usable members in that file.</b>" }]);
        return;
      }
      roster = clean;
      refreshDisplayedTiers();
      save();
      say(backupReport, [{ html: "<b>Imported " + clean.length + " members.</b>" }]);
    };
    fr.readAsText(file);
    ev.target.value = "";
  });

  el("clearRoster").addEventListener("click", function () {
    if (!roster.length) {
      say(backupReport, [{ kind: "warn", html: "The roster is already empty." }]);
      return;
    }
    if (!window.confirm("Delete all " + roster.length + " members? This cannot be undone.")) return;
    roster = [];
    save();
    say(backupReport, [{ kind: "warn", html: "<b>Roster cleared.</b>" }]);
  });

  if (window.FBAuth) {
    FBAuth.applyBodyState();
    FBAuth.onChange(function () {
      roster = FBStore.getRoster();
      paint();
    });
  }

  FBStore.init().then(function () {
    roster = FBStore.getRoster();
    paint();
    FBStore.startSync();
  });

  /* Someone else added a member: fold it in without losing what is on screen. */
  FBStore.onChange(function (status) {
    var incoming = FBStore.getRoster();
    var a = roster.map(function (m) { return [m.name, m.tier, m.gender, m.position].join("|"); }).sort().join(",");
    var b = incoming.map(function (m) { return [m.name, m.tier, m.gender, m.position].join("|"); }).sort().join(",");
    if (a !== b) { roster = incoming; paint(); }
    var badge = el("syncState");
    if (badge) {
      badge.textContent = status.mode === "server"
        ? (status.online ? "Live \u00b7 " + status.count + " members" : "Offline \u00b7 showing last known")
        : status.count + " members";
    }
  });
})();
