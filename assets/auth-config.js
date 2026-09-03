/* ==========================================================================
   FRISBEING UF - admin access settings
   This is the only file you need to edit to control who can sort teams and
   edit the roster. Everything here is public: it ships to every visitor's
   browser, so never put a real secret in it.
   ========================================================================== */
window.FBAuthConfig = {

  /* ---- 1. Sign in with a Tsinglan Google account --------------------------
     Paste the OAuth client ID from Google Cloud here. While this is empty the
     Google button is hidden and the passcode below is used instead.
     Setup is in README.md under "Admin access".                            */
  googleClientId: "",

  /* Only accounts on this domain can ever become admins. */
  emailDomain: "tsinglan.org",

  /* ---- 2. Who is an admin ------------------------------------------------
     Without this list EVERY student with a school address would be an admin.
     Keep it to the club leaders. Lower case, full addresses.               */
  adminEmails: [
    "harry.xu_27@tsinglan.org"
    /* add the other leaders here, for example:
       "michael.cheng_27@tsinglan.org",
       "justin.he_27@tsinglan.org",
       "kevin.xiao_27@tsinglan.org" */
  ],

  /* ---- 3. Passcode fallback ----------------------------------------------
     Lets you run the sorter before Google sign-in is set up, and gets you in
     at the field if Google is unreachable. Change it from the default, and
     set it to "" once Google sign-in is working if you want it gone.       */
  passcode: "UF-601af5-610d0c",

  /* How long a sign-in lasts before it has to be repeated, in days. Long
     enough that a leader is not logging in on the sideline every week. */
  sessionDays: 30
};
