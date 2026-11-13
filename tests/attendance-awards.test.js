const {test} = require('node:test');
const assert = require('node:assert/strict');
const {reconcile: rankFrequency, frequencyStats} = require('../assets/attendance-awards.js');
function reconcile(roster,accounts,now) { return rankFrequency(roster,accounts,now,Object.fromEntries(accounts.map(a=>[a.id,{joined:a.attendanceCount,total:20}]))); }
const sunday = Date.parse('2026-10-25T15:59:59Z');
const monday = sunday + 1000;
function fixture(counts) {
  const accounts = counts.map((count,i) => ({id:'u'+i, member:['Alex','Blair','Casey','Drew','Erin'][i],attendanceCount:count}));
  return {accounts,roster:accounts.map(a=>({name:a.member}))};
}
test('top-three rates include every tied member without duplicate roster slots',()=>{
  const {roster,accounts}=fixture([8,8,8,8,0]);
  roster.push({name:'Alex'});
  const {states}=reconcile(roster,accounts,sunday);
  assert.deepEqual(Object.values(states).filter(s=>s.unlocked).map(s=>s.rank),[1,1,1,1]);
  assert.equal(states.u3.unlocked,true);
  assert.equal(states.u4.unlocked,false);
  accounts.forEach(a=>a.attendanceCount=0);
  assert.equal(Object.values(reconcile(roster,accounts,sunday).states).some(s=>s.unlocked),false);
});
test('seen awards stay quiet, reset at Shanghai Monday, revoke on rank loss, and can be earned again',()=>{
  const {roster,accounts}=fixture([10,9,8,7]);
  let result=reconcile(roster,accounts,sunday);
  assert.equal(result.states.u0.week,'2026-10-19');
  accounts[0].passionSupermanSeenAt=sunday;
  assert.equal(reconcile(roster,accounts,sunday).states.u0.unseen,false);
  assert.equal(reconcile(roster,accounts,sunday).changed,false);
  result=reconcile(roster,accounts,monday);
  assert.equal(result.states.u0.week,'2026-10-26');
  assert.equal(result.states.u0.unseen,true);
  accounts[0].passionSupermanSeenAt=monday;
  accounts[0].attendanceCount=1;
  result=reconcile(roster,accounts,monday);
  assert.equal(result.states.u0.unlocked,false);
  assert.equal(result.states.u0.unseen,false);
  assert.equal(result.states.u3.unlocked,true);
  accounts[0].attendanceCount=11;
  assert.equal(reconcile(roster,accounts,monday).states.u0.unseen,true);
  accounts[0].member=null;
  assert.equal(reconcile(roster,accounts,monday).states.u0.unlocked,false);
});


test('personal honours use 8 cumulative or 6 consecutive sessions; ultra begins at 20', () => {
  const {reconcilePersonal} = require('../assets/attendance-awards.js');
  for (const [count, streak, star, ultra] of [[7,5,false,false],[8,0,true,false],[0,6,true,false],[19,0,true,false],[20,0,true,true],[21,0,true,true]]) {
    const result = reconcilePersonal({attendanceCount:count},streak,sunday);
    assert.equal(result.star.unlocked,star); assert.equal(result.ultra.unlocked,ultra);
  }
  const account = {attendanceCount:5,passionStarUnlockedAt:100,passionStarSeenAt:101};
  let result = reconcilePersonal(account,4,sunday);
  assert.equal(result.star.unlocked,false); assert.equal(account.passionStarUnlockedAt,undefined);
  account.attendanceCount=21;
  result=reconcilePersonal(account,0,sunday);
  assert.equal(result.ultra.unseen,true);
  account.passionUltraSeenAt=sunday;
  assert.equal(reconcilePersonal(account,0,sunday).ultra.unseen,false);
  account.attendanceCount=19;
  assert.equal(reconcilePersonal(account,0,sunday).ultra.unlocked,false);
  account.attendanceCount=21;
  assert.equal(reconcilePersonal(account,0,monday).ultra.unseen,true);
});


test('a new member with 3/3 outranks an older member with 25/35', () => {
  const {roster,accounts}=fixture([25,3,10,0]);
  const stats={u0:{joined:25,total:35},u1:{joined:3,total:3},u2:{joined:10,total:20},u3:{joined:0,total:0}};
  const result=rankFrequency(roster,accounts,sunday,stats);
  assert.equal(result.states.u1.rank,1);
  assert.equal(result.states.u0.rank,2);
  assert.equal(result.states.u3.unlocked,false);
});

test('frequency uses completed scheduled days from creation, with cancellations, extra sessions and independent accounts', () => {
  const accounts=[{id:'old',createdAt:Date.parse('2026-10-01T02:00:00Z')},{id:'new',createdAt:Date.parse('2026-10-08T02:00:00Z')}];
  const schedule={since:'2026-10-01',weekdays:[2,4],added:['2026-10-09'],removed:['2026-10-06']};
  const games={'2026-10-01':{attendance:['old']},'2026-10-08':{attendance:['new','old']},'2026-10-09':{attendance:['new']},'2026-10-13':{rsvps:{old:'in',new:'in'}}};
  const stats=frequencyStats(accounts,schedule,games,Date.parse('2026-10-13T11:54:00Z'));
  assert.deepEqual(stats.old,{joined:2,total:3,rate:2/3});
  assert.deepEqual(stats.new,{joined:2,total:2,rate:1});
  const ended=frequencyStats(accounts,schedule,games,Date.parse('2026-10-13T13:00:00Z'));
  assert.equal(ended.old.total,4); assert.equal(ended.new.total,3);
});


test('all tied third-place rates receive Fris Star, with competition ranks and no headcount tiebreak', () => {
  const {roster,accounts}=fixture([1,1,1,1,1]);
  const frequencies={u0:{joined:10,total:10},u1:{joined:8,total:10},u2:{joined:3,total:5},u3:{joined:6,total:10},u4:{joined:1,total:10}};
  const result=rankFrequency(roster,accounts,sunday,frequencies);
  assert.deepEqual(Object.values(result.states).map(s=>s.rank),[1,2,3,3,null]);
  frequencies.u1={joined:2,total:2};
  const tiedFirst=rankFrequency(roster,accounts,sunday,frequencies);
  assert.deepEqual(Object.values(tiedFirst.states).map(s=>s.rank),[1,1,3,3,null]);
});
