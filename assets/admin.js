/* ==========================================================================
   FRISBEING UF - account page: sign in with Microsoft, and who you are
   ========================================================================== */
(function () {
  "use strict";

  var el = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function say(target, kind, html) {
    target.innerHTML = html ? '<div class="rep ' + kind + '">' + html + "</div>" : "";
  }

  var preferredDialog = el("preferredDialog");
  var preferredList = el("preferredList");
  var preferredNames = [];
  var preferredSelected = [];
  var preferredMode = "preferred";
  var preferredLimit = 2;
  var currentMemberName = null;
  var profileRequest = 0;
  var teammateGroupState = null;
  var preferredActionTimer = null;

  function preferredRequest(method, path, body) {
    if (window.FBPreview && FBPreview.active()) return FBPreview.request(method, path, body);
    var base = window.FBServer && FBServer.apiBase ? String(FBServer.apiBase).replace(/\/$/, "") : "";
    var headers = { "Accept": "application/json" };
    var token = FBAuth.token();
    if (token) headers.Authorization = "Bearer " + token;
    if (body) headers["Content-Type"] = "application/json";
    return fetch(base + path, {
      method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store"
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || "Could not save your choices.");
        return data;
      });
    });
  }

  function preferredStatus(message) { el("preferredStatus").textContent = message || ""; }

  function showPreferredActionStatus(message) {
    var status = el("preferredActionStatus");
    if (preferredActionTimer) window.clearTimeout(preferredActionTimer);
    status.textContent = message || "";
    if (message) preferredActionTimer = window.setTimeout(function () {
      status.textContent = "";
      preferredActionTimer = null;
    }, 5000);
  }

  function currentUser() {
    return FBAuth.user() || (window.FBPreview && FBPreview.active() ? FBPreview.user() : null);
  }

  function loadTeammateProfile() {
    var request = ++profileRequest;
    if (!currentUser()) { el("teammateArea").hidden = true; return; }
    el("teammateArea").hidden = false;
    el("teammateStatus").textContent = "Loading teammate info…";
    preferredRequest("GET", "/me").then(function (data) {
      if (request !== profileRequest || !currentUser()) return;
      var account = data.account || {};
      currentMemberName = account.member || null;
      paintTeammateProfile(data);
    }).catch(function (error) {
      if (request !== profileRequest) return;
      el("teammateStatus").textContent = error && error.message ? error.message : "Could not load teammate info.";
    });
  }

  function paintTeammateProfile(data) {
    var invitationsBox = el("teammateInvitations");
    var sentBox = el("teammateSent");
    var group = data.teammateGroup;
    var invitations = data.teammateInvitations || [];
    var sent = data.teammateInvitationsSent || [];
    teammateGroupState = group;
    var memberList = el("preferredTeamMembers");
    memberList.innerHTML = "";
    invitationsBox.innerHTML = "";
    sentBox.innerHTML = "";
    memberList.hidden = !group;
    invitationsBox.hidden = !invitations.length;
    sentBox.hidden = !sent.length;
    el("inviteNotification").hidden = !invitations.length;
    if (window.FBNav && FBNav.updateInviteStatus) FBNav.updateInviteStatus(invitations.length > 0);
    el("preferredOpen").disabled = !!group && (!group.isLeader || group.members.length >= 3);
    el("teammateStatus").textContent = "";

    if (group) {
      memberList.setAttribute("aria-label", "Teammate group members");
      (group.members || []).forEach(function (member) {
        var chip = document.createElement("div");
        chip.className = "preferred-team-member";
        var name = document.createElement("span");
        name.className = member.id === group.leaderId ? "preferred-team-member-name is-leader" : "preferred-team-member-name";
        name.textContent = member.name;
        chip.appendChild(name);
        if (group.isLeader || member.isMe) {
          var remove = document.createElement("button");
          remove.type = "button";
          remove.className = "preferred-member-remove";
          remove.setAttribute("aria-label", member.isMe ? "Leave the teammate group" : "Remove " + member.name + " from the group");
          remove.textContent = "×";
          remove.addEventListener("click", function () { removeTeammate(member); });
          chip.appendChild(remove);
        }
        memberList.appendChild(chip);
      });
    }

    if (invitations.length) {
      invitations.forEach(function (invitation) {
        var row = document.createElement("div");
        row.className = "teammate-invitation";
        var text = document.createElement("p");
        text.textContent = invitation.inviterName + " invited you to team up.";
        row.appendChild(text);
        [ ["accept", "Accept"], ["decline", "Decline"] ].forEach(function (choice) {
          var button = document.createElement("button");
          button.type = "button";
          button.className = "btn" + (choice[0] === "accept" ? " solid" : "");
          button.innerHTML = "<span>" + choice[1] + "</span>";
          button.addEventListener("click", function () { respondToInvitation(invitation.id, choice[0]); });
          row.appendChild(button);
        });
        invitationsBox.appendChild(row);
      });
    }
    if (sent.length) {
      var sentHeading = document.createElement("h3");
      sentHeading.textContent = "Invitations sent";
      sentBox.appendChild(sentHeading);
      sent.forEach(function (invitation) {
        var item = document.createElement("p");
        item.textContent = invitation.memberName + " · waiting for a response";
        sentBox.appendChild(item);
      });
    }
    el("teammateArea").hidden = !invitations.length && !sent.length;
  }

  function removeTeammate(member) {
    preferredRequest("DELETE", "/me/teammate-group/members/" + encodeURIComponent(member.id)).then(function (data) {
      paintTeammateProfile(data);
    }).catch(function (error) {
      el("teammateStatus").textContent = error && error.message ? error.message : "Could not remove teammate.";
      el("teammateArea").hidden = false;
    });
  }

  function respondToInvitation(id, response) {
    el("teammateStatus").textContent = response === "accept" ? "Joining the group…" : "Declining invitation…";
    preferredRequest("POST", "/me/teammate-invitations/" + encodeURIComponent(id) + "/respond", { response: response }).then(function (data) {
      paintTeammateProfile(data);
    }).catch(function (error) {
      el("teammateStatus").textContent = error && error.message ? error.message : "Could not respond to invitation.";
    });
  }

  function paintPreferredList() {
    preferredList.innerHTML = "";
    el("preferredCount").textContent = preferredLimit
      ? preferredSelected.length + " / " + preferredLimit + " selected"
      : "Your teammate group is full.";
    if (!preferredNames.length) {
      var empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "No members are on the list yet.";
      preferredList.appendChild(empty);
      return;
    }
    preferredNames.forEach(function (name) {
      var button = document.createElement("button");
      var checked = preferredSelected.indexOf(name) >= 0;
      button.type = "button";
      button.className = "preferred-choice";
      button.setAttribute("aria-pressed", checked ? "true" : "false");
      var mark = document.createElement("span");
      mark.className = "preferred-check";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = checked ? "✓" : "";
      var label = document.createElement("span");
      label.textContent = name;
      button.appendChild(mark);
      button.appendChild(label);
      button.addEventListener("click", function () {
        var index = preferredSelected.indexOf(name);
        if (index >= 0) preferredSelected.splice(index, 1);
        else if (preferredSelected.length < preferredLimit) preferredSelected.push(name);
        else { preferredStatus("You can choose up to " + preferredLimit + " member" + (preferredLimit === 1 ? "" : "s") + "."); return; }
        preferredStatus("");
        var scrollTop = preferredList.scrollTop;
        paintPreferredList();
        preferredList.scrollTop = scrollTop;
        Array.prototype.forEach.call(preferredList.children, function (choice) {
          if (choice.lastChild && choice.lastChild.textContent === name) choice.focus({ preventScroll: true });
        });
      });
      preferredList.appendChild(button);
    });
  }

  function openTeammatePicker(mode) {
    preferredMode = mode;
    preferredLimit = mode === "group" ? 1 : 2;
    preferredNames = [];
    preferredSelected = [];
    preferredList.innerHTML = "";
    preferredStatus("Loading members…");
    el("preferredSave").disabled = true;
    el("preferredTitle").textContent = mode === "group" ? "Invite one more teammate" : "Preferred teammates";
    el("preferredSave").querySelector("span").textContent = mode === "group" ? "Send invitation" : "Send invitations";
    preferredDialog.showModal();
    Promise.all([preferredRequest("GET", "/state"), preferredRequest("GET", "/me")]).then(function (results) {
      if (!preferredDialog.open) return;
      var account = results[1].account || {};
      currentMemberName = account.member || null;
      var group = results[1].teammateGroup;
      if (mode !== "group" && group) preferredLimit = Math.max(0, 3 - group.members.length);
      preferredNames = (results[0].roster || []).map(function (member) { return member.name; })
        .filter(function (name) { return typeof name === "string" && name.trim(); })
        .filter(function (name) { return !currentMemberName || name.toLowerCase() !== currentMemberName.toLowerCase(); })
        .filter(function (name) { return !(group && group.members || []).some(function (member) { return member.name.toLowerCase() === name.toLowerCase(); }); })
        .sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: "base" }); });
      var saved = (results[1].account && results[1].account.preferredTeammates) || [];
      preferredSelected = mode === "preferred" && !group ? saved.map(function (name) {
        return preferredNames.find(function (member) { return member.toLowerCase() === String(name).toLowerCase(); });
      }).filter(Boolean).slice(0, preferredLimit) : [];
      el("preferredCount").textContent = preferredLimit ? "Choose up to " + preferredLimit + " member" + (preferredLimit === 1 ? "" : "s") : "Your teammate group is full.";
      preferredStatus("");
      el("preferredSave").disabled = preferredLimit === 0;
      paintPreferredList();
    }).catch(function (error) {
      preferredStatus(error && error.message ? error.message : "Could not load members.");
    });
  }
  el("preferredOpen").addEventListener("click", function () { openTeammatePicker("preferred"); });

  el("inviteNotification").addEventListener("click", function () {
    var panel = el("teammateArea");
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
    var firstAction = panel.querySelector("button");
    if (firstAction) window.setTimeout(function () { firstAction.focus({ preventScroll: true }); }, 250);
  });

  el("preferredClose").addEventListener("click", function () { preferredDialog.close(); });
  preferredDialog.addEventListener("click", function (event) {
    if (event.target === preferredDialog) preferredDialog.close();
  });
  el("preferredSave").addEventListener("click", function () {
    var saveButton = el("preferredSave");
    if (preferredMode === "group" && !preferredSelected.length) {
      preferredStatus("Choose one member to invite.");
      return;
    }
    saveButton.disabled = true;
    preferredStatus("Saving…");
    var save = preferredMode === "group"
      ? preferredRequest("POST", "/me/teammate-invitations", { member: preferredSelected[0] })
      : preferredRequest("PUT", "/me/preferences", { preferredTeammates: preferredSelected });
    save.then(function () {
      var sentCount = preferredSelected.length;
      preferredDialog.close();
      showPreferredActionStatus(sentCount ? (sentCount === 1 ? "Invitation sent." : "Invitations sent.") : "Invitations updated.");
      loadTeammateProfile();
    }).catch(function (error) {
      preferredStatus(error && error.message ? error.message : "Could not save your choices.");
    }).finally(function () { saveButton.disabled = false; });
  });

  function paint() {
    var user = currentUser();
    var canSignIn = FBAuth.canSignIn && FBAuth.canSignIn();

    el("signedIn").hidden = !user;
    el("signedOut").hidden = !!user;
    el("portalLede").hidden = !!user;
    document.body.classList.toggle("account-signed-in", !!user);
    el("portalTitle").textContent = "Account";
    document.title = (user ? "My Profile" : "Account") + " · FRISBEING UF";

    if (user) {
      el("whoName").textContent = FBAuth.accountName(user.email);
      el("whoEmail").textContent = user.email;
      el("whoMember").textContent = FBAuth.accountRoleLabel(user.role);
      el("attendanceCount").textContent = String(Number(user.attendanceCount) || 0);
      el("teammateDemo").hidden = !(window.FBPreview && FBPreview.active());
      loadTeammateProfile();
      return;
    }
    profileRequest++;
    el("teammateArea").hidden = true;
    el("teammateDemo").hidden = true;
    el("preferredOpen").hidden = false;
    el("preferredOpen").disabled = false;

    el("msPanel").hidden = false;
    el("msBtn").disabled = !canSignIn;
    if (!canSignIn) {
      say(el("msReport"), "warn", "Microsoft sign-in is currently unavailable. Please try again later.");
    }
  }

  el("msBtn").addEventListener("click", function () {
    var btn = el("msBtn");
    btn.disabled = true;
    say(el("msReport"), "good", "Taking you to Microsoft&hellip;");
    FBAuth.signInWithMicrosoft().catch(function (e) {
      btn.disabled = false;
      say(el("msReport"), "bad", esc(e && e.message ? e.message : "Could not start sign-in."));
    });
  });

  document.querySelectorAll("[data-preview-role]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (window.FBPreview) FBPreview.enable("sort.html", button.getAttribute("data-preview-role"));
    });
  });

  document.querySelectorAll("[data-teammate-demo]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!window.FBPreview || !FBPreview.active() || !FBPreview.simulateTeammates) return;
      FBPreview.simulateTeammates(button.getAttribute("data-teammate-demo"));
      loadTeammateProfile();
    });
  });

  el("accountSignOut").addEventListener("click", function () {
    if (window.FBPreview && FBPreview.active()) { FBPreview.stop(); return; }
    FBAuth.signOut();
    window.location.assign("admin.html");
  });

  FBAuth.onChange(paint);
  window.setInterval(function () {
    if (document.visibilityState !== "hidden" && currentUser()) loadTeammateProfile();
  }, 15000);

  /* If we have just come back from Microsoft, finish the sign-in first, then
     draw the page in whatever state that leaves us. */
  FBAuth.completeMicrosoft().then(function (res) {
    if (res && res.ok === false) say(el("msReport"), "bad", esc(res.reason));
    paint();
  });

  paint();
})();
