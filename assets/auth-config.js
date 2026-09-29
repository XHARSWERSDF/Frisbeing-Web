/* ==========================================================================
   FRISBEING UF - sign-in settings

   Sign-in is your Tsinglan Microsoft 365 account (Microsoft Entra). There are
   no passwords and no passcode: Microsoft proves who you are, and the club
   server turns your school address into your role (leader, admin or player).

   The two values below come from a one-time app registration in
   https://entra.microsoft.com - see README.md, "Microsoft sign-in". They are
   NOT secrets; a single-page app registration is meant to ship in the page,
   and security comes from the redirect URI and the server's checks, not from
   hiding them. While they are blank the Account page explains what is missing.
   ========================================================================== */
window.FBAuthConfig = {
  entra: {
    /* Directory (tenant) ID of the Tsinglan organisation. */
    tenantId: "",
    /* Application (client) ID of the app registration. */
    clientId: "",
    /* Leave blank for real Microsoft. Only set this to point sign-in at a
       local mock while testing - the server still verifies every token. */
    authority: ""
  },

  /* Only this domain can sign in. Microsoft also enforces it via the tenant,
     this is the friendly message and a second check. */
  emailDomain: "tsinglan.org",

  /* How long a sign-in lasts on this device before Microsoft is asked again. */
  sessionDays: 30
};
