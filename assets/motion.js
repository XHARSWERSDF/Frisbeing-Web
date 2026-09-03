/* ==========================================================================
   FRISBEING UF - background, parallax and scroll reveals
   One rAF loop drives everything. Native scroll is left alone.
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- damask ground, injected once so it lives in a single place ------- */

  var DAMASK =
    '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><pattern id="dmk" width="64" height="88" patternUnits="userSpaceOnUse">' +
        '<g fill="none" stroke="#2B5C44" stroke-width="1.15" stroke-linecap="round">' +
          '<path d="M32 10 C24 22 17 28 17 38 C17 47 24 52 32 52 C40 52 47 47 47 38 C47 28 40 22 32 10 Z"/>' +
          '<path d="M32 21 C28 29 24 32 24 38 C24 43 27 46 32 46 C37 46 40 43 40 38 C40 32 36 29 32 21 Z"/>' +
          '<path d="M17 39 C9 36 3 41 4 49 C11 50 16 46 17 39 Z"/>' +
          '<path d="M47 39 C55 36 61 41 60 49 C53 50 48 46 47 39 Z"/>' +
          '<path d="M32 52 L32 66"/>' +
          '<path d="M32 66 C27 70 24 75 26 81 C30 79 33 73 32 66 Z"/>' +
          '<path d="M32 66 C37 70 40 75 38 81 C34 79 31 73 32 66 Z"/>' +
          '<path d="M0 54 C-8 66 -15 72 -15 82 C-15 91 -8 96 0 96 C8 96 15 91 15 82 C15 72 8 66 0 54 Z"/>' +
          '<path d="M64 54 C56 66 49 72 49 82 C49 91 56 96 64 96 C72 96 79 91 79 82 C79 72 72 66 64 54 Z"/>' +
          '<path d="M0 65 C-4 73 -8 76 -8 82 C-8 87 -5 90 0 90 C5 90 8 87 8 82 C8 76 4 73 0 65 Z"/>' +
          '<path d="M64 65 C60 73 56 76 56 82 C56 87 59 90 64 90 C69 90 72 87 72 82 C72 76 68 73 64 65 Z"/>' +
        '</g>' +
      '</pattern></defs>' +
      '<rect width="100%" height="100%" fill="url(#dmk)"/>' +
    '</svg>';

  var damask = document.getElementById("damask");
  if (!damask) {
    damask = document.createElement("div");
    damask.id = "damask";
    damask.setAttribute("aria-hidden", "true");
    document.body.insertBefore(damask, document.body.firstChild);
  }
  damask.innerHTML = DAMASK;

  /* ---- fit each frame to its own photo ---------------------------------
     Set the frame's aspect ratio from the image's real dimensions, so a
     `cover` fit has nothing to crop and nobody at the edge of a group shot
     is cut off. Also survives EXIF-rotated photos and future swaps. */

  Array.prototype.forEach.call(document.querySelectorAll(".photo img"), function (img) {
    var fit = function () {
      if (!img.naturalWidth || !img.naturalHeight) return;
      img.parentElement.style.aspectRatio = img.naturalWidth + " / " + img.naturalHeight;
    };
    if (img.complete) fit();
    img.addEventListener("load", fit);
  });

  /* ---- parallax + reveals ----------------------------------------------
     Deliberately not IntersectionObserver: a page can be loaded in a hidden
     or backgrounded frame, where IO delivers no callbacks at all and every
     revealable section would stay invisible forever. A geometry check on
     scroll always works.
     -------------------------------------------------------------------- */

  if (reduce) return;

  var wrap = document.querySelector(".wrap") || document.body;
  wrap.classList.add("reveal-on");

  var pending = Array.prototype.slice.call(document.querySelectorAll(".rv"));
  var ticking = false;

  /* Photos drift inside their own crop. The frame is fixed, the image is
     oversized, so moving it never leaves a gap. */
  var shots = Array.prototype.slice.call(document.querySelectorAll(".photo-band img"));

  function driftPhotos() {
    var vh = window.innerHeight;
    for (var i = 0; i < shots.length; i++) {
      var img = shots[i];
      var box = img.parentElement.getBoundingClientRect();
      if (box.bottom < -200 || box.top > vh + 200) continue;
      /* -1 when the frame is below the fold, +1 when above it */
      var progress = (box.top + box.height / 2 - vh / 2) / (vh / 2 + box.height / 2);
      if (progress < -1) progress = -1;
      if (progress > 1) progress = 1;
      var shift = progress * -34;
      img.style.transform = "scale(1.18) translate3d(0," + shift.toFixed(2) + "px,0)";
    }
  }

  function frame() {
    damask.style.transform = "translate3d(0," + (window.scrollY * -0.35) + "px,0)";
    driftPhotos();
    var trigger = window.innerHeight * 0.88;
    for (var i = pending.length - 1; i >= 0; i--) {
      if (pending[i].getBoundingClientRect().top < trigger) {
        pending[i].classList.add("in");
        pending.splice(i, 1);
      }
    }
    ticking = false;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(frame);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  frame();

  /* Belt and braces: nothing stays hidden for more than three seconds. */
  window.setTimeout(function () {
    pending.forEach(function (el) { el.classList.add("in"); });
    pending = [];
  }, 3000);
})();
