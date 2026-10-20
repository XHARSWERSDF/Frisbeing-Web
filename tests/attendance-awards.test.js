const {test} = require('node:test');
const assert = require('node:assert/strict');
const {reconcile} = require('../assets/attendance-awards.js');
const sunday = Date.parse('2026-10-25T15:59:59Z');
const monday = sunday + 1000;
function fixture(counts) {
  const accounts = counts.map((count,i) => ({id:'u'+i, member:['Alex','Blair','Casey','Drew','Erin'][i],attendanceCount:count}));
  return {accounts,roster:accounts.map(a=>({name:a.member}))};
}
test('only three positive attendance leaders hold the award, with stable name ties and no duplicate member slots',()=>{
  const {roster,accounts}=fixture([8,8,8,8,0]);
  roster.push({name:'Alex'});
  const {states}=reconcile(roster,accounts,sunday);
  assert.deepEqual(Object.values(states).filter(s=>s.unlocked).map(s=>s.rank),[1,2,3]);
  assert.equal(states.u3.unlocked,false);
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
