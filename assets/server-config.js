/* ==========================================================================
   FRISBEING UF - server settings

   ONE LINE TO CHANGE when the server is ready. Everything else adapts.

   Leave apiBase as "" and the site runs in FILE MODE exactly as before:
   roster.json for the squad, this browser for edits, share links for teams.

   Set apiBase to your server's address and the site switches to SERVER MODE:
   the roster and the team draw live on the server, every device stays in
   sync, and Microsoft sign-in (accounts, roles, tiers) becomes available.
   ========================================================================== */
window.FBServer = {

  /* e.g. "https://frisbeing-api.example.com" or "/api" if the API is served
     from the same address as the website. No trailing slash. */
  apiBase: "",

  /* How often, in seconds, an open page checks whether anything changed.
     Ten seconds is invisible to a person and costs the server almost
     nothing. Lower it if you want, but do not go below 3. */
  syncSeconds: 10
};
