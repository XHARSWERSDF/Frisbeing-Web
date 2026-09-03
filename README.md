# Frisbeing UF

Website and team sorter for the Tsinglan School ultimate frisbee club.

Plain HTML, CSS and JavaScript. No build step, no npm, nothing to install —
open a file and it runs. The person who inherits this club in two years can
read the source and understand it.

## Pages

| File | What it is |
|---|---|
| `index.html` | The club info page, built from the brochure |
| `sort.html` | The team sorter — attendance in, teams out |
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

## The two input boxes

**Club roster** (on `sort.html` under *Club roster*, or on `roster.html`) —
one member per line:

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

**Tonight's attendance** (on `sort.html`) — paste the sign-up list straight
from the group chat. The parser strips numbering (`1.` `2、`), bullets,
`@mentions`, ticks and emoji, bracketed asides (`(late)`, `（可能迟到）`),
trailing `+1`, and notes after a dash. It splits on newlines and commas,
ignores headers and timestamps, and matches names case- and spacing-
insensitively, including unique first-name matches.

Anyone it cannot place is reported, not dropped:

- **Not on the roster** — a typo, or someone who needs adding
- **Too vague** — "David" when there is a David Chen and a David Chan
- **Listed twice** — counted once

## The three editions

| Edition | Who is in the draw |
|---|---|
| **Fair teams** | Everyone present, balanced across all three levels |
| **Tournament pool** | Advanced and intermediate only |
| **Beginner rounds** | Intermediate and beginner, plus exactly one advanced player per team |

Beginner rounds refuses rather than guesses if there are not enough advanced
players present for the number of teams requested.

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

**File mode** is what ships. The squad comes from `roster.json`, leaders edit
in their own browser, and team draws are shared with a link.

**Server mode** switches the same site over to a shared database:

- A leader adds a member &mdash; everyone with the page open sees it within
  about 10 seconds, without reloading
- A leader sorts &mdash; the draw appears for everyone, no share link needed
- Edits work from any device; no more Publish and no more sending files
- The passcode is checked **on the server**, so a member cannot get past it
  with developer tools

Nothing else changes: same design, same sorting, same PDF upload. The roster
also stays cached on each device, so the sorter still works on a field with
no signal.

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

## Sharing tonight's teams

There is no database, so a draw has nowhere to live on the server. Instead it
travels inside a link.

After sorting, press **Share link**. That copies a URL with the teams encoded
into it &mdash; paste it into the group chat, and anyone who opens it sees the
rosters on the real site: names only, no skill levels, no leader controls. A
full 39-player draw makes a link of about 700 characters.

If the browser refuses clipboard access, the link appears in a box below the
button so it can be copied by hand.

Sorting again replaces the link, so old ones keep showing the draw they were
made from &mdash; which is usually what you want when someone scrolls back.

## Admin access

Members get a read-only site: the club page, the squad list by name, and a
frisbee they can spin. **Sorting teams, editing the roster, and seeing skill
levels are for club leaders.** Sign in at `admin.html` (the *Leaders* link).

Everything is configured in **`assets/auth-config.js`**.

### Be honest about what this is

The site is static and the roster lives in each browser's own storage, so this
check runs on the visitor's machine. Anyone who opens developer tools can
switch it off. That is fine here because there is nothing shared to protect:
turning the gate off only lets someone sort teams in their own browser with
their own copy of the roster. It cannot change anything for anyone else.

What it does buy: members see a clean site, skill levels stay private, and
nobody edits the roster by wandering in.

If you ever need access genuinely **enforced**, put
[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
in front of `sort.html`, `roster.html` and `admin.html`. It gates on real
Google Workspace login at the edge, is free up to 50 users, and needs no code.

Sharing the passcode with the other leaders is a perfectly reasonable way to
run this, and needs no setup at all. The Google option below is optional.

### Set up school Google sign-in

1. Go to <https://console.cloud.google.com/apis/credentials>, create a project.
2. **Create credentials → OAuth client ID → Web application.**
3. Under *Authorised JavaScript origins* add your site's address, exactly
   (e.g. `https://frisbeing.netlify.app`). Add `http://localhost:8931` too if
   you want to test locally.
4. Copy the client ID into `googleClientId` in `assets/auth-config.js`.

### Say who the leaders are

**This is the important bit.** `emailDomain` alone would make every student
with a school address an admin. `adminEmails` is the list that actually
decides:

```js
adminEmails: [
  "harry.xu_27@tsinglan.org",
  "michael.cheng_27@tsinglan.org"
]
```

An empty list denies everyone rather than letting everyone in.

### The passcode

`passcode` lets you run the sorter before Google sign-in is set up, and gets
you in at the field when Google is unreachable. **Change it from the default**,
and set it to `""` once Google sign-in works if you want it gone.

A sign-in lasts `sessionDays` (30 by default) on that device.

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
background for next time. There is no version string to remember to bump.

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
  sort.js              sorter page
  roster.js            members page
  auth-config.js       who can sort and edit - the file you edit
  auth.js              the leader gate
  admin.js             leader sign-in page
  monogram.png         extracted from the A3 poster
  icon-*.png           home screen icons
  photos/              club photographs
```

Colours are sampled from the poster and brochure: ink `#08150F`, field
`#0E2018`, pitch `#11261D`, brand green `#1C4734`, silver `#C0C0BF`, chalk
white. Type is Anton (skewed −9° to match the poster italic), Space Mono for
labels, Plus Jakarta Sans for body.
