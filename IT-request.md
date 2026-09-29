# Request to IT: a Microsoft Entra app registration for the Frisbee club site

*Forward this to whoever manages the school's Microsoft 365 / Entra tenant.*
*It is a one-time, low-risk setup and needs no ongoing maintenance.*

## What we are asking for

The Ultimate Frisbee club has a website where club leaders sign in to manage
the squad. We want members to sign in with their **Tsinglan Microsoft account**
(the same login as Outlook and Teams) instead of a separate password. To do
that we need an **app registration** created in <https://entra.microsoft.com>.

We are **not** asking for any admin consent to read mailboxes, files, or
directory data. The app only needs to confirm *who* is signing in — the
standard OpenID Connect sign-in (`openid profile email`), which every user
consents to for themselves. No client secret is needed.

## The exact steps

1. **Entra ID → App registrations → New registration.**
2. **Name:** `Frisbeing UF` (any name is fine).
3. **Supported account types:** *Accounts in this organizational directory only
   (single tenant).*
4. **Redirect URI:** platform **Single-page application (SPA)**, and add the
   address(es) the site is served from — the sign-in page is `admin.html`:
   - `https://REPLACE-WITH-OUR-SITE/admin.html`
   - `http://localhost:8000/admin.html`  *(so we can test locally — optional)*

   > Please add these under **Single-page application**, not "Web". A club
   > member will confirm the exact production address; add one line per address.
5. Click **Register.**

## What to send back to us

From the app registration's **Overview** page, please send:

- **Application (client) ID** — a GUID
- **Directory (tenant) ID** — a GUID

Neither is a secret; a single-page app is designed to hold these in the page,
and access is controlled by the redirect URI you registered above and by checks
on our own server. We do not need a client secret or certificate.

## Why this is safe

- Single tenant means **only `@tsinglan.org` accounts can sign in** — no outside
  accounts, no personal Microsoft accounts.
- The redirect URI you register is the **only** place Microsoft will return a
  sign-in to, so the IDs cannot be used from another site.
- The app requests only sign-in scopes (`openid profile email`). It cannot read
  mail, files, or anyone else's data.
- If the club ever winds down, deleting the app registration instantly turns the
  sign-in off.

Thank you!
