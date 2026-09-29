# Putting this online

## Part 1 — the website (do this first)

- Upload every file in this folder to your host
- Keep the folder structure exactly as it is
- `index.html` must be at the top level
- The host must serve it over **https** — GitHub Pages and Netlify both do,
  free. Notifications and the phone app need it.
- Open the site — it should work straight away

At this point everyone can see the club page and the squad list. The Sorter
page says game nights are switched off: Join, the draw and notifications
need Part 2 and Part 3.

## Part 2 — school sign-in (ask IT)

Sign-in is the school's own Microsoft account, so IT has to register the site
once.

- Send IT the note in `IT-request.md` — it says exactly what to click
- Tell them the site's address, so they can register `https://your-address/admin.html`
- They send back two IDs: the **Application (client) ID** and the
  **Directory (tenant) ID**
- Open `assets/auth-config.js` and paste them into `clientId` and `tenantId`
- Re-upload that one file

## Part 3 — the server (when your friend has it ready)

This is what runs game nights, sign-in and the live roster.

- Your friend runs the server in the `server/` folder, with the same two IDs
  from IT as `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID`
- Give them the member list as `server/directory.json` (see
  `server/directory.example.json` for the format). It holds real school
  emails, so send it privately — it is never put in the GitHub repo
- The server must be on **https** too, or phones will refuse to talk to it
- They tell you its web address
- Open `assets/server-config.js`
- Change `apiBase: ""` to `apiBase: "https://their-address/api"`
- Re-upload that one file

Everything else stays the same. Full instructions for them are in
`server/README.md`.

## How to tell which mode you are in

- **No server**: the Sorter page says game nights are switched off, and adding
  a member only changes your own device (press Publish and re-upload
  `roster.json`)
- **Server connected**: the Sorter page shows tonight's game, everyone can
  sign in with their school account, and changes appear for everyone within
  about ten seconds

## Getting it on a phone

Once the site is on a real address with `https`:

- **iPhone**: open it in **Safari** (not Chrome) → Share → Add to Home Screen.
  Open it from the Home Screen to get "teams are out" notifications — that is
  Apple's rule for web apps
- **Android**: Chrome → Install app

The icon opens straight into tonight's game.

## If something looks stale after you re-upload

The site caches itself so it works offline. After changing a file, load the
page twice — the second load picks up the new version. If you change
`assets/sort.js` or `assets/brand.css`, also bump the version number as
described in `README.md` under *Deploying*.
