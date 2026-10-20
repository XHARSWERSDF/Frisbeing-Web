(function () {
  'use strict';
  var section = document.createElement('section');
  section.className = 'band-pitch';
  section.id = 'club-photo-booth';
  section.innerHTML = '<div class="inner"><h2 class="display">Club Photo Booth</h2><div class="row"><button class="btn" id="boothUpload" hidden><span>Add photos</span></button><input id="boothFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></div><p id="boothStatus" role="status"></p><div class="booth-grid" id="boothGrid"></div></div>';
  document.querySelector('.why-section').after(section);
  var grid = section.querySelector('#boothGrid'), status = section.querySelector('#boothStatus');
  var upload = section.querySelector('#boothUpload'), input = section.querySelector('#boothFiles');
  var viewer = document.createElement('dialog');
  viewer.className = 'booth-viewer';
  viewer.setAttribute('aria-label', 'Club photo');
  viewer.innerHTML = '<button class="booth-close" type="button" aria-label="Close photo" autofocus>×</button><img class="booth-full-photo" alt="Frisbeing club photo"><div class="booth-viewer-actions"><a class="booth-save">Save photo</a><button class="booth-delete" type="button" hidden>Delete photo</button></div><p class="booth-viewer-status" role="status"></p>';
  document.body.append(viewer);
  var selected = null;
  var remove = viewer.querySelector('.booth-delete');
  var viewerStatus = viewer.querySelector('.booth-viewer-status');
  viewer.querySelector('.booth-close').onclick = function () { viewer.close(); };
  viewer.addEventListener('click', function (event) { if (event.target === viewer) { var box = viewer.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) viewer.close(); } });
  function openPhoto(photo) {
    selected = photo;
    viewer.querySelector('.booth-full-photo').src = photo.image;
    var save = viewer.querySelector('.booth-save');
    save.href = photo.image;
    save.download = 'frisbeing-' + photo.id + (photo.id.match(/\.(jpe?g|png|webp)$/i) ? '' : '.jpg');
    remove.hidden = !photo.canDelete;
    remove.disabled = false;
    viewerStatus.textContent = '';
    viewer.showModal();
  }
  remove.onclick = async function () {
    if (!selected || !selected.canDelete || !window.confirm('Delete this photo?')) return;
    remove.disabled = true;
    try { await request('DELETE', selected.id); viewer.close(); await load(); }
    catch (error) { viewerStatus.textContent = error.message; }
    finally { remove.disabled = false; }
  };
  var seeds = ['01-night-disc.jpeg','06-daylight-team.jpeg','04-night-team.jpeg','09-league-team.jpeg','02-night-squad.jpeg','07-day-track-team.jpeg','03-disc-circle.jpeg','08-night-four.jpeg','11-night-trio.jpg','12-field-huddle.jpg','13-day-squad.jpg','14-night-squad.jpg'].map(function (name) { return { id: name, image: 'assets/photos/' + name }; });
  function preview() { return window.FBPreview && FBPreview.active(); }
  function user() { return window.FBAuth && FBAuth.user(); }
  async function request(method, id, body) {
    if (preview()) {
      var key = 'frisbeing.preview.club-photos';
      var photos = JSON.parse(localStorage.getItem(key) || '[]');
      var me = user();
      if (method !== 'GET' && !me) throw new Error('Sign in to add photos.');
      if (method === 'POST') photos.push({ id: Date.now().toString(16) + Math.random().toString(16).slice(2), image: body.image, owner: me.email });
      if (method === 'DELETE') {
        var found = photos.find(function (p) { return p.id === id; });
        if (!found || found.owner !== me.email) throw new Error('You can only delete your own photos.');
        photos = photos.filter(function (p) { return p.id !== id; });
      }
      if (method !== 'GET') localStorage.setItem(key, JSON.stringify(photos));
      return { photos: photos.map(function (p) { return Object.assign({}, p, { canDelete: !!me && p.owner === me.email }); }) };
    }
    var base = String((window.FBServer || {}).apiBase || '').replace(/\/$/, '');
    if (!base) {
      if (method === 'GET') return { photos: [] };
      throw new Error('Connect to the club server to upload photos.');
    }
    var headers = { 'Content-Type': 'application/json' };
    if (window.FBAuth && FBAuth.token()) headers.Authorization = 'Bearer ' + FBAuth.token();
    var response = await fetch(base + '/club-photos' + (id ? '/' + encodeURIComponent(id) : ''), { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    var result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not update photos.');
    return result;
  }
  function render(photos) {
    grid.replaceChildren();
    seeds.concat(photos).forEach(function (photo, index) {
      var figure = document.createElement('figure');
      var open = document.createElement('button');
      open.type = 'button'; open.className = 'booth-frame';
      open.setAttribute('aria-label', 'Open club photo ' + (index + 1));
      open.setAttribute('aria-haspopup', 'dialog');
      open.onclick = function () { openPhoto(photo); };
      var img = document.createElement('img');
      img.src = photo.image; img.alt = 'Frisbeing club photo'; img.loading = 'lazy';
      open.append(img); figure.append(open); grid.append(figure);
    });
  }
  async function load() {
    upload.hidden = !user();
    try { var result = await request('GET'); render(result.photos || []); }
    catch (error) { status.textContent = 'Could not load uploaded photos. Refresh to try again.'; }
  }
  function prepare(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 20000000) return reject(new Error('Choose a JPG, PNG or WebP photo under 20 MB.'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not open this photo.')); };
      img.onload = function () {
        var scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
        var ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        var result = canvas.toDataURL('image/jpeg', .8);
        if (result.length > 900000) result = canvas.toDataURL('image/jpeg', .55);
        if (result.length > 900000) return reject(new Error('This photo is too large. Choose a smaller copy.'));
        resolve(result);
      };
      img.src = url;
    });
  }
  upload.onclick = function () { input.click(); };
  input.onchange = async function () {
    upload.disabled = true;
    var completed = 0;
    try {
      for (var file of input.files) { status.textContent = 'Uploading ' + (completed + 1) + ' / ' + input.files.length + '…'; await request('POST', null, { image: await prepare(file) }); completed++; }
      status.textContent = completed + ' photo(s) added.';
    } catch (error) { status.textContent = completed + ' photo(s) added. ' + error.message; }
    finally { input.value = ''; upload.disabled = false; await load(); }
  };
  render([]); load();
  if (window.FBAuth) FBAuth.onChange(load);
})();
