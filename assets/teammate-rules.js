(function (root) {
  "use strict";
  var rules = {
    maxMembers: 3,
    classify: function (fromGroup, toGroup, expectedGroupId) {
      function unavailable(message) { return { kind: "unavailable", message: message }; }
      if (expectedGroupId && (!fromGroup || fromGroup.id !== expectedGroupId)) {
        return unavailable("The inviting team has changed. Please send a new invitation.");
      }
      if (fromGroup && toGroup) {
        return unavailable(fromGroup.id === toGroup.id ? "Already in the same team." : "Already in another team.");
      }
      if (toGroup) {
        if (toGroup.members.length >= rules.maxMembers) return unavailable("Their team is full (3 members).");
        return { kind: "invite-back", message: "Requested to join their team. Waiting for a response." };
      }
      if (fromGroup && fromGroup.members.length >= rules.maxMembers) return unavailable("The inviting team is full (3 members).");
      return { kind: "invite", message: "Waiting for a response." };
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = rules;
  else root.FBTeammates = rules;
})(typeof window !== "undefined" ? window : globalThis);
