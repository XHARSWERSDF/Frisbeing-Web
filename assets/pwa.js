/* ==========================================================================
   FRISBEING UF - install support
   Registers the service worker so the sorter works with no signal once the
   site has been opened once. Service workers need https or localhost, so on
   a file:// preview this quietly does nothing.
   ========================================================================== */
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;

  /* Local development must always use the files on disk, never an old app
     shell. Remove any registration/cache left by a previous local session. */
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    var registrations = navigator.serviceWorker.getRegistrations().then(function (items) {
      return Promise.all(items.map(function (registration) { return registration.unregister(); }));
    });
    var oldCaches = "caches" in window ? caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) { return key.indexOf("frisbeing-") === 0; }).map(function (key) { return caches.delete(key); }));
    }) : Promise.resolve();
    Promise.all([registrations, oldCaches]).then(function () {
      if (!navigator.serviceWorker.controller) return;
      try {
        if (sessionStorage.getItem("frisbeing.local-sw-cleared")) return;
        sessionStorage.setItem("frisbeing.local-sw-cleared", "1");
      } catch (ignore) { /* Reload once; the next request bypasses the unregistered worker. */ }
      location.reload();
    });
    return;
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () { /* offline support is optional */ });
  });
})();
