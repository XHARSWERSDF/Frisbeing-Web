/* One photo collection, shown as a scrollable grid or a seamless upward loop. */
(function () {
  "use strict";
  var gallery = document.querySelector('.photo-gallery');
  if (!gallery) return;
  var group = gallery.querySelector('.photo-conveyor-group');
  var toggle = gallery.querySelector('.photo-rail-toggle');
  var controls = document.querySelector('.photos-view-switch');
  var buttons = controls.querySelectorAll('[data-gallery-mode]');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var duplicate = group.cloneNode(true);
  duplicate.setAttribute('aria-hidden', 'true');
  duplicate.setAttribute('inert', '');
  duplicate.classList.add('photo-conveyor-copy');
  group.parentElement.appendChild(duplicate);
  var visible = true;
  var mode = 'grid';
  try {
    if (localStorage.getItem('frisbeing.photos.view') === 'conveyor') mode = 'conveyor';
  } catch (ignore) { /* The gallery also works without browser storage. */ }

  function fit() {
    if (mode !== 'conveyor') return;
    gallery.style.setProperty('--photo-cycle', Math.max(1, group.offsetHeight / 30) + 's');
  }
  function update() {
    gallery.classList.toggle('is-active', mode === 'conveyor' && visible && !document.hidden && !reduced.matches);
    toggle.hidden = mode !== 'conveyor' || reduced.matches;
  }
  function selectMode(next) {
    mode = next;
    gallery.dataset.view = mode;
    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.galleryMode === mode));
    });
    if (mode === 'conveyor') {
      // Every frame must be available even before it scrolls into view.
      gallery.querySelectorAll('img').forEach(function (img) { img.loading = 'eager'; });
    }
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
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      update();
    }).observe(gallery);
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(group);
  window.addEventListener('resize', fit, { passive: true });
  document.addEventListener('visibilitychange', update);
  reduced.addEventListener('change', update);
  gallery.classList.add('is-ready');
  controls.hidden = false;
  selectMode(mode);
})();
