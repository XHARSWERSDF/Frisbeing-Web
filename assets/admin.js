/* ==========================================================================
   FRISBEING UF - account page: sign in with Microsoft, and who you are
   ========================================================================== */
(function () {
  "use strict";

  var el = function (id) { return document.getElementById(id); };
  var CFG = window.FBAuthConfig || {};

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function say(target, kind, html) {
    target.innerHTML = html ? '<div class="rep ' + kind + '">' + html + "</div>" : "";
  }

  function paint() {
    var user = FBAuth.user();
    var server = FBAuth.serverMode && FBAuth.serverMode();
    var canSignIn = FBAuth.canSignIn && FBAuth.canSignIn();

    el("signedIn").hidden = !user;
    el("signedOut").hidden = !!user;

    if (user) {
      var admin = FBAuth.isAdmin();
      el("portalTitle").textContent = "You are in";
      el("portalLede").textContent = admin ? "Leader tools are unlocked." : "Welcome to the squad.";
      el("goSorter").hidden = !admin;
      el("goMembers").querySelector("span").textContent = admin ? "Members & accounts" : "See the squad";
      el("whoName").textContent = user.name;
      el("whoRole").textContent = FBAuth.ROLE_NAME[user.role] || "";
      el("whoEmail").textContent = user.email;
      /* Everyone is told which squad-list entry is theirs - never its tier. */
      say(el("whoMember"), user.member ? "good" : "warn", user.member
        ? "On the squad list as <b>" + esc(user.member) + "</b>."
        : "<b>Not matched to the squad list yet.</b> A leader will link your account to your name.");
      return;
    }

    el("portalTitle").textContent = "Sign in";
    el("msPanel").hidden = !canSignIn;
    el("needsServerPanel").hidden = !!server;
    el("needsSetupPanel").hidden = !server || canSignIn;
    el("domainLabel").textContent = "@" + (CFG.emailDomain || "tsinglan.org");
  }

  el("signOut").addEventListener("click", function () {
    FBAuth.signOut();
    paint();
  });

  el("msBtn").addEventListener("click", function () {
    var btn = el("msBtn");
    btn.disabled = true;
    say(el("msReport"), "good", "Taking you to Microsoft&hellip;");
    FBAuth.signInWithMicrosoft().catch(function (e) {
      btn.disabled = false;
      say(el("msReport"), "bad", esc(e && e.message ? e.message : "Could not start sign-in."));
    });
  });

  FBAuth.onChange(paint);

  /* If we have just come back from Microsoft, finish the sign-in first, then
     draw the page in whatever state that leaves us. */
  FBAuth.completeMicrosoft().then(function (res) {
    if (res && res.ok === false) say(el("msReport"), "bad", esc(res.reason));
    paint();
  });

  paint();
})();
