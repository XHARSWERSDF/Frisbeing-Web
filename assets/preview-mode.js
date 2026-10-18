(function () {
  "use strict";
  var KEY = "frisbeing.ui-preview.v1", ROLE = "frisbeing.ui-preview.role", DATA = "frisbeing.ui-preview.data.v1";
  var localDevelopment = location.protocol === "file:" || ["localhost", "127.0.0.1", "::1", "[::1]"].indexOf(location.hostname) >= 0;
  if (!localDevelopment) {
    try { localStorage.removeItem(KEY); localStorage.removeItem(ROLE); } catch (ignore) { /* Storage may be disabled. */ }
    return;
  }
  var signedOutPanel = document.getElementById("signedOut");
  if (signedOutPanel) {
    signedOutPanel.insertAdjacentHTML("afterbegin", "<div class=\"preview-actions\">\n          <p class=\"hint\">Preview without signing in</p>\n          <div class=\"row\"><button class=\"btn\" data-preview-role=\"player\" type=\"button\"><span>Member</span></button><button class=\"btn\" data-preview-role=\"admin\" type=\"button\"><span>Admin</span></button><button class=\"btn\" data-preview-role=\"leader\" type=\"button\"><span>Admin Manager</span></button></div>\n          <p class=\"hint\">Preview interactions run only in this browser and do not change the live roster or sessions.</p>\n        </div>");
  }
  var labels = { player: "Member", admin: "Admin", leader: "Admin Manager" };
  var emailNames = { player: "member", admin: "admin", leader: "admin-manager" };
  var demoMembers = { player: "Demo Alex", admin: "Demo Jamie", leader: "Demo Taylor" };
  function enabled() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
  function role() { try { return labels[localStorage.getItem(ROLE)] ? localStorage.getItem(ROLE) : "player"; } catch (e) { return "player"; } }
  function stop() { localStorage.removeItem(KEY); window.location.assign("admin.html"); }
  function enable(path, selectedRole) {
    localStorage.setItem(KEY, "1");
    localStorage.setItem(ROLE, labels[selectedRole] ? selectedRole : "player");
    window.location.assign(path || "sort.html");
  }
  function user() { return { name: "Preview " + labels[role()], email: "preview-" + emailNames[role()] + "@tsinglan.org", member: demoMembers[role()], role: role(), attendanceCount: 0 }; }
  function dateAt(offset) {
    var today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    var d = new Date(today + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  function beforeSessionCutoff() {
    var parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    var hour = Number(parts.find(function (part) { return part.type === "hour"; }).value);
    var minute = Number(parts.find(function (part) { return part.type === "minute"; }).value);
    return hour * 60 + minute < 20 * 60 + 10;
  }
  var data;
  function getData() {
    if (!data) try { data = JSON.parse(localStorage.getItem(DATA)); } catch (e) { /* first preview */ }
    if (!data) {
      var roster = ["Alex", "Jamie", "Taylor", "Morgan", "Riley", "Casey"].map(function (name, i) {
        return { name: "Demo " + name, tier: ["A", "I", "B"][i % 3], gender: i % 2 ? "f" : "m", position: i % 3 ? "c" : "h" };
      });
      data = { version: 1, added: [dateAt(0), dateAt(1)], removed: [], games: {}, roster: roster,
        accounts: Object.keys(labels).map(function (r) { return { id: r, name: "Preview " + labels[r], email: "preview-" + emailNames[r] + "@tsinglan.org", role: r, member: demoMembers[r] }; }) };
      data.games[dateAt(0)] = { joined: roster.map(function (p, i) { return Object.assign({ id: "demo-" + i, member: p.name }, p); }), passed: [], draw: null };
      persist();
    }
    if (!Array.isArray(data.teammateInvitations)) data.teammateInvitations = [];
    if (!Array.isArray(data.teammateGroups)) data.teammateGroups = [];
    if (!Array.isArray(data.gearProducts)) data.gearProducts = [];
    if (!data.gearProductsInitialized) {
      if (!data.gearProducts.some(function (product) { return product && product.id === "club-frisbee"; })) data.gearProducts.unshift({ id: "club-frisbee", name: "Club Frisbee", description: "Official Frisbeing UF disc", price: 50, image: "assets/photos/club-frisbee-reference.png", createdAt: Date.now() });
      data.gearProductsInitialized = true;
      persist();
    }
    if (!data.games || typeof data.games !== "object" || Array.isArray(data.games)) data.games = {};
    var repairedGames = false;
    Object.keys(data.games).forEach(function (date) {
      var game = data.games[date];
      if (!game || typeof game !== "object") {
        data.games[date] = { joined: [], passed: [], draw: null };
        repairedGames = true;
        return;
      }
      ["joined", "passed"].forEach(function (key) {
        if (!Array.isArray(game[key])) { game[key] = []; repairedGames = true; }
        else {
          var safePlayers = game[key].filter(function (player) { return player && typeof player === "object"; });
          if (safePlayers.length !== game[key].length) { game[key] = safePlayers; repairedGames = true; }
        }
      });
      if (game.draw) {
        if (!Array.isArray(game.draw.teams)) { game.draw = null; repairedGames = true; }
        else {
          var safeTeams = game.draw.teams.map(function (team) {
            return Array.isArray(team) ? team.filter(function (player) { return player && typeof player === "object"; }) : [];
          });
          if (safeTeams.some(function (team, index) { return !Array.isArray(game.draw.teams[index]) || team.length !== game.draw.teams[index].length; })) repairedGames = true;
          game.draw.teams = safeTeams;
        }
      }
    });
    if (data && Array.isArray(data.accounts)) {
      data.accounts.forEach(function (account) {
        if (account.id === account.role && labels[account.role]) {
          account.name = "Preview " + labels[account.role];
          account.email = "preview-" + emailNames[account.role] + "@tsinglan.org";
          account.member = demoMembers[account.role];
        }
      });
    }
    if (repairedGames) persist();
    return data;
  }
  function persist() { try { localStorage.setItem(DATA, JSON.stringify(data)); } catch (e) { /* memory still works */ } }
  function kind(date) {
    var d = getData();
    if (d.removed.indexOf(date) >= 0) return null;
    if ([2, 4].indexOf(new Date(date + "T12:00:00Z").getUTCDay()) >= 0) return "regular";
    return d.added.indexOf(date) >= 0 ? "extra" : null;
  }
  function game(date) { var d = getData(); return d.games[date] || (d.games[date] = { joined: [], passed: [], draw: null }); }
  function view(date) {
    var g = game(date), k = kind(date), id = "preview-" + role();
    var v = { date: date, today: dateAt(0), tz: "Asia/Shanghai", kind: k, isGame: !!k, signedIn: true, role: role(), games: data.version,
      canJoin: !!k && date >= dateAt(0) && date <= dateAt(1) && (date !== dateAt(0) || beforeSessionCutoff()), participants: g.joined.map(function (p) { return { name: p.name }; }),
      me: { rsvp: g.joined.some(function (p) { return p.id === id; }) ? "in" : g.passed.some(function (p) { return p.id === id; }) ? "out" : null }, drawn: !!g.draw };
    if (role() !== "player") { v.joined = g.joined; v.passed = g.passed; if (g.draw) v.teams = g.draw.teams; }
    if (g.draw) {
      v.draw = { at: g.draw.at, n: g.draw.teams.length };
      var idx = g.draw.teams.findIndex(function (t) { return t.some(function (p) { return p.id === id; }); });
      v.mine = idx < 0 ? null : { letter: "ABCDEFGHIJKL"[idx], members: g.draw.teams[idx].map(function (p) { return p.name; }), players: g.draw.teams[idx], position: g.draw.teams[idx].find(function (p) { return p.id === id; }).position };
    }
    return v;
  }
  function groupFor(id) { return getData().teammateGroups.find(function (group) { return group.members.some(function (member) { return member.id === id; }); }) || null; }
  function teammateGroupView(group, id) {
    if (!group) return null;
    return { id: group.id, leaderId: group.leaderId, leaderName: group.leaderName || group.members.find(function (m) { return m.id === group.leaderId; }).name,
      isLeader: group.leaderId === id, members: group.members.map(function (member) { return { id: member.id, name: member.name, isMe: member.id === id }; }) };
  }
  function teammateInvitationsFor(memberName) {
    var alreadyGrouped = getData().teammateGroups.some(function (group) {
      return group.members.some(function (member) { return member.name.toLowerCase() === String(memberName || "").toLowerCase(); });
    });
    if (alreadyGrouped) return [];
    return getData().teammateInvitations.filter(function (invitation) {
      return invitation.status === "pending" && invitation.toMember.toLowerCase() === String(memberName || "").toLowerCase();
    }).map(function (invitation) { return { id: invitation.id, inviterName: invitation.fromName, createdAt: invitation.createdAt }; });
  }
  function teammateInvitationsSentBy(userId) {
    return getData().teammateInvitations.filter(function (invitation) { return invitation.status === "pending" && invitation.fromUserId === userId; })
      .map(function (invitation) { return { id: invitation.id, memberName: invitation.toMember, createdAt: invitation.createdAt }; });
  }
  function addTeammateInvitation(fromUser, memberName) {
    var existing = getData().teammateInvitations.find(function (invitation) {
      return invitation.status === "pending" && invitation.fromUserId === fromUser.id && invitation.toMember.toLowerCase() === memberName.toLowerCase();
    });
    if (existing) return existing;
    var invitation = { id: "preview-invite-" + Math.random().toString(36).slice(2, 10), fromUserId: fromUser.id,
      fromName: fromUser.member || fromUser.name, toMember: memberName, status: "pending", createdAt: Date.now() };
    getData().teammateInvitations.push(invitation);
    return invitation;
  }
  function request(method, path, body) {
    return Promise.resolve().then(function () {
      var d = getData(), url = new URL(path, "https://preview.invalid"), route = url.pathname, result;
      if (method !== "GET" && role() === "player" && !/\/rsvp$/.test(route) && route !== "/me/preferences" && route.indexOf("/me/teammate-invitations") !== 0 && route.indexOf("/me/teammate-group") !== 0) throw new Error("Switch to Admin or Admin Manager preview to use this control.");
      if (route === "/version") return { version: d.version, games: d.version };
      if (route === "/gear-products" && method === "GET") return { products: d.gearProducts };
      if (route === "/gear-products" && method === "POST") {
        if (role() !== "admin" && role() !== "leader") throw new Error("Only Admin and Admin Manager accounts can add products.");
        var productName = String(body && body.name || "").trim();
        var productDescription = String(body && body.description || "").trim();
        var productPrice = Number(body && body.price);
        var productImage = String(body && body.image || "");
        if (!productName || productName.length > 80 || productDescription.length > 500 || !Number.isFinite(productPrice) || productPrice <= 0 || productPrice > 1000000) throw new Error("Enter a product name and valid price.");
        if (productImage && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(productImage) || productImage.length > 900000)) throw new Error("Choose a smaller image.");
        var savedProduct = { id: "preview-product-" + Math.random().toString(36).slice(2, 12), name: productName,
          price: Math.round(productPrice * 100) / 100, description: productDescription, image: productImage,
          isPreorder: !!(body && body.isPreorder), createdAt: Date.now() };
        d.gearProducts.push(savedProduct); persist();
        return { product: savedProduct };
      }
      var gearProductMatch = /^\/gear-products\/([^/]+)$/.exec(route);
      if (gearProductMatch && method === "PUT") {
        if (role() !== "admin" && role() !== "leader") throw new Error("Only Admin and Admin Manager accounts can edit products.");
        var existingProduct = d.gearProducts.find(function (product) { return product.id === decodeURIComponent(gearProductMatch[1]); });
        if (!existingProduct) throw new Error("Product not found.");
        var updatedName = String(body && body.name || "").trim();
        var updatedDescription = String(body && body.description || "").trim();
        var updatedPrice = Number(body && body.price);
        var updatedImage = body && body.image !== undefined ? String(body.image) : existingProduct.image;
        if (!updatedName || updatedName.length > 80 || updatedDescription.length > 500 || !Number.isFinite(updatedPrice) || updatedPrice <= 0 || updatedPrice > 1000000) throw new Error("Enter a product name and valid price.");
        if (updatedImage && !updatedImage.startsWith("assets/") && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(updatedImage) || updatedImage.length > 900000)) throw new Error("Choose a smaller image.");
        Object.assign(existingProduct, { name: updatedName, description: updatedDescription, price: Math.round(updatedPrice * 100) / 100,
          image: updatedImage, isPreorder: body && body.isPreorder !== undefined ? !!body.isPreorder : !!existingProduct.isPreorder });
        persist();
        return { product: existingProduct };
      }
      if (gearProductMatch && method === "DELETE") {
        if (role() !== "admin" && role() !== "leader") throw new Error("Only Admin and Admin Manager accounts can remove products.");
        var removeProductIndex = d.gearProducts.findIndex(function (product) { return product.id === decodeURIComponent(gearProductMatch[1]); });
        if (removeProductIndex < 0) throw new Error("Product not found.");
        d.gearProducts.splice(removeProductIndex, 1); persist();
        return { removed: true };
      }
      if (route === "/state") return { version: d.version, roster: d.roster.map(function (p) { return role() === "player" ? { name: p.name, gender: p.gender } : p; }), teams: null };
      if (route === "/me" && method === "GET") {
        var current = user(), group = groupFor(current.email);
        return { role: role(), account: Object.assign({}, current, { preferredTeammates: (d.preferredTeammates && d.preferredTeammates[role()]) || [] }),
          teammateGroup: teammateGroupView(group, current.email), teammateInvitations: teammateInvitationsFor(current.member), teammateInvitationsSent: teammateInvitationsSentBy(current.email) };
      }
      if (route === "/me/preferences" && method === "PUT") {
        var requested = body && body.preferredTeammates;
        if (!Array.isArray(requested) || requested.length > 2 || requested.some(function (name) { return typeof name !== "string"; })) throw new Error("Choose up to two members.");
        var selected = [];
        requested.forEach(function (name) {
          var member = d.roster.find(function (entry) { return entry.name.toLowerCase() === name.trim().toLowerCase(); });
          if (!member || selected.indexOf(member.name) >= 0) throw new Error("Choose members from the current member list.");
          if (member.name.toLowerCase() === user().member.toLowerCase()) throw new Error("You cannot invite yourself.");
          var linked = d.accounts.find(function (account) { return account.member && account.member.toLowerCase() === member.name.toLowerCase(); });
          if (linked && groupFor("preview-" + emailNames[linked.role] + "@tsinglan.org")) throw new Error(member.name + " is already in a teammate group.");
          selected.push(member.name);
        });
        var current = user(), group = groupFor(current.email), slots = group ? 3 - group.members.length : 2;
        if (group && group.leaderId !== current.email) throw new Error("Only the group captain can invite teammates.");
        if (selected.length > slots) throw new Error(group ? "Your group can invite one more member." : "You can invite up to two teammates.");
        d.preferredTeammates = d.preferredTeammates || {};
        d.preferredTeammates[role()] = selected;
        d.teammateInvitations = d.teammateInvitations.filter(function (invitation) {
          return invitation.status !== "pending" || invitation.fromUserId !== current.email || selected.some(function (name) { return name.toLowerCase() === invitation.toMember.toLowerCase(); });
        });
        selected.forEach(function (name) { addTeammateInvitation(current, name); });
        persist();
        return { preferredTeammates: selected, invitationsSent: selected.length };
      }
      if (route === "/me/teammate-invitations" && method === "POST") {
        var target = d.roster.find(function (entry) { return entry.name.toLowerCase() === String(body && body.member || "").trim().toLowerCase(); });
        if (!target) throw new Error("Choose a member from the current member list.");
        var sender = user(), senderGroup = groupFor(sender.email);
        if (!senderGroup || senderGroup.leaderId !== sender.email || senderGroup.members.length !== 2) throw new Error("Only the captain of a two-person group can invite one more teammate.");
        if (target.name.toLowerCase() === sender.member.toLowerCase()) throw new Error("You cannot invite yourself.");
        var linkedTarget = d.accounts.find(function (account) { return account.member && account.member.toLowerCase() === target.name.toLowerCase(); });
        if (linkedTarget && groupFor("preview-" + emailNames[linkedTarget.role] + "@tsinglan.org")) throw new Error(target.name + " is already in a teammate group.");
        addTeammateInvitation(sender, target.name); persist();
        return { invitationSent: true, teammateGroup: teammateGroupView(senderGroup, sender.email), teammateInvitations: teammateInvitationsFor(sender.member), teammateInvitationsSent: teammateInvitationsSentBy(sender.email) };
      }
      var memberRemoval = /^\/me\/teammate-group\/members\/([^/]+)$/.exec(route);
      if (memberRemoval && method === "DELETE") {
        var captain = user(), team = groupFor(captain.email), teammateId = decodeURIComponent(memberRemoval[1]);
        if (!team) throw new Error("You are not in a teammate group.");
        var memberIndex = team.members.findIndex(function (member) { return member.id === teammateId; });
        var isSelf = teammateId === captain.email, isCaptain = team.leaderId === captain.email;
        if (memberIndex < 0) throw new Error("That teammate is no longer in your group.");
        if (!isSelf && !isCaptain) throw new Error("Only the group captain can remove another teammate.");
        team.members.splice(memberIndex, 1);
        if (isSelf && isCaptain && team.members.length >= 2) team.leaderId = team.members[0].id;
        if (team.members.length < 2) d.teammateGroups = d.teammateGroups.filter(function (entry) { return entry.id !== team.id; });
        persist();
        return { teammateGroup: teammateGroupView(groupFor(captain.email), captain.email), teammateInvitations: teammateInvitationsFor(captain.member),
          teammateInvitationsSent: teammateInvitationsSentBy(captain.email) };
      }
      var teammateRespond = /^\/me\/teammate-invitations\/([^/]+)\/respond$/.exec(route);
      if (teammateRespond && method === "POST") {
        if (!["accept", "decline"].includes(body && body.response)) throw new Error("Choose accept or decline.");
        var recipient = user();
        var invitation = d.teammateInvitations.find(function (entry) { return entry.id === teammateRespond[1] && entry.status === "pending" && entry.toMember.toLowerCase() === recipient.member.toLowerCase(); });
        if (!invitation) throw new Error("That invitation is no longer available.");
        if (body.response === "decline") { invitation.status = "declined"; }
        else {
          if (groupFor(recipient.email)) throw new Error("You are already in a teammate group.");
          var inviterGroup = groupFor(invitation.fromUserId);
          if (inviterGroup && inviterGroup.members.length >= 3) throw new Error("That teammate group is full.");
          if (!inviterGroup) {
            inviterGroup = { id: "preview-group-" + Date.now(), leaderId: invitation.fromUserId, leaderName: invitation.fromName,
              members: [{ id: invitation.fromUserId, name: invitation.fromName }], demo: !!invitation.demo };
            d.teammateGroups.push(inviterGroup);
          }
          inviterGroup.members.push({ id: recipient.email, name: recipient.member });
          invitation.status = "accepted";
          d.teammateInvitations.forEach(function (other) {
            if (other !== invitation && other.status === "pending" && other.toMember.toLowerCase() === recipient.member.toLowerCase()) other.status = "unavailable";
            if (inviterGroup.members.length >= 3 && other.status === "pending" && other.fromUserId === invitation.fromUserId) other.status = "unavailable";
          });
        }
        invitation.respondedAt = Date.now(); persist();
        var joinedGroup = groupFor(recipient.email);
        return { account: recipient, teammateGroup: teammateGroupView(joinedGroup, recipient.email), teammateInvitations: teammateInvitationsFor(recipient.member), teammateInvitationsSent: teammateInvitationsSentBy(recipient.email) };
      }
      if (route === "/roster" && method === "PUT") { d.roster = body.roster; result = { version: d.version + 1 }; }
      else if (route === "/accounts" && method === "GET") { if (role() === "player") throw new Error("Admin preview required."); return { accounts: d.accounts }; }
      else if (route.indexOf("/accounts/") === 0) {
        var id = route.split("/")[2], a = d.accounts.find(function (x) { return x.id === id; });
        if (!a) throw new Error("Account not found.");
        if (method === "DELETE") {
          if (a.role === "leader" || (a.role === "admin" && role() !== "leader")) throw new Error("This role cannot remove that account.");
          d.accounts = d.accounts.filter(function (x) { return x !== a; });
        } else if (method === "PUT") a.member = body.member;
        result = {};
      } else if (route === "/schedule" && method === "GET") {
        var month = url.searchParams.get("month"), dates = [], count = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
        for (var n = 1; n <= count; n++) { var date = month + "-" + String(n).padStart(2, "0"); if (kind(date)) dates.push({ date: date, kind: kind(date), drawn: !!game(date).draw, joined: game(date).joined.length }); }
        return { month: month, today: dateAt(0), sessions: dates };
      } else if (route === "/schedule" && method === "POST") {
        if (body.date < dateAt(0)) throw new Error("That day has already passed.");
        d.added = d.added.filter(function (x) { return x !== body.date; }); d.removed = d.removed.filter(function (x) { return x !== body.date; });
        if (body.action === "add") d.added.push(body.date);
        else { d.removed.push(body.date); delete d.games[body.date]; }
        result = {};
      } else if (route === "/game" && method === "GET") {
        var selected = url.searchParams.get("date"), v = view(selected || dateAt(0)); if (!selected) v.upcoming = view(dateAt(1)); return v;
      } else if (/^\/game\/\d{4}-\d{2}-\d{2}\//.test(route)) {
        var date = route.split("/")[2], action = route.split("/")[3], g = game(date), id = "preview-" + role();
        if (action === "rsvp") {
          if (date === dateAt(0) && !beforeSessionCutoff()) throw new Error("Sign-ups for tonight closed at 20:10.");
          var person = Object.assign({ id: id, tier: "I", gender: "", position: "c" }, user());
          g.joined = g.joined.filter(function (p) { return p.id !== id; }); g.passed = g.passed.filter(function (p) { return p.id !== id; });
          (body.status === "in" ? g.joined : g.passed).push(person);
          if (g.draw) { g.draw.teams = g.draw.teams.map(function (t) { return t.filter(function (p) { return p.id !== id; }); }); if (body.status === "in") g.draw.teams[FB.chooseTeam(g.draw.teams, person)].push(person); }
        } else if (action === "draw") {
          if (method === "DELETE") g.draw = null;
          else { var sorted = FB.sort(g.joined, "fair", body.n); if (sorted.error) throw new Error(sorted.error); g.draw = { at: Date.now(), teams: sorted.teams }; }
        } else if (action === "assignment" && g.draw) {
          var source = g.draw.teams.findIndex(function (t) { return t.some(function (p) { return p.id === body.id; }); });
          var p = g.draw.teams[source].find(function (p) { return p.id === body.id; });
          if (body.position) p.position = body.position;
          if (body.team !== undefined) { g.draw.teams[source] = g.draw.teams[source].filter(function (x) { return x.id !== p.id; }); g.draw.teams[body.team].push(p); }
        } else throw new Error("This preview action is unavailable.");
        d.version++; persist(); return Object.assign(view(date), { notifying: 0 });
      } else throw new Error("This preview action is unavailable.");
      d.version++; persist(); return result;
    }).then(function (result) { return JSON.parse(JSON.stringify(result)); });
  }
  function simulateTeammates(kind) {
    var d = getData(), current = user(), currentId = current.email;
    d.teammateInvitations = d.teammateInvitations.filter(function (invitation) { return !invitation.demo; });
    d.teammateGroups = d.teammateGroups.filter(function (group) { return !group.demo; });
    if (kind === "invite") {
      d.teammateInvitations.push({ id: "demo-invite-" + Date.now(), fromUserId: "demo-captain", fromName: "Demo Captain",
        toMember: current.member, status: "pending", createdAt: Date.now(), demo: true });
    } else if (kind === "pair" || kind === "trio") {
      var members = [{ id: currentId, name: current.member }, { id: "demo-partner", name: "Demo Teammate" }];
      if (kind === "trio") members.push({ id: "demo-third", name: "Demo Third Member" });
      d.teammateGroups.push({ id: "demo-group-" + Date.now(), leaderId: currentId, leaderName: current.member, members: members, demo: true });
    }
    persist();
  }
  window.FBPreview = { active: enabled, enable: enable, stop: stop, user: user, role: role, request: request, simulateTeammates: simulateTeammates };
  if (enabled()) {
    // UI-only identity. All preview requests use the isolated local adapter.
    if (window.FBAuth) {
      FBAuth.user = user; FBAuth.role = role; FBAuth.token = function () { return null; };
      FBAuth.refreshAccount = function () { return Promise.resolve(null); };
      FBAuth.applyBodyState();
    }
    var badge = document.createElement("div"); badge.className = "preview-badge";
    badge.innerHTML = '<label for="previewRole">Preview</label><select id="previewRole" aria-label="Preview role">' + Object.keys(labels).map(function (r) { return '<option value="' + r + '"' + (r === role() ? ' selected' : '') + '>' + labels[r] + '</option>'; }).join("") + '</select><button type="button">Exit</button>';
    badge.querySelector("select").addEventListener("change", function (e) { localStorage.setItem(ROLE, e.target.value); window.location.reload(); });
    badge.querySelector("button").addEventListener("click", stop); document.body.appendChild(badge); document.body.classList.add("ui-preview");
  }
})();
