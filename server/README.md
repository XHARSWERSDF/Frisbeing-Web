# The Frisbeing API

What the website needs from a server. Hand this to whoever is setting it up.

`server.js` next to this file is a working implementation in plain Node — no
npm install, no framework. If the host runs Node, just run it. If it runs PHP,
Python or anything else, treat `server.js` as the spec: the endpoints and JSON
shapes below are all the website cares about.

## Run the reference server

For a local preview with test accounts, run `node server/preview.cjs --demo`
from the website folder, then open `http://localhost:8931/__demo`. Choose
an admin, Handle, Cutter, T2, T3 or unclassified player, or browse as a guest.
Open the chooser in separate tabs to test several accounts at once. Each tab
keeps its own sign-in. Today and tomorrow are scheduled, with sample
attendance ready for a draw and an extra Handle available to join late.

Demo mode uses a temporary database and local signing keys, while the API
still checks account permissions and signatures. It does not edit
`server/data.json`. Restarting resets the demo. Run `node server/preview.cjs`
without `--demo` to use the regular database and Microsoft sign-in.

Known genders are sourced from the GitHub roster and applied once per
`genderRevision` in `roster-update.json`. Confirmed renames retain their
original gender. New names remain unset; later admin edits are preserved.

From the website folder — the server borrows `assets/engine.js` to match
names the same way the sorter does. Give it the two Microsoft Entra IDs from
the app registration (see the main `README.md`, *Microsoft sign-in*):

```bash
ENTRA_TENANT_ID=your-tenant-id ENTRA_CLIENT_ID=your-client-id node server/server.js
```

The same two IDs go into `assets/auth-config.js` for the page. Without them the
server runs but rejects every sign-in, and the Account page says so.

Settings:

| Variable | Default | What it does |
|---|---|---|
| `ENTRA_TENANT_ID` | — | **Required.** Directory (tenant) ID of the Tsinglan organisation. The server only accepts logins from this tenant |
| `ENTRA_CLIENT_ID` | — | **Required.** Application (client) ID of the app registration. The server only accepts tokens issued for this app |
| `ENTRA_JWKS_URL` | Microsoft's keys for the tenant | Where the server fetches Microsoft's public signing keys. Leave it; override only for local testing |
| `PORT` | `8080` | Port to listen on |
| `CLUB_TZ` | `Asia/Shanghai` | The club's timezone. Decides which date counts as "tonight" |
| `PUSH_CONTACT` | `mailto:` + the supreme leader | Contact address sent to the browsers' push services with each notification, as Web Push requires |
| `PUSH_TEST_HOSTS` | — | Local testing only: extra hosts notifications may be sent to over plain http. Leave unset in production |
| `DATA_FILE` | `server/data.json` | Where the data is kept |
| `ORIGIN` | `*` | Set to the website's address to lock down CORS |

On first run it seeds itself from the `roster.json` shipped with the website,
so it starts with the squad already in it.

## Who is who

Roles come from the sign-up address, set at the top of `server.js`:

- `LEADER_EMAIL` — the supreme leader
- `ADMIN_EMAILS` — the admins
- every other `@tsinglan.org` address — a player

They are read on every request, so editing the list changes existing accounts
straight away.

## The member directory

`directory.json` next to `server.js` is the club's own list of who is who,
keyed by school email. It is **optional** — the server runs fine without it —
but with it, a Microsoft sign-in is recognised by address rather than by
guessing a name out of the email, and each member is greeted by the name they
like to be called.

```json
{
  "harry.xu_27@tsinglan.org": { "name": "Harry Xu", "preferred": "Maguire", "grade": "G12" }
}
```

- `name` is the member's full name, and is what gets matched to their entry on
  the squad list (which carries the skill tier).
- `preferred` is what they like to be called; it becomes their display name.
  Leave it `""` to fall back to the full name.
- `grade` is free text, only there to tell current members from graduated ones.

On each sign-in the server looks the address up here: the display name is
`preferred` (or `name`), and the squad match tries `name` first, then falls
back to the name read from the address. An address that is not in the directory
still signs in — as a player, matched by the old address-guess — so newcomers
are not locked out.

**`directory.json` is gitignored and must never be committed**: it holds real
school email addresses. `directory.example.json` shows the format and is safe
to commit. Copy it to `directory.json`, fill in the real people, and keep that
file on the server only.

## Point the website at it

In `assets/server-config.js`:

```js
apiBase: "https://your-server-address/api"
```

That single line is the switch. Empty means file mode (no server); filled in
means server mode. Nothing else changes.

## Endpoints

All paths are under `apiBase`. Everything is JSON. Signed-in requests carry
`Authorization: Bearer <token>`.

### Open to everyone

`GET /version` → `{ "version": 7, "games": 31 }`

The whole point of this one is to be tiny. Open pages call it every 10
seconds; if the numbers have not changed they do nothing. `version` moves with
the roster, `games` with every answer, draw and calendar change. They are kept
apart so a Join does not make every open page refetch the whole squad.

`GET /state` → the lot:

```json
{
  "version": 7,
  "roster": [{ "name": "Harry Xu", "tier": "A", "gender": "m" }],
  "teams": { "mode": "fair", "at": 1788083183273, "teams": [["Harry Xu"], ["Eli Liang"]] },
  "updatedAt": 1788083183273
}
```

`tier` is the internal skill code `A`, `I`, `B` or `U` (T1, T2, T3 or
unclassified), and is **sent only to leaders and admins**. Players and visitors get
`{ "name", "gender", "position" }` for each member. Position is `h` (Handle)
or `c` (Cutter). `teams` is `null` when no draw has been
posted.

### Accounts

`POST /login/microsoft` with `{ "idToken": "..." }` →
`{ "token": "...", "account": { "email", "name", "role", "member" } }`

- `idToken` is the OpenID Connect ID token the page got from Microsoft. The
  server verifies its RS256 signature against Microsoft's published keys, and
  that it was issued for this app (`ENTRA_CLIENT_ID`) by this tenant
  (`ENTRA_TENANT_ID`), and is unexpired
- The address inside the token must end in `@tsinglan.org`
- `role` is `leader`, `admin` or `player`; `member` is the linked roster name, or `null`
- First login for an address creates the account and matches it to the squad
  list; later logins return the existing account
- A token that fails verification → `401`; a valid non-Tsinglan account → `403`

There is no password or passcode endpoint: Microsoft is the only way in.

`GET /me` returns the signed-in account, its teammate group, incoming
invitations and pending invitations it sent. `attendanceCount` is the number
of sessions the member was marked in for at the 9pm China-time cutoff.

`GET /gear-products` returns the GearHub catalog. Admins and the Admin Manager
can add, edit, or remove products with `POST /gear-products`,
`PUT /gear-products/:id`, and `DELETE /gear-products/:id`. Product images are
optional; uploaded images are resized in the browser and stored as JPEG data
URLs with the product record.

`PUT /me/preferences` accepts `{ "preferredTeammates": ["Name", "Name"] }`
and sends invitations to at most two roster members. The captain of a
two-person group can invite one more member with `POST /me/teammate-invitations`
and `{ "member": "Name" }`. Invitees respond at
`POST /me/teammate-invitations/:id/respond` with `{ "response": "accept" }` or
`{ "response": "decline" }`. An accepted invitation adds the invitee to the
captain's group, which is limited to three people.
Each account can belong to only one group. A member may receive invitations
from multiple captains, but accepting one makes all their other pending
invitations unavailable and removes them from the member's invitation list.
The captain can remove another member with `DELETE
/me/teammate-group/members/:memberId`; any member can use the same endpoint
for their own ID to leave. If the captain leaves a group of three, the next
member becomes captain; groups with fewer than two people are dissolved.

`POST /logout` with the token in the header. Always `200`.

### Leaders and admins only

**Check these on the server.** This is the whole reason the server exists —
without it anyone could edit the roster, or read the tiers, from their
browser's developer tools. No token → `401`; a player's token → `403`.

| Request | Body | Returns |
|---|---|---|
| `PUT /roster` | `{ "roster": [...] }` | `{ "version": 8, "count": 40 }` |
| `PUT /teams` | `{ "mode": "fair", "at": 123, "teams": [["Name"]] }` | `{ "version": 9 }` |
| `DELETE /teams` | — | `{ "version": 10 }` |
| `GET /accounts` | — | `{ "accounts": [{ "id", "email", "name", "role", "member", "linkedByHand", "createdAt" }] }` |
| `PUT /accounts/:id` | `{ "member": "Name" }`, or `null` to unlink | the updated account; `409` if that name is linked to someone else |
| `DELETE /accounts/:id` | — | `{}`; the supreme leader's account cannot be removed, and only the supreme leader can remove an admin's |

A `PUT /roster` in which any member has no valid tier is refused with `400`:
that is a page which never received the tiers, not a leader clearing them.

### Game nights

Dates are `YYYY-MM-DD` in the club's timezone (`CLUB_TZ`). A date is a session
if it is a Tuesday or Thursday on or after the day the calendar was first
switched on (`schedule.since`), or a leader added it, and it has not been
called off.

| Request | Who | Body | Returns |
|---|---|---|---|
| `GET /schedule?month=2026-09` | anyone | — | `{ month, today, sessions: [{ date, kind, drawn, joined? }] }` — `kind` is `regular` or `extra`; `joined` counts only go to leaders and admins |
| `POST /schedule` | leaders, admins | `{ "date", "action": "add" \| "remove" }` | `{ date, kind }`. Past days are refused. Removing a day deletes its answers and teams |
| `GET /game?date=…` | anyone | — | That day as the asker may see it (defaults to today). Everyone: `{ date, today, isGame, kind, canJoin, participants: [{ name }] }`. Without a `date` query, also includes `upcoming`, tomorrow’s view. Signed in, also: `me.rsvp`, `drawn`, and `mine: { letter, members: [names] }` once teams are out. Leaders and admins, also: `joined` (with tier and gender), `passed`, and every team in `teams` |
| `PUT /game/:date/rsvp` | signed in | `{ "status": "in" \| "out" }` | the updated view. Available on the session day and the previous calendar day in `CLUB_TZ`; tonight's answers close at 9pm. Each date has its own answer. Joining after the draw inserts the player into a balanced existing team. Leaving removes only that player. Repeating the same answer is a no-op |
| `POST /game/:date/draw` | leaders, admins | `{ "n": 3 }` | the updated view, plus `notifying`: how many devices are being told |
| `DELETE /game/:date/draw` | leaders, admins | — | takes the teams back and reopens answers |
| `PUT /game/:date/assignment` | leaders, admins | `{ "id": "player-id", "team": 0, "position": "h" }` (team or position may be omitted) | updated view. Moves one player to an existing zero-based team and/or changes their session position; `409` if no draw exists |

A draw is always **Fair teams** over everyone who answered `in`: size, tier,
gender and position, using `assets/engine.js`. A player not linked to the squad list
plays as unclassified. The draw stores each player's id, so the team a player
is shown is always their own.

`mine` also includes `position` and `players: [{ id, name, position }]` for
the player's own team. No tiers or other teams are included. Admin team rows
include positions. Assignment changes increment `games`, are saved, and
notify the affected member. The draw's `at` remains stable during late joins
and moves; only a new draw changes it.

Public `participants` contains display names only, including after a draw;
it excludes tiers, positions, account identifiers, emails, passing lists and
team assignments. Today and tomorrow have independent attendance. Team
draws are restricted to the session day. Canceling a session removes its
attendance and hides its card on the next poll. At 9pm `CLUB_TZ`, the server
freezes each session's `in` answers as present and adds one to those members'
attendance totals. Finalization is idempotent across restarts; canceling a
session after finalization also removes its attendance from those totals.

On startup, `roster-update.json` merges the newest supplied list once per
revision into the persisted roster. Blank tiers retain existing values or
become U for new names; positions default to Cutter. Do not omit this file
when deploying the server. `directory.json` contains the updated email/name
matching data locally and remains ignored by Git.

### Push notifications

| Request | Who | Body | Returns |
|---|---|---|---|
| `GET /push/key` | anyone | — | `{ "publicKey" }` — the VAPID key the browser subscribes with |
| `POST /push/subscribe` | signed in | `{ "subscription": { "endpoint", … } }` | `{ ok, devices }`. Up to 5 devices per account |

When an admin draws, everyone on a team except the admin is sent an
**empty** Web Push: no payload, so nothing to encrypt. The service worker
(`sw.js`) turns it into "Teams are out! Tap to see which team you're on".
The VAPID key pair is generated on first use and stored in the data file.
Subscriptions the push service reports as gone (`404` / `410`) are dropped.

**Only real push services are accepted** (Google, Apple, Mozilla, Microsoft).
The browser chooses a subscription's address, so without that list anyone
signed in could make the server send requests anywhere.

## Rules the server must follow

- **`version` increases on every roster or teams write.** Polling depends on
  it. If it does not change, open pages will never notice the update.
- **Reject writes without a leader's or admin's token.** Not optional.
- **Never send tiers to anyone else**, players included.
- **Verify the Microsoft ID token** on every sign-in — signature, audience,
  issuer, tenant and expiry — before trusting the address inside it. Never
  trust an address a client simply claims.
- **Clean the roster on the way in** — trim names, drop duplicate names. The
  sorter assumes names are unique.
- **CORS** — if the API is on a different address from the website, it needs
  `Access-Control-Allow-Origin` and must answer `OPTIONS`.

## Things worth knowing

- Data is one JSON file, written to a temp file and renamed. A crash mid-write
  cannot leave a half-written roster.
- Accounts and sign-ins live in the same file, so nobody is signed out by a
  restart. Only a SHA-256 hash of each sign-in token is stored.
- The data file also holds the **push notification private key**, so keep it
  private (it is gitignored) and back it up. If it is lost, a new key is made
  and each phone re-subscribes on its next visit to the Sorter page.
- **Sign-in has no attempt limit.** There is no password to guess: a token is
  either signed by Microsoft for this app or refused. Limits are never counted
  per network address, because the whole school shares one public address and
  would be locked out together. The one limit left is per account: 60 Join /
  I'll pass changes in 10 minutes, in memory. A restart resets it.
- Microsoft's signing keys are cached for an hour. A token naming an unknown
  key refetches them at most once a minute, so junk tokens cannot make the
  server hammer Microsoft.
- The website keeps its own copy of the last known roster, so the sorter still
  works on a field with no signal. Draws made offline are not posted until the
  connection returns — the leader is told when that happens.
