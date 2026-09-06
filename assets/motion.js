/* ==========================================================================
   FRISBEING UF - background, parallax and scroll reveals
   One rAF loop drives everything. Native scroll is left alone.
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- damask ground ----------------------------------------------------
     The pattern itself is a seamless mirror-tiled image set as the CSS
     background of #damask (see brand.css). Here we only make sure the
     element exists on every page; the parallax loop below drifts it. */

  var damask = document.getElementById("damask");
  if (!damask) {
    damask = document.createElement("div");
    damask.id = "damask";
    damask.setAttribute("aria-hidden", "true");
    document.body.insertBefore(damask, document.body.firstChild);
  }

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
    /* Slide the repeating background, not the element - an infinite tiling
       never exposes a gap however far it drifts. */
    damask.style.backgroundPositionY = (window.scrollY * -0.35) + "px";
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
