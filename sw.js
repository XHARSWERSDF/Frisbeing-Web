/* ==========================================================================
   FRISBEING UF - service worker
   The sorter has to work on a field with no signal, so the whole app shell is
   cached on install and served cache-first. Bump CACHE to ship an update.
   ========================================================================== */
const CACHE = "frisbeing-v5";

const SHELL = [
  "./",
  "./index.html",
  "./sort.html",
  "./roster.html",
  "./manifest.json",
  "./roster.json",
  "./assets/brand.css",
  "./assets/engine.js",
  "./assets/store.js",
  "./assets/server-config.js",
  "./assets/motion.js",
  "./assets/sort.js",
  "./assets/roster.js",
  "./admin.html",
  "./assets/auth-config.js",
  "./assets/auth.js",
  "./assets/admin.js",
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

  /* The two config files decide how the whole site behaves - which server to
     talk to, which passcode to accept. A stale copy silently puts the site in
     the wrong mode, so these are never served from cache while online. */
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
