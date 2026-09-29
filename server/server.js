/* ==========================================================================
   FRISBEING UF - reference API server

   Node 18+ and nothing else. No npm install, no framework, no build step.
   Data is a single JSON file on disk, which is plenty for a club and means
   there is no database to set up or back up separately.

   Run it from the website folder. It borrows assets/engine.js to match
   names the same way the sorter does, so the two travel together:
       node server/server.js

   Environment variables:
       ENTRA_TENANT_ID   Tsinglan directory (tenant) ID  (required for sign-in)
       ENTRA_CLIENT_ID   the app registration's client ID (required for sign-in)
       PORT              port to listen on               (default 8080)
       DATA_FILE         where to keep the data          (default server/data.json)
       ORIGIN            allowed website address         (default *, see below)
       CLUB_TZ           the club's timezone              (default Asia/Shanghai)
       PUSH_CONTACT      contact sent to push services   (default the leader)
       ENTRA_JWKS_URL    override Microsoft's key URL     (testing only)
       PUSH_TEST_HOSTS   extra http push hosts            (testing only)

   If your host runs PHP or Python instead of Node, hand this file over as
   the specification - the endpoints and shapes below are what the website
   expects, and any language can serve them.
   ========================================================================== */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const FB = require(path.join(__dirname, "..", "assets", "engine.js"));

const PORT = process.env.PORT || 8080;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const ORIGIN = process.env.ORIGIN || "*";

/* ------------------------------------------------------------- microsoft --
   Sign-in is a Tsinglan Microsoft 365 (Entra) account. The browser gets an ID
   token from Microsoft; this server verifies its signature against Microsoft's
   published keys before trusting a word of it. Set these from the Entra app
   registration (see server/README.md). Single-tenant is expected: TENANT is
   the Tsinglan directory (tenant) ID, so only Tsinglan accounts are accepted. */

const ENTRA_TENANT_ID = process.env.ENTRA_TENANT_ID || "";
const ENTRA_CLIENT_ID = process.env.ENTRA_CLIENT_ID || "";
/* Overridable so a test can point at a local key set; normally left blank. */
const ENTRA_JWKS_URL = process.env.ENTRA_JWKS_URL ||
  (ENTRA_TENANT_ID ? "https://login.microsoftonline.com/" + ENTRA_TENANT_ID + "/discovery/v2.0/keys" : "");

/* ----------------------------------------------------------------- roles --
   Who runs the club, by school address. Read on every request, so editing
   this list takes effect at once, including for accounts that already
   exist. Every other school address that signs up is a player. */

const EMAIL_DOMAIN = "@tsinglan.org";
const LEADER_EMAIL = "harry.xu_27@tsinglan.org";   /* the supreme leader */
const ADMIN_EMAILS = [
  "kevin.xiao_26@tsinglan.org",
  "justin.he_27@tsinglan.org",
  "michael.cheng_27@tsinglan.org",
  "jason.xu_27@tsinglan.org"
];

function roleFor(email) {
  if (email === LEADER_EMAIL) return "leader";
  if (ADMIN_EMAILS.includes(email)) return "admin";
  return "player";
}

function isSchoolEmail(email) {
  return email.endsWith(EMAIL_DOMAIN) && /^[^\s@]+@[^\s@]+$/.test(email);
}

/* ------------------------------------------------------------------ data -- */

let db = { version: 1, roster: [], teams: null, users: [], sessions: {}, updatedAt: Date.now() };

/* The member directory: the club's own list of who is who, keyed by school
   email. It gives the real display name (or the name someone likes to be
   called) and lets a Microsoft sign-in be matched to the squad by address
   rather than by guessing a name from the email. It is optional - without it
   the server still works, it just falls back to reading names out of the
   address. It is never committed, because it holds real emails; see
   directory.example.json and server/README.md. */
let directory = {};

function loadDirectory() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "directory.json"), "utf8"));
    directory = {};
    for (const [email, info] of Object.entries(raw)) {
      if (email[0] === "_" || !info || typeof info !== "object") continue; // skip _comment etc.
      directory[email.trim().toLowerCase()] = {
        name: String(info.name || "").replace(/\s+/g, " ").trim(),
        preferred: String(info.preferred || "").replace(/\s+/g, " ").trim(),
        grade: String(info.grade || "").trim()
      };
    }
    console.log(`Loaded ${Object.keys(directory).length} people from directory.json`);
  } catch (e) {
    directory = {};
  }
}

/* The name to show for a signed-in member: what they like to be called if the
   directory has it, else their full name there, else whatever Microsoft sent,
   else a name read out of the address. */
function displayName(email, claimName) {
  const known = directory[email];
  const chosen = (known && (known.preferred || known.name)) || claimName || nameFromEmail(email);
  return String(chosen).replace(/\s+/g, " ").trim().slice(0, 80);
}

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
  /* Accounts arrived after the roster, so older data files have neither. */
  if (!Array.isArray(db.users)) db.users = [];
  if (!db.sessions || typeof db.sessions !== "object") db.sessions = {};
  const now = Date.now();
  for (const [key, s] of Object.entries(db.sessions)) {
    if (!s || s.until < now) delete db.sessions[key];
  }
  /* Sessions arrived after accounts. Regular Tuesdays and Thursdays count
     from the day the calendar was first switched on, never before it. */
  let fresh = false;
  if (!db.schedule || typeof db.schedule !== "object") { db.schedule = {}; fresh = true; }
  const sch = db.schedule;
  if (!Array.isArray(sch.weekdays)) sch.weekdays = DEFAULT_WEEKDAYS.slice();
  if (!Array.isArray(sch.added)) sch.added = [];
  if (!Array.isArray(sch.removed)) sch.removed = [];
  if (!isDateString(sch.since)) { sch.since = clubDate(); fresh = true; }
  if (!db.games || typeof db.games !== "object") db.games = {};
  if (!db.push || typeof db.push !== "object") db.push = {};
  if (!Number.isInteger(db.gamesVersion)) db.gamesVersion = 1;
  pruneSessions();                                     /* drop history past KEEP_DAYS */
  if (fresh) save();
  loadDirectory();
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

/* Players are sent the roster without tiers. A roster that comes back
   without them is a page that never had them, not a leader clearing every
   level - refuse it, rather than let cleanRoster drop those members and
   quietly empty the squad. */
function missingTiers(list) {
  return Array.isArray(list) && list.some((m) =>
    m && typeof m.name === "string" && m.name.trim() && !["A", "I", "B"].includes(m.tier));
}

/* ---------------------------------------------------- microsoft tokens --
   Verify a Microsoft ID token the way Microsoft says to: check the RS256
   signature against the tenant's published keys, then the audience, issuer,
   tenant and expiry. Only after all of that do we believe the email inside.
   Keys are cached for an hour. A token naming a key we have not seen fetches
   them again - but at most once a minute, so a stream of junk tokens cannot
   turn this server into something that hammers Microsoft. */

let jwksCache = { at: 0, keys: [] };

async function jwksKey(kid) {
  const age = Date.now() - jwksCache.at;
  const unknown = !jwksCache.keys.find((k) => k.kid === kid);
  if (age > 3600 * 1000 || (unknown && age > 60 * 1000)) {
    if (!ENTRA_JWKS_URL) throw new Error("Microsoft sign-in is not configured on the server.");
    const r = await fetch(ENTRA_JWKS_URL);
    if (!r.ok) throw new Error("Could not fetch Microsoft's signing keys.");
    const d = await r.json();
    jwksCache = { at: Date.now(), keys: Array.isArray(d.keys) ? d.keys : [] };
  }
  return jwksCache.keys.find((k) => k.kid === kid);
}

function b64urlToBuf(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}
function b64urlJson(s) {
  return JSON.parse(b64urlToBuf(s).toString("utf8"));
}

async function verifyMicrosoftToken(idToken) {
  if (!ENTRA_CLIENT_ID) throw new Error("Microsoft sign-in is not configured on the server.");
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed sign-in token.");
  let header, p;
  try { header = b64urlJson(parts[0]); p = b64urlJson(parts[1]); }
  catch (e) { throw new Error("Malformed sign-in token."); }
  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm.");

  const jwk = await jwksKey(header.kid);
  if (!jwk) throw new Error("Unknown signing key.");
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const ok = crypto.verify("RSA-SHA256",
    Buffer.from(parts[0] + "." + parts[1]), key, b64urlToBuf(parts[2]));
  if (!ok) throw new Error("The sign-in token's signature did not check out.");

  const now = Math.floor(Date.now() / 1000);
  if (!p.exp || p.exp <= now) throw new Error("That sign-in has expired.");
  if (p.nbf && p.nbf > now + 300) throw new Error("That sign-in is not valid yet.");
  if (p.aud !== ENTRA_CLIENT_ID) throw new Error("That sign-in was issued for a different app.");
  if (p.iss !== "https://login.microsoftonline.com/" + p.tid + "/v2.0") {
    throw new Error("Unexpected sign-in issuer.");
  }
  if (ENTRA_TENANT_ID && p.tid !== ENTRA_TENANT_ID) {
    throw new Error("That sign-in is from a different organisation.");
  }
  return p;
}

/* -------------------------------------------------------------- sessions --
   Kept in the data file, so a restart or a deploy does not sign every
   player out. Only a hash of each token is stored: a copy of the file is
   not a copy of everyone's sign-in. */

const SESSION_MS = 30 * 24 * 3600 * 1000;

function tokenKey(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function issueToken(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  db.sessions[tokenKey(token)] = { until: Date.now() + SESSION_MS, userId: userId || null };
  save();
  return token;
}

function bearer(req) {
  const auth = req.headers["authorization"] || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

/* Who is asking, or null for anyone not signed in. Every session belongs to
   a Microsoft-verified account; a session with no account behind it (an old
   one from before this change) is treated as signed out. */
function whoIs(req) {
  const token = bearer(req);
  if (!token) return null;
  const key = tokenKey(token);
  const s = db.sessions[key];
  if (!s || s.until < Date.now()) {
    if (s) { delete db.sessions[key]; save(); }
    return null;
  }
  const user = s.userId && db.users.find((u) => u.id === s.userId);
  if (!user) { delete db.sessions[key]; save(); return null; }
  return { role: roleFor(user.email), user };
}

function runsTheClub(who) {
  return !!who && (who.role === "leader" || who.role === "admin");
}

/* ------------------------------------------------------------ rate limit --
   In memory, per ACCOUNT - never per address. The whole school reaches the
   server from one public address, so counting by address would lock every
   student out together. Sign-in has no limit at all: there is no password
   to guess, and a token is either signed by Microsoft or refused. */

const buckets = new Map();

function tooMany(key, limit, windowMs) {
  const now = Date.now();
  if (buckets.size > 10000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  b.count++;
  return b.count > limit;
}

/* -------------------------------------------------------------- accounts -- */

/* "alex.chen_29@tsinglan.org" -> "Alex Chen". School addresses are
   firstname.lastname_YY, which is how the roster spells people too. */
function nameFromEmail(email) {
  return email.split("@")[0].replace(/_\d+$/, "").replace(/[._-]+/g, " ").trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/* The roster entry an account belongs to, or null. The address is tried
   first (in either name order), then the name they typed. Only an exact
   match to an entry no other account has claimed counts. Anything vaguer
   is left for a leader to link by hand, because a wrong link would quietly
   give one person another's place on the squad. */
function matchMember(email, typedName) {
  const claimed = new Set(db.users.filter((u) => u.member).map((u) => FB.norm(u.member)));
  const known = directory[email];
  const fromEmail = nameFromEmail(email);
  const reversed = fromEmail.split(" ").reverse().join(" ");
  /* The directory's full name is tried first: it is what the member told the
     club, so it beats a name guessed from the address. */
  for (const candidate of [known && known.name, fromEmail, reversed, typedName]) {
    const key = FB.norm(candidate);
    if (!key || claimed.has(key)) continue;
    const hits = db.roster.filter((m) => FB.norm(m.name) === key);
    if (hits.length === 1) return hits[0].name;
  }
  return null;
}

/* Keep every account pointed at a roster entry that still exists, and give
   unlinked ones another try: someone who signed up before a leader added
   them to the squad is picked up as soon as they are. A link a leader set
   by hand is never replaced automatically. */
function relinkAccounts() {
  for (const u of db.users) {
    if (u.member && !db.roster.some((m) => FB.norm(m.name) === FB.norm(u.member))) u.member = null;
  }
  for (const u of db.users) {
    if (!u.member && !u.linkedByHand) u.member = matchMember(u.email, u.name);
  }
}

/* What an account holder is told about themselves. Never their tier. */
function accountView(user) {
  return { email: user.email, name: user.name, role: roleFor(user.email), member: user.member || null };
}

/* -------------------------------------------------------------- sessions --
   The club plays on set weekdays - Tuesday and Thursday unless changed. A
   leader or admin can add a one-off date or call any date off from the
   calendar. Players answer Join or I'll pass for tonight; the supreme leader
   then draws teams from everyone who joined, and each of them gets a push
   notification to come and see which team they are on.

   "Tonight" is the club's own calendar date (China time), decided here on
   the server, so a phone with the wrong clock or timezone cannot show the
   wrong day. */

const CLUB_TZ = process.env.CLUB_TZ || "Asia/Shanghai";
const DEFAULT_WEEKDAYS = [2, 4];               /* 0 = Sunday: Tuesday and Thursday */
const KEEP_DAYS = 400;                          /* history kept in the data file */
const TEAM_LETTERS = "ABCDEFGHIJKL";

function clubDate(ms) {
  /* en-CA writes dates as YYYY-MM-DD */
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(ms == null ? Date.now() : ms));
}

function isDateString(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

/* Noon UTC keeps a calendar date on the same day whatever timezone the
   server itself runs in. */
function weekdayOf(date) { return new Date(date + "T12:00:00Z").getUTCDay(); }

function addDays(date, n) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* "regular", "extra", or null when there is no session that day. */
function sessionKind(date) {
  const s = db.schedule;
  if (s.removed.includes(date)) return null;
  if (s.added.includes(date)) return "extra";
  if (date >= s.since && s.weekdays.includes(weekdayOf(date))) return "regular";
  return null;
}

function gameFor(date) {
  if (!db.games[date]) db.games[date] = { rsvps: {}, draw: null };
  return db.games[date];
}

function pruneSessions() {
  const cutoff = addDays(clubDate(), -KEEP_DAYS);
  db.schedule.added = db.schedule.added.filter((d) => d >= cutoff);
  db.schedule.removed = db.schedule.removed.filter((d) => d >= cutoff);
  for (const d of Object.keys(db.games)) if (d < cutoff) delete db.games[d];
}

function currentName(p) {
  const u = db.users.find((x) => x.id === p.id);
  return (u && u.name) || p.name;
}

/* Everyone who answered Join, shaped the way the sorting engine wants.
   Tier and gender come from their entry on the squad list; anyone not linked
   to it yet plays as unclassified, weighted like T3. */
function joinedPlayers(game) {
  const out = [];
  for (const [userId, answer] of Object.entries(game.rsvps)) {
    if (answer !== "in") continue;
    const user = db.users.find((u) => u.id === userId);
    if (!user) continue;
    const entry = user.member && db.roster.find((m) => FB.norm(m.name) === FB.norm(user.member));
    out.push({
      id: user.id,
      name: user.name || nameFromEmail(user.email),
      member: entry ? entry.name : null,
      tier: entry ? entry.tier : "U",
      gender: entry ? entry.gender : ""
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/* One date, as the person asking is allowed to see it. Players learn their
   own answer and, once teams are drawn, their own team by name - nothing
   else. Leaders and admins also get who joined, who passed, and every team,
   with tiers. */
function gameView(date, who) {
  const kind = sessionKind(date);
  const game = db.games[date] || null;
  const view = {
    date, today: clubDate(), tz: CLUB_TZ, kind, isGame: !!kind,
    games: db.gamesVersion, signedIn: !!who, role: who ? who.role : null
  };
  if (!who) return view;

  const draw = game && game.draw;
  view.me = { rsvp: (game && game.rsvps[who.user.id]) || null };
  view.drawn = !!draw;
  if (draw) {
    view.draw = { at: draw.at, n: draw.teams.length };
    const idx = draw.teams.findIndex((t) => t.some((p) => p.id === who.user.id));
    view.mine = idx < 0 ? null : {
      letter: TEAM_LETTERS[idx],
      members: draw.teams[idx].map(currentName)
    };
  }
  if (runsTheClub(who)) {
    view.joined = game ? joinedPlayers(game) : [];
    view.passed = game
      ? Object.entries(game.rsvps).filter(([, a]) => a === "out")
          .map(([id]) => db.users.find((u) => u.id === id)).filter(Boolean)
          .map((u) => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name))
      : [];
    if (draw) {
      view.teams = draw.teams.map((t) => t.map((p) => ({
        id: p.id, name: currentName(p), member: p.member, tier: p.tier, gender: p.gender
      })));
    }
  }
  return view;
}

/* ------------------------------------------------------------ web push --
   Plain Web Push with VAPID, no library. Each push is EMPTY: with no payload
   there is nothing to encrypt, and the service worker shows the same
   "teams are out" message whichever push arrives. The key pair is made on
   first use and kept in the data file. */

const PUSH_CONTACT = process.env.PUSH_CONTACT || ("mailto:" + LEADER_EMAIL);

/* Only the browsers' own push services. The browser - so, the user - picks
   the address a subscription points at; without this list anyone signed in
   could make the server send requests wherever they liked. */
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.apple.com",
  "push.services.mozilla.com", "notify.windows.com"];
/* Local testing only: extra hosts allowed over plain http. */
const TEST_PUSH_HOSTS = String(process.env.PUSH_TEST_HOSTS || "")
  .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

function pushEndpointAllowed(endpoint) {
  let u;
  try { u = new URL(String(endpoint || "")); } catch (e) { return false; }
  const host = u.hostname.toLowerCase();
  if (TEST_PUSH_HOSTS.includes(host)) return true;
  return u.protocol === "https:" && PUSH_HOSTS.some((h) => host === h || host.endsWith("." + h));
}

function vapidKeys() {
  if (!db.vapid || !db.vapid.publicKey || !db.vapid.privateKey) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = publicKey.export({ format: "jwk" });
    db.vapid = {
      /* the raw uncompressed point, which is what browsers expect */
      publicKey: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")])
        .toString("base64url"),
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" })
    };
    save();
  }
  return db.vapid;
}

function vapidHeader(endpoint) {
  const v = vapidKeys();
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const data = enc({ typ: "JWT", alg: "ES256" }) + "." + enc({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: PUSH_CONTACT
  });
  const sig = crypto.sign("sha256", Buffer.from(data), { key: v.privateKey, dsaEncoding: "ieee-p1363" });
  return "vapid t=" + data + "." + sig.toString("base64url") + ", k=" + v.publicKey;
}

/* Resolves with the push service's status code, or 0 if unreachable. */
function pushOne(endpoint) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(endpoint); } catch (e) { return resolve(0); }
    const lib = u.protocol === "http:" ? http : https;
    const req = lib.request(u, {
      method: "POST",
      headers: { TTL: "43200", Urgency: "high", Authorization: vapidHeader(endpoint), "Content-Length": "0" }
    }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on("error", () => resolve(0));
    req.setTimeout(10000, () => { req.destroy(); resolve(0); });
    req.end();
  });
}

/* Fire and forget, so a slow push service never holds up the draw. Returns
   how many devices are being told. */
function notifyUsers(userIds) {
  const jobs = [];
  for (const id of userIds) for (const s of db.push[id] || []) jobs.push({ id, endpoint: s.endpoint });
  if (!jobs.length) return 0;
  Promise.all(jobs.map((j) => pushOne(j.endpoint).then((status) => ({ ...j, status })))).then((results) => {
    let changed = false;
    for (const r of results) {
      /* 404 and 410 mean the subscription is gone for good. */
      if (r.status === 404 || r.status === 410) {
        db.push[r.id] = (db.push[r.id] || []).filter((s) => s.endpoint !== r.endpoint);
        changed = true;
      }
    }
    if (changed) save();
    const ok = results.filter((r) => r.status >= 200 && r.status < 300).length;
    console.log(`Push: ${ok} of ${results.length} accepted by the push services`);
  });
  return jobs.length;
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

/* Not signed in is a 401; signed in as a player is a 403. */
function refuse(res, who) {
  return who
    ? send(res, 403, { error: "Only the club's leaders and admins can do that." })
    : send(res, 401, { error: "Sign in as a club leader first." });
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
      /* `games` moves on every answer, draw and calendar change, separately
         from the roster's `version`, so a Join does not make every open page
         refetch the whole squad. */
      return send(res, 200, { version: db.version, games: db.gamesVersion });
    }

    if (route === "/state" && req.method === "GET") {
      /* Tiers are for leaders and admins. Players and visitors get names
         only, so the ranking never reaches their browser at all. */
      const full = runsTheClub(whoIs(req));
      return send(res, 200, {
        version: db.version,
        roster: full ? db.roster : db.roster.map((m) => ({ name: m.name, gender: m.gender })),
        teams: db.teams,
        updatedAt: db.updatedAt
      });
    }

    /* --- sign in with Microsoft ----------------------------------------- */

    if (route === "/login/microsoft" && req.method === "POST") {
      const body = await readBody(req);
      let claim;
      try {
        claim = await verifyMicrosoftToken(body.idToken);
      } catch (e) {
        return send(res, 401, { error: e.message || "That Microsoft sign-in could not be verified." });
      }

      /* preferred_username is the signed-in address; email is a fallback. */
      const email = String(claim.preferred_username || claim.email || "").trim().toLowerCase();
      if (!isSchoolEmail(email)) {
        return send(res, 403, { error: "Sign in with your Tsinglan school account (" + EMAIL_DOMAIN + ")." });
      }
      const name = displayName(email, claim.name);

      /* First Microsoft sign-in creates the account; later ones update the
         display name. Microsoft has already proved the address is theirs, so
         a leader address needs nothing extra. */
      let user = db.users.find((u) => u.email === email);
      if (!user) {
        user = {
          id: crypto.randomBytes(8).toString("hex"),
          email,
          name,
          member: matchMember(email, name),
          linkedByHand: false,
          createdAt: Date.now()
        };
        db.users.push(user);
      } else if (name && user.name !== name) {
        user.name = name;
      }
      save();
      return send(res, 200, { token: issueToken(user.id), account: accountView(user) });
    }

    if (route === "/logout" && req.method === "POST") {
      const token = bearer(req);
      if (token && db.sessions[tokenKey(token)]) {
        delete db.sessions[tokenKey(token)];
        save();
      }
      return send(res, 200, {});
    }

    if (route === "/me" && req.method === "GET") {
      const who = whoIs(req);
      if (!who) return send(res, 401, { error: "Not signed in." });
      return send(res, 200, { role: who.role, account: who.user ? accountView(who.user) : null });
    }

    /* --- write: leaders and admins only. Checked HERE, so nobody can get
           past it by changing anything in their own browser. ---------------- */

    if (route === "/roster" && req.method === "PUT") {
      const who = whoIs(req);
      if (!runsTheClub(who)) return refuse(res, who);
      const body = await readBody(req);
      if (missingTiers(body.roster)) {
        return send(res, 400, { error: "Some members arrived without a level, so nothing was saved. Reload the page and try again." });
      }
      db.roster = cleanRoster(body.roster);
      relinkAccounts();
      db.version++;
      save();
      return send(res, 200, { version: db.version, count: db.roster.length });
    }

    if (route === "/teams" && req.method === "PUT") {
      const who = whoIs(req);
      if (!runsTheClub(who)) return refuse(res, who);
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
      const who = whoIs(req);
      if (!runsTheClub(who)) return refuse(res, who);
      db.teams = null;
      db.version++;
      save();
      return send(res, 200, { version: db.version });
    }

    /* --- accounts: leaders and admins ------------------------------------ */

    if (route === "/accounts" && req.method === "GET") {
      const who = whoIs(req);
      if (!runsTheClub(who)) return refuse(res, who);
      return send(res, 200, {
        accounts: db.users.map((u) => ({
          id: u.id, ...accountView(u), linkedByHand: !!u.linkedByHand, createdAt: u.createdAt
        }))
      });
    }

    const one = /^\/accounts\/([a-f0-9]{16})$/.exec(route);

    if (one && req.method === "PUT") {
      const who = whoIs(req);
      if (!runsTheClub(who)) return refuse(res, who);
      const user = db.users.find((u) => u.id === one[1]);
      if (!user) return send(res, 404, { error: "No such account." });
      const body = await readBody(req);
      let member = null;
      if (body.member) {
        const entry = db.roster.find((m) => FB.norm(m.name) === FB.norm(body.member));
        if (!entry) return send(res, 400, { error: "That name is not on the roster." });
        const owner = db.users.find((u) => u !== user && u.member && FB.norm(u.member) === FB.norm(entry.name));
        if (owner) return send(res, 409, { error: entry.name + " is already linked to " + owner.email + "." });
        member = entry.name;
      }
      user.member = member;
      user.linkedByHand = true;
      save();
      return send(res, 200, { account: { id: user.id, ...accountView(user), linkedByHand: true } });
    }

    if (one && req.method === "DELETE") {
      const who = whoIs(req);
      if (!runsTheClub(who)) return refuse(res, who);
      const user = db.users.find((u) => u.id === one[1]);
      if (!user) return send(res, 404, { error: "No such account." });
      /* The supreme leader's account cannot be removed from the site, and
         only the supreme leader can remove an admin's. */
      const target = roleFor(user.email);
      if (target === "leader") {
        return send(res, 403, { error: "The supreme leader's account cannot be removed." });
      }
      if (target === "admin" && who.role !== "leader") {
        return send(res, 403, { error: "Only the supreme leader can remove an admin's account." });
      }
      db.users = db.users.filter((u) => u !== user);
      for (const [key, s] of Object.entries(db.sessions)) {
        if (s.userId === user.id) delete db.sessions[key];
      }
      delete db.push[user.id];
      for (const g of Object.values(db.games)) delete g.rsvps[user.id];
      save();
      return send(res, 200, {});
    }

    /* --- sessions: the calendar ------------------------------------------ */

    if (route === "/schedule" && req.method === "GET") {
      const month = url.searchParams.get("month") || clubDate().slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return send(res, 400, { error: "Month should look like 2026-09." });
      const full = runsTheClub(whoIs(req));
      const [y, m] = month.split("-").map(Number);
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const sessions = [];
      for (let d = 1; d <= days; d++) {
        const date = month + "-" + String(d).padStart(2, "0");
        const kind = sessionKind(date);
        if (!kind) continue;
        const g = db.games[date];
        const s = { date, kind, drawn: !!(g && g.draw) };
        if (full) s.joined = g ? Object.values(g.rsvps).filter((a) => a === "in").length : 0;
        sessions.push(s);
      }
      return send(res, 200, {
        month, today: clubDate(), tz: CLUB_TZ, weekdays: db.schedule.weekdays,
        sessions, games: db.gamesVersion
      });
    }

    if (route === "/schedule" && req.method === "POST") {
      const who = whoIs(req);
      if (!runsTheClub(who)) return refuse(res, who);
      const body = await readBody(req);
      const date = String(body.date || "");
      if (!isDateString(date)) return send(res, 400, { error: "That is not a date." });
      if (date < clubDate()) return send(res, 400, { error: "That day has already passed." });
      const s = db.schedule;
      if (body.action === "add") {
        s.removed = s.removed.filter((d) => d !== date);
        if (!sessionKind(date)) s.added.push(date);        /* not a regular day: a one-off */
      } else if (body.action === "remove") {
        s.added = s.added.filter((d) => d !== date);
        if (sessionKind(date)) s.removed.push(date);       /* still a regular day: call it off */
        delete db.games[date];                              /* its answers and teams go with it */
      } else {
        return send(res, 400, { error: "Say whether to add or remove the session." });
      }
      pruneSessions();
      db.gamesVersion++;
      save();
      return send(res, 200, { date, kind: sessionKind(date), games: db.gamesVersion });
    }

    /* --- sessions: tonight's game ---------------------------------------- */

    if (route === "/game" && req.method === "GET") {
      const date = url.searchParams.get("date") || clubDate();
      if (!isDateString(date)) return send(res, 400, { error: "That is not a date." });
      return send(res, 200, gameView(date, whoIs(req)));
    }

    const rsvp = /^\/game\/(\d{4}-\d{2}-\d{2})\/rsvp$/.exec(route);
    if (rsvp && req.method === "PUT") {
      const who = whoIs(req);
      if (!who) return send(res, 401, { error: "Sign in with your Tsinglan account first." });
      /* Per person: nobody changes their mind 60 times in ten minutes, but a
         script flipping an answer would rewrite the data file nonstop. */
      if (tooMany("rsvp:" + who.user.id, 60, 10 * 60 * 1000)) {
        return send(res, 429, { error: "That is a lot of changes. Wait a few minutes." });
      }
      const date = rsvp[1];
      if (!isDateString(date) || !sessionKind(date)) return send(res, 400, { error: "There is no game on that day." });
      if (date < clubDate()) return send(res, 400, { error: "That game is over." });
      const body = await readBody(req);
      if (body.status !== "in" && body.status !== "out") return send(res, 400, { error: "Answer in or out." });
      const game = gameFor(date);
      if (game.draw) return send(res, 409, { error: "The teams for this game are already out." });
      game.rsvps[who.user.id] = body.status;
      db.gamesVersion++;
      save();
      return send(res, 200, gameView(date, who));
    }

    const draw = /^\/game\/(\d{4}-\d{2}-\d{2})\/draw$/.exec(route);
    if (draw && (req.method === "POST" || req.method === "DELETE")) {
      const who = whoIs(req);
      if (!who) return send(res, 401, { error: "Sign in first." });
      if (who.role !== "leader") return send(res, 403, { error: "Only the supreme leader draws the teams." });
      const date = draw[1];
      if (!isDateString(date) || !sessionKind(date)) return send(res, 400, { error: "There is no game on that day." });
      if (date < clubDate()) return send(res, 400, { error: "That game is over." });
      const game = gameFor(date);

      if (req.method === "DELETE") {
        /* Takes the teams back and reopens Join / I'll pass. */
        game.draw = null;
        db.gamesVersion++;
        save();
        return send(res, 200, gameView(date, who));
      }

      const body = await readBody(req);
      const n = Math.floor(Number(body.n));
      if (!(n >= 2 && n <= TEAM_LETTERS.length)) {
        return send(res, 400, { error: "Pick between 2 and " + TEAM_LETTERS.length + " teams." });
      }
      const players = joinedPlayers(game);
      if (players.length < n) {
        return send(res, 400, { error: players.length + " joined so far - not enough for " + n + " teams." });
      }
      /* Fair teams: everyone who joined plays, balanced by gender first and
         then by tier. The other editions leave people out, which would leave
         someone who pressed Join with no team to find. */
      const result = FB.sort(players, "fair", n);
      if (result.error) return send(res, 400, { error: result.error });
      game.draw = {
        at: Date.now(),
        by: who.user.email,
        teams: result.teams.map((t) => t.map((p) => ({
          id: p.id, name: p.name, member: p.member, tier: p.tier, gender: p.gender
        })))
      };
      db.gamesVersion++;
      save();
      /* Tell everyone on a team - except whoever just pressed the disc. */
      const notifying = notifyUsers(players.map((p) => p.id).filter((id) => id !== who.user.id));
      return send(res, 200, { ...gameView(date, who), notifying });
    }

    /* --- push notifications ---------------------------------------------- */

    if (route === "/push/key" && req.method === "GET") {
      return send(res, 200, { publicKey: vapidKeys().publicKey });
    }

    if (route === "/push/subscribe" && req.method === "POST") {
      const who = whoIs(req);
      if (!who) return send(res, 401, { error: "Sign in first." });
      const body = await readBody(req);
      const endpoint = body.subscription && body.subscription.endpoint;
      if (!pushEndpointAllowed(endpoint)) {
        return send(res, 400, { error: "That is not a notification address this server can send to." });
      }
      const list = (db.push[who.user.id] || []).filter((s) => s.endpoint !== endpoint);
      list.push({ endpoint: String(endpoint), at: Date.now() });
      while (list.length > 5) list.shift();                 /* a few devices each is plenty */
      db.push[who.user.id] = list;
      save();
      return send(res, 200, { ok: true, devices: list.length });
    }

    return send(res, 404, { error: "No such endpoint: " + route });
  } catch (err) {
    return send(res, 400, { error: err.message || "Bad request" });
  }
});

/* Requiring this file (rather than running it) does not start a server. */
module.exports = { verifyMicrosoftToken };

if (require.main === module) {
  load();
  server.listen(PORT, () => {
    console.log(`Frisbeing API listening on http://localhost:${PORT}`);
    console.log(`  ${db.roster.length} members, ${db.users.length} accounts, version ${db.version}`);
    console.log(`  data file: ${DATA_FILE}`);
    if (!ENTRA_CLIENT_ID || !ENTRA_TENANT_ID) {
      console.log("  WARNING: Microsoft sign-in is off. Set ENTRA_TENANT_ID and ENTRA_CLIENT_ID.");
    }
  });
}
