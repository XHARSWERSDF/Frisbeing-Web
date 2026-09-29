/* ==========================================================================
   FRISBEING UF - accounts panel on the members page

   Leaders and admins see everyone who has signed up, which squad-list entry
   each account is linked to, and can fix a link or remove an account. The
   server decides what is allowed; this only draws it.
   ========================================================================== */
(function () {
  "use strict";

  var el = function (id) { return document.getElementById(id); };
  var panel = el("accountsPanel");
  if (!panel) return;

  var listEl = el("accountList"), countEl = el("accountsCount"), report = el("accountsReport");
  var accounts = [];
  var rosterNames = "";

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function say(kind, html) {
    report.innerHTML = html ? '<div class="rep ' + kind + '">' + html + "</div>" : "";
  }

  function allowed() {
    return FBStore.serverMode() && window.FBAuth && FBAuth.isAdmin();
  }

  function load() {
    if (!allowed()) {
      panel.hidden = true;
      accounts = [];
      return;
    }
    panel.hidden = false;
    FBStore._request("/accounts").then(function (d) {
      accounts = d.accounts || [];
      paint();
    }, function (err) {
      say("bad", "<b>Could not load accounts.</b> " + esc(err && err.message ? err.message : ""));
    });
  }

  /* Mirrors the server's rule, which is the one that actually decides. */
  function canRemove(a) {
    if (a.role === "leader") return false;
    if (a.role === "admin") return FBAuth.isSupremeLeader();
    return true;
  }

  function paint() {
    var roster = FBStore.getRoster().slice().sort(function (x, y) { return x.name.localeCompare(y.name); });
    var owner = {};
    accounts.forEach(function (a) { if (a.member) owner[FB.norm(a.member)] = a.id; });

    var unmatched = accounts.filter(function (a) { return !a.member; }).length;
    countEl.textContent = accounts.length + (accounts.length === 1 ? " account" : " accounts") +
      (unmatched ? " · " + unmatched + " not linked" : "");

    listEl.innerHTML = "";
    if (!accounts.length) {
      var e = document.createElement("div");
      e.className = "empty";
      e.textContent = "Nobody has signed up yet.";
      listEl.appendChild(e);
      return;
    }

    /* Unlinked accounts first: they are the ones that need a leader. */
    var rank = { leader: 0, admin: 1, player: 2 };
    accounts.slice().sort(function (a, b) {
      return (a.member ? 1 : 0) - (b.member ? 1 : 0) ||
        rank[a.role] - rank[b.role] || a.name.localeCompare(b.name);
    }).forEach(function (a) {
      var row = document.createElement("div");
      row.className = "member account";

      var who = document.createElement("span");
      who.className = "nm";
      who.innerHTML = esc(a.name) +
        '<span class="sub">' + esc(a.email) + " · " + esc(FBAuth.ROLE_NAME[a.role] || a.role) + "</span>";
      row.appendChild(who);

      var pick = document.createElement("select");
      pick.setAttribute("aria-label", "Squad-list entry for " + a.name);
      var none = document.createElement("option");
      none.value = "";
      none.textContent = "Not linked";
      pick.appendChild(none);
      roster.forEach(function (m) {
        var taken = owner[FB.norm(m.name)];
        if (taken && taken !== a.id) return;   /* already someone else's */
        var o = document.createElement("option");
        o.value = m.name;
        o.textContent = m.name;
        if (a.member && FB.norm(a.member) === FB.norm(m.name)) o.selected = true;
        pick.appendChild(o);
      });
      pick.addEventListener("change", function () { link(a, pick.value); });
      row.appendChild(pick);

      var del = document.createElement("button");
      del.className = "del";
      del.type = "button";
      del.innerHTML = "&times;";
      if (canRemove(a)) {
        del.title = "Remove the account for " + a.name;
        del.setAttribute("aria-label", del.title);
        del.addEventListener("click", function () { remove(a); });
      } else {
        del.disabled = true;
        del.style.visibility = "hidden";
      }
      row.appendChild(del);

      listEl.appendChild(row);
    });
  }

  function link(a, member) {
    FBStore._request("/accounts/" + a.id, { method: "PUT", body: { member: member || null } }).then(function () {
      say("good", member
        ? "<b>" + esc(a.name) + "</b> is linked to <b>" + esc(member) + "</b>."
        : "<b>" + esc(a.name) + "</b> is no longer linked to the squad list.");
      load();
    }, function (err) {
      say("bad", "<b>Could not change the link.</b> " + esc(err && err.message ? err.message : ""));
      load();
    });
  }

  function remove(a) {
    if (!window.confirm("Remove the account for " + a.name + " (" + a.email + ")? They can sign up again afterwards.")) return;
    FBStore._request("/accounts/" + a.id, { method: "DELETE" }).then(function () {
      say("warn", "<b>Removed</b> the account for " + esc(a.name) + ".");
      load();
    }, function (err) {
      say("bad", "<b>Could not remove it.</b> " + esc(err && err.message ? err.message : ""));
    });
  }

  if (window.FBAuth) FBAuth.onChange(load);

  /* A changed squad list changes the names to pick from, and the server may
     have linked accounts to new entries - so fetch again. The store also
     reports every quiet poll, which must not rebuild a menu someone has open. */
  FBStore.onChange(function () {
    var names = FBStore.getRoster().map(function (m) { return m.name; }).sort().join("|");
    if (names === rosterNames) return;
    rosterNames = names;
    load();
  });
})();
