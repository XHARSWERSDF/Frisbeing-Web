# The Frisbeing API

What the website needs from a server. Hand this to whoever is setting it up.

`server.js` next to this file is a working implementation in plain Node — no
npm install, no framework. If the host runs Node, just run it. If it runs PHP,
Python or anything else, treat `server.js` as the spec: the endpoints and JSON
shapes below are all the website cares about.

## Run the reference server

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

`tier` is the internal skill code `A`, `I` or `B` (shown in the app as T1, T2
and T3), and is **sent only to leaders and admins**. Players and visitors get
`{ "name", "gender" }` for each member. `teams` is `null` when no draw has been
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

`GET /me` → `{ "role": "player", "account": { ... } }`, or `401` when the token
is no longer valid.

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
| `GET /game?date=…` | anyone | — | That day as the asker may see it (defaults to today). Everyone: `{ date, today, isGame, kind }`. Signed in, also: `me.rsvp`, `drawn`, and `mine: { letter, members: [names] }` once teams are out. Leaders and admins, also: `joined` (with tier and gender), `passed`, and every team in `teams` |
| `PUT /game/:date/rsvp` | signed in | `{ "status": "in" \| "out" }` | the updated view. `409` once the teams are drawn |
| `POST /game/:date/draw` | **supreme leader only** | `{ "n": 3 }` | the updated view, plus `notifying`: how many devices are being told |
| `DELETE /game/:date/draw` | **supreme leader only** | — | takes the teams back and reopens answers |

A draw is always **Fair teams** over everyone who answered `in`: gender first,
then tier, using `assets/engine.js`. A player not linked to the squad list
plays as unclassified. The draw stores each player's id, so the team a player
is shown is always their own.

### Push notifications

| Request | Who | Body | Returns |
|---|---|---|---|
| `GET /push/key` | anyone | — | `{ "publicKey" }` — the VAPID key the browser subscribes with |
| `POST /push/subscribe` | signed in | `{ "subscription": { "endpoint", … } }` | `{ ok, devices }`. Up to 5 devices per account |

When the supreme leader draws, everyone on a team except the leader is sent an
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
