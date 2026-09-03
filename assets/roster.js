/* ==========================================================================
   FRISBEING UF - members page
   ========================================================================== */
(function () {
  "use strict";

  var el = function (id) { return document.getElementById(id); };
  var roster = [];
  var newTier = "I";
  var newGender = "";

  var isAdmin = function () { return window.FBAuth && FBAuth.isAdmin(); };

  var listEl = el("memberList"),
      countEl = el("rosterCount"),
      headingEl = el("squadHeading"),
      rosInput = el("rosterInput"),
      rosReport = el("rosterReport"),
      addReport = el("addReport"),
      backupReport = el("backupReport"),
      pdfReport = el("pdfReport");

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
    var word = { A: "T1", I: "T2", B: "T3" };
    var gword = { f: "girl", m: "boy" };
    return list_.map(function (m) {
      /* keep gender in the export so it round-trips through load / paste */
      return m.name + (m.gender && gword[m.gender] ? "_" + gword[m.gender] : "") + "_" + word[m.tier];
    }).join("\n");
  }

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
    countEl.textContent = n + (n === 1 ? " member" : " members");

    /* A leader can edit all day and wonder why nobody else sees it. Say so. */
    var warn = el("unpublished");
    if (warn) {
      var pending = isAdmin() && !FBStore.serverMode() && FBStore.hasLocalEdits();
      warn.hidden = !pending;
      if (pending) {
        warn.innerHTML = '<div class="rep warn"><b>These changes are only on this device.</b> ' +
          'Press <b>Publish roster</b> below, then replace <code>roster.json</code> on the website ' +
          'so the squad list updates for everyone.</div>';
      }
    }

    var by = { A: 0, I: 0, B: 0 };
    var gcount = { f: 0, m: 0, u: 0 };
    roster.forEach(function (m) {
      by[m.tier]++;
      gcount[m.gender === "f" ? "f" : m.gender === "m" ? "m" : "u"]++;
    });
    headingEl.textContent = n
      ? n + (n === 1 ? " member" : " members")
      : "Nobody yet";

    /* Tell the leader whether gender-balancing can actually run yet. */
    var gnote = el("genderNote");
    if (gnote) {
      if (!n || !isAdmin()) { gnote.hidden = true; }
      else if (gcount.u === 0) {
        gnote.hidden = false;
        gnote.innerHTML = '<div class="rep good">Gender is set for everyone (' +
          gcount.f + ' girls, ' + gcount.m + ' boys). Teams are balanced by gender first, then skill.</div>';
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

    var order = { A: 0, I: 1, B: 2 };
    roster.slice().sort(function (a, b) {
      return order[a.tier] - order[b.tier] || a.name.localeCompare(b.name);
    }).forEach(function (m) {
      var row = document.createElement("div");
      row.className = "member";

      var nm = document.createElement("span");
      nm.className = "nm";
      nm.textContent = m.name;
      row.appendChild(nm);

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
      ["A", "I", "B"].forEach(function (t) {
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
    save(rosReport);

    var by = { A: 0, I: 0, B: 0 };
    roster.forEach(function (m) { by[m.tier]++; });
    var out = [{
      kind: "good",
      html: "<b>Saved " + roster.length + " members.</b> " +
        by.A + " T1, " + by.I + " T2, " + by.B + " T3."
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

  el("loadDemo").addEventListener("click", function () {
    rosInput.value = rosterToText(FBStore.DEMO);
    say(rosReport, [{ html: "<b>Demo squad loaded into the box.</b> Press <b>Save roster</b> to use it, or replace it with your real names first." }]);
  });

  /* --------------------------------------------------------------- pdf --
     The club keeps its name list in Google Docs, so the PDF export is the
     shortest path from "the list changed" to "the website changed". */

  el("pdfFile").addEventListener("change", function (ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;

    el("pdfName").textContent = file.name;
    say(pdfReport, [{ html: "Reading <b>" + esc(file.name) + "</b>&hellip;" }]);

    file.arrayBuffer()
      .then(function (buf) { return FB.pdfToText(new Uint8Array(buf), FB.inflate); })
      .then(function (text) {
        var res = FB.parseRoster(text);
        if (!res.members.length) {
          say(pdfReport, [{
            kind: "bad",
            html: "<b>No names found in that PDF.</b> Lines need to read " +
              "<code>Name_Level</code>, for example <code>Harry Xu_Advanced</code>. " +
              "If the document is a scan or a photo there is no text to read &mdash; " +
              "paste the list into the box below instead."
          }]);
          return;
        }

        roster = res.members;
        save(pdfReport);

        var by = { A: 0, I: 0, B: 0 };
        roster.forEach(function (m) { by[m.tier]++; });
        var out = [{
          kind: "good",
          html: "<b>Read " + roster.length + " members from " + esc(file.name) + ".</b> " +
            by.A + " T1, " + by.I + " T2, " + by.B + " T3. " +
            (FBStore.serverMode()
              ? "Saved to the server \u2014 everyone sees it within a few seconds."
              : "<b>Now press Publish roster</b> below so everyone sees it.")
        }];
        if (res.duplicates.length) {
          out.push({ kind: "warn", html: "<b>" + res.duplicates.length + " duplicate name" +
            (res.duplicates.length === 1 ? "" : "s") + "</b> &mdash; the first was kept." + list(res.duplicates) });
        }
        if (res.errors.length) {
          out.push({ kind: "warn", html: "<b>" + res.errors.length + " line" +
            (res.errors.length === 1 ? "" : "s") + " skipped.</b>" +
            list(res.errors.map(function (e) { return e.text + " \u2014 " + e.reason; })) });
        }
        say(pdfReport, out);
      })
      .catch(function (err) {
        say(pdfReport, [{
          kind: "bad",
          html: "<b>Could not read that PDF.</b> " + esc(err && err.message ? err.message : "") +
            " Paste the list into the box below instead."
        }]);
      });
  });

  /* ----------------------------------------------------------- add one -- */

  var oneTierEl = el("oneTier");
  ["A", "I", "B"].forEach(function (t) {
    var b = document.createElement("button");
    b.type = "button";
    b.innerHTML = "<span>" + FB.TIER_NAME[t] + "</span>";
    b.setAttribute("aria-pressed", t === newTier ? "true" : "false");
    b.addEventListener("click", function () {
      newTier = t;
      Array.prototype.forEach.call(oneTierEl.children, function (c, i) {
        c.setAttribute("aria-pressed", ["A", "I", "B"][i] === t ? "true" : "false");
      });
    });
    oneTierEl.appendChild(b);
  });

  var oneGenEl = el("oneGender");
  if (oneGenEl) {
    [["f", "Girl"], ["m", "Boy"]].forEach(function (spec) {
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = "<span>" + spec[1] + "</span>";
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
    roster.push({ name: name, tier: newTier, gender: newGender });
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
    say(backupReport, [{ html: "<b>Downloaded roster.json with " + roster.length + " members.</b> " +
      "Replace <code>roster.json</code> on the website with this file, and everyone will see the update." }]);
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
        return m && typeof m.name === "string" && ["A", "I", "B"].indexOf(m.tier) >= 0;
      }).map(function (m) { return { name: m.name, tier: m.tier }; });
      if (!clean.length) {
        say(backupReport, [{ kind: "bad", html: "<b>No usable members in that file.</b>" }]);
        return;
      }
      roster = clean;
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
    var a = roster.map(function (m) { return m.name + "|" + m.tier; }).sort().join(",");
    var b = incoming.map(function (m) { return m.name + "|" + m.tier; }).sort().join(",");
    if (a !== b) { roster = incoming; paint(); }
    var badge = el("syncState");
    if (badge) {
      badge.textContent = status.mode === "server"
        ? (status.online ? "Live \u00b7 " + status.count + " members" : "Offline \u00b7 showing last known")
        : status.count + " members";
    }
  });
})();
