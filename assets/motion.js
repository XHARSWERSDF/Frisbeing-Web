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
  wrap.classList.add("reveal-on", "motion-ready");

  /* Give every content page the same entrance hierarchy without requiring
     animation-only classes in the HTML. The homepage already marks its main
     story blocks; utility pages are enrolled here. */
  Array.prototype.forEach.call(document.querySelectorAll("section > .inner, .photo-band .over > .inner"), function (root) {
    if (!root.closest(".hero")) root.classList.add("rv");
  });

  function prepareReveal(root) {
    var selector = [
      ".head > *", ".cards > .card", ".steps-list > .step", ".sessions > .sess",
      ".photo", ".chips > .chip-o", ".panel", ".sorter", ".cal-top", ".cal-card",
      ".day-panel", ".member-list", ".tonight > *", ".photo-band .over .inner > *"
    ].join(",");
    var seen = [];
    if (root.closest(".photo-band")) selector += ", :scope > *";
    Array.prototype.forEach.call(root.querySelectorAll(selector), function (el) {
      if (seen.indexOf(el) !== -1) return;
      seen.push(el);
      el.classList.add("motion-item");
      el.style.setProperty("--motion-order", Math.min(seen.length - 1, 9));
      if (el.matches(".display, .cal-month")) el.classList.add("motion-title");
      else if (el.matches(".eyebrow")) el.classList.add("motion-eyebrow");
      else if (el.matches(".card, .step, .panel, .sorter, .cal-card, .day-panel")) el.classList.add("motion-card");
      else if (el.matches(".photo")) el.classList.add("motion-photo", seen.length % 2 ? "motion-left" : "motion-right");
      else if (el.matches(".chip-o")) el.classList.add("motion-pop");
      else el.classList.add("motion-copy");
    });
  }

  var pending = Array.prototype.slice.call(document.querySelectorAll(".rv"));
  pending.forEach(prepareReveal);
  var ticking = false;
  var lastY = window.scrollY;

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
      var shift = progress * -42;
      var sweep = progress * 9;
      img.style.transform = "scale(1.2) translate3d(" + sweep.toFixed(2) + "px," + shift.toFixed(2) + "px,0) rotate(" + (progress * .45).toFixed(2) + "deg)";
    }
  }

  function frame() {
    /* Slide the repeating background, not the element - an infinite tiling
       never exposes a gap however far it drifts. */
    var y = window.scrollY;
    damask.style.backgroundPosition = (Math.sin(y / 260) * 18).toFixed(2) + "px " + (y * -0.46).toFixed(2) + "px";
    document.body.classList.toggle("is-scrolled", y > 24);
    document.documentElement.style.setProperty("--scroll-kick", Math.max(-1, Math.min(1, (y - lastY) / 36)).toFixed(3));
    lastY = y;
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

  /* Belt and braces: nothing can stay hidden forever if a browser suppresses
     geometry updates, but leave enough time for real scroll reveals to play. */
  window.setTimeout(function () {
    pending.forEach(function (el) { el.classList.add("in"); });
    pending = [];
  }, 12000);

  /* Lists and results are assembled by the roster, calendar and sorter
     scripts after this file runs. Newly born rows get a short spring-pop,
     echoing phystut's staggered calendar and note-card entrances. */
  var bornCount = 0;
  var bornSelector = ".member, .team, .cal-day, .rep, .mates li, .tonight > *, .day-panel > *";
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      Array.prototype.forEach.call(mutation.addedNodes, function (node) {
        if (node.nodeType !== 1) return;
        var nodes = [];
        if (node.matches && node.matches(bornSelector)) nodes.push(node);
        if (node.querySelectorAll) nodes = nodes.concat(Array.prototype.slice.call(node.querySelectorAll(bornSelector)));
        nodes.forEach(function (el) {
          if (el.classList.contains("motion-born")) return;
          el.classList.add("motion-born");
          el.style.setProperty("--motion-order", bornCount % 8);
          bornCount++;
        });
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
