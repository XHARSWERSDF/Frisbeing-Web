/* Weekly, transferable attendance honour. Shared by the API and local preview. */
(function (root) {
  'use strict';
  function reconcile(roster, accounts, now, frequencies) {
    now = now == null ? Date.now() : now;
    var date = new Date(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)) + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    var week = date.toISOString().slice(0,10);
    var norm = function (name) { return String(name || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,''); };
    frequencies = frequencies || {};
    function compare(a,b) { return b.joined * a.total - a.joined * b.total; }
    var ranked = roster.map(function (member) {
      var linked = accounts.filter(function (account) { return account.member && norm(account.member) === norm(member.name); });
      var stats = linked.map(function(account) { return frequencies[account.id] || { joined: 0, total: 0 }; }).filter(function(s) { return s.total > 0 && s.joined > 0; }).sort(compare);
      return { name: member.name, key: norm(member.name), joined: stats.length ? stats[0].joined : 0, total: stats.length ? stats[0].total : 0 };
    }).filter(function(member) { return member.total > 0 && member.joined > 0; }).sort(function(a,b) { return compare(a,b) || a.key.localeCompare(b.key,'en'); });
    ranked = ranked.filter(function (member,index) { return ranked.findIndex(function (entry) { return entry.key === member.key; }) === index; });
    ranked.forEach(function(member, index) {
      member.rank = index > 0 && compare(member,ranked[index-1]) === 0 ? ranked[index-1].rank : index+1;
    });
    var changed = false, states = {};
    accounts.forEach(function (account) {
      var index = ranked.findIndex(function (member) { return account.member && member.key === norm(account.member); });
      var active = index >= 0 && ranked[index].rank <= 3;
      if (account.passionSupermanRule !== "frequency-ties-v2" || account.passionSupermanWeek !== week || !!account.passionSupermanActive !== active) {
        account.passionSupermanRule = "frequency-ties-v2";
        account.passionSupermanWeek = week;
        account.passionSupermanActive = active;
        delete account.passionSupermanSeenAt;
        changed = true;
      }
      states[account.id] = {unlocked:active, unseen:active && !account.passionSupermanSeenAt, week:week, rank:active ? ranked[index].rank : null, frequency:frequencies[account.id] || {joined:0,total:0,rate:0}};
    });
    return {states:states,changed:changed};
  }
  function frequencyStats(accounts, schedule, games, now, zone) {
    now = now == null ? Date.now() : now; zone = zone || 'Asia/Shanghai';
    var formatter = new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
    var today = formatter.format(new Date(now));
    var time = new Intl.DateTimeFormat('en-GB', {timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(new Date(now));
    var latest = new Date(today + 'T12:00:00Z');
    if (Number(time) < 21) latest.setUTCDate(latest.getUTCDate()-1);
    var end = latest.toISOString().slice(0,10), starts = {}, stats = {};
    accounts.forEach(function(a) {
      var created = Number(a.createdAt);
      starts[a.id] = created > 0 && Number.isFinite(created) ? formatter.format(new Date(created)) : schedule.since || today;
      stats[a.id] = {joined:0,total:0,rate:0};
    });
    var first = Object.values(starts).sort()[0];
    if (!first) return stats;
    for (var day = new Date(first + 'T12:00:00Z'); day.toISOString().slice(0,10) <= end; day.setUTCDate(day.getUTCDate()+1)) {
      var date = day.toISOString().slice(0,10);
      if ((schedule.removed || []).indexOf(date) >= 0) continue;
      if ((schedule.added || []).indexOf(date) < 0 && !(date >= schedule.since && (schedule.weekdays || []).indexOf(day.getUTCDay()) >= 0)) continue;
      var game = games[date] || {}, present = Array.isArray(game.attendance) ? game.attendance : Object.keys(game.rsvps || {}).filter(function(id) { return game.rsvps[id] === 'in'; });
      accounts.forEach(function(a) { if (date >= starts[a.id]) { stats[a.id].total++; if (present.indexOf(a.id) >= 0) stats[a.id].joined++; } });
    }
    accounts.forEach(function(a) { var s=stats[a.id]; s.rate=s.total ? s.joined/s.total : 0; });
    return stats;
  }
  function reconcilePersonal(account, streak, now) {
    now = now == null ? Date.now() : now;
    var changed = false;
    function badge(prefix, eligible) {
      var unlocked = prefix + 'UnlockedAt', seen = prefix + 'SeenAt';
      if (eligible && !account[unlocked]) { account[unlocked] = now; delete account[seen]; changed = true; }
      if (!eligible && (account[unlocked] || account[seen])) { delete account[unlocked]; delete account[seen]; changed = true; }
      return { unlocked: eligible, unseen: eligible && !account[seen], unlockedAt: account[unlocked] || null, seenAt: account[seen] || null, currentStreak: streak || 0 };
    }
    var count = Number(account.attendanceCount) || 0;
    var star = badge('passionStar', count >= 8 || streak >= 6);
    var ultra = badge('passionUltra', count >= 20);
    return { star: star, ultra: ultra, changed: changed };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {reconcile:reconcile,reconcilePersonal:reconcilePersonal,frequencyStats:frequencyStats};
  else root.FBAttendanceAwards = {reconcile:reconcile,reconcilePersonal:reconcilePersonal,frequencyStats:frequencyStats};
})(typeof window !== 'undefined' ? window : globalThis);
