/* Browse one collection, or show three alternating belts in the page. */
(function () {
  "use strict";
  var gallery = document.querySelector('.photo-gallery');
  if (!gallery) return;
  var group = gallery.querySelector('.photo-conveyor-group');
  var toggle = gallery.querySelector('.photo-rail-toggle');
  var controls = document.querySelector('.photos-view-switch');
  var buttons = controls.querySelectorAll('[data-gallery-mode]');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var belts = null;
  var tracks = [];
  var visible = true;
  var mode = 'grid';
  try {
    if (localStorage.getItem('frisbeing.photos.view') === 'conveyor') mode = 'conveyor';
  } catch (ignore) { /* The gallery also works without browser storage. */ }

  function buildBelts() {
    if (belts) return;
    belts = document.createElement('div');
    belts.className = 'photo-belts';
    gallery.appendChild(belts);
    var originals = Array.prototype.slice.call(group.children);
    for (var column = 0; column < 3; column++) {
      var belt = document.createElement('div');
      belt.className = 'photo-belt';
      belt.setAttribute('role', 'group');
      belt.setAttribute('aria-label', ['Left photo column, moving up', 'Middle photo column, moving down', 'Right photo column, moving up'][column]);
      var track = document.createElement('div');
      track.className = 'photo-belt-track';
      var sequence = document.createElement('div');
      sequence.className = 'photo-belt-group';
      originals.forEach(function (photo, index) {
        if (index % 3 !== column) return;
        var frame = photo.cloneNode(true);
        frame.querySelector('img').loading = 'eager';
        sequence.appendChild(frame);
      });
      track.appendChild(sequence);
      var copy = sequence.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('inert', '');
      copy.classList.add('photo-belt-copy');
      track.appendChild(copy);
      belt.appendChild(track);
      belts.appendChild(belt);
      tracks.push(track);
      if (window.ResizeObserver) new ResizeObserver(fit).observe(sequence);
    }
  }
  function fit() {
    if (mode !== 'conveyor') return;
    var nav = document.querySelector('.nav');
    gallery.style.setProperty('--photos-nav-height', (nav ? nav.offsetHeight : 0) + 'px');
    tracks.forEach(function (track) {
      // Each sequence travels once at a steady 30 pixels per second.
      track.style.setProperty('--photo-cycle', Math.max(1, track.firstElementChild.offsetHeight / 30) + 's');
    });
  }
  function update() {
    gallery.classList.toggle('is-active', mode === 'conveyor' && visible && !document.hidden && !reduced.matches);
    toggle.hidden = mode !== 'conveyor' || reduced.matches;
  }
  function selectMode(next) {
    mode = next;
    gallery.dataset.view = mode;
    document.body.classList.toggle('is-photo-conveyor', mode === 'conveyor');
    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.galleryMode === mode));
    });
    if (mode === 'conveyor') buildBelts();
    fit();
    update();
    try { localStorage.setItem('frisbeing.photos.view', mode); } catch (ignore) { /* Optional preference. */ }
  }
  buttons.forEach(function (button) {
    button.addEventListener('click', function () { selectMode(button.dataset.galleryMode); });
  });
  toggle.addEventListener('click', function () {
    var paused = gallery.classList.toggle('is-paused');
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Resume photo stream' : 'Pause photo stream');
    toggle.textContent = paused ? 'Play photos' : 'Pause photos';
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && mode === 'conveyor') {
      selectMode('grid');
      buttons[0].focus();
    }
  });
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      update();
    }).observe(gallery);
  }
  if (window.ResizeObserver) {
    var nav = document.querySelector('.nav');
    if (nav) new ResizeObserver(fit).observe(nav);
  }
  window.addEventListener('resize', fit, { passive: true });
  document.addEventListener('visibilitychange', update);
  reduced.addEventListener('change', update);
  gallery.classList.add('is-ready');
  controls.hidden = false;
  selectMode(mode);
})();
