# The Frisbeing API

What the website needs from a server. Hand this to whoever is setting it up.

`server.js` next to this file is a working implementation in plain Node — no
npm install, no framework. If the host runs Node, just run it. If it runs PHP,
Python or anything else, treat `server.js` as the spec: the endpoints and JSON
shapes below are all the website cares about.

## Run the reference server

```bash
PASSCODE=pick-a-real-one node server/server.js
```

Settings, all optional:

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `PASSCODE` | `frisbeing2022` | The leader passcode — **change this** |
| `DATA_FILE` | `server/data.json` | Where the data is kept |
| `ORIGIN` | `*` | Set to the website's address to lock down CORS |

On first run it seeds itself from the `roster.json` shipped with the website,
so it starts with the squad already in it.

## Point the website at it

In `assets/server-config.js`:

```js
apiBase: "https://your-server-address/api"
```

That single line is the switch. Empty means file mode (no server); filled in
means server mode. Nothing else changes.

## Endpoints

All paths are under `apiBase`. Everything is JSON.

### Open to everyone

`GET /version` → `{ "version": 7 }`

The whole point of this one is to be tiny. Open pages call it every 10
seconds; if the number has not changed they do nothing.

`GET /state` → the lot:

```json
{
  "version": 7,
  "roster": [{ "name": "Harry Xu", "tier": "A" }],
  "teams": { "mode": "fair", "at": 1788083183273, "teams": [["Harry Xu"], ["Eli Liang"]] },
  "updatedAt": 1788083183273
}
```

`tier` is `A`, `I` or `B`. `teams` is `null` when no draw has been posted.

### Sign in

`POST /login` with `{ "passcode": "..." }` → `{ "token": "...", "name": "Club leader" }`

Wrong passcode → `401` with `{ "error": "That passcode is not right." }`

`POST /logout` with the token in the header. Always `200`.

### Leaders only

These require `Authorization: Bearer <token>`. **Check it on the server.** This
is the whole reason the server exists — without this check a member can edit
the roster from their browser's developer tools.

| Request | Body | Returns |
|---|---|---|
| `PUT /roster` | `{ "roster": [...] }` | `{ "version": 8, "count": 40 }` |
| `PUT /teams` | `{ "mode": "fair", "at": 123, "teams": [["Name"]] }` | `{ "version": 9 }` |
| `DELETE /teams` | — | `{ "version": 10 }` |

Without a valid token: `401` and `{ "error": "Sign in as a club leader first." }`

## Rules the server must follow

- **`version` increases on every write.** Polling depends on it. If it does not
  change, open pages will never notice the update.
- **Reject writes without a valid token.** Not optional.
- **Clean the roster on the way in** — trim names, drop anything that is not
  tier `A`/`I`/`B`, drop duplicate names. The sorter assumes names are unique.
- **CORS** — if the API is on a different address from the website, it needs
  `Access-Control-Allow-Origin` and must answer `OPTIONS`.

## Things worth knowing

- Data is one JSON file, written to a temp file and renamed. A crash mid-write
  cannot leave a half-written roster.
- Sessions are in memory, so a restart signs leaders out. Fine for a club; move
  them to the data file if that annoys anyone.
- The website keeps its own copy of the last known roster, so the sorter still
  works on a field with no signal. Draws made offline are not posted until the
  connection returns — the leader is told when that happens.
