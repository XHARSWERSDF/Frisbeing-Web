const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const net = require('node:net');
const FB = require('../assets/engine.js');

test('fair draw balances Fris Index, total size and tiers; late picks preserve input', () => {
  const players = [];
  for (const tier of FB.TIERS) for (const gender of ['f', 'm', '']) for (const position of ['h', 'c']) {
    for (let i = 0; i < 3; i++) players.push({ name: `${tier}-${gender}-${position}-${i}`, tier, gender, position });
  }
  for (const n of [2, 3, 4, 6]) {
    const result = FB.sort(players, 'fair', n);
    assert.equal(result.error, undefined);
    assert.equal(new Set(result.teams.flat().map(p => p.name)).size, players.length);
    const spread = values => Math.max(...values) - Math.min(...values);
    assert.ok(spread(result.teams.map(t => t.length)) <= 1);
    assert.ok(spread(result.teams.map(FB.score)) <= 2);
    for (const key of FB.TIERS) {
      assert.ok(spread(result.teams.map(t => FB.counts(t)[key])) <= 1, `uneven ${key}`);
    }
    const before = JSON.stringify(result.teams);
    assert.ok(FB.chooseTeam(result.teams, { tier: 'A', gender: 'm', position: 'h' }) >= 0);
    assert.equal(JSON.stringify(result.teams), before);
  }
  const teams = [
    [{ tier: 'A', gender: 'm', position: 'h' }],
    [{ tier: 'B', gender: 'm', position: 'c' }],
    [{ tier: 'B', gender: 'm', position: 'c' }, { tier: 'B', gender: 'm', position: 'c' }]
  ];
  assert.equal(FB.chooseTeam(teams, { tier: 'A', gender: 'm', position: 'h' }), 1);
  const picks = new Set(Array.from({ length: 100 }, () => FB.chooseTeam([[], []], { tier: 'B', position: 'c' })));
  assert.equal(picks.size, 2, 'ties should be random');
  assert.deepEqual(FB.parseRoster('Alex Chen_boy_T1_Handle\nSam Wu_U_Cutter').members, [
    { name: 'Alex Chen', tier: 'A', gender: 'm', position: 'h' },
    { name: 'Sam Wu', tier: 'U', gender: '', position: 'c' }
  ]);
});

test('session API preserves pending draws, rejects invalid moves and persists role edits', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'frisbeing-test-'));
  const dataFile = path.join(temp, 'data.json');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const offsetDate = n => {
    const date = new Date(today + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + n);
    return date.toISOString().slice(0, 10);
  };
  const tomorrow = offsetDate(1), later = offsetDate(2), yesterday = offsetDate(-1);
  const roster = [
    { name: 'Test Admin', tier: 'A', gender: 'm', position: 'h' },
    { name: 'Test One', tier: 'A', gender: 'f', position: 'c' },
    { name: 'Test Two', tier: 'I', gender: 'm', position: 'c' },
    { name: 'Test Three', tier: 'B', gender: 'f', position: 'c' },
    { name: 'Test Late', tier: 'A', gender: 'm', position: 'h' }
  ];
  const users = roster.map((m, i) => ({ id: `u${i}`, email: i === 0 ? 'justin.he_27@tsinglan.org' : `test${i}@tsinglan.org`, name: m.name, member: m.name }));
  users.push({ id: 'unknown', email: 'unknown@tsinglan.org', name: 'Unknown' });
  const sessions = Object.fromEntries(users.map(u => [crypto.createHash('sha256').update(`token-${u.id}`).digest('hex'), { userId: u.id, until: Date.now() + 86400000 }]));
  const legacy = [
    { name: 'Andrew Liang', tier: 'I', gender: 'f' },
    { name: 'Eric Bin', tier: 'B', gender: 'm' },
    { name: 'Evanjeline Wang', tier: 'A', gender: 'f' }
  ];
  fs.writeFileSync(dataFile, JSON.stringify({ version: 1, roster: roster.concat(legacy), users, sessions, gamesVersion: 1,
    schedule: { weekdays: [], added: [yesterday, today, tomorrow, later], removed: [], since: today }, games: {}, push: {} }));
  const listener = net.createServer();
  await new Promise(r => listener.listen(0, '127.0.0.1', r));
  const port = listener.address().port;
  await new Promise(r => listener.close(r));
  let processHandle;
  const clockFile = path.join(temp, 'clock.cjs');
  const start = async (time = '12:00:00') => {
    const timestamp = Date.parse(today + 'T' + time + '+08:00');
    fs.writeFileSync(clockFile, `const RealDate = Date; global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [${timestamp}])); } static now() { return ${timestamp}; } };`);
    processHandle = spawn(process.execPath, ['--require', clockFile, path.join(__dirname, '../server/server.js')], {
      env: { ...process.env, PORT: String(port), DATA_FILE: dataFile, CLUB_TZ: 'Asia/Shanghai' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolve, reject) => {
      let output = '';
      processHandle.stdout.on('data', chunk => { output += chunk; if (output.includes('listening on')) resolve(); });
      processHandle.stderr.on('data', chunk => { output += chunk; });
      processHandle.once('exit', code => reject(new Error(`API exited ${code}: ${output}`)));
    });
  };
  const stop = async () => { const p = processHandle; if (!p || p.exitCode !== null) return; await new Promise(r => { p.once('exit', r); p.kill(); }); };
  const api = async (method, route, id, body, status = 200) => {
    const res = await fetch(`http://127.0.0.1:${port}/api${route}`, { method,
      headers: { 'Content-Type': 'application/json', ...(id ? { Authorization: `Bearer token-${id}` } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const data = await res.json();
    assert.equal(res.status, status, JSON.stringify(data));
    return data;
  };
  const gameRoute = `/game/${today}`;
  try {
    await start();
    // Migration does not erase existing tiers or admin data.
    let saved = JSON.parse(fs.readFileSync(dataFile));
    assert.equal(saved.roster.find(m => m.name === 'Test Late').position, 'h');
    assert.equal(saved.roster.find(m => m.name === 'Juanen Liang').tier, 'I', 'renamed blank tiers retain prior level');
    assert.equal(saved.roster.find(m => m.name === 'Wenbo Bin').tier, 'B');
    assert.equal(saved.roster.find(m => m.name === 'Juanen Liang').gender, 'm', 'renamed members use GitHub gender');
    assert.equal(saved.roster.find(m => m.name === 'Michael Cheng').gender, 'm', 'new database entries use GitHub gender');
    assert.equal(saved.roster.find(m => m.name === 'Roxy Yang').gender, '', 'new members have no guessed gender');
    assert.equal(saved.roster.find(m => m.name === 'Evanjeline Wang').tier, 'A');
    assert.equal(saved.roster.find(m => m.name === 'Roxy Yang').tier, 'U');
    assert.equal(saved.roster.find(m => m.name === 'Roxy Yang').position, 'c');
    assert.equal(saved.roster.filter(m => m.name === 'Anne Guo').length, 1, 'source duplicates are merged');
    await api('GET', '/roster-attendance', 'u1', undefined, 403);
    await api('PUT', '/roster-attendance', 'u1', { name: 'Test One', delta: 1 }, 403);
    assert.equal((await api('GET', '/roster-attendance', 'u0')).members.find(p => p.name === 'Test One').walkInCount, 0);
    assert.equal((await api('PUT', '/roster-attendance', 'u0', { name: 'Test One', delta: 1 })).walkInCount, 1);
    assert.equal((await api('GET', '/me', 'u1')).account.attendanceCount, 0);
    const emptyPublic = await api('GET', '/game');
    assert.deepEqual(emptyPublic.participants, []);
    assert.equal(emptyPublic.upcoming.date, tomorrow);
    assert.equal(emptyPublic.upcoming.canJoin, true);
    await api('PUT', `/game/${tomorrow}/rsvp`, null, { status: 'in' }, 401);
    await api('PUT', `/game/${later}/rsvp`, 'u1', { status: 'in' }, 400);
    await api('PUT', `/game/${yesterday}/rsvp`, 'u1', { status: 'in' }, 400);
    await api('POST', `/game/${tomorrow}/draw`, 'u0', { n: 2 }, 400);
    await api('PUT', `/game/${tomorrow}/rsvp`, 'u4', { status: 'in' });
    let publicView = await api('GET', '/game');
    assert.deepEqual(publicView.participants, [], 'tomorrow answers do not join today');
    assert.deepEqual(publicView.upcoming.participants, [{ name: 'Test Late' }]);
    assert.ok(!('joined' in publicView.upcoming) && !('passed' in publicView.upcoming) && !('teams' in publicView.upcoming));
    const futureView = await api('GET', `/game?date=${later}`, 'u1');
    assert.equal(futureView.canJoin, false);
    for (const user of users.slice(0, 4)) await api('PUT', `${gameRoute}/rsvp`, user.id, { status: 'in' });
    await api('POST', `${gameRoute}/draw`, null, { n: 2 }, 401);
    await api('POST', `${gameRoute}/draw`, 'u1', { n: 2 }, 403);
    let view = await api('POST', `${gameRoute}/draw`, 'u0', { n: 2 });
    assert.equal(view.drawn, false, 'a draw starts as an unpublished draft');
    assert.equal(view.hasDraft, true, 'admins can work on the private draft');
    assert.equal(view.notifying, undefined, 'drawing does not notify members');
    let memberView = await api('GET', '/game', 'u4');
    assert.equal(memberView.drawn, false);
    assert.equal(memberView.mine, null);
    assert.ok(!('teams' in memberView));
    const original = new Map(view.teams.flatMap((t, i) => t.map(p => [p.id, i])));
    let mine = await api('PUT', `${gameRoute}/rsvp`, 'u4', { status: 'in' });
    assert.equal(mine.mine, null, 'a late member cannot see an unpublished draft');
    assert.equal(mine.needsRedraw, false);
    assert.ok(!('teams' in mine) && !('joined' in mine));
    assert.ok(mine.participants.some(p => p.name === 'Test Late'));
    assert.ok(mine.participants.every(p => Object.keys(p).join() === 'name'));
    publicView = await api('GET', '/game');
    assert.equal(publicView.participants.length, 5);
    assert.equal(publicView.upcoming.participants.length, 1, 'today and tomorrow lists stay separate');
    assert.ok(publicView.participants.every(p => Object.keys(p).join() === 'name'));
    assert.ok(!('joined' in publicView) && !('passed' in publicView) && !('teams' in publicView) && !('mine' in publicView));
    await api('PUT', `/game/${tomorrow}/rsvp`, 'u4', { status: 'out' });
    publicView = await api('GET', '/game');
    assert.equal(publicView.upcoming.participants.length, 0);
    assert.equal(publicView.participants.length, 5, 'passing tomorrow does not leave today');
    await api('PUT', `/game/${tomorrow}/rsvp`, 'u4', { status: 'in' });
    view = await api('GET', '/game', 'u0');
    for (const [id, i] of original) assert.ok(view.teams[i].some(p => p.id === id));
    assert.equal(view.teams.flat().length, 5, 'late arrival is immediately assigned');
    assert.equal(view.teams.flat().find(p => p.id === 'u4').lateJoin, true);
    assert.equal(view.redrawReason, null);
    view = await api('POST', `${gameRoute}/draw`, 'u0', { n: 2 });
    assert.equal(view.needsRedraw, false);
    assert.equal(FB.drawError(view.teams), null);
    assert.ok(view.teams.flat().every(p => !p.lateJoin), "fresh sort clears late badges");
    await api('POST', `${gameRoute}/publish`, null, {}, 401);
    await api('POST', `${gameRoute}/publish`, 'u1', {}, 403);
    memberView = await api('GET', '/game', 'u4');
    assert.equal(memberView.mine, null, 'members cannot see teams before publication');
    view = await api('POST', `${gameRoute}/publish`, 'u0', {});
    assert.equal(view.drawn, true);
    assert.equal(view.hasDraft, false);
    memberView = await api('GET', '/game', 'u4');
    assert.ok(memberView.mine, 'publication reveals the member team');
    mine = await api('GET', '/game', 'u4');
    const expected = 'ABCDEFGHIJKL'.indexOf(mine.mine.letter);
    assert.equal(mine.mine.position, 'h');
    assert.ok(mine.mine.players.every(p => !('tier' in p) && !('member' in p) && !('teammateGroupId' in p)));
    const version = (await api('GET', '/game', 'u4')).games;
    mine = await api('PUT', `${gameRoute}/rsvp`, 'u4', { status: 'in' });
    assert.equal(mine.games, version);
    await api('PUT', `${gameRoute}/assignment`, 'u1', { id: 'u4', team: 1 }, 403);
    await api('PUT', `${gameRoute}/assignment`, null, { id: 'u4', team: 1 }, 401);
    await api('PUT', `${gameRoute}/assignment`, 'u0', { id: 'u4', team: 8 }, 400);
    await api('PUT', `${gameRoute}/assignment`, 'u0', { id: 'u4', position: 'bad' }, 400);
    view = await api('PUT', `${gameRoute}/assignment`, 'u0', { id: 'u4', position: 'c' });
    assert.equal(view.teams.flat().filter(p => p.id === 'u4').length, 1);
    assert.ok(view.teams[expected].some(p => p.id === 'u4' && p.position === 'c'));
    mine = await api('GET', '/game', 'u4');
    assert.equal(mine.mine.letter, 'ABCDEFGHIJKL'[expected]);
    assert.equal(mine.mine.position, 'c');
    mine = await api('PUT', `${gameRoute}/rsvp`, 'u4', { status: 'out' });
    assert.equal(mine.mine, null);
    assert.equal(mine.needsRedraw, false);
    assert.ok(!mine.participants.some(p => p.name === 'Test Late'), 'leaving removes the public name');
    mine = await api('PUT', `${gameRoute}/rsvp`, 'u4', { status: 'in' });
    assert.equal(mine.mine.position, 'h', 'rejoining uses the current roster position');
    assert.equal(mine.needsRedraw, false);
    await api('PUT', `${gameRoute}/rsvp`, 'unknown', { status: 'in' });
    view = await api('GET', '/game', 'u0');
    assert.equal(view.teams.flat().find(p => p.id === 'unknown').tier, 'U');
    assert.equal(view.teams.flat().find(p => p.id === 'unknown').position, 'c');
    const publicRoster = await api('GET', '/state', 'u1');
    assert.ok(publicRoster.roster.every(p => !('tier' in p) && ['h', 'c'].includes(p.position)));
    await api('PUT', `${gameRoute}/assignment`, 'u0', { id: 'u4', position: 'c' });
    saved = JSON.parse(fs.readFileSync(dataFile));
    saved.roster.find(m => m.name === 'Harry Xu').tier = 'B';
    saved.roster.find(m => m.name === 'Michael Cheng').gender = 'f';
    fs.writeFileSync(dataFile, JSON.stringify(saved));
    await stop();
    await start();
    assert.equal((await api("GET", "/roster-attendance", "u0")).members.find(p => p.name === "Test One").walkInCount, 1);
    assert.equal(JSON.parse(fs.readFileSync(dataFile)).roster.find(m => m.name === 'Harry Xu').tier, 'B', 'tier migration runs once');
    assert.equal(JSON.parse(fs.readFileSync(dataFile)).roster.find(m => m.name === 'Michael Cheng').gender, 'f', 'later admin gender edits survive restart');
    assert.equal((await api('GET', '/game', 'u4')).mine.position, 'c', 'session position survives restart');
    assert.equal((await api('GET', '/game', 'u4')).upcoming.me.rsvp, 'in', 'advance sign-up survives restart');
    await api('POST', '/schedule', 'u0', { date: tomorrow, action: 'remove' });
    assert.equal((await api('GET', '/game')).upcoming.isGame, false);
    assert.deepEqual((await api('GET', '/game')).upcoming.participants, []);
    await api('PUT', `/game/${tomorrow}/rsvp`, 'u4', { status: 'in' }, 400);
    view = await api('POST', `${gameRoute}/draw`, 'u0', { n: 2 });
    const movedPlayer = view.teams[0][0];
    view = await api('PUT', `${gameRoute}/assignment`, 'u0', { id: movedPlayer.id, team: 1 });
    assert.ok(view.teams[1].some(p => p.id === movedPlayer.id), 'admin can make an otherwise invalid manual move');
    assert.equal(view.drawn, false, 'manual changes return published teams to an admin-only draft');
    assert.equal(view.hasDraft, true);
    await stop();
    await start('20:09:59');
    await api('PUT', `${gameRoute}/rsvp`, 'u4', { status: 'out' });
    await stop();
    await start('20:10:00');
    await api('PUT', `${gameRoute}/rsvp`, 'u4', { status: 'in' }, 400);
    await api('DELETE', `${gameRoute}/draw`, 'u0');
    await api('PUT', `${gameRoute}/assignment`, 'u0', { id: 'u4', team: 0 }, 409);
  } finally { await stop(); fs.rmSync(temp, { recursive: true, force: true }); }
});
