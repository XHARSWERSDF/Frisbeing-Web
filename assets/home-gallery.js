/* Home's upward photo stream. Two identical groups make the loop seamless. */
(function () {
  "use strict";
  var rail = document.querySelector('.home-photo-rail');
  if (!rail) return;
  var group = rail.querySelector('.photo-conveyor-group');
  var toggle = rail.querySelector('.photo-rail-toggle');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var duplicate = group.cloneNode(true);
  duplicate.setAttribute('aria-hidden', 'true');
  duplicate.setAttribute('inert', '');
  duplicate.classList.add('photo-conveyor-copy');
  group.parentElement.appendChild(duplicate);
  var visible = true;

  function fit() {
    // One complete group per cycle, at a steady 30 pixels per second.
    rail.style.setProperty('--photo-cycle', Math.max(1, group.offsetHeight / 30) + 's');
    var nav = document.querySelector('.nav');
    rail.style.setProperty('--photo-rail-top', (nav ? nav.offsetHeight : 74) + 'px');
  }
  function update() {
    rail.classList.toggle('is-active', visible && !document.hidden);
    toggle.hidden = reduced.matches;
  }
  toggle.addEventListener('click', function () {
    var paused = rail.classList.toggle('is-paused');
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Resume photo stream' : 'Pause photo stream');
    toggle.textContent = paused ? 'Play photos' : 'Pause photos';
  });
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      update();
    }).observe(rail);
  }
  if (window.ResizeObserver) {
    var observer = new ResizeObserver(fit);
    observer.observe(group);
    var nav = document.querySelector('.nav');
    if (nav) observer.observe(nav);
  }
  window.addEventListener('resize', fit, { passive: true });
  document.addEventListener('visibilitychange', update);
  reduced.addEventListener('change', update);
  fit();
  rail.classList.add('is-ready');
  update();
})();
