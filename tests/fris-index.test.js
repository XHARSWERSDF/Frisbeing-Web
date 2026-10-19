const { test } = require('node:test');
const assert = require('node:assert/strict');
const FB = require('../assets/engine.js');
const player = (id, tier, group = null, gender = '') => ({ id, name: id, tier, teammateGroupId: group, gender, position: 'c' });

test('Fris Index uses 4/3/2/1 base points and only the highest eligible bonus per attending group', () => {
  assert.equal(FB.score(FB.TIERS.map((t, i) => player(String(i), t))), 10);
  for (const [tier, expected] of [['A', 3], ['I', 2], ['B', 1], ['U', 0]]) {
    for (const count of [2, 3]) {
      const group = Array.from({ length: count }, (_, i) => player(String(i), tier, 'g'));
      assert.equal(FB.score(group), count * FB.WEIGHT[tier] + expected);
    }
  }
  for (const [tiers, bonus] of [[['A', 'I'], 2], [['A', 'B'], 0], [['I', 'B'], 0], [['A', 'U'], 0],
    [['A', 'A', 'I'], 3], [['A', 'I', 'I'], 2], [['A', 'I', 'B'], 2], [['B', 'B', 'A'], 1]]) {
    const group = tiers.map((tier, i) => player(String(i), tier, 'g'));
    assert.equal(FB.score(group), tiers.reduce((sum, tier) => sum + FB.WEIGHT[tier], 0) + bonus, tiers.join('/'));
  }
  assert.equal(FB.score([player('a', 'A', 'g')]), 4, 'an absent teammate adds nothing');
  assert.equal(FB.score([player('a', 'A', 'g1'), player('b', 'A', 'g2')]), 8, 'same field team is not the same registered team');
  assert.equal(FB.score([player('a', 'I', 'g'), player('b', 'I', 'g'), player('c', 'A'), player('d', 'B'), player('e', 'B')]), 16);
});

test('only attending buddies stay together; successful draws respect size and index for every pair of teams', () => {
  const people = [player('a', 'A', 'pair'), player('b', 'I', 'pair'), player('c', 'A'), player('d', 'I'), player('e', 'B'), player('f', 'U')];
  const before = JSON.stringify(people);
  const result = FB.sort(people, 'fair', 2);
  assert.equal(result.error, undefined);
  assert.equal(result.teams.flat().length, 6);
  assert.ok(result.teams.some(t => t.some(p => p.id === 'a') && t.some(p => p.id === 'b')));
  assert.ok(result.balance.frisGap <= 2);
  assert.ok(result.balance.sizeGap <= 1);
  assert.equal(JSON.stringify(people), before);
  // A third registered teammate who did not sign up is not in the input or score.
  assert.equal(FB.score(people.slice(0, 2)), 9);
});

test('unsatisfiable attendance returns an error without splitting a group or publishing an invalid draw', () => {
  for (const [people, n] of [
    [[player('a', 'A'), player('b', 'U')], 2],
    [[player('a', 'A', 'g'), player('b', 'A', 'g'), player('c', 'U'), player('d', 'U')], 2],
    [Array.from({ length: 6 }, (_, i) => player(String(i), 'I', 'g' + Math.floor(i / 2))), 4]
  ]) {
    const result = FB.sort(people, 'fair', n);
    assert.equal(result.code, 'DRAW_CONSTRAINTS');
    assert.equal(result.teams, undefined);
  }
});

test('small draws match exhaustive search for the best feasible index gap; tier counts are not a hard limit', () => {
  let seed = 17;
  const random = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  for (let round = 0; round < 50; round++) {
    const people = Array.from({ length: 4 + random(5) }, (_, i) => player('p' + i, FB.TIERS[random(4)], i < 2 && round % 2 ? 'pair' : null, random(2) ? 'f' : 'm'));
    const units = FB.attendanceUnits(people);
    let bestGap = Infinity;
    for (let mask = 0; mask < 2 ** units.length; mask++) {
      const teams = [[], []];
      units.forEach((u, i) => teams[(mask >> i) & 1].push(...u));
      const balance = FB.drawBalance(teams);
      if (teams.every(t => t.length) && balance.sizeGap <= 1 && balance.frisGap <= 2) bestGap = Math.min(bestGap, balance.frisGap);
    }
    const result = FB.sort(people, 'fair', 2);
    if (bestGap === Infinity) assert.equal(result.code, 'DRAW_CONSTRAINTS');
    else {
      assert.equal(result.error, undefined);
      assert.equal(result.balance.frisGap, bestGap);
      assert.ok(result.balance.sizeGap <= 1);
      assert.equal(result.balance.splitTeammates, false);
      assert.equal(new Set(result.teams.flat().map(p => p.id)).size, people.length);
    }
  }
});

test('manual admin moves allow any team balance while keeping invalid targets safe', () => {
  const teams = [[player('a', 'I'), player('b', 'I'), player('c', 'I')], [player('d', 'I'), player('e', 'I')]];
  const moved = FB.moveTeamMember(teams, 'd', 0);
  assert.equal(moved.error, undefined);
  assert.equal(moved.teams[0].filter(p => p.id === 'd').length, 1);
  assert.equal(moved.teams[1].some(p => p.id === 'd'), false);
  assert.ok(FB.drawError(moved.teams), 'manual moves may exceed automatic draw limits');
  assert.ok(FB.moveTeamMember(teams, 'd', 4).error);
  const paired = [[player('p1', 'A', 'pair'), player('p2', 'I', 'pair')], [player('q', 'B')]];
  const movedPair = FB.moveTeamMember(paired, 'p1', 1);
  assert.deepEqual(movedPair.teams[0], []);
  assert.deepEqual(movedPair.teams[1].map(p => p.id), ['q', 'p1', 'p2']);
});

test('attendance changes preserve assignments when possible and request redraw when the limits cannot be kept', () => {
  const teams = [[player('a', 'A'), player('b', 'I')], [player('c', 'A'), player('d', 'B')]];
  const before = JSON.stringify(teams);
  const late = FB.refreshDrawAttendance(teams, teams.flat().concat(player('late', 'A')));
  assert.ok(late.reason);
  assert.equal(JSON.stringify(teams), before);
  const valid = FB.refreshDrawAttendance(teams, teams.flat().concat(player('late', 'U')));
  assert.equal(valid.reason, null);
  assert.equal(FB.drawError(valid.teams), null);
  const quit = FB.refreshDrawAttendance(teams, teams.flat().filter(p => p.id !== 'c'));
  assert.ok(quit.reason);
  assert.equal(JSON.stringify(teams), before);
});


test('same-tier headcounts can differ when the Fris Index and total sizes are balanced', () => {
  const people = [player('a', 'B', 'trio'), player('b', 'B', 'trio'), player('c', 'B', 'trio'), player('d', 'A'), player('e', 'I'), player('f', 'U')];
  const result = FB.sort(people, 'fair', 2);
  assert.equal(result.error, undefined);
  assert.equal(result.balance.frisGap, 1);
  assert.equal(result.balance.sizeGap, 0);
  assert.ok(result.balance.tierGaps.includes(3));
});

test('four teams balance every pair while keeping four registered pairs together', () => {
  const people = [];
  for (let i = 0; i < 4; i++) people.push(player('a' + i, 'A', 'g' + i, 'f'), player('b' + i, 'I', 'g' + i, 'm'), player('u' + i, 'U'));
  const result = FB.sort(people, 'fair', 4);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.balance.frisIndex, [10, 10, 10, 10]);
  assert.equal(result.balance.sizeGap, 0);
  assert.equal(result.balance.splitTeammates, false);
});
