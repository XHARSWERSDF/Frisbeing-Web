/* ==========================================================================
   FRISBEING UF - leader access portal
   ========================================================================== */
(function () {
  "use strict";

  var el = function (id) { return document.getElementById(id); };
  var CFG = window.FBAuthConfig || {};

  function say(target, kind, html) {
    target.innerHTML = '<div class="rep ' + kind + '">' + html + "</div>";
  }

  function paint() {
    var user = FBAuth.user();

    el("signedIn").hidden = !user;
    el("signedOut").hidden = !!user;

    if (user) {
      el("portalTitle").textContent = "You are in";
      el("portalLede").textContent = "Leader tools are unlocked on this device.";
      el("whoEmail").textContent = user.via === "google" ? user.email : "Signed in with the leader passcode";
      el("whoVia").textContent = user.via === "google" ? "School account" : "Passcode";
      return;
    }

    el("portalTitle").textContent = "Sign in";
    el("portalLede").textContent =
      "Sorting teams and editing the roster are for club leaders. Sign in with your Tsinglan school account.";

    var configured = FBAuth.configured();
    el("googlePanel").hidden = !configured;
    el("setupPanel").hidden = configured;
    /* A server always accepts the passcode, whatever this file says. */
    el("passcodePanel").hidden = !(FBAuth.passcodeEnabled() || (FBAuth.serverMode && FBAuth.serverMode()));
    el("domainLabel").textContent = "@" + (CFG.emailDomain || "");
  }

  /* The Google script is loaded async, so wait for it before drawing the
     button. Give up after a few seconds rather than spinning forever - the
     passcode panel is already on screen as a way through. */
  function mountGoogle() {
    if (!FBAuth.configured()) return;
    var tries = 0;
    var timer = window.setInterval(function () {
      tries++;
      var ok = FBAuth.mountGoogleButton(el("googleBtn"), function (res) {
        if (res.ok) { paint(); say(el("googleReport"), "good", "<b>Signed in.</b>"); }
        else say(el("googleReport"), "bad", res.reason);
      });
      if (ok || tries > 40) {
        window.clearInterval(timer);
        if (!ok) {
          say(el("googleReport"), "warn",
            "<b>Google sign-in could not load.</b> You may be offline. Use the leader passcode below.");
        }
      }
    }, 150);
  }

  el("signOut").addEventListener("click", function () {
    FBAuth.signOut();
    paint();
  });

  el("passForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = el("passInput").value;
    var done = function (res) {
      if (res.ok) {
        el("passInput").value = "";
        paint();
        say(el("passReport"), res.offline ? "warn" : "good",
          res.offline ? "<b>Unlocked offline.</b> " + res.note : "<b>Unlocked.</b>");
      } else {
        say(el("passReport"), "bad", res.reason);
      }
    };
    /* With a server the passcode is checked there, not here. */
    if (FBAuth.serverMode && FBAuth.serverMode()) {
      say(el("passReport"), "good", "Checking&hellip;");
      FBAuth.signInWithServer(code).then(done);
    } else {
      done(FBAuth.signInWithPasscode(code));
    }
  });

  FBAuth.onChange(paint);
  paint();
  mountGoogle();
})();
