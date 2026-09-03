/* ==========================================================================
   FRISBEING UF - reference API server

   Node 18+ and nothing else. No npm install, no framework, no build step.
   Data is a single JSON file on disk, which is plenty for 40 members and
   means there is no database to set up or back up separately.

   Run it:
       node server/server.js

   Environment variables (all optional):
       PORT          port to listen on          (default 8080)
       PASSCODE      the leader passcode        (default frisbeing2022)
       DATA_FILE     where to keep the data     (default server/data.json)
       ORIGIN        allowed website address    (default *, see note below)

   If your host runs PHP or Python instead of Node, hand this file over as
   the specification - the endpoints and shapes below are what the website
   expects, and any language can serve them.
   ========================================================================== */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 8080;
const PASSCODE = process.env.PASSCODE || "frisbeing2022";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const ORIGIN = process.env.ORIGIN || "*";

/* ------------------------------------------------------------------ data -- */

let db = { version: 1, roster: [], teams: null, updatedAt: Date.now() };

function load() {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!Array.isArray(db.roster)) db.roster = [];
  } catch (e) {
    /* First run: seed from the roster.json shipped with the website, so the
       server starts with the squad already in it rather than empty. */
    try {
      const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "roster.json"), "utf8"));
      db.roster = cleanRoster(seed);
      console.log(`Seeded ${db.roster.length} members from roster.json`);
    } catch (e2) {
      console.log("Starting with an empty roster");
    }
    save();
  }
}

function save() {
  db.updatedAt = Date.now();
  /* Write to a temporary file first, then rename. A crash mid-write can
     otherwise leave a half-written file and lose the whole roster. */
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function cleanRoster(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const m of list) {
    if (!m || typeof m.name !== "string") continue;
    if (!["A", "I", "B"].includes(m.tier)) continue;
    const name = m.name.replace(/\s+/g, " ").trim();
    if (!name || name.length > 80) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;       /* same name twice would break sorting */
    seen.add(key);
    out.push({ name, tier: m.tier, gender: (m.gender === "f" || m.gender === "m") ? m.gender : "" });
    if (out.length >= 500) break;      /* nobody has a 500-person club */
  }
  return out;
}

/* --------------------------------------------------------------- sessions -- */

const sessions = new Map();           /* token -> expiry */
const SESSION_MS = 30 * 24 * 3600 * 1000;

function issueToken() {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_MS);
  return token;
}

function isLeader(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) { sessions.delete(token); return false; }
  return true;
}

/* Compare without leaking how much of the passcode was right. */
function samePasscode(given) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(PASSCODE);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ---------------------------------------------------------------- server -- */

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS"
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) { reject(new Error("Body too large")); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error("Body was not valid JSON")); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname.replace(/^\/api/, "").replace(/\/$/, "") || "/";

  if (req.method === "OPTIONS") return send(res, 204, {});

  try {
    /* --- read: open to everyone, this is a club noticeboard ------------- */

    if (route === "/version" && req.method === "GET") {
      return send(res, 200, { version: db.version });
    }

    if (route === "/state" && req.method === "GET") {
      return send(res, 200, {
        version: db.version,
        roster: db.roster,
        teams: db.teams,
        updatedAt: db.updatedAt
      });
    }

    /* --- sign in --------------------------------------------------------- */

    if (route === "/login" && req.method === "POST") {
      const body = await readBody(req);
      if (!samePasscode(body.passcode)) {
        return send(res, 401, { error: "That passcode is not right." });
      }
      return send(res, 200, { token: issueToken(), name: "Club leader" });
    }

    if (route === "/logout" && req.method === "POST") {
      const auth = req.headers["authorization"] || "";
      if (auth.startsWith("Bearer ")) sessions.delete(auth.slice(7));
      return send(res, 200, {});
    }

    /* --- write: leaders only. Checked HERE, so a member cannot get past
           it by changing anything in their own browser. -------------------- */

    if (route === "/roster" && req.method === "PUT") {
      if (!isLeader(req)) return send(res, 401, { error: "Sign in as a club leader first." });
      const body = await readBody(req);
      db.roster = cleanRoster(body.roster);
      db.version++;
      save();
      return send(res, 200, { version: db.version, count: db.roster.length });
    }

    if (route === "/teams" && req.method === "PUT") {
      if (!isLeader(req)) return send(res, 401, { error: "Sign in as a club leader first." });
      const body = await readBody(req);
      if (!Array.isArray(body.teams)) return send(res, 400, { error: "No teams given." });
      db.teams = {
        mode: String(body.mode || "fair"),
        at: Number(body.at) || Date.now(),
        teams: body.teams.map((t) => (Array.isArray(t) ? t.map(String).slice(0, 200) : [])).slice(0, 12)
      };
      db.version++;
      save();
      return send(res, 200, { version: db.version });
    }

    if (route === "/teams" && req.method === "DELETE") {
      if (!isLeader(req)) return send(res, 401, { error: "Sign in as a club leader first." });
      db.teams = null;
      db.version++;
      save();
      return send(res, 200, { version: db.version });
    }

    return send(res, 404, { error: "No such endpoint: " + route });
  } catch (err) {
    return send(res, 400, { error: err.message || "Bad request" });
  }
});

load();
server.listen(PORT, () => {
  console.log(`Frisbeing API listening on http://localhost:${PORT}`);
  console.log(`  ${db.roster.length} members loaded, version ${db.version}`);
  console.log(`  data file: ${DATA_FILE}`);
  if (PASSCODE === "frisbeing2022") {
    console.log("  WARNING: still using the default passcode. Set PASSCODE.");
  }
});
