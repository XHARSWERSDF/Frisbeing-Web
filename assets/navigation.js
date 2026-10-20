/* Show account-specific navigation links for signed-in or preview sessions. */
(function () {
  "use strict";

  var hasOwnBackground = document.body.classList.contains("fris-off-school-body");
  var backgroundKey = "frisbeing.background";
  var themePicker = document.createElement("div");
  themePicker.className = "background-picker";
  themePicker.setAttribute("role", "group");
  themePicker.setAttribute("aria-label", "Background style");
  themePicker.innerHTML = '<button type="button" data-background="classic">Classic</button><button type="button" data-background="minimalism">Minimalism</button>';
  var backgroundStyle = "minimalism";
  try {
    var savedStyle = localStorage.getItem(backgroundKey);
    if (savedStyle === "photos") backgroundStyle = "classic";
    else if (savedStyle === "pattern") backgroundStyle = "minimalism";
  } catch (ignore) {}
  function applyBackground() {
    document.body.classList.toggle("pattern-background", !hasOwnBackground && backgroundStyle === "classic");
    themePicker.querySelectorAll("button").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.background === backgroundStyle));
    });
  }
  applyBackground();
  var brandMark = document.querySelector(".nav .mark");
  if (brandMark && !hasOwnBackground) brandMark.after(themePicker);
  themePicker.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-background]");
    if (!button) return;
    backgroundStyle = button.dataset.background;
    applyBackground();
    try { localStorage.setItem(backgroundKey, backgroundStyle === "classic" ? "photos" : "pattern"); } catch (ignore) {}
  });

  var tools = document.getElementById("memberTools");
  var gameLink = document.getElementById("gameNav");
  var memberLink = document.getElementById("membershipNav");
  var accountLink = document.getElementById("accountNav");
  if (!tools && !gameLink && !accountLink) return;
  var localDevelopment = location.protocol === "file:" || ["localhost", "127.0.0.1", "::1", "[::1]"].indexOf(location.hostname) >= 0;
  var accountLabel = null;
  var inviteBadge = null;
  var passionStarBadge = null;
  var inviteRequestId = 0;
  var passionRequestId = 0;
  if (accountLink) {
    accountLabel = document.createTextNode("");
    inviteBadge = document.createElement("span");
    inviteBadge.className = "nav-invite-notification";
    inviteBadge.id = "navInviteNotification";
    inviteBadge.setAttribute("aria-hidden", "true");
    inviteBadge.hidden = true;
    var inviteMark = document.createElement("img");
    inviteMark.src = "assets/monogram.png";
    inviteMark.alt = "";
    inviteBadge.appendChild(inviteMark);
    passionStarBadge = document.createElement("span");
    passionStarBadge.className = "nav-passion-star-notification";
    passionStarBadge.id = "navPassionStarNotification";
    passionStarBadge.setAttribute("aria-hidden", "true");
    passionStarBadge.textContent = "★";
    passionStarBadge.hidden = true;
    accountLink.replaceChildren(accountLabel, inviteBadge, passionStarBadge);
  }

  if (localDevelopment && window.FBPreview && FBPreview.simulateTeammates) {
    var passionSimulator = document.createElement("button");
    passionSimulator.type = "button";
    passionSimulator.className = "dev-passion-star-global";
    passionSimulator.textContent = "Simulate Passion Star";
    passionSimulator.addEventListener("click", function () {
      var alreadySignedInPreview = FBPreview.active() && FBPreview.signedIn();
      if (/\/admin\.html$/.test(location.pathname)) {
        try { sessionStorage.setItem("frisbeing.wait-for-passion-profile-open", "1"); } catch (ignore) { /* optional in private mode */ }
      }
      FBPreview.simulateTeammates("passion-star");
      if (window.FBNav && FBNav.updatePassionStarStatus) FBNav.updatePassionStarStatus(true);
      if (!alreadySignedInPreview && window.FBAuth && FBAuth._fire) FBAuth._fire();
      if (window.FBNav && FBNav.refresh) FBNav.refresh();
    });
    document.body.appendChild(passionSimulator);
  }

  function syncUser(user) {
    var active = !!user || !!(window.FBPreview && FBPreview.signedIn && FBPreview.signedIn());
    document.body.classList.toggle("has-user-session", active);
    if (tools) tools.hidden = !active;
    if (gameLink) gameLink.hidden = false;
    if (memberLink) memberLink.hidden = !active;
    if (!active && /\/(roster|gearhub|profile|fris-off-school)\.html$/.test(location.pathname)) {
      window.location.replace("admin.html");
      return;
    }
    if (accountLabel) accountLabel.textContent = active ? "My Profile" : "Account";
    refreshInviteBadge(active);
  }

  function refreshInviteBadge(active) {
    if (!inviteBadge) return;
    var requestId = ++inviteRequestId;
    var starRequestId = ++passionRequestId;
    if (!active) { inviteBadge.hidden = true; if (passionStarBadge) passionStarBadge.hidden = true; return; }
    var signedInUser = window.FBPreview && FBPreview.active()
      ? FBPreview.user()
      : window.FBAuth && FBAuth.user ? FBAuth.user() : null;
    var storageKey = signedInUser && signedInUser.email
      ? "frisbeing.pending-teammate-invite:" + String(signedInUser.email).toLowerCase()
      : null;
    if (storageKey) {
      try { inviteBadge.hidden = window.localStorage.getItem(storageKey) !== "1"; }
      catch (ignore) { /* the server request below remains authoritative */ }
    }

    var request;
    if (window.FBPreview && FBPreview.active()) {
      request = FBPreview.request("GET", "/me");
    } else {
      var token = window.FBAuth && FBAuth.token ? FBAuth.token() : null;
      if (!token) { inviteBadge.hidden = true; if (passionStarBadge) passionStarBadge.hidden = true; return; }
      var base = window.FBServer && FBServer.apiBase ? String(FBServer.apiBase).replace(/\/$/, "") : "";
      request = fetch(base + "/me", {
        headers: { "Accept": "application/json", "Authorization": "Bearer " + token },
        cache: "no-store"
      }).then(function (response) {
        if (!response.ok) throw new Error("Could not load invitation status.");
        return response.json();
      });
    }
    request.then(function (data) {
      var pending = !!((data.teammateInvitations || []).length);
      if (requestId === inviteRequestId) {
        inviteBadge.hidden = !pending;
        if (storageKey) {
          try { window.localStorage.setItem(storageKey, pending ? "1" : "0"); }
          catch (ignore) { /* a full or restricted storage does not block the badge */ }
        }
      }
      if (passionRequestId === starRequestId && passionStarBadge) passionStarBadge.hidden = !(data.passionStar && data.passionStar.unseen);
    }).catch(function () {
      /* Keep the last known reminder during a temporary connection failure. */
    });
  }

  function updateInviteStatus(pending) {
    ++inviteRequestId;
    if (!inviteBadge) return;
    inviteBadge.hidden = !pending;
    var signedInUser = window.FBPreview && FBPreview.active()
      ? FBPreview.user()
      : window.FBAuth && FBAuth.user ? FBAuth.user() : null;
    if (!signedInUser || !signedInUser.email) return;
    try {
      window.localStorage.setItem(
        "frisbeing.pending-teammate-invite:" + String(signedInUser.email).toLowerCase(),
        pending ? "1" : "0"
      );
    } catch (ignore) { /* reminder remains visible for this page */ }
  }

  function updatePassionStarStatus(unseen) {
    ++passionRequestId;
    if (passionStarBadge) passionStarBadge.hidden = !unseen;
  }

  window.FBNav = window.FBNav || {};
  window.FBNav.updateInviteStatus = updateInviteStatus;
  window.FBNav.updatePassionStarStatus = updatePassionStarStatus;
  window.FBNav.refresh = function () { syncUser(window.FBAuth && FBAuth.user()); };
  if (accountLink) accountLink.addEventListener("click", function () {
    if (!/\/admin\.html$/.test(location.pathname)) return;
    try {
      if (sessionStorage.getItem("frisbeing.wait-for-passion-profile-open") === "1") {
        sessionStorage.removeItem("frisbeing.wait-for-passion-profile-open");
        window.location.reload();
      }
    } catch (ignore) { /* normal navigation still works */ }
  });
  if (window.FBAuth) FBAuth.onChange(syncUser);
  syncUser(window.FBAuth && FBAuth.user());
  window.setInterval(function () {
    if (document.visibilityState !== "hidden") {
      syncUser(window.FBAuth && FBAuth.user());
    }
  }, 15000);
  window.addEventListener("focus", function () { syncUser(window.FBAuth && FBAuth.user()); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "hidden") syncUser(window.FBAuth && FBAuth.user());
  });
})();
