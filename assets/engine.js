/* ==========================================================================
   FRISBEING UF - sorting engine and list parsers
   Plain script, no build step. Attaches to window.FB (and module.exports so
   the test harness can require it).
   ========================================================================== */
(function (root) {
  "use strict";

  var FB = {};

  /* Tiers are T1 (strongest), T2, T3 (developing). The codes A/I/B are kept
     internally so nothing downstream had to change; only the display name
     and the accepted words moved to T1/T2/T3. A=T1, I=T2, B=T3.

     U (unclassified) is not a level anyone on the roster can have. It marks
     people on tonight's list who are not on the roster at all: they weigh the
     same as T3 and go wherever T3 goes, but are dealt as their own group so
     every team gets an even share of the unknowns. */
  FB.TIERS = ["A", "I", "B", "U"];
  FB.TIER_NAME = { A: "T1", I: "T2", B: "T3", U: "U" };
  FB.WEIGHT = { A: 3, I: 2, B: 1, U: 1 };

  FB.MODES = {
    fair: {
      key: "fair",
      label: "Fair teams",
      tiers: ["A", "I", "B"],
      anchorA: 0,
      blurb: "Everyone who turned up, balanced by gender first, then across all three tiers."
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
    B: ["t3", "tier3", "tierthree", "beginner", "beginners", "begin", "beg", "b", "new", "novice", "rookie", "starter", "初级", "初", "新手"]
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

      var tier = null, gender = "";
      attrs.forEach(function (a) {
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
      members.push({ name: name, tier: tier, gender: gender });
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

  function score(team) {
    return team.reduce(function (s, p) { return s + FB.WEIGHT[p.tier]; }, 0);
  }
  FB.score = score;

  function counts(team) {
    /* tiers in capitals; lower-case u is "gender not set", not unclassified */
    var c = { A: 0, I: 0, B: 0, U: 0, f: 0, m: 0, u: 0 };
    team.forEach(function (p) {
      c[p.tier]++;
      var g = p.gender === "f" ? "f" : p.gender === "m" ? "m" : "u";
      c[g]++;
    });
    return c;
  }
  FB.counts = counts;

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

  FB.sort = function (players, modeKey, n) {
    var built = FB.build(players, modeKey, n);
    if (built.error) return built;
    built.teams = FB.refine(FB.draft(built, n), built, n);
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
