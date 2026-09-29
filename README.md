# Frisbeing UF

Website and team sorter for the Tsinglan School ultimate frisbee club.

Plain HTML, CSS and JavaScript. No build step, no npm, nothing to install —
open a file and it runs. The person who inherits this club in two years can
read the source and understand it.

## Pages

| File | What it is |
|---|---|
| `index.html` | The club info page, built from the brochure |
| `sort.html` | Tonight's game — Join / I'll pass, the session calendar, the draw, and each player's team reveal |
| `roster.html` | Member management, backup and restore |
| `admin.html` | Club leader sign-in |
| `roster.json` | The published squad &mdash; what everyone sees |

## Running it locally

Double-clicking the files works, but the service worker and "add to home
screen" need a real server. From this folder:

```bash
python3 -m http.server 8931
```

Then open <http://localhost:8931>.

**While editing:** the service worker serves files from its cache, so your
changes may not show up on reload. In DevTools open *Application &rarr; Service
Workers* and tick **Update on reload**, or press **Unregister** once.

## Game nights

The **Sorter** page (`sort.html`) is tonight's game. It needs server mode and
Microsoft sign-in (see below).

**What a player sees** — one big message about tonight:

1. No session tonight: *No Current Scheduled Games For Tonight* / *Stay tuned
   next day!* and three spinning 🥏.
2. A session tonight: *🔥 TONIGHT 🔥 — We shall have a GAME OF “激情❤️‍🔥”
   FRISBEE* with **Join** and **I'll pass**. Signed-out visitors get a
   *Sign in to join* button instead.
3. After answering: *You're In! Stay tuned for the team selection!* or *It's
   alr, Cya another day!* They can change their answer until the teams are
   drawn; after that it is locked.
4. Once the teams are drawn, everyone who joined gets a **push notification**,
   and their page becomes a disc — *See Your … TEAM!!!* Tapping it spins the
   disc and reveals *You are on team* **A** (or B, C…) with their teammates.
   Players only ever see their own team, by name, never a tier.

**What leaders and admins also get** — a calendar under tonight's message:

- Every **Tuesday and Thursday** is a session by default (white bubbles). Tap
  any day to **schedule** an extra one (gold bubbles) or **call one off**.
  Calling off a day deletes its answers and teams. Past days are read-only.
- For the selected day: who **joined** and who is **passing**, with gender,
  and T1/T2/T3 when *Show skill levels* is on. Nicknames show next to the
  squad-list name, and anyone not linked to the squad list plays as
  unclassified.
- **Only the supreme leader draws.** Pick the number of teams, spin the disc,
  and the server sorts everyone who joined — gender first, then tier (see
  *How the sorting works*) — and notifies them. The disc stays for a
  **Reshuffle**, and *Take teams back* reopens Join / I'll pass.

Session draws always use **Fair teams**, because every other edition leaves
someone out — and a player who pressed Join must always have a team to find.
"Tonight" is China time, decided by the server (`CLUB_TZ`), so a phone with
the wrong clock cannot show the wrong day.

**Notifications on iPhone** only work once the site is added to the Home
Screen (Share → *Add to Home Screen*) and opened from there — that is Apple's
rule for web push. The page tells iPhone users this when they join. Android
and desktop browsers ask for permission when the player taps Join.

## Club roster format

On `roster.html`, one member per line:

```
Harry Xu_advance
Cindy Lin_intermediate
Bruce Lai_beginner
```

Levels understood: `advance` / `advanced` / `adv` / `a`, `intermediate` /
`inter` / `int` / `i`, `beginner` / `beg` / `b` / `new`, plus 高级 / 中级 /
初级. A comma, colon, tab or spaced hyphen works instead of the underscore.
Lines that cannot be read are listed back to you with the reason — nothing is
silently dropped.

## Other editions

`assets/engine.js` still has the older editions — **Tournament pool** (T1 and
T2 only), **Elite pool** (the names in `FB.MODES.elite.members`) and
**Development** (T2 and T3 plus one T1 per team). The game-night page does not
offer them, since each one leaves some of the people who joined without a
team. They are kept so they can be brought back, for example as a separate
tournament page. Its paste-the-attendance parser (`FB.parseAttendance`) is
kept for the same reason.

## How the sorting works

**Gender first, then skill.** If members have a gender set (girl / boy), the
sorter hands out girls and boys in separate passes, so every team gets the
same number of each give or take one. Skill is balanced underneath that. Set
gender on the Members page (the ♀ / ♂ toggles) or in the list as
`Name_Gender_Level`, e.g. `Harry Xu_boy_advanced`. Members with no gender set
are still spread evenly, just not counted as boys or girls.


1. Shuffle within each level, so teams differ every week.
2. Deal level by level. Before each level the draft order is re-sorted so the
   currently smallest — then weakest — team picks first. Whoever missed out on
   an advanced player gets first call on the intermediates.
3. A refinement pass swaps between the strongest and weakest team, but only
   where every level stays within one of even. On a clean roster it never
   fires; it exists for when attendance skews the draw.

**Unclassified players** are people on tonight's list who are not on the
roster. They count as T3 for team strength and sit out wherever T3 sits out
(Tournament pool), but they are dealt as their own group, after the gender
passes and before the refinement pass: whole rounds, smallest teams first, so
every team gets the same number of them give or take one. Refinement never
moves them, and they are never saved to the roster.

Every team ends up within one player of every other on **each level
separately**, and within one on total size.

**Levels are hidden by default.** Rosters show names only — no letters beside
anyone, no per-team breakdown. *Show skill levels* turns both back on for
whoever is running the session, and the choice sticks on that device.

## Server mode

The site runs in one of two modes, decided by a single line in
`assets/server-config.js`:

```js
apiBase: ""                                  // file mode  (no server)
apiBase: "https://your-server/api"           // server mode
```

**File mode** is what ships. The squad comes from `roster.json` and leaders
edit in their own browser. Game nights are switched off — the Sorter page
says so — because Join, the draw and notifications all live on the server.

**Server mode** switches the same site over to a shared database:

- Game nights: the calendar, Join / I'll pass, the supreme leader's draw, push
  notifications and each player's team reveal (see *Game nights*)
- A leader adds a member &mdash; everyone with the page open sees it within
  about 10 seconds, without reloading. Answers and draws show up the same way
- Edits work from any device; no more Publish and no more sending files
- Sign-in is a real Microsoft login and every roster and tier check runs **on
  the server**, so a member cannot get past it with developer tools

Setup, endpoints and a working reference server are in
[`server/README.md`](server/README.md).

## The published roster

`roster.json` in this folder **is** the club roster. It ships with the site, so
every visitor sees the same squad list whether or not they are a leader. It
currently holds the 39 active members.

Members always see exactly what is in that file. Leaders get a working copy in
their own browser the moment they edit anything.

**To change the squad for everyone:**

1. Update your name list in Google Docs and export it as a **PDF**.
2. Sign in as a leader, go to Members, press **Choose PDF** and pick the file.
3. Press **Publish roster** &mdash; it downloads a new `roster.json`.
4. Replace `roster.json` on the website with that file and redeploy.

The PDF reader expects the format you already use &mdash; one member per line
as `Name_Level`, with numbering like `1.` stripped automatically:

```
1. Harry Xu_Advanced
2. Carina Zheng_Beginner
3. Eli Liang_Intermediate
```

It reads the text straight out of the PDF: no library ships with the site and
nothing is uploaded anywhere. A **scanned or photographed** document has no
text to read &mdash; use the paste box for those. Pasting also stays available
for a quick one-off change.

Until step 3, edits live only on that device, and the Members page says so in
an amber banner. That warning exists because editing and wondering why nobody
else can see it is the easy mistake to make.

## Accounts

With the club server switched on (see *Server mode*), anyone with a Tsinglan
school account signs in on the **Account** page with **Microsoft** — the same
login they use for Outlook and Teams. There is no separate password and no
passcode: Microsoft proves who they are, and the server decides what each
account can do, from the address:

| Role | Who | Can |
|---|---|---|
| **Supreme leader** | `harry.xu_27@tsinglan.org` | Everything an admin can, plus remove an admin's account |
| **Admin** | `kevin.xiao_26`, `justin.he_27`, `michael.cheng_27`, `jason.xu_27` | Sort teams, edit the squad, see skill levels, link and remove player accounts |
| **Player** | Every other `@tsinglan.org` address | See the squad list and tonight's teams |

The list is `LEADER_EMAIL` and `ADMIN_EMAILS` at the top of `server/server.js`.
It is read on every request, so a change applies to existing accounts at once.

**Tiers stay private.** The server takes skill levels out of the roster before
sending it to anyone who is not a leader or admin. A player's browser never
receives them — not hidden on screen, simply not there.

**Matching to the squad list.** A new account is linked to its roster entry by
the member directory (`server/directory.json`, keyed by email) if the server
has one, then by the name in the address (`alex.chen_29` → Alex Chen).
Only an exact match to an entry nobody else has claimed counts. Anyone left
over is listed first under **Members → Accounts**, where a leader picks their
name. Someone who signs up before being added to the roster is linked
automatically once they are. The directory also decides the name a member is
greeted by — the one they like to be called; see `server/README.md`.

**No impersonation.** Because Microsoft proves ownership of the address, and
roles come from the address, nobody can claim Harry's account by typing his
email — they would have to sign in to Harry's actual Microsoft account. That is
the whole reason for using the school login instead of a passcode.

**Nothing to forget.** There is no password to reset. If someone loses access
they take it up with the school's Microsoft account help, not the club.

**Before going public:** `roster.json` still ships with tiers in it, and
anyone can open that file. The server only reads it on its very first run.
Stripping the tiers from it closes the gap, at the cost of file mode and of
seeding a brand-new server from it.

## Microsoft sign-in

Members get a read-only site: the club page, the squad list by name, and a
frisbee they can spin. **Sorting teams, editing the roster, and seeing skill
levels are for club leaders.** Sign in at `admin.html` (the *Account* link).

Sign-in is the school's own **Microsoft 365** login. Nobody types a password
into this site and there is no passcode to leak: the browser is sent to
Microsoft, Microsoft sends back a signed proof of who you are, and the **club
server** — not the page — checks that proof and decides your role. Because the
check is on the server, a member cannot get past it with developer tools, and
because it is a real Microsoft login, nobody can claim another person's address.

This needs **server mode** (see above). Without the server there is no sign-in
at all; the Account page says so and the rest of the site still works.

### Register the app in Entra (one time)

Someone with a Tsinglan admin account — most likely school IT — does this once
in <https://entra.microsoft.com>. (Students usually cannot register apps
themselves; there is a note to forward to IT in `IT-request.md`.)

1. **Entra ID → App registrations → New registration.**
2. Name it e.g. *Frisbeing UF*. Under *Supported account types* choose
   **Accounts in this organizational directory only** (single tenant).
3. Under *Redirect URI* choose the **Single-page application (SPA)** platform
   and add the Account page's address, exactly — for example
   `https://frisbeing.com/admin.html`, and `http://localhost:8000/admin.html`
   too if you want to test locally. Add one line per address the site is served
   from.
4. **Register.** On the Overview page copy the **Application (client) ID** and
   the **Directory (tenant) ID**.

### Paste the two IDs in

Both go into **`assets/auth-config.js`**:

```js
entra: {
  tenantId: "the Directory (tenant) ID",
  clientId: "the Application (client) ID"
}
```

Neither is a secret — a single-page app is meant to ship them in the page, and
the security comes from the registered redirect URI and the server's checks.
While they are blank the Account page explains what is missing.

The **server** needs the same two IDs so it can verify the login, as
`ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` — see [`server/README.md`](server/README.md).

### Say who the leaders are

Roles are decided on the server, not in the page. `LEADER_EMAIL` (the supreme
leader) and `ADMIN_EMAILS` (the admins) at the top of `server/server.js` are
the list that matters; every other `@tsinglan.org` address is a player. They
are read on every request, so editing the list changes existing accounts at
once.

A sign-in lasts `sessionDays` (30 by default) on that device before Microsoft
is asked again.

## Installing it on a phone

The sorter is a PWA. The home screen icon opens straight into `sort.html`,
and it works with no signal once the site has been opened once.

- **iPhone:** open the site in **Safari** (not Chrome), Share → *Add to Home Screen*
- **Android:** Chrome → *Install app*

Needs HTTPS, which GitHub Pages and Netlify both provide free.

## Deploying

Drop this folder on any static host:

- **GitHub Pages** — push the folder, Settings → Pages → deploy from branch
- **Netlify** — drag the folder onto the dashboard

Pages are fetched network-first, so a deploy lands on the next visit. CSS, JS
and images are stale-while-revalidate: instant from cache, refreshed in the
background for next time.

**One version number to bump:** `sort.html` loads `brand.css?v=N` and
`sort.js?v=N`, where N matches `CACHE` in `sw.js`. When either file changes,
raise N in `sort.html`, in `SHELL` in `sw.js`, and in `CACHE` in `sw.js`, all
together. Otherwise a phone serves the new page with the old
script from its cache, and the page breaks until a second reload.

## Where the roster is stored

In the browser's `localStorage`, on that device only. Nothing is uploaded and
there is no account.

That means edits on your laptop do not appear on your phone. Use **Export
roster.json** on the members page and **Import roster.json** on the other
device. If the club later wants edits to sync automatically, that is a
Supabase free tier and about an hour of work — it is not needed for 40 people.

## Files

```
index.html  sort.html  roster.html
manifest.json          PWA metadata, opens at sort.html
sw.js                  offline caching
assets/
  brand.css            tokens, type, the slash-bar motif, layout
  engine.js            parsers and sorting — no DOM, unit-testable
  store.js             localStorage and the demo squad
  motion.js            damask background, parallax, scroll reveals
  sort.js              game nights: tonight, calendar, draw, team reveal
  roster.js            members page
  auth-config.js       Microsoft sign-in IDs - the file you edit
  auth.js              Microsoft sign-in and the leader gate
  admin.js             the Account / sign-in page
  monogram.png         extracted from the A3 poster
  icon-*.png           home screen icons
  photos/              club photographs
```

Colours are sampled from the poster and brochure: ink `#08150F`, field
`#0E2018`, pitch `#11261D`, brand green `#1C4734`, silver `#C0C0BF`, chalk
white. Type is Anton (skewed −9° to match the poster italic), Space Mono for
labels, Plus Jakarta Sans for body.
