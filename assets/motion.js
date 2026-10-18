/* ==========================================================================
   FRISBEING UF - background, parallax and scroll reveals
   One rAF loop drives everything. Native scroll is left alone.
   ========================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- photo-wall background -------------------------------------------
     Build a tiled photo booth wall behind the site content. */

  var damask = document.getElementById("damask");
  if (!damask) {
    damask = document.createElement("div");
    damask.id = "damask";
    damask.setAttribute("aria-hidden", "true");
    document.body.insertBefore(damask, document.body.firstChild);
  }
  var hero = document.querySelector('.hero');
  var backgroundPhotos = [
    "01-night-disc.jpeg", "06-daylight-team.jpeg", "04-night-team.jpeg", "09-league-team.jpeg",
    "02-night-squad.jpeg", "07-day-track-team.jpeg", "03-disc-circle.jpeg", "08-night-four.jpeg",
    "11-night-trio.jpg", "12-field-huddle.jpg", "13-day-squad.jpg", "14-night-squad.jpg"
  ];
  if (hero) {
    function fitPhotoWall() {
      var width = damask.clientWidth || window.innerWidth;
      var height = damask.clientHeight || window.innerHeight;
      var compact = width <= 900;
      var columns = compact ? (width <= 480 ? 2 : 3) : 4;
      var tileWidth = (width - 12 - (columns - 1) * 6) / columns;
      var rows = compact ? Math.max(1, Math.round((height - 6) / (tileWidth * .75 + 6))) : 3;
      damask.style.setProperty("--photo-wall-rows", String(rows));
      var count = columns * rows;
      while (damask.children.length > count) damask.lastElementChild.remove();
      while (damask.children.length < count) {
        var img = document.createElement("img");
        img.src = "assets/photos/" + backgroundPhotos[damask.children.length % backgroundPhotos.length];
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        img.decoding = "async";
        damask.appendChild(img);
      }
    }
    fitPhotoWall();
    window.addEventListener("resize", fitPhotoWall);
    if (window.ResizeObserver) new ResizeObserver(fitPhotoWall).observe(damask);
  } else {
    document.body.classList.add("utility-brand-background");
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

  var heroContent = hero && hero.querySelector('.inner');
  var artReady = false;
  var art = document.createElement('div');
  art.className = 'scroll-art';
  art.setAttribute('aria-hidden', 'true');
  var contour = document.createElement('canvas');
  contour.className = 'scroll-art-contours';
  art.appendChild(contour);
  document.body.insertBefore(art, damask);

  // A single backdrop renderer serves Home and all three content pages.
  // Only Home mounts the white foreground canvas and interactive details.
  var brand = document.createElement('canvas');
  var details;
  var detailSources = [];
  var detailMirrors = [];
  var joinMirror;
  if (hero) {
    document.body.classList.add('has-scroll-art');
    brand.className = 'scroll-brand';
    brand.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(brand, damask.nextSibling);
    details = document.createElement('div');
    details.className = 'scroll-brand-details';
    document.body.insertBefore(details, brand.nextSibling);
    detailSources = [hero.querySelector('.eyebrow'), hero.querySelector('.hero-join')].filter(Boolean);
    detailMirrors = detailSources.map(function (source) {
      var mirror = source.cloneNode(true);
      mirror.removeAttribute('id');
      mirror.tabIndex = -1;
      details.appendChild(mirror);
      return mirror;
    });
    var joinSource = hero.querySelector('.hero-join');
    joinMirror = detailMirrors[detailSources.indexOf(joinSource)];
    if (joinMirror) {
      joinMirror.tabIndex = 0;
      joinMirror.addEventListener('click', function (event) {
        event.preventDefault();
        var destination = window.FBAuth && FBAuth.user() ? 'sort.html' : 'admin.html';
        window.location.assign(destination);
      });
    }
  } else {
    var tint = document.createElement('div');
    tint.className = 'page-background-tint';
    tint.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(tint, damask);
  }

  function positionDetails() {
    detailSources.forEach(function (source, index) {
      var mirror = detailMirrors[index];
      var box = source.getBoundingClientRect();
      var sourceCenter = box.left + box.width / 2;
      mirror.style.left = (source.matches('.eyebrow') ? sourceCenter : sourceCenter - source.offsetWidth / 2) + 'px';
      mirror.style.top = (box.top + window.scrollY) + 'px';
      mirror.style.width = source.matches('.eyebrow') ? 'max-content' : source.offsetWidth + 'px';
      mirror.style.height = source.offsetHeight + 'px';
    });
  }

  var layout;
  var crest;
  var artTitles = [];
  if (hero) {
    // Measure Home without entrance animations affecting the bitmap.
    layout = document.createElement('div');
    layout.className = 'brand-layout-measure';
    layout.setAttribute('aria-hidden', 'true');
    layout.inert = true;
    layout.innerHTML = '<section class="hero">' +
      '<div class="inner" style="display:flex;flex-direction:column;align-items:center">' +
        '<div class="hero-lockup">' +
          '<img class="crest" src="assets/monogram.png" alt="">' +
          '<h1 class="display" style="transform-origin:center bottom">Frisbeing</h1>' +
          '<p class="hero-sub">Ultimate Frisbee Club</p>' +
        '</div>' +
        '<p class="eyebrow">Tsinglan School &middot; Est. 2022</p>' +
        '<a class="btn solid hero-join"><span>JOIN</span></a>' +
        '<div class="learn-more"><span class="learn-arrow">↓</span><span>Learn more</span></div>' +
      '</div></section>';
    document.body.appendChild(layout);
    crest = layout.querySelector('.crest');
    artTitles = [layout.querySelector('h1.display'), layout.querySelector('.hero-sub')];
  } else {
    // Content pages use only the emblem, with no Home text or scroll cue.
    crest = new Image();
    crest.src = 'assets/monogram.png';
  }

  function renderContours() {
    if (!crest.complete || !crest.naturalWidth) return;
    if (layout) {
      var nav = document.querySelector('.nav');
      layout.style.top = (nav ? nav.offsetHeight : 0) + 'px';
    }
    var scale = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3,
      Math.sqrt(4000000 / (window.innerWidth * window.innerHeight)));
    var w = Math.round(window.innerWidth * scale);
    var h = Math.round(window.innerHeight * scale);
    brand.width = contour.width = w;
    brand.height = contour.height = h;
    var front = brand.getContext('2d');
    front.setTransform(scale, 0, 0, scale, 0, 0);
    var box;
    if (hero) {
      box = crest.getBoundingClientRect();
    } else {
      // Center against the full viewport, independent of navigation or content.
      var ratio = crest.naturalWidth / crest.naturalHeight;
      var logoWidth = Math.min(Math.max(75, window.innerWidth * .12), 150,
        window.innerHeight * .6 * ratio);
      var logoHeight = logoWidth / ratio;
      box = {
        left: (window.innerWidth - logoWidth) / 2,
        top: (window.innerHeight - logoHeight) / 2,
        bottom: (window.innerHeight + logoHeight) / 2,
        width: logoWidth,
        height: logoHeight
      };
    }
    if (document.body.dataset.backgroundEmblem !== 'false') {
      front.drawImage(crest, box.left, box.top, box.width, box.height);
    }
    artTitles.forEach(function (source) {
      var rect = source.getBoundingClientRect();
      var style = getComputedStyle(source);
      front.save();
      front.font = style.fontWeight + ' ' + (parseFloat(style.fontSize) * .75) + 'px ' + style.fontFamily;
      front.textAlign = 'center';
      front.textBaseline = 'alphabetic';
      if ('letterSpacing' in front) front.letterSpacing = (parseFloat(style.letterSpacing) * .75 || 0) + 'px';
      front.fillStyle = style.color;
      var text = source.textContent.trim().toUpperCase();
      var metrics = front.measureText(text);
      var ascent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent;
      var descent = metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent;
      front.translate(rect.left + rect.width / 2, rect.top + rect.height / 2);
      var matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
      front.transform(matrix.a, matrix.b, matrix.c, matrix.d, 0, 0);
      front.fillText(text, 0, (ascent - descent) / 2);
      front.restore();
    });

    // Keep the exact lockup as a crisp silhouette, but use a broad radial
    // glow for the field so its changing letter contours do not leave marks.
    var source = front.getImageData(0, 0, w, h);
    var pixels = new ImageData(w, h);
    var light = [228, 232, 206], dark = [13, 30, 22];
    var top = box.top, bottom = box.bottom;
    artTitles.forEach(function (title) {
      var rect = title.getBoundingClientRect();
      top = Math.min(top, rect.top);
      bottom = Math.max(bottom, rect.bottom);
    });
    var focusX = window.innerWidth / 2;
    var focusY = (top + bottom) / 2;
    var spreadX = Math.max(260, box.width * 2.4);
    var spreadY = Math.max(260, (bottom - top) * 1.5);
    for (var i = 0; i < w * h; i++) {
      var x = (i % w) / scale;
      var y = Math.floor(i / w) / scale;
      var radius = Math.sqrt(Math.pow((x - focusX) / spreadX, 2) + Math.pow((y - focusY) / spreadY, 2));
      var t = 1 - Math.exp(-radius * 1.65);
      var alpha = source.data[i * 4 + 3] / 255;
      // A fraction of a channel of stable dither prevents 8-bit color
      // quantization from appearing as faint lines on large displays.
      var hash = Math.imul(i ^ (i >>> 13), 1274126177) >>> 0;
      var noise = (hash / 4294967295 - .5) * .7;
      for (var c = 0; c < 3; c++) {
        var shade = light[c] + (dark[c] - light[c]) * t + noise * (1 - alpha);
        pixels.data[i * 4 + c] = shade * (1 - alpha) + dark[c] * alpha;
      }
      pixels.data[i * 4 + 3] = 255;
    }
    contour.getContext('2d').putImageData(pixels, 0, 0);
    if (!hero) return;
    positionDetails();
    artReady = true;
    if (window.scrollY > 0 && heroReturnTrigger) {
      heroHidden = heroReturnTrigger.getBoundingClientRect().top <= joinBottom();
    }
    document.body.classList.add('brand-ready');
    updateHero();
  }
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderContours, 120);
  });
  Promise.all([
    hero && document.fonts ? document.fonts.ready : Promise.resolve(),
    crest.decode ? crest.decode() : new Promise(function (resolve) {
      if (crest.complete) resolve(); else crest.addEventListener('load', resolve, { once: true });
    })
  ]).then(renderContours).catch(function (error) {
    console.error('Unable to prepare the brand background:', error);
  });

  // Switch when The Sessions first overlaps the JOIN button; reverse that
  // state only after the section clears the button again while scrolling up.
  var heroReturnTrigger = document.querySelector('.hero + .band-field') || document.querySelector('.band-pitch');
  var heroLastY = window.scrollY;
  var joinSource = hero && hero.querySelector('.hero-join');
  function joinBottom() {
    return joinMirror ? joinMirror.getBoundingClientRect().bottom : window.innerHeight * 2 / 3;
  }
  var heroHidden = false;
  var heroReturning = false;
  function updateHero() {
    if (!heroContent) return;
    var y = Math.max(0, window.scrollY);
    document.body.classList.toggle('scroll-cue-hidden', y > 0);
    var delta = y - heroLastY;
    heroLastY = y;
    var triggerTop = heroReturnTrigger ? heroReturnTrigger.getBoundingClientRect().top : Infinity;
    var buttonBottom = joinBottom();
    if (delta > 0 && triggerTop <= buttonBottom) {
      heroHidden = true;
      heroReturning = false;
    } else if (delta < 0 && triggerTop >= buttonBottom) {
      if (heroHidden) heroReturning = true;
      heroHidden = false;
    }
    if (y === 0) {
      if (heroHidden) heroReturning = true;
      heroHidden = false;
    }
    document.body.classList.toggle('hero-returning', artReady && heroReturning);
    document.body.classList.toggle('hero-dismissed', artReady && heroHidden);
    heroContent.inert = artReady && heroHidden;
    if (hero) details.inert = artReady && heroHidden;
  }

  if (reduce) {
    window.addEventListener('scroll', updateHero, { passive: true });
    window.addEventListener('resize', updateHero, { passive: true });
    updateHero();
    return;
  }

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
    var y = window.scrollY;
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
    updateHero();
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
