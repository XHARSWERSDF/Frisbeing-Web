/* ==========================================================================
   FRISBEING UF - sorting engine and list parsers
   Plain script, no build step. Attaches to window.FB (and module.exports so
   the test harness can require it).
   ========================================================================== */
(function (root) {
  "use strict";

  var FB = {};

  /* Internal tier codes: A=T1, I=T2, B=T3, U=T4. */
  FB.TIERS = ["A", "I", "B", "U"];
  FB.TIER_NAME = { A: "T1", I: "T2", B: "T3", U: "T4" };
  FB.WEIGHT = { A: 4, I: 3.3, B: 2, U: 1.5 };
  FB.POSITION_NAME = { h: "Handle", c: "Cutter" };
  FB.parsePosition = function (raw) {
    var v = norm(raw);
    return ["h", "handle", "handler"].indexOf(v) >= 0 ? "h"
      : ["c", "cut", "cutter"].indexOf(v) >= 0 ? "c" : null;
  };
  FB.position = function (p) { return FB.parsePosition(p && p.position) || "c"; };

  FB.MODES = {
    fair: {
      key: "fair",
      label: "Fair teams",
      tiers: ["A", "I", "B"],
      anchorA: 0,
      blurb: "Keep attending teammates together, balance the Fris Index, total size and gender, with an index gap of at most 2."
    },
    tournament: {
      key: "tournament",
      label: "Tournament pool",
      tiers: ["A", "I"],
      anchorA: 0,
      blurb: "Top two tiers only — T1 and T2. T3 and unclassified players sit this one out."
    },
    elite: {
      key: "elite",
      label: "Elite pool",
      tiers: ["A", "I", "B"],
      anchorA: 0,
      /* The squad itself. Only people named here are drawn; everyone else sits
         out. Names must match the roster (case and spacing do not matter), so
         update this list when someone joins, leaves or is renamed. */
      members: [
        "Harry Xu", "Michael Cheng", "Jason Xu", "Jason Luo", "Shopping Deng",
        "Justin He", "Carina Zheng", "Yan Li", "Eva Song", "Kristy Gai",
        "Elsa Li", "Ingram Xie", "Kevin Xiao", "Shawn Ai"
      ],
      blurb: "The elite squad only, balanced by gender first, then across tiers. Everyone else sits this one out."
    },
    beginner: {
      key: "beginner",
      label: "Development",
      tiers: ["I", "B"],
      anchorA: 1,
      blurb: "T2 and T3 players, plus one T1 player anchoring each team."
    }
  };

  /* ---------------------------------------------------------------- text --
     Names may be Latin or CJK, so normalisation keeps letters and digits in
     any script and throws away everything else (spaces, dots, punctuation).
     -------------------------------------------------------------------- */

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }
  FB.norm = norm;

  function tidySpace(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  /* ---------------------------------------------------------------- tier -- */

  var TIER_WORDS = {
    A: ["t1", "tier1", "tierone", "advanced", "advance", "adv", "a", "high", "expert", "elite", "高级", "高"],
    I: ["t2", "tier2", "tiertwo", "intermediate", "intermediates", "inter", "int", "i", "mid", "middle", "medium", "中级", "中"],
    B: ["t3", "tier3", "tierthree", "beginner", "beginners", "begin", "beg", "b", "new", "novice", "rookie", "starter", "初级", "初", "新手"],
    U: ["t4", "tier4", "tierfour", "u", "unclassified"]
  };

  FB.parseTier = function (raw) {
    var v = norm(raw);
    if (!v) return null;
    var t, i;
    for (t in TIER_WORDS) {
      if (!Object.prototype.hasOwnProperty.call(TIER_WORDS, t)) continue;
      for (i = 0; i < TIER_WORDS[t].length; i++) {
        if (v === norm(TIER_WORDS[t][i])) return t;
      }
    }
    /* tolerate things like "advanced player" or "lvl advanced" */
    for (t in TIER_WORDS) {
      if (!Object.prototype.hasOwnProperty.call(TIER_WORDS, t)) continue;
      for (i = 0; i < TIER_WORDS[t].length; i++) {
        var w = norm(TIER_WORDS[t][i]);
        if (w.length > 2 && v.indexOf(w) !== -1) return t;
      }
    }
    return null;
  };

  /* -------------------------------------------------------------- gender --
     Optional. Only used to balance boys and girls across teams. A bare "b"
     is deliberately NOT a gender word, because it already means Beginner. */

  var GENDER_WORDS = {
    f: ["female", "f", "girl", "girls", "woman", "women", "w", "lady", "ladies", "女", "女生", "g"],
    m: ["male", "m", "boy", "boys", "man", "men", "guy", "guys", "男", "男生"]
  };

  FB.GENDER_NAME = { f: "Girl", m: "Boy", "": "Unknown" };

  FB.parseGender = function (raw) {
    var v = norm(raw);
    if (!v) return "";
    var g, i;
    for (g in GENDER_WORDS) {
      if (!Object.prototype.hasOwnProperty.call(GENDER_WORDS, g)) continue;
      for (i = 0; i < GENDER_WORDS[g].length; i++) {
        if (v === norm(GENDER_WORDS[g][i])) return g;
      }
    }
    return "";
  };

  /* -------------------------------------------------------------- roster --
     One per line. The documented format is "Harry Xu_advance", and now
     optionally "Harry Xu_girl_advance" (name, then level and/or gender in
     any order). Also accepts a comma, colon, tab, pipe, or spaced hyphen.
     -------------------------------------------------------------------- */

  var ROSTER_SPLIT = /^(.*?)(?:_|\s[-–—]\s|[,:：\t|])([^_,:：\t|]*)$/;

  FB.parseRoster = function (text) {
    var lines = String(text || "").split(/\r?\n/);
    var members = [];
    var errors = [];
    var duplicates = [];
    var seen = {};

    lines.forEach(function (raw, idx) {
      var line = tidySpace(raw);
      if (!line) return;
      if (isHeading(line)) return;

      var name = null, attrs = [];

      /* Names do not contain underscores, so the name is everything before the
         first underscore and the rest are attributes (level and/or gender in
         any order). Falls back to the old single-separator split. */
      if (line.indexOf("_") !== -1) {
        var bits = line.split("_");
        name = bits.shift();
        attrs = bits;
      } else {
        var m = ROSTER_SPLIT.exec(line);
        if (m) { name = m[1]; attrs = [m[2]]; }
        else { name = line; attrs = []; }
      }

      name = tidySpace(stripDecoration(name || ""));

      var tier = null, gender = "", position = "c";
      attrs.forEach(function (a) {
        var pos = FB.parsePosition(a);
        if (pos) { position = pos; return; }
        var t = FB.parseTier(a);
        if (t && !tier) { tier = t; return; }
        var g = FB.parseGender(a);
        if (g && !gender) gender = g;
      });

      if (!name) {
        errors.push({ line: idx + 1, text: line, reason: "No name found" });
        return;
      }
      if (!tier) {
        var joined = tidySpace(attrs.join(" "));
        errors.push({
          line: idx + 1, text: line,
          reason: !joined
            ? "No level - add _advance, _intermediate or _beginner"
            : 'Level "' + joined + '" not recognised'
        });
        return;
      }

      var key = norm(name);
      if (seen[key]) {
        duplicates.push(name);
        return;
      }
      seen[key] = true;
      members.push({ name: name, tier: tier, gender: gender, position: position });
    });

    return { members: members, errors: errors, duplicates: duplicates };
  };

  /* ---------------------------------------------------------- attendance --
     People paste sign-up lists straight out of a group chat, so the input is
     numbered, ticked, annotated and padded with chatter. Strip all of it and
     keep the name.
     -------------------------------------------------------------------- */

  var HEADING_WORDS = [
    "attendance", "attending", "present", "list", "roster", "lineup", "line up",
    "training", "practice", "session", "tonight", "today", "tomorrow", "signup",
    "sign up", "sign-up", "who is coming", "whos coming", "who's coming", "players",
    "接龙", "名单", "报名", "参加", "今天",
    "明天", "训练", "出席", "来的人"
  ];

  function isHeading(line) {
    var v = norm(line);
    if (!v) return true;
    /* pure digits, times, dates */
    if (/^\d+$/.test(v)) return true;
    if (/^\d{1,2}[:：]\d{2}/.test(tidySpace(line))) return true;
    for (var i = 0; i < HEADING_WORDS.length; i++) {
      var w = norm(HEADING_WORDS[i]);
      if (w && v === w) return true;
      /* a heading normally ends in a colon: "Tonight's training:" */
      if (w && v.indexOf(w) !== -1 && /[:：]\s*$/.test(line)) return true;
    }
    return false;
  }

  /* remove numbering, mentions, ticks, emoji, notes and trailing counters */
  function stripDecoration(s) {
    var out = String(s || "");
    out = out.replace(/^\s*[\(\[（【]?\s*\d+\s*[\)\]）】\.、,:：\-–—]+\s*/, "");
    out = out.replace(/^\s*[-–—\*•·●○▸>]+\s*/, "");
    out = out.replace(/^\s*@\s*/, "");
    out = out.replace(/\s*\+\s*\d+\s*$/, "");
    out = out.replace(/\p{Extended_Pictographic}/gu, " ");
    out = out.replace(/[☀-➿⬀-⯿️‍✅❌✔✖]/g, " ");
    /* a note after a spaced dash: "Cindy Lin - leaving early" */
    out = out.replace(/\s[-–—]\s.*$/, "");
    out = out.replace(/^[\s\.,:：、;；\-–—]+/, "");
    out = out.replace(/[\s\.,:：、;；\-–—]+$/, "");
    return tidySpace(out);
  }
  FB.stripDecoration = stripDecoration;

  FB.extractNames = function (text) {
    var t = String(text || "");
    /* drop bracketed asides first, before splitting, so "(late, maybe)"
       cannot be broken in half by the comma split */
    t = t.replace(/[\(（\[【][^\)）\]】]*[\)）\]】]/g, " ");
    var parts = t.split(/[\n\r;；,，、]+/);
    var names = [];
    parts.forEach(function (p) {
      if (isHeading(p)) return;
      var cleaned = stripDecoration(p);
      if (!cleaned) return;
      if (isHeading(cleaned)) return;
      /* must contain at least one letter */
      if (!/\p{L}/u.test(cleaned)) return;
      /* absurdly long lines are sentences, not names */
      if (cleaned.length > 40) return;
      names.push(cleaned);
    });
    return names;
  };

  /* Match a written name against the roster: exact, then spacing-insensitive,
     then a unique prefix, then a unique substring. Anything with more than one
     candidate is reported rather than guessed. */
  FB.matchName = function (input, members) {
    var v = norm(input);
    if (!v) return { status: "unmatched" };

    var exact = members.filter(function (m) { return norm(m.name) === v; });
    if (exact.length === 1) return { status: "ok", member: exact[0] };
    if (exact.length > 1) return { status: "ambiguous", options: exact };

    var pref = members.filter(function (m) { return norm(m.name).indexOf(v) === 0; });
    if (pref.length === 1) return { status: "ok", member: pref[0] };
    if (pref.length > 1) return { status: "ambiguous", options: pref };

    var sub = members.filter(function (m) {
      var n = norm(m.name);
      return n.indexOf(v) !== -1 || v.indexOf(n) !== -1;
    });
    if (sub.length === 1) return { status: "ok", member: sub[0] };
    if (sub.length > 1) return { status: "ambiguous", options: sub };

    return { status: "unmatched" };
  };

  /* Anyone the roster does not know still plays. They come back as
     unclassified players (tier U) instead of being left out of the draw. */
  FB.parseAttendance = function (text, members) {
    var names = FB.extractNames(text);
    var present = [];
    var unclassified = [];
    var ambiguous = [];
    var duplicates = [];
    var taken = {};

    names.forEach(function (raw) {
      var res = FB.matchName(raw, members);
      if (res.status === "ok") {
        var key = norm(res.member.name);
        if (taken[key]) { duplicates.push(raw); return; }
        taken[key] = true;
        present.push(res.member);
      } else if (res.status === "ambiguous") {
        ambiguous.push({ input: raw, options: res.options.map(function (m) { return m.name; }) });
      } else {
        if (taken[norm(raw)]) { duplicates.push(raw); return; }
        taken[norm(raw)] = true;
        unclassified.push({ name: raw, tier: "U", gender: "" });
      }
    });

    return {
      present: present,
      unclassified: unclassified,
      ambiguous: ambiguous,
      duplicates: duplicates,
      read: names.length
    };
  };

  /* ----------------------------------------------------------- sorting -- */

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  FB.shuffle = shuffle;

  FB.teammateBonus = function (players) {
    var tiers = { A: 0, I: 0, B: 0, U: 0 };
    players.forEach(function (p) { tiers[p.tier in tiers ? p.tier : "U"]++; });
    // One bonus per registered teammate group: the highest eligible bonus.
    return Math.max(tiers.A >= 2 ? 2 : 0, tiers.I >= 2 ? 1 : 0,
      tiers.A >= 1 && tiers.I >= 1 ? 2 : 0);
  };

  function score(team) {
    var groups = new Map(), total = 0;
    team.forEach(function (p) {
      total += FB.WEIGHT[p.tier] || FB.WEIGHT.U;
      if (!p.teammateGroupId) return;
      if (!groups.has(p.teammateGroupId)) groups.set(p.teammateGroupId, []);
      groups.get(p.teammateGroupId).push(p);
    });
    groups.forEach(function (members) { total += FB.teammateBonus(members); });
    return Math.round(total * 10) / 10;
  }
  FB.score = score;
  FB.frisIndex = score;

  // Only people supplied in the attendance list participate in a group.
  FB.attendanceUnits = function (players) {
    var units = [], grouped = new Map();
    players.forEach(function (p) {
      if (!p.teammateGroupId) { units.push([p]); return; }
      if (!grouped.has(p.teammateGroupId)) { var unit = []; grouped.set(p.teammateGroupId, unit); units.push(unit); }
      grouped.get(p.teammateGroupId).push(p);
    });
    return units;
  };

  FB.drawBalance = function (teams) {
    function spread(values) { return values.length ? Math.max.apply(null, values) - Math.min.apply(null, values) : 0; }
    var stats = teams.map(counts), scores = teams.map(score), groupTeams = new Map(), split = false;
    teams.forEach(function (team, i) { team.forEach(function (p) {
      if (!p.teammateGroupId) return;
      if (groupTeams.has(p.teammateGroupId) && groupTeams.get(p.teammateGroupId) !== i) split = true;
      groupTeams.set(p.teammateGroupId, i);
    }); });
    return { sizeGap: spread(teams.map(function (team) { return team.length; })),
      tierGaps: FB.TIERS.map(function (tier) { return spread(stats.map(function (c) { return c[tier]; })); }),
      frisIndex: scores, frisGap: Math.round(spread(scores) * 10) / 10, splitTeammates: split };
  };

  FB.drawError = function (teams) {
    var balance = FB.drawBalance(teams);
    if (balance.splitTeammates) return "Attending teammates must stay on the same team.";
    if (teams.some(function (team) { return !team.length; })) return "Every team needs at least one player. Draw teams again.";
    if (balance.sizeGap > 1) return "The total number of players must differ by at most 1 between any two teams.";
    if (balance.frisGap > 2) return "The Fris Index must differ by at most 2 between any two teams.";
    return null;
  };

  FB.moveTeamMember = function (teams, id, target) {
    if (!Number.isInteger(target) || !teams[target]) return { error: "Choose an existing team." };
    var player = teams.reduce(function (all, team) { return all.concat(team); }, []).find(function (p) { return p.id === id; });
    if (!player) return { error: "That player is no longer on a team. Refresh and try again." };
    var moving = [], groupId = player.teammateGroupId;
    var candidate = teams.map(function (team) { return team.filter(function (p) {
      if (p.id !== id && (!groupId || p.teammateGroupId !== groupId)) return true;
      moving.push(p);
      return false;
    }); });
    candidate[target] = candidate[target].concat(moving);
    return { teams: candidate, movedIds: moving.map(function (p) { return p.id; }) };
  };

  // Retain existing assignments where the latest attendance still fits.
  // The caller keeps the old snapshot when a redraw is needed.
  FB.refreshDrawAttendance = function (teams, players) {
    var current = new Map(players.map(function (p) { return [p.id, p]; })), assigned = new Set();
    var candidate = teams.map(function (team) { return team.filter(function (p) { return current.has(p.id); }).map(function (p) {
      assigned.add(p.id);
      return Object.assign({}, current.get(p.id), { position: FB.position(p) });
    }); });
    FB.attendanceUnits(players.filter(function (p) { return !assigned.has(p.id); })).forEach(function (unit) {
      var existing = unit[0].teammateGroupId && candidate.findIndex(function (team) {
        return team.some(function (p) { return p.teammateGroupId === unit[0].teammateGroupId; });
      });
      var target = typeof existing === "number" && existing >= 0 ? existing : -1, bestCost = Infinity;
      if (target < 0) candidate.forEach(function (team, i) {
        team.push.apply(team, unit);
        var balance = FB.drawBalance(candidate);
        var cost = Math.max(0, balance.sizeGap - 1) * 10000 + Math.max(0, balance.frisGap - 2) * 100 + balance.frisGap;
        team.splice(team.length - unit.length, unit.length);
        if (cost < bestCost) { bestCost = cost; target = i; }
      });
      if (target >= 0) candidate[target].push.apply(candidate[target], unit);
    });
    return { teams: candidate, reason: FB.drawError(candidate) };
  };

  function counts(team) {
    /* tiers in capitals; lower-case u is "gender not set", not unclassified */
    var c = { A: 0, I: 0, B: 0, U: 0, f: 0, m: 0, u: 0, h: 0, c: 0 };
    team.forEach(function (p) {
      c[p.tier]++;
      var g = p.gender === "f" ? "f" : p.gender === "m" ? "m" : "u";
      c[g]++;
      c[FB.position(p)]++;
    });
    return c;
  }
  FB.counts = counts;

  /* Insert one player without changing anyone else's assignment. Shuffling
     candidates before the stable sort makes equally balanced teams random. */
  FB.chooseTeam = function (teams, player) {
    if (!teams.length) return -1;
    var stats = teams.map(counts), g = genderKey(player) || "u", pos = FB.position(player);
    return shuffle(teams.map(function (_, i) { return i; })).sort(function (a, b) {
      return teams[a].length - teams[b].length
        || stats[a][player.tier] - stats[b][player.tier]
        || stats[a][g] - stats[b][g]
        || stats[a][pos] - stats[b][pos]
        || score(teams[a]) - score(teams[b]);
    })[0];
  };

  function genderKey(p) { return p.gender === "f" ? "f" : p.gender === "m" ? "m" : ""; }
  function genderCount(team, g) {
    var n = 0;
    for (var i = 0; i < team.length; i++) if (genderKey(team[i]) === g) n++;
    return n;
  }

  /* Which genders are actually present, scarcest first. Dealing the scarce
     gender onto the emptiest teams first is what keeps it even. */
  function gendersPresent(pool) {
    var tally = { f: 0, m: 0, "": 0 };
    pool.forEach(function (p) { tally[genderKey(p)]++; });
    return ["f", "m", ""].filter(function (g) { return tally[g] > 0; })
      .sort(function (a, b) { return tally[a] - tally[b]; });
  }

  /* Decide who is in this draw. Refuses clearly rather than guessing. */
  FB.build = function (players, modeKey, n) {
    var m = FB.MODES[modeKey];
    if (!m) return { error: "Unknown edition." };
    if (!(n >= 2)) return { error: "Pick at least two teams." };

    /* A named squad (Elite pool) only draws from the people on its list. */
    var named = m.members ? m.members.map(norm) : null;
    var eligible = named
      ? players.filter(function (p) { return named.indexOf(norm(p.name)) >= 0; })
      : players;

    var anchors = [];
    if (m.anchorA > 0) {
      var adv = shuffle(eligible.filter(function (p) { return p.tier === "A"; }));
      var need = m.anchorA * n;
      if (adv.length < need) {
        return {
          error: "Beginner rounds puts one advanced player on every team, so " + n +
            " teams needs " + need + ". Only " + adv.length + " here tonight. " +
            "Pick fewer teams, or add more advanced players to the attendance list."
        };
      }
      anchors = adv.slice(0, need);
    }

    var pool = eligible.filter(function (p) { return m.tiers.indexOf(p.tier) >= 0; });
    /* Unclassified players go wherever T3 goes, so Tournament benches them. */
    var unclassified = m.tiers.indexOf("B") >= 0
      ? eligible.filter(function (p) { return p.tier === "U"; })
      : [];
    var playing = pool.length + anchors.length + unclassified.length;
    if (playing < n) {
      return { error: "Only " + playing + " player" + (playing === 1 ? "" : "s") +
        " available for this edition, which is not enough for " + n + " teams." };
    }
    return {
      pool: pool, anchors: anchors, unclassified: unclassified, mode: m,
      playing: playing,
      benched: players.length - playing
    };
  };

  /* Deal gender first, then skill within it.

     Boys and girls are handed out in separate passes, so each team ends up
     with the same number of girls give or take one, and the same for boys -
     that is the gender balance the club asked for. Inside each gender pass we
     still deal tier by tier and let the weakest team pick first, so skill
     stays balanced underneath. Anchors (beginner mode) are placed first.

     When nobody has a gender set this collapses to one pass and behaves
     exactly like the old skill-only sort. */
  FB.draft = function (built, n) {
    var teams = [], i;
    for (i = 0; i < n; i++) teams.push([]);
    shuffle(built.anchors.slice()).forEach(function (p, k) { teams[k % n].push(p); });

    if (built.mode.key === "fair") {
      /* Deal scarce Handles first, then Cutters. Each tier/gender group is
         shuffled, and every pick keeps total size within one player. */
      ["h", "c"].forEach(function (pos) {
        FB.TIERS.forEach(function (tier) {
          gendersPresent(built.pool.concat(built.unclassified)).forEach(function (g) {
            shuffle(built.pool.concat(built.unclassified).filter(function (p) {
              return FB.position(p) === pos && p.tier === tier && genderKey(p) === g;
            })).forEach(function (p) { teams[FB.chooseTeam(teams, p)].push(p); });
          });
        });
      });
      return teams;
    }

    gendersPresent(built.pool).forEach(function (g) {
      built.mode.tiers.forEach(function (tier) {
        var tp = shuffle(built.pool.filter(function (p) {
          return p.tier === tier && genderKey(p) === g;
        }));
        if (!tp.length) return;
        var order = shuffle(teams.map(function (_, k) { return k; }))
          .sort(function (a, b) {
            /* gender balance leads; skill, then size, break ties */
            return genderCount(teams[a], g) - genderCount(teams[b], g)
                || score(teams[a]) - score(teams[b])
                || teams[a].length - teams[b].length;
          });
        tp.forEach(function (p, k) { teams[order[k % n]].push(p); });
      });
    });

    /* Unclassified players last, in whole rounds, smallest teams first. Every
       team gets the same number of them give or take one, and the odd ones
       out fill whatever size gap the gender passes left behind. */
    var smallest = shuffle(teams.map(function (_, k) { return k; }))
      .sort(function (a, b) {
        return teams[a].length - teams[b].length || score(teams[a]) - score(teams[b]);
      });
    shuffle(built.unclassified.slice()).forEach(function (p, k) {
      teams[smallest[k % n]].push(p);
    });
    return teams;
  };

  /* Safety net: swap between strongest and weakest, but only where every tier
     stays within one of level. Anchors and unclassified players are never
     moved. */
  FB.refine = function (teams, built, n) {
    var lo = {}, hi = {}, tiers = built.mode.tiers;
    tiers.forEach(function (t) {
      var tot = built.pool.filter(function (p) { return p.tier === t; }).length;
      lo[t] = Math.floor(tot / n); hi[t] = Math.ceil(tot / n);
    });
    for (var pass = 0; pass < 200; pass++) {
      var s = teams.map(score);
      var mx = Math.max.apply(null, s), mn = Math.min.apply(null, s);
      if (mx - mn <= 1) break;
      var H = s.indexOf(mx), L = s.indexOf(mn);
      var cH = counts(teams[H]), cL = counts(teams[L]);
      var best = null, bestGap = mx - mn;
      teams[H].forEach(function (a) {
        teams[L].forEach(function (b) {
          if (tiers.indexOf(a.tier) < 0 || tiers.indexOf(b.tier) < 0) return;
          /* Only swap same-gender players, so a skill tidy-up can never undo
             the gender balance the draft just built. */
          if (genderKey(a) !== genderKey(b)) return;
          if (FB.position(a) !== FB.position(b)) return;
          var d = FB.WEIGHT[a.tier] - FB.WEIGHT[b.tier];
          if (d <= 0) return;
          var nH = { A: cH.A, I: cH.I, B: cH.B }, nL = { A: cL.A, I: cL.I, B: cL.B };
          nH[a.tier]--; nH[b.tier]++; nL[b.tier]--; nL[a.tier]++;
          var ok = true;
          tiers.forEach(function (t) {
            if (nH[t] < lo[t] || nH[t] > hi[t] || nL[t] < lo[t] || nL[t] > hi[t]) ok = false;
          });
          if (!ok) return;
          var gap = Math.abs((s[H] - d) - (s[L] + d));
          if (gap < bestGap) { bestGap = gap; best = [a, b]; }
        });
      });
      if (!best) break;
      teams[H][teams[H].indexOf(best[0])] = best[1];
      teams[L][teams[L].indexOf(best[1])] = best[0];
    }
    return teams;
  };

  /* Assign complete attendance units. Hard constraints are checked during
     search; no greedy fallback can silently publish an invalid draw. */
  FB.fairDraft = function (players, n, options) {
    options = options || {};
    var total = players.length, minSize = Math.floor(total / n), maxSize = Math.ceil(total / n);
    var units = shuffle(FB.attendanceUnits(players).map(function (members) {
      var c = counts(members);
      return { members: members, size: members.length, score: Math.round(score(members) * 10),
        tiers: FB.TIERS.map(function (tier) { return c[tier]; }), genders: [c.f, c.m, c.u], positions: [c.h, c.c] };
    })).sort(function (a, b) { return b.size - a.size || b.score - a.score; });
    if (units.some(function (u) { return u.size > maxSize; })) {
      return { error: "Attending teammates cannot fit together while keeping team sizes within 1. Choose fewer teams or adjust attendance.", code: "DRAW_CONSTRAINTS" };
    }
    // Search in tenths so fractional tier weights retain exact comparisons.
    var sumScore = units.reduce(function (sum, u) { return sum + u.score; }, 0);
    var minScore, maxScore;
    var totalTiers = FB.TIERS.map(function (tier) { return players.filter(function (p) { return p.tier === tier; }).length; });
    var totalGenders = ["f", "m", ""].map(function (g) { return players.filter(function (p) { return genderKey(p) === g; }).length; });
    var targets = Array.from({ length: n }, function (_, i) { return minSize + (i < total % n ? 1 : 0); });
    var remaining = Array(units.length + 1);
    remaining[units.length] = { size: 0, score: 0 };
    for (var k = units.length - 1; k >= 0; k--) {
      var next = remaining[k + 1], unit = units[k];
      remaining[k] = { size: next.size + unit.size, score: next.score + unit.score };
    }
    var nodes = 0, limit = options.maxNodes || 100000, exhausted = false, anyExhausted = false, answer = null, winningGap = null;
    function blank() { return { units: [], size: 0, score: 0, tiers: [0, 0, 0, 0], genders: [0, 0, 0], positions: [0, 0] }; }
    function add(team, unit, sign) {
      team.size += sign * unit.size; team.score += sign * unit.score;
      ["tiers", "genders", "positions"].forEach(function (key) {
        unit[key].forEach(function (count, i) { team[key][i] += sign * count; });
      });
    }
    function spread(values) { return Math.max.apply(null, values) - Math.min.apply(null, values); }
    var startGap = sumScore % n ? 1 : 0;
    var lastGap = 20;
    for (var gap = startGap; gap <= lastGap && !answer; gap++) {
      exhausted = false;
      var roundNodes = 0;
      minScore = Math.ceil((sumScore - gap * (n - 1)) / n);
      maxScore = Math.floor((sumScore + gap * (n - 1)) / n);
      if (units.some(function (unit) { return unit.score > maxScore; })) continue;
      var teams = targets.map(blank), failed = new Set();
      function signature(team, i) { return [targets[i], team.size, team.score].join(","); }
      function search(at) {
        nodes++;
        if (++roundNodes > limit) { exhausted = true; anyExhausted = true; return false; }
        if (at === units.length) {
          if (teams.some(function (team, i) { return team.size !== targets[i]; }) || spread(teams.map(function (team) { return team.score; })) > gap) return false;
          answer = teams; winningGap = gap; return true;
        }
        var rest = remaining[at], scoreDeficit = 0;
        for (var i = 0; i < n; i++) {
          var team = teams[i], slots = targets[i] - team.size;
          if (team.size + rest.size < targets[i] || team.score + rest.score < minScore || team.score + slots * 15 > maxScore || team.score + slots * 60 < minScore) return false;
          scoreDeficit += Math.max(0, minScore - team.score);
        }
        if (scoreDeficit > rest.score) return false;
        var key = at + ":" + teams.map(signature).sort().join(";");
        if (failed.has(key)) return false;
        var unit = units[at], seen = new Set();
        var order = shuffle(teams.map(function (_, i) { return i; })).sort(function (a, b) {
          function cost(team, i) {
            var tierCost = unit.tiers.reduce(function (sum, count, t) { return sum + count * team.tiers[t] / Math.max(1, totalTiers[t]); }, 0);
            var genderCost = unit.genders.reduce(function (sum, count, g) { return sum + count * team.genders[g] / Math.max(1, totalGenders[g]); }, 0);
            return team.score / Math.max(1, maxScore) * 100 + team.size / targets[i] * 20 + genderCost + tierCost;
          }
          return cost(teams[a], a) - cost(teams[b], b);
        });
        for (var o = 0; o < order.length && !exhausted; o++) {
          var index = order[o], dest = teams[index], stateKey = signature(dest, index);
          if (seen.has(stateKey)) continue;
          seen.add(stateKey);
          if (dest.size + unit.size > targets[index] || dest.score + unit.score > maxScore) continue;
          add(dest, unit, 1); dest.units.push(unit);
          if (search(at + 1)) return true;
          dest.units.pop(); add(dest, unit, -1);
        }
        if (!exhausted) failed.add(key);
        return false;
      }
      search(0);
    }
    if (!answer) return { code: anyExhausted ? "DRAW_SEARCH_LIMIT" : "DRAW_CONSTRAINTS", error: anyExhausted
      ? "Could not find a valid draw. Try again, choose fewer teams, or adjust attendance."
      : "No draw can keep attending teammates together, keep total team sizes within 1, and keep the Fris Index gap within 2. Change the team count or attendance." };

    // Improve the Fris Index first, then gender ratios, retaining hard limits.
    // Complete units move together, so a refinement can never split buddies.
    function metric() {
      var tierCost = 0, genderCost = 0, positionCost = 0, indexCost = 0;
      answer.forEach(function (team) {
        team.tiers.forEach(function (count) { tierCost += count * count; });
        team.genders.forEach(function (count, g) { genderCost += Math.pow(count * total - totalGenders[g] * team.size, 2); });
        team.positions.forEach(function (count) { positionCost += count * count; });
        indexCost += team.score * team.score;
      });
      return [spread(answer.map(function (team) { return team.score; })), indexCost, genderCost, tierCost, positionCost];
    }
    function less(a, b) { for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i]; } return false; }
    for (var pass = 0; pass < 60; pass++) {
      var best = null, bestMetric = metric();
      for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) {
        for (var x = 0; x < answer[a].units.length; x++) for (var y = 0; y < answer[b].units.length; y++) {
          var u = answer[a].units[x], v = answer[b].units[y];
          var sa = answer[a].size - u.size + v.size, sb = answer[b].size - v.size + u.size;
          if (sa < minSize || sa > maxSize || sb < minSize || sb > maxSize) continue;
          add(answer[a], u, -1); add(answer[a], v, 1); add(answer[b], v, -1); add(answer[b], u, 1);
          if (spread(answer.map(function (team) { return team.score; })) <= 20) {
            var candidate = metric();
            if (candidate[0] <= winningGap && less(candidate, bestMetric)) { bestMetric = candidate; best = [a, x, b, y]; }
          }
          add(answer[a], v, -1); add(answer[a], u, 1); add(answer[b], u, -1); add(answer[b], v, 1);
        }
      }
      if (!best) break;
      var first = answer[best[0]], second = answer[best[2]], u = first.units[best[1]], v = second.units[best[3]];
      add(first, u, -1); add(first, v, 1); add(second, v, -1); add(second, u, 1);
      first.units[best[1]] = v; second.units[best[3]] = u;
    }
    var result = shuffle(answer.map(function (team) { return team.units.reduce(function (members, unit) { return members.concat(unit.members); }, []); }));
    return { teams: result, balance: FB.drawBalance(result), searchNodes: nodes };
  };

  FB.sort = function (players, modeKey, n) {
    var built = FB.build(players, modeKey, n);
    if (built.error) return built;
    if (modeKey === "fair") {
      var result = FB.fairDraft(built.pool.concat(built.unclassified), n);
      return result.error ? result : Object.assign(built, result);
    }
    var teams = FB.draft(built, n);
    built.teams = FB.refine(teams, built, n);
    return built;
  };

  /* ------------------------------------------------------------- pdf --
     Enough of a PDF reader to pull a name list out of a Google Docs export.
     Text in those files is glyph-indexed, so the bytes in the page stream
     mean nothing without the font's ToUnicode table - we read that first,
     then map the glyph codes back to characters.

     `inflate` is injected so this stays testable outside a browser:
     DecompressionStream in the page, zlib in the test harness. */

  function findStreams(bytes) {
    var latin = "";
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      latin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    var out = [], re = /stream\r?\n/g, m;
    while ((m = re.exec(latin)) !== null) {
      /* "endstream" also ends in "stream" - skip those, or every other
         match is garbage taken from the middle of a real stream. */
      if (latin.substr(m.index - 3, 3) === "end") continue;
      var start = m.index + m[0].length;
      var end = latin.indexOf("endstream", start);
      if (end < 0) continue;
      /* PDFs put an EOL before "endstream". DecompressionStream, unlike
         zlib, errors on any trailing byte, so drop them. */
      while (end > start && (bytes[end - 1] === 10 || bytes[end - 1] === 13)) end--;
      out.push(bytes.subarray(start, end));
    }
    return out;
  }

  function buildCMap(text) {
    var map = {};
    var chars = /beginbfchar([\s\S]*?)endbfchar/g, m;
    while ((m = chars.exec(text)) !== null) {
      var pair = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g, p;
      while ((p = pair.exec(m[1])) !== null) {
        map[parseInt(p[1], 16)] = hexToStr(p[2]);
      }
    }
    var ranges = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = ranges.exec(text)) !== null) {
      var tri = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g, t;
      while ((t = tri.exec(m[1])) !== null) {
        var lo = parseInt(t[1], 16), hi = parseInt(t[2], 16), dst = parseInt(t[3], 16);
        for (var c = lo; c <= hi && c - lo < 65535; c++) {
          map[c] = String.fromCharCode(dst + (c - lo));
        }
      }
    }
    return map;
  }

  function hexToStr(hex) {
    var s = "";
    for (var i = 0; i + 3 < hex.length + 1; i += 4) {
      s += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
    }
    return s;
  }

  function decodeHex(hex, map) {
    var s = "";
    hex = hex.replace(/\s+/g, "");
    for (var i = 0; i + 1 < hex.length; i += 4) {
      var code = parseInt(hex.substr(i, 4), 16);
      s += (map[code] !== undefined) ? map[code] : "";
    }
    return s;
  }

  /* Walk the page stream, emitting a newline whenever the text cursor moves
     to a different line. */
  function streamToText(content, map) {
    var out = "", lastY = null;
    var token = /<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^\\()])*)\)|(-?[\d.]+)|(\[|\])|([A-Za-z*'"]+)/g;
    var operands = [], m;
    while ((m = token.exec(content)) !== null) {
      if (m[1] !== undefined) { operands.push({ hex: m[1] }); continue; }
      if (m[2] !== undefined) { operands.push({ lit: m[2] }); continue; }
      if (m[3] !== undefined) { operands.push({ num: parseFloat(m[3]) }); continue; }
      if (m[4] !== undefined) { continue; }
      var op = m[5];
      if (op === "Tm" && operands.length >= 6) {
        var y = operands[operands.length - 1].num;
        if (lastY !== null && Math.abs(y - lastY) > 0.5) out += "\n";
        lastY = y;
      } else if (op === "Td" || op === "TD") {
        var ty = operands.length >= 2 ? operands[operands.length - 1].num : 0;
        if (ty) { out += "\n"; if (lastY !== null) lastY += ty; }
      } else if (op === "T*") {
        out += "\n";
      } else if (op === "Tj" || op === "'" || op === '"') {
        var a = operands[operands.length - 1];
        if (a && a.hex !== undefined) out += decodeHex(a.hex, map);
        else if (a && a.lit !== undefined) out += a.lit;
      } else if (op === "TJ") {
        for (var i = 0; i < operands.length; i++) {
          if (operands[i].hex !== undefined) out += decodeHex(operands[i].hex, map);
          else if (operands[i].lit !== undefined) out += operands[i].lit;
        }
      }
      operands = [];
    }
    return out;
  }

  /* Browser inflate. DecompressionStream is native, so no library ships. */
  FB.inflate = function (u8) {
    if (typeof DecompressionStream === "undefined") {
      return Promise.reject(new Error("This browser cannot unpack PDFs."));
    }
    var ds = new DecompressionStream("deflate");
    var stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  };

  FB.pdfToText = function (bytes, inflate) {
    var streams = findStreams(bytes);
    return Promise.all(streams.map(function (s) {
      return inflate(s).then(function (out) { return out; }, function () { return null; });
    })).then(function (results) {
      var map = {}, pages = [];
      results.forEach(function (r) {
        if (!r) return;
        var text = "";
        for (var i = 0; i < r.length; i++) text += String.fromCharCode(r[i]);
        if (/beginbfchar|beginbfrange/.test(text)) {
          var built = buildCMap(text);
          for (var k in built) if (Object.prototype.hasOwnProperty.call(built, k)) map[k] = built[k];
        } else if (/\bTj\b|\bTJ\b/.test(text)) {
          pages.push(text);
        }
      });
      if (!pages.length) return "";
      return pages.map(function (p) { return streamToText(p, map); }).join("\n");
    });
  };

  /* ---------------------------------------------------- shareable link --
     A static site has nowhere to store tonight's draw, so the draw travels
     inside the link itself. Names only - levels never leave the leader's
     device. UTF-8 safe, so Chinese names survive the round trip. */

  FB.encodeTeams = function (teams, mode) {
    var payload = {
      v: 1,
      m: mode || "fair",
      d: Date.now(),
      t: teams.map(function (team) {
        return team.map(function (p) { return p.name; });
      })
    };
    var bytes = new TextEncoder().encode(JSON.stringify(payload));
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  FB.decodeTeams = function (code) {
    try {
      var b64 = String(code).replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var data = JSON.parse(new TextDecoder("utf-8").decode(bytes));
      if (!data || !Array.isArray(data.t)) return null;
      /* rebuild as player objects; a shared link carries no levels */
      data.teams = data.t.map(function (names) {
        return names.map(function (n) { return { name: String(n), tier: "I" }; });
      });
      return data;
    } catch (e) { return null; }
  };

  /* Plain text for pasting into a group chat. */
  FB.toText = function (teams, opts) {
    opts = opts || {};
    return teams.map(function (team, i) {
      var head = "Team " + String.fromCharCode(65 + i) + " (" + team.length + ")";
      var body = team.slice().sort(function (a, b) {
        return FB.TIERS.indexOf(a.tier) - FB.TIERS.indexOf(b.tier) || a.name.localeCompare(b.name);
      }).map(function (p) {
        return "- " + p.name + (opts.tiers ? " [" + p.tier + "]" : "");
      }).join("\n");
      return head + "\n" + body;
    }).join("\n\n");
  };

  root.FB = FB;
  if (typeof module !== "undefined" && module.exports) module.exports = FB;
})(typeof window !== "undefined" ? window : globalThis);
