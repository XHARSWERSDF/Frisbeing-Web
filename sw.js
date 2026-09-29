/* ==========================================================================
   FRISBEING UF - service worker
   The sorter has to work on a field with no signal, so the whole app shell is
   cached on install and served cache-first. Bump CACHE to ship an update.
   ========================================================================== */
const CACHE = "frisbeing-v11";

const SHELL = [
  "./",
  "./index.html",
  "./sort.html",
  "./roster.html",
  "./manifest.json",
  "./roster.json",
  "./assets/brand.css",
  "./assets/brand.css?v=11",          /* sort.html asks for these by version */
  "./assets/engine.js",
  "./assets/store.js",
  "./assets/server-config.js",
  "./assets/motion.js",
  "./assets/sort.js?v=11",
  "./assets/roster.js",
  "./admin.html",
  "./assets/auth-config.js",
  "./assets/auth.js",
  "./assets/admin.js",
  "./assets/accounts.js",
  "./assets/pwa.js",
  "./assets/photos/squad-selfie.jpg",
  "./assets/photos/bleachers.jpg",
  "./assets/photos/night-squad.jpg",
  "./assets/photos/action.jpg",
  "./assets/photos/undefeated.jpg",
  "./assets/photos/floodlights.jpg",
  "./assets/pattern.png",
  "./assets/monogram.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      /* Fetch each file with cache:"reload" so a stale copy in the browser's
         own HTTP cache can never get baked into a fresh cache version - that
         would silently ship old code after an update. Added individually so
         one 404 does not fail the whole install. */
      .then((c) => Promise.all(SHELL.map((u) =>
        fetch(u, { cache: "reload" })
          .then((res) => (res && res.ok ? c.put(u, res) : null))
          .catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

/* Teams are out. The club server sends an EMPTY push (nothing to encrypt),
   so the message is always the same: come and spin for your team. Browsers
   require every push to show something, so this always does. */
self.addEventListener("push", (e) => {
  e.waitUntil(self.registration.showNotification("Teams are out! 🥏", {
    body: "Tonight's teams have been drawn. Tap to see which team you're on.",
    icon: "./assets/icon-192.png",
    badge: "./assets/icon-192.png",
    tag: "frisbeing-teams",
    renotify: true,
    data: { url: "./sort.html" }
  }));
});

/* Tapping it brings an open Frisbeing tab forward, or opens one. The page
   checks with the server as it comes into view, so it lands on the disc. */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "./sort.html", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.split("?")[0] === target);
      if (open) return open.focus();
      const any = list.find((c) => new URL(c.url).origin === self.location.origin && "navigate" in c);
      /* navigate() refuses windows this worker does not control, so fall
         back to a new window rather than doing nothing. */
      if (any) {
        return any.navigate(target).then((c) => c && c.focus())
          .catch(() => self.clients.openWindow(target));
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* Google Fonts: stale-while-revalidate so the site still renders offline */
  if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com")) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => {
          const net = fetch(req).then((res) => {
            if (res && res.ok) c.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  /* Never touch the API. What it answers depends on who is signed in -
     tiers go to leaders only - so a cached copy could show one person's
     view to the next person on the same phone. */
  if (/\/api(\/|$)/.test(url.pathname)) return;

  /* The two config files decide how the whole site behaves - which server to
     talk to, which Microsoft app to sign in with. A stale copy silently puts
     the site in the wrong mode, so these are never served from cache while
     online. */
  const isConfig = /\/(server-config|auth-config)\.js$/.test(url.pathname);

  /* Pages go network-first so a deploy is picked up as soon as there is a
     connection, falling back to cache when there is none. Cache-first here
     would leave the club staring at last term's version. */
  const isPage = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isPage || isConfig) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match("./sort.html")))
    );
    return;
  }

  /* CSS, JS and images are stale-while-revalidate: served instantly from
     cache (so the field works with no signal), refreshed in the background
     for next time. This means a deploy lands on the next visit without
     anyone having to remember to bump CACHE. */
  e.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req).then((hit) => {
        const net = fetch(req, { cache: "no-cache" }).then((res) => {
          if (res && res.ok && res.type === "basic") c.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    )
  );
});
