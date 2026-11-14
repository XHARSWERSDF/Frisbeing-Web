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
    signedOutPanel.insertAdjacentHTML("afterbegin", "<div class=\"preview-actions\">\n          <p class=\"hint\">Preview without signing in</p>\n          <div class=\"row\"><button class=\"btn\" data-preview-role=\"guest\" type=\"button\"><span>Signed-out visitor</span></button><button class=\"btn\" data-preview-role=\"player\" type=\"button\"><span>Member</span></button><button class=\"btn\" data-preview-role=\"admin\" type=\"button\"><span>Admin</span></button><button class=\"btn\" data-preview-role=\"leader\" type=\"button\"><span>Admin Manager</span></button></div>\n          <p class=\"hint\">Preview interactions run only in this browser and do not change the live roster or sessions.</p>\n        </div>");
  }
  var labels = { guest: "Signed-out visitor", player: "Member", admin: "Admin", leader: "Admin Manager" };
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
  function signedIn() { return enabled() && role() !== "guest"; }
  function signupGrade(value) {
    if (/^ms$/i.test(String(value || "").trim())) return "MS";
    var grade=String(value || "").trim().replace(/^(?:grade|g)\s*/i, "").replace(/\s+/g, "");
    return /^(?:[1-9]|1[0-2])$/.test(grade) ? "G"+grade : null;
  }
  function isSuspended(account) { return !!account && account.role === "player" && account.gameSuspended === true; }
  function user() { return !signedIn() ? null : { name: "Preview " + labels[role()], email: "preview-" + emailNames[role()] + "@tsinglan.org", member: demoMembers[role()], role: role(), gameSuspended: isSuspended(getData().accounts.find(function(a) { return a.id === role(); })), attendanceCount: 0 }; }
  function dateAt(offset) {
    var today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    var d = new Date(today + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  var sessionTimeOverride = null;
  function beforeSessionCutoff() {
    if (sessionTimeOverride) return sessionTimeOverride === "before";
    var parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    var hour = Number(parts.find(function (part) { return part.type === "hour"; }).value);
    var minute = Number(parts.find(function (part) { return part.type === "minute"; }).value);
    return hour * 60 + minute < 19 * 60 + 55;
  }
  function previewNorm(value) { return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }
  var data;
  window.addEventListener("storage", function (event) {
    if (event.key === DATA) { data = null; if (window.FBNav && FBNav.refresh) FBNav.refresh(); }
  });
  function getData() {
    if (!data) try { data = JSON.parse(localStorage.getItem(DATA)); } catch (e) { /* first preview */ }
    if (!data) {
      var roster = ["Alex", "Jamie", "Taylor", "Morgan", "Riley", "Casey"].map(function (name, i) {
        return { name: "Demo " + name, tier: ["A", "I", "B"][i % 3], gender: i % 2 ? "f" : "m", position: i % 3 ? "c" : "h" };
      });
      data = { version: 1, added: [dateAt(0), dateAt(1)], removed: [], games: {}, roster: roster,
        accounts: Object.keys(emailNames).map(function (r) { return { id: r, name: "Preview " + labels[r], email: "preview-" + emailNames[r] + "@tsinglan.org", role: r, member: demoMembers[r] }; }) };
      data.games[dateAt(0)] = { joined: roster.map(function (p, i) { return Object.assign({ id: "demo-" + i, member: p.name }, p); }), passed: [], draw: null };
      persist();
    }
    if (!Array.isArray(data.teammateInvitations)) data.teammateInvitations = [];
    if (!Array.isArray(data.teammateGroups)) data.teammateGroups = [];
    data.teammateInvitations.forEach(function (invitation) {
      if (invitation.fromUserId) return;
      var sender = data.accounts.find(function (account) { return previewNorm(account.member || account.name) === previewNorm(invitation.fromName); });
      if (sender) invitation.fromUserId = sender.email;
    });
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
  function drawingPlayers(g, preferredTeamsEnabled) {
    if (preferredTeamsEnabled === undefined) preferredTeamsEnabled = !g.draw || g.draw.preferredTeamsEnabled !== false;
    return g.joined.map(function (player) {
      var group = getData().teammateGroups.find(function (entry) {
        return entry.members.some(function (member) { return previewNorm(member.name) === previewNorm(player.member || player.name); });
      });
      return Object.assign({}, player, { teammateGroupId: preferredTeamsEnabled && group ? group.id : null, separateFrom: (g.draw && g.draw.separatePairs || []).filter(function(pair) { return pair.indexOf(player.id) >= 0; }).map(function(pair) { return pair.find(function(id) { return id !== player.id; }); }) });
    });
  }
  function view(date) {
    var g = game(date), k = kind(date), id = "preview-" + role();
    var ownEntry = signedIn() && g.joined.concat(g.passed).find(function (p) { return previewNorm(p.member || p.name) === previewNorm(user().member); });
    if (ownEntry) id = ownEntry.id;
    var manages = role() === "admin" || role() === "leader";
    var published = !!g.draw && g.draw.published !== false;
    var v = { date: date, today: dateAt(0), tz: "Asia/Shanghai", kind: k, isGame: !!k, signedIn: signedIn(), role: role(), games: data.version,
      gameSuspended: isSuspended(user()), canJoin: !isSuspended(user()) && !!k && date >= dateAt(0) && date <= dateAt(1) && (date !== dateAt(0) || beforeSessionCutoff()), participants: signedIn() ? g.joined.map(function (p) { return { name: p.name }; }) : [],
      me: { rsvp: g.joined.some(function (p) { return p.id === id; }) ? "in" : g.passed.some(function (p) { return p.id === id; }) ? "out" : null }, drawn: published,
      hasDraft: !!g.draw && !published && manages };
    v.serverNow = Date.now();
    v.signupClosesAt = Date.parse(date + 'T19:55:00+08:00');
    v.nextSignup = null;
    for (var offset = 0; offset <= 366; offset++) {
      var nextDate = dateAt(offset), closesAt = Date.parse(nextDate + 'T19:55:00+08:00');
      if (kind(nextDate) && closesAt > Date.now()) { v.nextSignup = { date: nextDate, closesAt: closesAt }; break; }
    }
    v.accountFriendSignups = g.joined.filter(function(p) { return !p.temporaryPlayer && p.ownerEmail === (user() || {}).email; }).map(function(p) { return { id: p.id, name: p.name }; });
    v.friendSignups = g.joined.filter(function(p) { return p.temporaryPlayer && p.ownerEmail === (user() || {}).email; }).map(function(p) { return { id: p.id, name: p.name }; });
    if (manages) {
      v.separatePairs = g.draw && g.draw.separatePairs || [];
      v.preferredTeamsEnabled = !g.draw || g.draw.preferredTeamsEnabled !== false;
      v.joined = drawingPlayers(g); v.passed = g.passed;
      if (g.draw) {
        var currentGroups = new Map(drawingPlayers(g).map(function (player) { return [player.id, player.teammateGroupId || null]; }));
        v.teams = g.draw.teams.map(function (team) { return team.map(function (player) {
          return Object.assign({}, player, { teammateGroupId: currentGroups.get(player.id) || null });
        }); });
      }
    }
    if (g.draw && (published || manages)) {
      v.draw = { at: g.draw.at, n: g.draw.teams.length };
      v.needsRedraw = !!g.draw.needsRedraw;
      if (manages) v.redrawReason = g.draw.redrawReason || null;
      var idx = published && signedIn() && v.me.rsvp === "in" ? g.draw.teams.findIndex(function (t) { return t.some(function (p) { return p.id === id; }); }) : -1;
      v.mine = idx < 0 ? null : { letter: "ABCDEFGHIJKL"[idx], members: g.draw.teams[idx].map(function (p) { return p.name; }), players: g.draw.teams[idx].map(function (p) { return { id: p.id, name: p.name, position: FB.position(p), lateJoin: !!p.lateJoin }; }), position: g.draw.teams[idx].find(function (p) { return p.id === id; }).position };
    }
    return v;
  }
  function groupFor(id) { return getData().teammateGroups.find(function (group) { return group.members.some(function (member) { return member.id === id; }); }) || null; }
  function teammateGroupView(group, id) {
    if (!group) return null;
    return { id: group.id, leaderId: group.leaderId, leaderName: group.leaderName || group.members.find(function (m) { return m.id === group.leaderId; }).name,
      isLeader: group.leaderId === id, members: group.members.map(function (member) { return { id: member.id, name: member.name, isMe: member.id === id }; }) };
  }
  function previewAccountFor(memberName) {
    return getData().accounts.find(function (account) { return account.member && previewNorm(account.member) === previewNorm(memberName); });
  }
  function previewInvitationState(invitation, memberName) {
    var recipient = previewAccountFor(memberName);
    var recipientGroup = getData().teammateGroups.find(function (group) {
      return group.members.some(function (member) { return previewNorm(member.name) === previewNorm(memberName); });
    }) || (recipient && groupFor(recipient.email));
    return FBTeammates.classify(groupFor(invitation.fromUserId), recipientGroup, invitation.groupId);
  }
  function teammateInvitationsFor(memberName) {
    return getData().teammateInvitations.filter(function (invitation) {
      return invitation.status === "pending" && previewNorm(invitation.toMember) === previewNorm(memberName);
    }).map(function (invitation) {
      return { id: invitation.id, inviterName: invitation.fromName, createdAt: invitation.createdAt,
        kind: previewInvitationState(invitation, memberName).kind };
    }).filter(function (invitation) { return invitation.kind !== "unavailable"; });
  }
  function teammateInvitationsSentBy(userId) {
    return getData().teammateInvitations.filter(function (invitation) { return ["pending", "declined"].includes(invitation.status) && !invitation.dismissed && invitation.fromUserId === userId; })
      .map(function (invitation) {
        var current = invitation.status === "declined" ? { kind: "declined", message: "Your request was declined." } : previewInvitationState(invitation, invitation.toMember);
        return { id: invitation.id, memberName: invitation.toMember, createdAt: invitation.createdAt, kind: current.kind, message: current.message };
      });
  }
  function addTeammateInvitation(fromUser, memberName) {
    var fromId = fromUser.email || fromUser.id;
    var existing = getData().teammateInvitations.find(function (invitation) {
      return invitation.status === "pending" && invitation.fromUserId === fromId && previewNorm(invitation.toMember) === previewNorm(memberName);
    });
    if (existing && previewInvitationState(existing, memberName).kind !== "unavailable") return existing;
    if (existing) existing.status = "unavailable";
    var invitation = { id: "preview-invite-" + Math.random().toString(36).slice(2, 10), fromUserId: fromId,
      fromName: fromUser.member || fromUser.name, toMember: memberName, status: "pending", createdAt: Date.now(),
      groupId: (groupFor(fromId) || {}).id || null };
    getData().teammateInvitations.push(invitation);
    return invitation;
  }
  function previewBagView(d, id) {
    var saved = d.gearBags && d.gearBags[id];
    var items = [];
    d.gearProducts.forEach(function (product) {
      var quantity = saved && saved.products[product.id];
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return;
      items.push({ productId: product.id, name: product.name, price: product.price, quantity: quantity,
        lineTotal: Math.round(product.price * 100) * quantity / 100 });
    });
    return { products: Object.fromEntries(items.map(function (item) { return [item.productId, item.quantity]; })),
      items: items, itemCount: items.reduce(function (sum, item) { return sum + item.quantity; }, 0),
      total: items.reduce(function (sum, item) { return sum + Math.round(item.lineTotal * 100); }, 0) / 100,
      updatedAt: saved ? saved.updatedAt : null };
  }
  function request(method, path, body) {
    return Promise.resolve().then(function () {
      var d = getData(), url = new URL(path, "https://preview.invalid"), route = url.pathname, result;
      if (method !== "GET" && role() === "guest") throw new Error("Sign in to use this action.");
      if (method !== "GET" && (role() === "player" || role() === "guest") && !/^\/game\/\d{4}-\d{2}-\d{2}\/friends$/.test(route) && !/\/rsvp$/.test(route) && route !== "/me/gear-bag" && route !== "/me/preferences" && route !== "/feedback" && route !== "/me/passion-ultra/seen" && route !== "/me/passion-star/seen" && route !== "/me/passion-superman/seen" && route.indexOf("/me/teammate-invitations") !== 0 && route.indexOf("/me/teammate-group") !== 0) throw new Error("Switch to Admin or Admin Manager preview to use this control.");
      if (route === "/feedback" && method === "POST") {
        var message = typeof (body && body.message) === "string" ? body.message.trim() : "";
        if (!message || message.length > 4000) throw new Error("Write feedback between 1 and 4,000 characters.");
        d.feedback = d.feedback || [];
        d.feedback.push({ id: "feedback-" + Date.now() + "-" + Math.random().toString(36).slice(2), message: message, createdAt: Date.now() });
        persist(); return { ok: true };
      }
      if (route === "/feedback" && method === "GET") {
        if (role() !== "admin" && role() !== "leader") throw new Error("Only Admin and Admin Manager accounts can view feedback.");
        return { feedback: (d.feedback || []).map(function (entry) { return { id: entry.id, message: entry.message, createdAt: entry.createdAt }; }).reverse() };
      }
      if (route === "/game-suspension" && method === "PUT") {
        if (role() !== "admin" && role() !== "leader") throw new Error("Admin preview required.");
        var target = d.accounts.find(function(a) { return previewNorm(a.member) === previewNorm(body.name); });
        if (!target || target.role !== "player" || typeof body.suspended !== "boolean") throw new Error("Choose a Member account and a suspension status.");
        target.gameSuspended = body.suspended;
        if (body.suspended) Object.keys(d.games).forEach(function(date) {
          if (date < dateAt(0)) return;
          var g = game(date);
          g.joined = g.joined.filter(function(p) { return previewNorm(p.member || p.name) !== previewNorm(target.member); });
          if (g.draw) g.draw.teams = FB.refreshDrawAttendance(g.draw.teams, drawingPlayers(g)).teams;
        });
        d.version++; persist(); return { name: target.member, gameSuspended: isSuspended(target) };
      }
      if (route === "/roster-attendance" && method === "PUT") {
        var member = d.roster.find(function (entry) { return previewNorm(entry.name) === previewNorm(body.name); });
        if (!member || [1, -1].indexOf(body.delta) < 0) throw new Error("Choose a member and +1 or -1.");
        d.walkInCounts = d.walkInCounts || {};
        var key = previewNorm(member.name);
        d.walkInCounts[key] = Math.max(0, (Number(d.walkInCounts[key]) || 0) + body.delta);
        persist();
        return { name: member.name, walkInCount: d.walkInCounts[key] };
      }
      if (route === "/roster-attendance" && method === "GET") {
        if (role() !== "admin" && role() !== "leader") throw new Error("Admin preview required.");
        return { members: d.roster.map(function (member) {
          var account = d.accounts.find(function (entry) { return entry.member && previewNorm(entry.member) === previewNorm(member.name); });
          return { name: member.name, attendanceFrequency: account ? previewFrequencies(d)[account.id] : null, canSuspend: !!account && account.role === "player", gameSuspended: isSuspended(account), attendanceCount: Math.max(0, Number(account && account.attendanceCount) || 0), walkInCount: Math.max(0, Number((d.walkInCounts || {})[previewNorm(member.name)]) || 0) };
        }) };
      }
      if (route === "/version") return { version: d.version, games: d.version };
      if (route === "/teammate-groups" && method === "GET") {
        if (role() !== "admin" && role() !== "leader") throw new Error("Only Admin and Admin Manager accounts can view teams.");
        return { teams: d.teammateGroups.map(function (group) {
          return { id: group.id, members: group.members.map(function (member) {
            if (member && typeof member === "object") return { name: member.name || member.member || "Member" };
            var account = d.accounts.find(function (entry) { return entry.email === member || entry.id === member; });
            return { name: account ? (account.member || account.name) : "Member" };
          }) };
        }) };
      }
      if (route === "/gear-products" && method === "GET") return { products: d.gearProducts };
      if (route === "/fris-off-school" && method === "GET") return { image: d.frisOffSchoolQr || "assets/fris-off-school-qr.png" };
      if (route === "/fris-off-school" && method === "PUT") {
        if (role() !== "admin" && role() !== "leader") throw new Error("Only Admin and Admin Manager accounts can replace the QR code.");
        var schoolQr = String(body && body.image || "");
        if (!schoolQr || schoolQr.length > 900000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(schoolQr)) throw new Error("Choose a PNG, JPG or WebP image smaller than 650 KB.");
        d.frisOffSchoolQr = schoolQr; persist();
        return { image: schoolQr };
      }
      if (route === "/me/gear-bag" && ["GET", "PUT"].indexOf(method) >= 0) {
        if (role() === "guest") throw new Error("Sign in to view your bag.");
        if (!d.gearBags) d.gearBags = {};
        if (method === "PUT") {
          var bagProducts = body && body.products;
          if (!bagProducts || typeof bagProducts !== "object" || Array.isArray(bagProducts)) throw new Error("Send a valid bag.");
          Object.keys(bagProducts).forEach(function (id) {
            var product = d.gearProducts.find(function (entry) { return entry.id === id; });
            var count = bagProducts[id];
            if (!product || !Number.isInteger(count) || count < 1 || count > 99) throw new Error("Choose available products and quantities from 1 to 99.");
            var previous = d.gearBags[role()] && d.gearBags[role()].products[id] || 0;
            if (product.isPreorder && count > previous) throw new Error("Coming-soon products cannot be added to a bag.");
          });
          d.gearBags[role()] = { products: Object.assign({}, bagProducts), updatedAt: Date.now() };
          persist();
        }
        return previewBagView(d, role());
      }
      if (route === "/gear-bags" && method === "GET") {
        if (role() !== "admin" && role() !== "leader") throw new Error("Only club admins can view member bags.");
        var bags = d.accounts.map(function (account) { return Object.assign({ userId: account.id, name: account.member || account.name, email: account.email }, previewBagView(d, account.id)); });
        bags.sort(function (a, b) { return b.itemCount - a.itemCount || a.name.localeCompare(b.name); });
        return { bags: bags };
      }
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
      if (route === "/state") return { version: d.version, roster: d.roster.map(function (p) { return role() === "player" || role() === "guest" ? { name: p.name, gender: p.gender } : p; }), teams: null };
      if (route === "/me" && method === "GET") {
        if (!signedIn()) throw new Error("This preview visitor is signed out.");
        var current = user(), group = groupFor(current.email);
        var storedAccount = d.accounts.find(function (entry) { return entry.id === role(); });
        var personal = FBAttendanceAwards.reconcilePersonal(storedAccount, Number(storedAccount.previewStreak) || 0);
        if (personal.changed) persist();
        var superman = FBAttendanceAwards.reconcile(d.roster, d.accounts, Date.now(), previewFrequencies(d));
        if (superman.changed) persist();
        return { role: role(), account: Object.assign({}, current, { attendanceFrequency: previewFrequencies(d)[role()], attendanceCount: Number(storedAccount && storedAccount.attendanceCount) || 0, preferredTeammates: (d.preferredTeammates && d.preferredTeammates[role()]) || [] }),
          passionSuperman: superman.states[role()],
          passionStar: personal.star, passionUltra: personal.ultra,
          teammateGroup: teammateGroupView(group, current.email), teammateInvitations: teammateInvitationsFor(current.member), teammateInvitationsSent: teammateInvitationsSentBy(current.email) };
      }
      if (route === "/me/passion-superman/seen" && method === "POST") {
        if (!signedIn()) throw new Error("Sign in to view your award.");
        var awards = FBAttendanceAwards.reconcile(d.roster, d.accounts, Date.now(), previewFrequencies(d));
        var award = awards.states[role()];
        if (!award || !award.unlocked) throw new Error("This award belongs to the current attendance top three.");
        d.accounts.find(function (account) { return account.id === role(); }).passionSupermanSeenAt = Date.now();
        persist();
        return {seen:true, alreadySeen:!award.unseen};
      }
      if ((route === "/me/passion-star/seen" || route === "/me/passion-ultra/seen") && method === "POST") {
        if (!signedIn()) throw new Error("Sign in to view your award.");
        var awardAccount = d.accounts.find(function(a) { return a.id === role(); });
        var personalAward = FBAttendanceAwards.reconcilePersonal(awardAccount, Number(awardAccount.previewStreak) || 0);
        var ultra = route === "/me/passion-ultra/seen", state = ultra ? personalAward.ultra : personalAward.star;
        if (!state.unlocked) throw new Error("This award has not been unlocked yet.");
        awardAccount[ultra ? "passionUltraSeenAt" : "passionStarSeenAt"] = Date.now(); persist();
        return { seen: true, alreadySeen: !state.unseen };
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
          var currentState = FBTeammates.classify(groupFor(user().email), linked && groupFor(linked.email));
          if (currentState.kind === "unavailable") throw new Error(member.name + ": " + currentState.message);
          selected.push(member.name);
        });
        var current = user(), group = groupFor(current.email), slots = group ? 3 - group.members.length : 2;
        if (group && group.leaderId !== current.email) throw new Error("Only the group captain can invite teammates.");
        if (selected.length > slots) throw new Error(group ? "Your group can invite one more member." : "You can invite up to two teammates.");
        var joinRequests = selected.filter(function (name) {
          return previewInvitationState({ fromUserId: current.email }, name).kind === "invite-back";
        });
        if (joinRequests.some(function (name) { return (body.confirmJoinRequests || []).indexOf(name) < 0; })) return { confirmationRequired: joinRequests };
        d.preferredTeammates = d.preferredTeammates || {};
        d.preferredTeammates[role()] = selected;
        d.teammateInvitations = d.teammateInvitations.filter(function (invitation) {
          return invitation.status !== "pending" || invitation.fromUserId !== current.email || selected.some(function (name) { return name.toLowerCase() === invitation.toMember.toLowerCase(); });
        });
        selected.forEach(function (name) { addTeammateInvitation(current, name); });
        persist();
        var notices = teammateInvitationsSentBy(current.email).filter(function (entry) { return entry.kind === "invite-back"; })
          .map(function (entry) { return entry.memberName + ": " + entry.message; });
        return { preferredTeammates: selected, invitationsSent: selected.length, notices: notices };
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
      var cancelInvitation = /^\/me\/teammate-invitations\/([^/]+)\/cancel$/.exec(route);
      if (cancelInvitation && method === "POST") {
        if (!signedIn()) throw new Error("Not signed in.");
        var pending = d.teammateInvitations.find(function (entry) { return entry.id === cancelInvitation[1] && entry.fromUserId === user().email && entry.status === "pending"; });
        if (!pending) throw new Error("That invitation is no longer pending. Refresh to see the latest team.");
        pending.status = "cancelled";
        pending.respondedAt = Date.now();
        if (d.preferredTeammates) d.preferredTeammates[role()] = (d.preferredTeammates[role()] || []).filter(function (name) { return previewNorm(name) !== previewNorm(pending.toMember); });
        persist();
        return { ok: true };
      }
      var dismissInvitation = /^\/me\/teammate-invitations\/([^/]+)\/dismiss$/.exec(route);
      if (dismissInvitation && method === "POST") {
        var notice = d.teammateInvitations.find(function (entry) { return entry.id === dismissInvitation[1] && entry.fromUserId === user().email && entry.status === "declined"; });
        if (!notice) throw new Error("Notice no longer available.");
        notice.dismissed = true; persist(); return { ok: true };
      }
      var teammateRespond = /^\/me\/teammate-invitations\/([^/]+)\/respond$/.exec(route);
      if (teammateRespond && method === "POST") {
        if (!["accept", "decline"].includes(body && body.response)) throw new Error("Choose accept or decline.");
        var recipient = user();
        var invitation = d.teammateInvitations.find(function (entry) { return entry.id === teammateRespond[1] && entry.status === "pending" && entry.toMember.toLowerCase() === recipient.member.toLowerCase(); });
        if (!invitation) throw new Error("That invitation is no longer available.");
        if (body.response === "decline") { invitation.status = "declined"; }
        else {
          var currentState = previewInvitationState(invitation, recipient.member);
          if (currentState.kind === "unavailable") throw new Error(currentState.message);
          if (body.expectedKind && body.expectedKind !== currentState.kind) throw new Error("Team membership changed. Review the updated invitation and try again.");
          if (currentState.kind === "invite-back") {
            groupFor(recipient.email).members.push({ id: invitation.fromUserId, name: invitation.fromName });
            invitation.status = "accepted";
          } else {
            var inviterGroup = groupFor(invitation.fromUserId);
            if (!inviterGroup) {
              inviterGroup = { id: "preview-group-" + Math.random().toString(36).slice(2), leaderId: invitation.fromUserId, leaderName: invitation.fromName,
                members: [{ id: invitation.fromUserId, name: invitation.fromName }], demo: !!invitation.demo };
              d.teammateGroups.push(inviterGroup);
            }
            inviterGroup.members.push({ id: recipient.email, name: recipient.member });
            invitation.status = "accepted";
          }
        }
        invitation.respondedAt = Date.now(); persist();
        var joinedGroup = groupFor(recipient.email);
        return { invitationAction: invitation.status, account: recipient, teammateGroup: teammateGroupView(joinedGroup, recipient.email), teammateInvitations: teammateInvitationsFor(recipient.member), teammateInvitationsSent: teammateInvitationsSentBy(recipient.email) };
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
        for (var n = 1; n <= count; n++) { var date = month + "-" + String(n).padStart(2, "0"), scheduledGame = game(date), isPublished = !!scheduledGame.draw && scheduledGame.draw.published !== false; if (kind(date)) dates.push({ date: date, kind: kind(date), drawn: isPublished, hasDraft: !!scheduledGame.draw && !isPublished && (role() === "admin" || role() === "leader"), joined: scheduledGame.joined.length }); }
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
        if (action === "friends") {
          if (!signedIn()) throw new Error("Sign in first.");
          if (isSuspended(user())) throw new Error("Game sign-ups are unavailable for your account.");
          var friendView = view(date), me = user();
          if (date !== dateAt(0)) throw new Error("Signing up friends opens on the session day.");
          if (!friendView.canJoin) throw new Error("Sign-ups are closed for this session.");
          if (friendView.me.rsvp !== "in") throw new Error("Join this session before signing up a friend.");
          if (method === "GET") return { friends: d.accounts.filter(function(a) { return a.email !== me.email && !isSuspended(a) && !g.joined.some(function(p) { return previewNorm(p.member || p.name) === previewNorm(a.member || a.name); }); }).map(function(a) { return { id: a.id, name: a.name }; }) };
          if (method === "DELETE") {
            var guest = g.joined.find(function(p) { return p.id === body.id && p.ownerEmail === me.email; });
            if (!guest) throw new Error("You can only remove players you signed up.");
            g.joined = g.joined.filter(function(p) { return p.id !== body.id; });
            if (!guest.temporaryPlayer) { var removed = Object.assign({}, guest); delete removed.ownerEmail; g.passed = g.passed.filter(function(p) { return p.id !== removed.id; }); g.passed.push(removed); }
          } else if (body.userId || Array.isArray(body.userIds)) {
            var ids = Array.from(new Set(Array.isArray(body.userIds) ? body.userIds : [body.userId]));
            var accounts = ids.map(function(id) { return d.accounts.find(function(a) { return a.id === id && a.email !== me.email; }); });
            if (!ids.length || accounts.some(function(a) { return !a; })) throw new Error("Choose friends' accounts.");
            if (accounts.some(isSuspended)) throw new Error("A selected account is suspended from games.");
            if (accounts.some(function(a) { return g.joined.some(function(p) { return previewNorm(p.member || p.name) === previewNorm(a.member || a.name); }); })) throw new Error("A selected friend has already joined.");
            accounts.forEach(function(account) {
              var entry = d.roster.find(function(p) { return previewNorm(p.name) === previewNorm(account.member); });
              g.passed = g.passed.filter(function(p) { return previewNorm(p.member || p.name) !== previewNorm(account.member || account.name); });
              g.joined.push(Object.assign({}, entry, account, { id: "preview-" + account.id, ownerEmail: me.email, tier: entry ? entry.tier : "U", position: FB.position(entry) }));
            });
          } else {
            var name = typeof (body.fullName || body.name) === "string" ? (body.fullName || body.name).trim().replace(/\s+/g, " ") : "";
            var grade = signupGrade(body.grade);
            if (!grade) throw new Error("Choose a grade: MS, G9, G10, G11 or G12.");
            if (!name || name.length > 80) throw new Error("Enter a full name of 1–80 characters.");
            var named = d.accounts.filter(function(a) { return [a.fullName,a.member || a.name].filter(Boolean).some(function(n) { return previewNorm(n) === previewNorm(name); }); });
            var matches = named.filter(function(a) { return signupGrade(a.grade) === grade; });
            if (matches.length > 1) throw new Error("More than one account matches. Choose the account from the list.");
            if (matches.length === 1) {
              var account = matches[0];
              if (isSuspended(account)) throw new Error("This account is suspended from games.");
              if (g.joined.some(function(p) { return previewNorm(p.member || p.name) === previewNorm(account.member || account.name); })) throw new Error("This player has already joined.");
              var entry = d.roster.find(function(p) { return previewNorm(p.name) === previewNorm(account.member); });
              g.passed = g.passed.filter(function(p) { return previewNorm(p.member || p.name) !== previewNorm(account.member || account.name); });
              g.joined.push(Object.assign({}, entry, account, { id: "preview-" + account.id, ownerEmail: me.email, tier: entry ? entry.tier : "U", position: FB.position(entry) }));
            } else {
              if (named.length) throw new Error("The name belongs to an existing account. Check the grade or choose the account from the list.");
              if (g.joined.some(function(p) { return previewNorm(p.name) === previewNorm(name) && (!p.grade || p.grade === grade); })) throw new Error("This player has already joined.");
              if (friendView.friendSignups.length >= 2) throw new Error("You can sign up at most two temporary players per session.");
              g.joined.push({ id: "guest-" + Date.now() + "-" + Math.random().toString(36).slice(2), name: name, grade: grade, tier: "B", position: "c", gender: "", temporaryPlayer: true, ownerEmail: me.email });
            }
          }
          if (g.draw) { g.draw.teams = FB.refreshDrawAttendance(g.draw.teams, drawingPlayers(g)).teams; g.draw.needsRedraw = false; g.draw.redrawReason = null; }
        } else if (action === "rsvp") {
          if (isSuspended(user())) throw new Error("Game sign-ups are unavailable for your account.");
          if (date === dateAt(0) && !beforeSessionCutoff()) throw new Error("Sign-ups for tonight closed at 19:55.");
          var currentUser = user(), rosterEntry = d.roster.find(function (p) { return previewNorm(p.name) === previewNorm(currentUser.member); });
          var previousEntry = g.joined.concat(g.passed).find(function (p) { return previewNorm(p.member || p.name) === previewNorm(currentUser.member); });
          if (previousEntry) id = previousEntry.id;
          var person = Object.assign({ id: id, tier: rosterEntry ? rosterEntry.tier : "U", gender: rosterEntry ? rosterEntry.gender : "", position: FB.position(rosterEntry) }, currentUser);
          g.joined = g.joined.filter(function (p) { return p.id !== id; }); g.passed = g.passed.filter(function (p) { return p.id !== id; });
          (body.status === "in" ? g.joined : g.passed).push(person);
          if (g.draw) {
            var refreshed = FB.refreshDrawAttendance(g.draw.teams, drawingPlayers(g));
            g.draw.teams = refreshed.teams; g.draw.needsRedraw = false; g.draw.redrawReason = null;
          }
        } else if (action === "draw") {
          if (method === "DELETE") g.draw = null;
          else { var players = drawingPlayers(g, body.preferredTeamsEnabled !== false), pairs = body.separatePairs || [];
            if (!Array.isArray(pairs) || pairs.length > 100 || pairs.some(function(pair) { return !Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1] || pair.some(function(id) { return !players.some(function(p) { return p.id === id; }); }); })) throw new Error("Choose two different players who joined this session.");
            players.forEach(function(p) { p.separateFrom = pairs.filter(function(pair) { return pair.indexOf(p.id) >= 0; }).map(function(pair) { return pair.find(function(id) { return id !== p.id; }); }); });
            var sorted = FB.sort(players, "fair", body.n); if (sorted.error) throw new Error(sorted.error); g.draw = { at: Date.now(), preferredTeamsEnabled: body.preferredTeamsEnabled !== false, separatePairs: pairs, published: false, teams: sorted.teams }; }
        } else if (action === "publish" && method === "POST") {
          if (!g.draw) throw new Error("Draw teams before publishing.");
          if (g.draw.published !== false) throw new Error("These teams are already published.");

          g.draw.published = true;
          g.draw.publishedAt = Date.now();
        } else if (action === "assignment" && g.draw) {
          var source = g.draw.teams.findIndex(function (t) { return t.some(function (p) { return p.id === body.id; }); });
          if (source < 0) throw new Error("That player is no longer on a team.");
          if (body.team !== undefined && body.team !== source) {
            var currentGroups = new Map(drawingPlayers(g).map(function (player) { return [player.id, player.teammateGroupId || null]; }));
            var candidate = g.draw.teams.map(function (team) { return team.map(function (player) {
              return Object.assign({}, player, { teammateGroupId: currentGroups.get(player.id) || null });
            }); });
            var moved = FB.moveTeamMember(candidate, body.id, body.team);
            if (moved.error) throw new Error(moved.error);
            if (moved.teams.some(function(team) { return (g.draw.separatePairs || []).some(function(pair) { return pair.every(function(id) { return team.some(function(p) { return p.id === id; }); }); }); })) throw new Error("These players must stay on separate teams.");
            g.draw.teams = moved.teams;
            if (date >= dateAt(0)) { g.draw.published = false; delete g.draw.publishedAt; }
          }
          if (body.position) g.draw.teams.forEach(function (t) { t.forEach(function (p) { if (p.id === body.id) p.position = body.position; }); });
        } else throw new Error("This preview action is unavailable.");
        d.version++; persist(); return Object.assign(view(date), { notifying: 0 });
      } else throw new Error("This preview action is unavailable.");
      d.version++; persist(); return result;
    }).then(function (result) { return JSON.parse(JSON.stringify(result)); });
  }
  function simulateTeammates(kind) {
    if (kind === "declined" || kind === "join-existing") {
      localStorage.setItem(KEY, "1");
      localStorage.setItem(ROLE, "player");
      var simulation = getData();
      var affected = ["preview-member@tsinglan.org", "preview-admin@tsinglan.org", "preview-admin-manager@tsinglan.org"];
      simulation.teammateGroups = simulation.teammateGroups.filter(function (group) {
        return !group.members.some(function (member) { return affected.indexOf(member.id) >= 0; });
      });
      simulation.teammateInvitations = simulation.teammateInvitations.filter(function (entry) { return !entry.demo; });
      if (kind === "declined") {
        simulation.teammateInvitations.push({ id: "demo-declined-" + Date.now(), fromUserId: affected[0],
          fromName: "Demo Alex", toMember: "Demo Jamie", status: "declined", createdAt: Date.now(), respondedAt: Date.now(), demo: true });
      } else {
        simulation.teammateGroups.push({ id: "demo-existing-team", leaderId: affected[1], leaderName: "Demo Jamie",
          members: [{ id: affected[1], name: "Demo Jamie" }, { id: affected[2], name: "Demo Taylor" }], demo: true });
      }
      persist();
      return;
    }
    if (kind === "session-pair" || kind === "session-pair-reset") {
      localStorage.setItem(KEY, "1");
      localStorage.setItem(ROLE, "admin");
      var sessionData = getData(), sessionGame = game(dateAt(0));
      sessionData.teammateGroups = sessionData.teammateGroups.filter(function (group) { return !group.demoSessionPair; });
      if (kind === "session-pair") {
        if (sessionGame.joined.length < 2) {
          sessionData.roster.slice(0, 2).forEach(function (member, index) {
            if (!sessionGame.joined.some(function (player) { return previewNorm(player.member || player.name) === previewNorm(member.name); })) {
              sessionGame.joined.push(Object.assign({ id: "demo-session-player-" + index, member: member.name }, member));
            }
          });
        }
        var pair = sessionGame.joined.slice(0, 2);
        if (pair.length === 2) {
          sessionData.teammateGroups.push({ id: "demo-session-pair", leaderId: pair[0].id, leaderName: pair[0].member || pair[0].name,
            members: pair.map(function (player) { return { id: player.id, name: player.member || player.name }; }), demo: true, demoSessionPair: true });
        }
        var pairedDraw = FB.sort(drawingPlayers(sessionGame), "fair", 2);
        sessionGame.draw = pairedDraw.error ? null : { at: Date.now(), published: false, teams: pairedDraw.teams };
      } else {
        sessionGame.draw = null;
      }
      sessionData.version++;
      persist();
      return kind === "session-pair";
    }
    if (!enabled() || role() === "guest") {
      localStorage.setItem(KEY, "1");
      localStorage.setItem(ROLE, "player");
    }
    var d = getData(), current = user(), currentId = current.email;
    d.teammateInvitations = d.teammateInvitations.filter(function (invitation) { return !invitation.demo; });
    d.teammateGroups = d.teammateGroups.filter(function (group) { return !group.demo; });
    var currentAccount = d.accounts.find(function (account) { return account.id === role(); });
    if (kind === "passion-star" && currentAccount) {
      currentAccount.attendanceCount = 8;
      currentAccount.passionStarUnlockedAt = Date.now();
      delete currentAccount.passionStarSeenAt;
    } else if (kind === "reset" && currentAccount) {
      currentAccount.attendanceCount = 0;
      delete currentAccount.passionStarUnlockedAt;
      delete currentAccount.passionStarSeenAt;
    }
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
  function simulateSignups() {
    if (!signedIn()) {
      localStorage.setItem(KEY, "1");
      localStorage.setItem(ROLE, "admin");
    }
    var d = getData(), date = dateAt(0), g = game(date), count = g.joined.length;
    d.removed = d.removed.filter(function (day) { return day !== date; });
    if (!kind(date)) d.added.push(date);
    function addMember(member, id) {
      if (g.joined.length >= 24 || g.joined.concat(g.passed).some(function (player) {
        return previewNorm(player.member || player.name) === previewNorm(member.name) || player.id === id;
      })) return;
      g.joined.push(Object.assign({}, member, { id: id, member: member.name }));
    }
    d.roster.forEach(function (member, index) { addMember(member, "demo-signup-roster-" + index); });
    for (var i = 0; g.joined.length < 24; i++) {
      var name = "Demo Player " + String(i + 1).padStart(2, "0");
      var member = d.roster.find(function (entry) { return previewNorm(entry.name) === previewNorm(name); });
      if (!member) {
        member = { name: name, tier: ["A", "I", "B", "U"][i % 4], gender: i % 2 ? "f" : "m", position: i % 3 ? "c" : "h" };
        d.roster.push(member);
      }
      addMember(member, "demo-signup-" + i);
    }
    if (g.joined.length !== count) g.draw = null;
    d.version++;
    persist();
  }
  function previewFrequencies(d) {
    var games = {};
    Object.keys(d.games).forEach(function(date) {
      games[date] = { attendance: d.accounts.filter(function(a) {
        return (d.games[date].joined || []).some(function(p) { return previewNorm(p.member || p.name) === previewNorm(a.member || a.name); });
      }).map(function(a) { return a.id; }) };
    });
    var frequencies = FBAttendanceAwards.frequencyStats(d.accounts, { since: d.frequencySince || Object.keys(d.games).sort()[0] || dateAt(0), weekdays: [2,4], added: d.added, removed: d.removed }, games);
    d.accounts.forEach(function(a) { if (a.previewFrequency) frequencies[a.id] = Object.assign({}, a.previewFrequency, {rate: a.previewFrequency.total ? a.previewFrequency.joined/a.previewFrequency.total : 0}); });
    return frequencies;
  }
  function simulateSuperman(lose) {
    if (!signedIn()) { localStorage.setItem(KEY, "1"); localStorage.setItem(ROLE, "player"); }
    var d = getData(), me = d.accounts.find(function (account) { return account.id === role(); });
    if (!lose) {
      me.previewFrequency = {joined:10,total:10};
      d.accounts.forEach(function(a) { if (a.id.indexOf("demo-superman-rival-") === 0) a.previewFrequency = {joined:1,total:2}; });
      delete me.passionSupermanSeenAt;
    } else {
      me.previewFrequency = {joined:5,total:10};
      for (var i=1; i<=3; i++) {
        var id = "demo-superman-rival-"+i;
        var rival = d.accounts.find(function (account) { return account.id === id; });
        if (!rival) {
          rival = {id:id, member:"Demo Champion "+i, name:"Demo Champion "+i, role:"player"};
          d.accounts.push(rival);
          d.roster.push({name:rival.member,tier:"I",gender:"",position:"c"});
        }
        rival.previewFrequency = {joined:20+i,total:20+i};
      }
    }
    FBAttendanceAwards.reconcile(d.roster,d.accounts,Date.now(),previewFrequencies(d));
    d.version++;
    persist();
  }
  function simulateFriends() {
    if (!signedIn()) { localStorage.setItem(KEY, "1"); localStorage.setItem(ROLE, "player"); }
    var d = getData(), date = dateAt(0), me = user();
    d.removed = d.removed.filter(function(x) { return x !== date; });
    if (d.added.indexOf(date) < 0) d.added.push(date);
    var g = game(date), entry = d.roster.find(function(p) { return previewNorm(p.name) === previewNorm(me.member); });
    if (!g.joined.some(function(p) { return previewNorm(p.member || p.name) === previewNorm(me.member); })) g.joined.push(Object.assign({}, entry, me, { id: "preview-" + role() }));
    g.passed = g.passed.filter(function(p) { return previewNorm(p.member || p.name) !== previewNorm(me.member); });
    if (!d.accounts.some(function(a) { return a.id === "friend-demo"; })) {
      d.accounts.push({ id: "friend-demo", name: "Demo Friend", fullName: "Demo Friend", grade: "G11", member: "Demo Friend", email: "demo-friend@tsinglan.org", role: "player" });
      d.roster.push({ name: "Demo Friend", tier: "I", position: "c", gender: "" });
    }
    d.version++; persist();
  }
  function hasSessionPair() {
    return enabled() && getData().teammateGroups.some(function (group) { return group.demoSessionPair; });
  }
  window.FBPreview = { active: enabled, signedIn: signedIn, enable: enable, stop: stop, user: user, role: role, request: request,
    simulateUltra: function() {
      if (!signedIn()) { localStorage.setItem(KEY, "1"); localStorage.setItem(ROLE, "player"); }
      var d = getData(), account = d.accounts.find(function(a) { return a.id === role(); });
      account.attendanceCount = Math.max(20, Number(account.attendanceCount) || 0);
      FBAttendanceAwards.reconcilePersonal(account, Number(account.previewStreak) || 0);
      account.passionStarSeenAt = Date.now();
      delete account.passionUltraSeenAt; d.version++; persist();
    },
    simulateSuspension: function() {
      localStorage.setItem(KEY, "1"); localStorage.setItem(ROLE, "player");
      var d = getData(), account = d.accounts.find(function(a) { return a.id === "player"; });
      account.gameSuspended = !account.gameSuspended; d.version++; persist();
    },
    simulateFriends: simulateFriends, setSessionTime: function(value) { sessionTimeOverride = value; },
    simulateTeammates: simulateTeammates, hasSessionPair: hasSessionPair, simulateSignups: simulateSignups, simulateSuperman: simulateSuperman, activate: activate };
  function activate() {
    if (!enabled()) return;
    // UI-only identity. All preview requests use the isolated local adapter.
    if (window.FBAuth) {
      FBAuth.user = user; FBAuth.role = role; FBAuth.token = function () { return null; };
      FBAuth.refreshAccount = function () { return Promise.resolve(null); };
      FBAuth.applyBodyState();
    }
    var existingRole = document.getElementById("previewRole");
    if (existingRole) { existingRole.value = role(); return; }
    var badge = document.createElement("div"); badge.className = "preview-badge";
    badge.innerHTML = '<label for="previewRole">Preview</label><select id="previewRole" aria-label="Preview role">' + Object.keys(labels).map(function (r) { return '<option value="' + r + '"' + (r === role() ? ' selected' : '') + '>' + labels[r] + '</option>'; }).join("") + '</select><button type="button">Exit</button>';
    badge.querySelector("select").addEventListener("change", function (e) { localStorage.setItem(ROLE, e.target.value); window.location.reload(); });
    badge.querySelector("button").addEventListener("click", stop); document.body.appendChild(badge); document.body.classList.add("ui-preview");
  }
  activate();
})();
