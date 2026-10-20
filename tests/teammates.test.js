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
    invite: (i, j) => api(i, 'PUT', '/me/preferences', { preferredTeammates: [users[j].member] }),
    respond: (i, invitation, response = 'accept', status = 200) => api(i, 'POST', `/me/teammate-invitations/${invitation.id}/respond`, { response, expectedKind: invitation.kind }, status),
    saved: () => JSON.parse(fs.readFileSync(file))
  };
}

test('solo request to an existing team needs invite-back and a second acceptance, including a non-captain', async t => {
  const f = await serverFixture(t);
  await f.invite(1, 2);
  await f.respond(2, (await f.me(2)).teammateInvitations[0]);
  const sent = await f.invite(0, 2);
  assert.match(sent.notices[0], /Already in a team/);
  let request = (await f.me(2)).teammateInvitations[0];
  assert.equal(request.kind, 'invite-back');
  await f.respond(2, request, 'decline');
  assert.equal((await f.me(0)).teammateInvitations.length, 0);
  assert.equal((await f.me(0)).teammateGroup, null);
  await f.invite(0, 2);
  request = (await f.me(2)).teammateInvitations[0];
  const result = await f.respond(2, request);
  assert.equal(result.invitationAction, 'invited-back');
  assert.equal(result.teammateGroup.members.length, 2);
  assert.equal((await f.me(0)).teammateGroup, null);
  const reverse = (await f.me(0)).teammateInvitations[0];
  assert.equal(reverse.kind, 'invite');
  assert.equal(reverse.inviterName, f.users[2].member);
  const joined = await f.respond(0, reverse);
  assert.equal(joined.teammateGroup.members.length, 3);
  assert.equal(joined.teammateGroup.leaderId, f.users[1].id);
  assert.equal(f.saved().teammateGroups.length, 1);
  await f.respond(0, reverse, 'accept', 404);
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
      assert.equal((await f.me(0)).teammateGroup, null);
      await f.respond(0, (await f.me(0)).teammateInvitations[0]);
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
  await f.invite(4, 1); await f.respond(1, (await f.me(1)).teammateInvitations[0]);
  await f.invite(5, 1); await f.respond(1, (await f.me(1)).teammateInvitations[0]);
  const invitations = await Promise.all([f.me(4), f.me(5)]);
  const results = await Promise.all([
    f.respond(4, invitations[0].teammateInvitations[0], 'accept', [200, 409]),
    f.respond(5, invitations[1].teammateInvitations[0], 'accept', [200, 409])
  ]);
  assert.deepEqual(results.map(r => r.httpStatus).sort(), [200, 409]);
  const groups = f.saved().teammateGroups;
  assert.ok(groups.every(g => g.members.length <= 3));
  const all = groups.flatMap(g => g.members);
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, 5);
});

test('a reverse invitation cannot merge teams if its recipient joins elsewhere first', async t => {
  const f = await serverFixture(t);
  await f.invite(1, 2); await f.respond(2, (await f.me(2)).teammateInvitations[0]);
  await f.invite(0, 1); await f.respond(1, (await f.me(1)).teammateInvitations[0]);
  const reverse = (await f.me(0)).teammateInvitations[0];
  await f.invite(3, 0);
  const other = (await f.me(0)).teammateInvitations.find(inv => inv.inviterName === f.users[3].member);
  await f.respond(0, other);
  await f.respond(0, reverse, 'accept', 409);
  assert.equal((await f.me(0)).teammateInvitations.length, 0);
  assert.match((await f.me(1)).teammateInvitationsSent[0].message, /another team/);
  assert.deepEqual(f.saved().teammateGroups.map(g => g.members.length), [2, 2]);
});

function previewFixture(seed, withEngine = true) {
  const storage = new Map([['frisbeing.ui-preview.v1', '1'], ['frisbeing.ui-preview.role', 'player']]);
  if (seed) storage.set('frisbeing.ui-preview.data.v1', JSON.stringify(seed));
  const node = () => ({ classList: { add() {} }, querySelector: () => ({ addEventListener() {} }), set innerHTML(v) {} });
  const context = vm.createContext({ console, URL, Intl, Date, Math, JSON,
    FB: withEngine ? require('../assets/engine.js') : undefined, location: { protocol: 'file:', hostname: '', assign() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    document: { getElementById: () => null, createElement: node, body: { appendChild() {}, classList: { add() {} } } }
  });
  context.window = context;
  for (const file of ['assets/teammate-rules.js', 'assets/attendance-awards.js', 'assets/preview-mode.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  const roles = ['player', 'admin', 'leader'];
  return async (i, method, route, body) => { storage.set('frisbeing.ui-preview.role', roles[i]); return context.FBPreview.request(method, route, body); };
}

test('local preview follows the same reverse invitation flow and identifies senders correctly', async () => {
  const api = previewFixture(undefined, false);
  await api(1, 'PUT', '/me/preferences', { preferredTeammates: ['Demo Taylor'] });
  let invitation = (await api(2, 'GET', '/me')).teammateInvitations[0];
  await api(2, 'POST', `/me/teammate-invitations/${invitation.id}/respond`, { response: 'accept', expectedKind: 'invite' });
  const request = await api(0, 'PUT', '/me/preferences', { preferredTeammates: ['Demo Taylor'] });
  assert.match(request.notices[0], /Already in a team/);
  invitation = (await api(2, 'GET', '/me')).teammateInvitations[0];
  assert.equal(invitation.kind, 'invite-back');
  await api(2, 'POST', `/me/teammate-invitations/${invitation.id}/respond`, { response: 'accept', expectedKind: 'invite-back' });
  assert.equal((await api(0, 'GET', '/me')).teammateGroup, null);
  invitation = (await api(0, 'GET', '/me')).teammateInvitations[0];
  const result = await api(0, 'POST', `/me/teammate-invitations/${invitation.id}/respond`, { response: 'accept', expectedKind: 'invite' });
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
  assert.deepEqual(result.teams.map(FB.score).sort((a, b) => a - b), [7.5, 9.3]);
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
  assert.deepEqual(Array.from(result.teams.map(FB.score)).sort((a, b) => a - b), [7.5, 9.3]);
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
