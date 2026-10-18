/* Show account-specific navigation links for signed-in or preview sessions. */
(function () {
  "use strict";

  var tools = document.getElementById("memberTools");
  var gameLink = document.getElementById("gameNav");
  var accountLink = document.getElementById("accountNav");
  if (!tools && !gameLink && !accountLink) return;
  var accountLabel = null;
  var inviteBadge = null;
  var inviteRequestId = 0;
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
    accountLink.replaceChildren(accountLabel, inviteBadge);
  }

  function syncUser(user) {
    var active = !!user || !!(window.FBPreview && FBPreview.active());
    document.body.classList.toggle("has-user-session", active);
    if (tools) tools.hidden = !active;
    if (gameLink) gameLink.hidden = !active;
    if (accountLabel) accountLabel.textContent = active ? "My Profile" : "Account";
    refreshInviteBadge(active);
  }

  function refreshInviteBadge(active) {
    if (!inviteBadge) return;
    var requestId = ++inviteRequestId;
    if (!active) { inviteBadge.hidden = true; return; }
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
      if (!token) { inviteBadge.hidden = true; return; }
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
      if (requestId !== inviteRequestId) return;
      var pending = !!((data.teammateInvitations || []).length);
      inviteBadge.hidden = !pending;
      if (storageKey) {
        try { window.localStorage.setItem(storageKey, pending ? "1" : "0"); }
        catch (ignore) { /* a full or restricted storage does not block the badge */ }
      }
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

  window.FBNav = window.FBNav || {};
  window.FBNav.updateInviteStatus = updateInviteStatus;
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
