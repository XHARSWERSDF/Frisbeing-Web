/* ==========================================================================
   FRISBEING UF - service worker
   The sorter has to work on a field with no signal, so the whole app shell is
   cached on install and served cache-first. Bump CACHE to ship an update.
   ========================================================================== */
const CACHE = "frisbeing-v217";

const SHELL = [
  "./",
  "./index.html",
  "./photos.html",
  "./sort.html",
  "./roster.html",
  "./profile.html",
  "./gearhub.html",
  "./manifest.json",
  "./roster.json",
  "./assets/brand.css",
  "./assets/engine.js",
  "./assets/store.js",
  "./assets/server-config.js",
  "./assets/roster.js",
  "./admin.html",
  "./assets/auth-config.js",
  "./assets/admin.js",
  "./assets/accounts.js",
  "./assets/pwa.js",
  "./assets/photos/squad-selfie.jpg",
  "./assets/photos/bleachers.jpg",
  "./assets/photos/night-squad.jpg",
  "./assets/photos/action.jpg",
  "./assets/photos/undefeated.jpg",
  "./assets/photos/floodlights.jpg",
  "./assets/photos/01-night-disc.jpeg",
  "./assets/photos/club-frisbee-reference.png",
  "./assets/photos/02-night-squad.jpeg",
  "./assets/photos/03-disc-circle.jpeg",
  "./assets/photos/04-night-team.jpeg",
  "./assets/photos/06-daylight-team.jpeg",
  "./assets/photos/07-day-track-team.jpeg",
  "./assets/photos/08-night-four.jpeg",
  "./assets/photos/09-league-team.jpeg",
  "./assets/photos/11-night-trio.jpg",
  "./assets/photos/12-field-huddle.jpg",
  "./assets/photos/13-day-squad.jpg",
  "./assets/photos/14-night-squad.jpg",
  "./assets/pattern.png",
  "./assets/monogram.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/photos/next-game.jpg",
  "./assets/frisbeing-damask.png",
  "./assets/home-gallery/club-01.jpg",
  "./assets/home-gallery/club-02.jpg",
  "./assets/home-gallery/club-03.jpg",
  "./assets/home-gallery/club-04.jpg",
  "./assets/home-gallery/club-05.jpg",
  "./assets/home-gallery/club-06.jpg",
  "./assets/home-gallery/club-07.jpg",
  "./assets/home-gallery/club-08.jpg",
  "./assets/home-gallery/club-09.jpg",
  "./assets/home-gallery/club-10.jpg",
  "./assets/home-gallery/club-11.jpg",
  "./assets/home-gallery/club-12.jpg",
  "./assets/home-gallery/club-13.jpg",
  "./assets/home-gallery/club-14.jpg",
  "./assets/home-gallery/club-15.jpg",
  "./assets/home-gallery/club-16.jpg",
  "./assets/home-gallery/club-17.jpg",
  "./assets/home-gallery/club-18.jpg",
  "./assets/home-gallery/club-19.jpg",
  "./assets/home-gallery/club-20.jpg",
  "./assets/home-gallery/club-21.jpg",
  "./assets/home-gallery/club-22.jpg",
  "./assets/home-gallery/club-23.jpg",
  "./assets/home-gallery/club-24.jpg",
  "./assets/home-gallery/club-25.jpg",
  "./assets/home-gallery/club-26.jpg",
  "./assets/home-gallery/club-27.jpg",
  "./assets/home-gallery/club-28.jpg",
  "./assets/home-gallery/club-29.jpg",
  "./assets/home-gallery/club-30.jpg",
  "./assets/home-gallery/club-31.jpg",
  "./assets/home-gallery/club-32.jpg",
  "./assets/home-gallery/club-33.jpg",
  "./assets/home-gallery/club-34.jpg",
  "./assets/home-gallery/club-42.jpg",
  "./assets/home-gallery/club-41.jpg",
  "./assets/home-gallery/club-40.jpg",
  "./assets/home-gallery/club-39.jpg",
  "./assets/home-gallery/club-38.jpg",
  "./assets/home-gallery/club-37.jpg",
  "./assets/home-gallery/club-36.jpg",
  "./assets/home-gallery/club-35.jpg",
  "./assets/brand.css?v=217",
  "./assets/server-config.js?v=217",
  "./assets/engine.js?v=217",
  "./assets/auth-config.js?v=217",
  "./assets/auth.js?v=217",
  "./assets/teammate-rules.js?v=217",
  "./assets/preview-mode.js?v=217",
  "./assets/navigation.js?v=217",
  "./assets/motion.js?v=217",
  "./assets/pwa.js?v=217",
  "./assets/sort.js?v=217",
  "./assets/profile.js?v=217",
  "./assets/gearhub.js?v=217",
  "./assets/photos.js?v=217",
  "./assets/admin.js?v=217",
  "./assets/store.js?v=217",
  "./assets/roster.js?v=217",
  "./assets/accounts.js?v=217"
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
