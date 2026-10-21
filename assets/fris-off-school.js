(function () {
  "use strict";

  var image = document.querySelector(".fris-off-school-qr");
  var admin = document.getElementById("frisOffSchoolAdmin");
  var input = document.getElementById("frisOffSchoolQrInput");
  var replace = document.getElementById("frisOffSchoolReplace");
  var status = document.getElementById("frisOffSchoolStatus");

  function isManager() {
    if (window.FBPreview && FBPreview.active()) return FBPreview.role() === "admin" || FBPreview.role() === "leader";
    return !!(window.FBAuth && FBAuth.isAdmin());
  }

  function request(method, data) {
    if (window.FBPreview && FBPreview.active()) return FBPreview.request(method, "/fris-off-school", data);
    var base = window.FBServer && FBServer.apiBase ? String(FBServer.apiBase).replace(/\/$/, "") : "";
    var headers = { "Accept": "application/json" };
    var token = window.FBAuth && FBAuth.token ? FBAuth.token() : null;
    if (token) headers.Authorization = "Bearer " + token;
    if (data) headers["Content-Type"] = "application/json";
    return fetch(base + "/fris-off-school", {
      method: method, headers: headers, body: data ? JSON.stringify(data) : undefined, cache: "no-store"
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (result) {
        if (!response.ok) throw new Error(result.error || "Could not update the QR code.");
        return result;
      });
    });
  }

  function syncRole() { admin.hidden = !isManager(); }

  function showImage(source) {
    image.onload = function () {
      image.style.visibility = "visible";
      image.parentElement.setAttribute("aria-busy", "false");
    };
    image.onerror = function () {
      image.style.visibility = "hidden";
      image.parentElement.setAttribute("aria-busy", "false");
      status.textContent = "Could not load the QR code. Please refresh.";
    };
    image.src = source;
  }

  function loadImage() {
    request("GET").then(function (result) {
      if (result.image) showImage(result.image);
    }).catch(function () {
      image.parentElement.setAttribute("aria-busy", "false");
      status.textContent = "Could not load the QR code. Please refresh.";
    });
  }

  syncRole();
  loadImage();
  if (window.FBAuth && FBAuth.onChange) FBAuth.onChange(syncRole);

  replace.addEventListener("click", function () { input.click(); });
  input.addEventListener("change", function () {
    var file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 650000) {
      status.textContent = "Choose a PNG, JPG or WebP image smaller than 650 KB.";
      input.value = "";
      return;
    }
    replace.disabled = true;
    status.textContent = "Replacing QR code…";
    var reader = new FileReader();
    reader.onerror = function () {
      replace.disabled = false;
      status.textContent = "Could not read that image.";
    };
    reader.onload = function () {
      request("PUT", { image: String(reader.result) }).then(function (result) {
        showImage(result.image);
        status.textContent = "QR code updated.";
      }).catch(function (error) {
        status.textContent = error.message || "Could not update the QR code.";
      }).finally(function () {
        replace.disabled = false;
        input.value = "";
      });
    };
    reader.readAsDataURL(file);
  });
})();
