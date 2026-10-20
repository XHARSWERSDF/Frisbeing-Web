/* Weekly, transferable attendance honour. Shared by the API and local preview. */
(function (root) {
  'use strict';
  function reconcile(roster, accounts, now) {
    now = now == null ? Date.now() : now;
    var date = new Date(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)) + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    var week = date.toISOString().slice(0,10);
    var norm = function (name) { return String(name || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,''); };
    var ranked = roster.map(function (member) {
      var linked = accounts.filter(function (account) { return account.member && norm(account.member) === norm(member.name); });
      return {name:member.name, key:norm(member.name), count:Math.max(0,...linked.map(function (account) { return Number(account.attendanceCount) || 0; }))};
    }).filter(function (member) { return member.count > 0; }).sort(function (a,b) { return b.count-a.count || a.key.localeCompare(b.key,'en'); });
    ranked = ranked.filter(function (member,index) { return ranked.findIndex(function (entry) { return entry.key === member.key; }) === index; }).slice(0,3);
    var changed = false, states = {};
    accounts.forEach(function (account) {
      var index = ranked.findIndex(function (member) { return account.member && member.key === norm(account.member); });
      var active = index >= 0;
      if (account.passionSupermanWeek !== week || !!account.passionSupermanActive !== active) {
        account.passionSupermanWeek = week;
        account.passionSupermanActive = active;
        delete account.passionSupermanSeenAt;
        changed = true;
      }
      states[account.id] = {unlocked:active, unseen:active && !account.passionSupermanSeenAt, week:week, rank:active ? index+1 : null};
    });
    return {states:states,changed:changed};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {reconcile:reconcile};
  else root.FBAttendanceAwards = {reconcile:reconcile};
})(typeof window !== 'undefined' ? window : globalThis);
