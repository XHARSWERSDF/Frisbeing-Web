(function () {
  "use strict";
  var user = window.FBAuth && FBAuth.user();
  if (!user && window.FBPreview && FBPreview.active()) user = FBPreview.user();
  if (!user) {
    window.location.replace("admin.html");
    return;
  }
  document.getElementById("profileName").textContent = FBAuth.accountName(user.email);
  document.getElementById("profileEmail").textContent = user.email;
  document.getElementById("profileMember").textContent = FBAuth.accountRoleLabel(user.role);
  document.getElementById("profileSignOut").addEventListener("click", function () {
    if (window.FBPreview && FBPreview.active()) { FBPreview.stop(); return; }
    FBAuth.signOut();
    window.location.assign("admin.html");
  });
})();
