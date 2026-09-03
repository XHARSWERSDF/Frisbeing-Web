# Putting this online

## Part 1 — the website (do this first)

- Upload every file in this folder to your host
- Keep the folder structure exactly as it is
- `index.html` must be at the top level
- Open the site — it should work straight away

At this point the club can see the info page, the squad list, and spin the
disc. Leaders can sort teams and share the result with a link.

## Part 2 — change the passcode

**Do this before you tell anyone the address.**

- Open `assets/auth-config.js`
- Find `passcode: "frisbeing2022"`
- Change it to something only the leaders know
- Re-upload that one file

## Part 3 — the server (when your friend has it ready)

This is what makes the roster update live for everyone.

- Your friend runs the server in the `server/` folder
- He tells you its web address
- Open `assets/server-config.js`
- Change `apiBase: ""` to `apiBase: "https://his-address/api"`
- Re-upload that one file

Everything else stays the same. Full instructions for him are in
`server/README.md`.

**Also tell him to set the passcode on the server** (`PASSCODE=...`). Once the
server is running, that is the one the site checks.

## How to tell which mode you are in

- **No server**: adding a member only changes your own device, and you have to
  press Publish and re-upload `roster.json`
- **Server connected**: adding a member appears for everyone within about ten
  seconds, and there is no Publish step

## Getting it on a phone

Once the site is on a real address with `https`:

- **iPhone**: open it in **Safari** (not Chrome) → Share → Add to Home Screen
- **Android**: Chrome → Install app

The icon opens straight into the sorter, and it works with no signal.

## If something looks stale after you re-upload

The site caches itself so it works offline. After changing a file, load the
page twice — the second load picks up the new version.
