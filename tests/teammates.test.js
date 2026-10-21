const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn } = require('node:child_process');
const vm = require('node:vm');

async function serverFixture(t, seed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frisbeing-teammates-'));
  const file = path.join(dir, 'data.json');
  const users = Array.from({ length: 6 }, (_, i) => ({ id: (i + 1).toString(16).padStart(16, '0'),
    name: `Test ${String.fromCharCode(65 + i)}`, member: `Test ${String.fromCharCode(65 + i)}`, email: `teammate${i}@tsinglan.org` }));
  const data = { users, roster: users.map(u => ({ name: u.member, tier: 'I', gender: '', position: 'c' })),
    sessions: Object.fromEntries(users.map((u, i) => [crypto.createHash('sha256').update(`test-${i}`).digest('hex'), { userId: u.id, until: Date.now() + 86400000 }])),
    teammateGroups: [], teammateInvitations: [] };
  if (seed) seed(data);
  fs.writeFileSync(file, JSON.stringify(data));
  const listener = net.createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const child = spawn(process.execPath, [path.resolve('server/server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_FILE: file }, stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => { if (child.exitCode === null) await new Promise(r => { child.once('exit', r); child.kill(); }); fs.rmSync(dir, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Server start timed out: ' + output)), 10000);
    child.stdout.on('data', data => { output += data; if (output.includes('listening on')) { clearTimeout(timeout); resolve(); } });
    child.stderr.on('data', data => { output += data; });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${output}`)); });
  });
  const api = async (i, method, route, body, expected = 200) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${route}`, { method,
      headers: { Authorization: `Bearer test-${i}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (Array.isArray(expected)) assert.ok(expected.includes(response.status), JSON.stringify(result));
    else assert.equal(response.status, expected, JSON.stringify(result));
    return Object.assign({ httpStatus: response.status }, result);
  };
  return {
    api, users, me: i => api(i, 'GET', '/me'),
    invite: (i, j) => api(i, 'PUT', '/me/preferences', { preferredTeammates: [users[j].member], confirmJoinRequests: [users[j].member] }),
    respond: (i, invitation, response = 'accept', status = 200) => api(i, 'POST', `/me/teammate-invitations/${invitation.id}/respond`, { response, expectedKind: invitation.kind }, status),
    saved: () => JSON.parse(fs.readFileSync(file))
  };
}

test('joining an existing team requires confirmation and reports rejections until dismissed', async t => {
  const f = await serverFixture(t);
  await f.invite(1, 2);
  await f.respond(2, (await f.me(2)).teammateInvitations[0]);
  const check = await f.api(0, 'PUT', '/me/preferences', { preferredTeammates: [f.users[2].member] });
  assert.deepEqual(check.confirmationRequired, [f.users[2].member]);
  assert.equal((await f.me(2)).teammateInvitations.length, 0);
  await f.invite(0, 2);
  let request = (await f.me(2)).teammateInvitations[0];
  await f.respond(2, request, 'decline');
  const declined = (await f.me(0)).teammateInvitationsSent.find(entry => entry.kind === 'declined');
  assert.ok(declined);
  await f.api(1, 'POST', `/me/teammate-invitations/${declined.id}/dismiss`, {}, 404);
  await f.api(0, 'POST', `/me/teammate-invitations/${declined.id}/dismiss`, {});
  assert.equal((await f.me(0)).teammateInvitationsSent.length, 0);
  await f.invite(0, 2);
  request = (await f.me(2)).teammateInvitations[0];
  const result = await f.respond(2, request);
  assert.equal(result.invitationAction, 'accepted');
  assert.equal((await f.me(0)).teammateGroup.members.length, 3);
  assert.equal(f.saved().teammateGroups.length, 1);
});

test('A invites B and B invites C: both acceptance orders use the latest memberships', async t => {
  for (const first of ['B', 'C']) await t.test(first + ' accepts first', async t => {
    const f = await serverFixture(t);
    await f.invite(0, 1); await f.invite(1, 2);
    const bInvitation = (await f.me(1)).teammateInvitations[0];
    const cInvitation = (await f.me(2)).teammateInvitations[0];
    if (first === 'B') {
      await f.respond(1, bInvitation);
      await f.respond(2, cInvitation);
    } else {
      await f.respond(2, cInvitation);
      await f.respond(1, bInvitation, 'accept', 409); // stale accept must not silently change meaning
      const updated = (await f.me(1)).teammateInvitations[0];
      assert.equal(updated.kind, 'invite-back');
      await f.respond(1, updated);
      assert.equal((await f.me(0)).teammateGroup.members.length, 3);
    }
    const groups = f.saved().teammateGroups;
    assert.equal(groups.length, 1);
    assert.equal(groups[0].members.length, 3);
    assert.equal(new Set(groups[0].members).size, 3);
  });
});

test('different teams are blocked and concurrent acceptances cannot exceed three members', async t => {
  const f = await serverFixture(t);
  await f.invite(0, 1); await f.respond(1, (await f.me(1)).teammateInvitations[0]);
  await f.invite(2, 3); await f.respond(3, (await f.me(3)).teammateInvitations[0]);
  await f.api(0, 'POST', '/me/teammate-invitations', { member: f.users[2].member }, 409);
  await f.invite(4, 1); await f.invite(5, 1);
  const requests = (await f.me(1)).teammateInvitations;
  const results = await Promise.all(requests.map(inv => f.respond(1, inv, 'accept', [200, 409])));
  assert.deepEqual(results.map(r => r.httpStatus).sort(), [200, 409]);
  const groups = f.saved().teammateGroups;
  assert.ok(groups.every(g => g.members.length <= 3));
  const all = groups.flatMap(g => g.members);
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, 5);
});

test('a join request cannot merge teams if the applicant joins elsewhere first', async t => {
  const f = await serverFixture(t);
  await f.invite(1, 2); await f.respond(2, (await f.me(2)).teammateInvitations[0]);
  await f.invite(0, 1);
  const request = (await f.me(1)).teammateInvitations[0];
  await f.invite(3, 0); await f.respond(0, (await f.me(0)).teammateInvitations[0]);
  await f.respond(1, request, 'accept', 409);
  assert.deepEqual(f.saved().teammateGroups.map(g => g.members.length), [2, 2]);
});

function previewFixture(seed, withEngine = true, sharedStorage) {
  const storage = sharedStorage || new Map([['frisbeing.ui-preview.v1', '1'], ['frisbeing.ui-preview.role', 'player']]);
  if (seed) storage.set('frisbeing.ui-preview.data.v1', JSON.stringify(seed));
  const node = () => ({ classList: { add() {} }, querySelector: () => ({ addEventListener() {} }), set innerHTML(v) {} });
  const events = {};
  const context = vm.createContext({ console, URL, Intl, Date, Math, JSON, addEventListener(type, callback) { events[type] = callback; },
    FB: withEngine ? require('../assets/engine.js') : undefined, location: { protocol: 'file:', hostname: '', assign() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    document: { getElementById: () => null, createElement: node, body: { appendChild() {}, classList: { add() {} } } }
  });
  context.window = context;
  for (const file of ['assets/teammate-rules.js', 'assets/attendance-awards.js', 'assets/preview-mode.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  const roles = ['player', 'admin', 'leader'];
  const api = async (i, method, route, body) => { storage.set('frisbeing.ui-preview.role', roles[i]); return context.FBPreview.request(method, route, body); };
  api.storage = storage;
  api.storageChanged = () => events.storage({ key: 'frisbeing.ui-preview.data.v1' });
  return api;
}

test('local preview follows the same reverse invitation flow and identifies senders correctly', async () => {
  const api = previewFixture(undefined, false);
  await api(1, 'PUT', '/me/preferences', { preferredTeammates: ['Demo Taylor'] });
  let invitation = (await api(2, 'GET', '/me')).teammateInvitations[0];
  await api(2, 'POST', `/me/teammate-invitations/${invitation.id}/respond`, { response: 'accept', expectedKind: 'invite' });
  const request = await api(0, 'PUT', '/me/preferences', { preferredTeammates: ['Demo Taylor'] });
  assert.deepEqual(Array.from(request.confirmationRequired), ['Demo Taylor']);
  await api(0, 'PUT', '/me/preferences', { preferredTeammates: ['Demo Taylor'], confirmJoinRequests: ['Demo Taylor'] });
  invitation = (await api(2, 'GET', '/me')).teammateInvitations[0];
  assert.equal(invitation.kind, 'invite-back');
  await api(2, 'POST', `/me/teammate-invitations/${invitation.id}/respond`, { response: 'accept', expectedKind: 'invite-back' });
  const result = await api(0, 'GET', '/me');
  assert.equal(result.teammateGroup.members.length, 3);
  assert.equal(result.teammateGroup.leaderId, 'preview-admin@tsinglan.org');
});


test('server draw attaches only attending teammates and persists their Fris Index group identity', async t => {
  const FB = require('../assets/engine.js');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const f = await serverFixture(t, data => {
    data.users[0].email = 'justin.he_27@tsinglan.org';
    data.roster.forEach((p, i) => { p.tier = ['A', 'A', 'I', 'B', 'B', 'U'][i]; });
    data.teammateGroups = [{ id: 'registered-team', leaderId: data.users[1].id, members: [1, 2, 3].map(i => data.users[i].id) }];
    data.schedule = { weekdays: [], added: [today], removed: [], since: today };
    data.games = { [today]: { rsvps: Object.fromEntries(data.users.map((p, i) => [p.id, i === 3 ? 'out' : 'in'])), draw: null } };
  });
  const result = await f.api(0, 'POST', `/game/${today}/draw`, { n: 2 });
  assert.equal(FB.drawError(result.teams), null);
  assert.equal(result.teams.flat().length, 5);
  assert.ok(result.teams.some(team => [1, 2].every(i => team.some(p => p.id === f.users[i].id))));
  assert.deepEqual(result.teams.map(FB.score).sort((a, b) => a - b), [7, 7]);
  assert.equal(f.saved().games[today].draw.teams.flat().filter(p => p.teammateGroupId).length, 2);
  const source = result.teams.findIndex(team => team.some(p => p.id === f.users[1].id));
  const moved = await f.api(0, 'PUT', `/game/${today}/assignment`, { id: f.users[1].id, team: 1 - source });
  assert.ok(moved.teams[1 - source].some(p => p.id === f.users[1].id));
  assert.ok(moved.teams[1 - source].some(p => p.id === f.users[2].id), 'attending teammate moves with them');
  assert.equal(moved.drawn, false);
});

test('preview draw uses registered teammates and allows unrestricted private draft moves', async () => {
  const FB = require('../assets/engine.js');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const people = ['A', 'A', 'I', 'B', 'B', 'U'].map((tier, i) => ({ id: 'p' + i, name: 'Person ' + i, tier, gender: '', position: 'c' }));
  const seed = { version: 1, roster: people, accounts: [], added: [today], removed: [],
    teammateGroups: [{ id: 'g', leaderId: 'p1', members: [1, 2, 3].map(i => ({ id: people[i].id, name: people[i].name })) }],
    games: { [today]: { joined: people.filter((_, i) => i !== 3), passed: [people[3]], draw: null } } };
  const api = previewFixture(seed);
  const result = await api(1, 'POST', `/game/${today}/draw`, { n: 2 });
  assert.deepEqual(Array.from(result.teams.map(FB.score)).sort((a, b) => a - b), [7, 7]);
  const source = result.teams.findIndex(team => team.some(p => p.id === 'p1'));
  const moved = await api(1, 'PUT', `/game/${today}/assignment`, { id: 'p1', team: 1 - source });
  assert.equal(moved.drawn, false);
  assert.equal(moved.hasDraft, true);
  assert.ok(moved.teams[1 - source].some(p => p.id === 'p1'));
  assert.ok(moved.teams[1 - source].some(p => p.id === 'p2'), 'attending teammate moves with them');
  const after = await api(1, 'GET', `/game?date=${today}`);
  assert.ok(after.teams[1 - source].some(p => p.id === 'p1'));
  const memberView = await api(0, 'GET', `/game?date=${today}`);
  assert.equal(memberView.drawn, false);
  assert.ok(!('teams' in memberView));
});


test('an already open preview profile receives an invite-back after another tab updates storage', async () => {
  const first = previewFixture(undefined, false);
  await first(1, 'PUT', '/me/preferences', { preferredTeammates: ['Demo Taylor'] });
  const invitation = (await first(2, 'GET', '/me')).teammateInvitations[0];
  await first(2, 'POST', `/me/teammate-invitations/${invitation.id}/respond`, { response: 'accept' });
  const second = previewFixture(undefined, false, first.storage);
  assert.equal((await second(2, 'GET', '/me')).teammateInvitations.length, 0);
  await first(0, 'PUT', '/me/preferences', { preferredTeammates: ['Demo Taylor'], confirmJoinRequests: ['Demo Taylor'] });
  second.storageChanged();
  const inbox = (await second(2, 'GET', '/me')).teammateInvitations;
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].kind, 'invite-back');
});


test('admins retain old session attendance and can edit archived teams without unpublishing', async t => {
  const date = '2024-01-02';
  const f = await serverFixture(t, data => {
    data.users[0].email = 'justin.he_27@tsinglan.org';
    const players = data.users.slice(0, 4).map(u => ({ id: u.id, name: u.name, member: u.member, tier: 'I', position: 'c', teammateGroupId: null }));
    data.schedule = { weekdays: [], added: [date], removed: [], since: date };
    data.games = { [date]: { rsvps: Object.fromEntries(players.map(p => [p.id, 'in'])),
      attendance: players.map(p => p.id), attendanceSnapshot: players, attendanceFinalizedAt: 1704200400000,
      draw: { at: 1704196800000, published: true, publishedAt: 1704196900000, teams: [players.slice(0, 2), players.slice(2)] } } };
  });
  let view = await f.api(0, 'GET', `/game?date=${date}`);
  assert.equal(view.joined.length, 4);
  assert.equal(view.teams.flat().length, 4);
  await f.api(1, 'PUT', `/game/${date}/assignment`, { id: f.users[0].id, team: 1 }, 403);
  view = await f.api(0, 'PUT', `/game/${date}/assignment`, { id: f.users[0].id, team: 1 });
  assert.ok(view.teams[1].some(p => p.id === f.users[0].id));
  assert.equal(view.drawn, true);
  assert.equal(view.hasDraft, false);
  assert.equal(f.saved().games[date].attendanceSnapshot.length, 4);
  assert.ok(f.saved().games[date].draw.teams[1].some(p => p.id === f.users[0].id));
  assert.equal((await f.api(0, 'GET', '/schedule?month=2024-01')).sessions[0].joined, 4);
});

test('anonymous feedback persists without identity and is readable only by admins', async t => {
  const f = await serverFixture(t, data => { data.users[0].email = 'justin.he_27@tsinglan.org'; });
  await f.api(1, 'GET', '/feedback', undefined, 403);
  await f.api(1, 'POST', '/feedback', { message: '  Please improve session reminders.  ', email: 'forged@example.com', userId: 'forged' }, 201);
  const inbox = await f.api(0, 'GET', '/feedback');
  assert.equal(inbox.feedback.length, 1);
  assert.equal(inbox.feedback[0].message, 'Please improve session reminders.');
  assert.deepEqual(Object.keys(inbox.feedback[0]).sort(), ['createdAt', 'id', 'message']);
  assert.deepEqual(Object.keys(f.saved().feedback[0]).sort(), ['createdAt', 'id', 'message']);
  await f.api(1, 'POST', '/feedback', { message: ' ' }, 400);
  await f.api(1, 'POST', '/feedback', { message: 'x'.repeat(4001) }, 400);
  await f.api(1, 'GET', '/feedback', undefined, 403);
});

test('preview feedback can be submitted by members and read only by managers', async () => {
  const api = previewFixture(undefined, false);
  await api(0, 'POST', '/feedback', { message: 'More club sessions please.' });
  await assert.rejects(api(0, 'GET', '/feedback'), /Only Admin/);
  for (const role of [1, 2]) {
    const inbox = await api(role, 'GET', '/feedback');
    assert.equal(inbox.feedback[0].message, 'More club sessions please.');
    assert.deepEqual(Object.keys(inbox.feedback[0]).sort(), ['createdAt', 'id', 'message']);
  }
});
