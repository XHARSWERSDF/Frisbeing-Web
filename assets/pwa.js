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
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () { /* offline support is optional */ });
  });
})();
