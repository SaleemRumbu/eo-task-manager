ED1 TASK MANAGER - STATIC VERSION (same approach as your Vercel app)
===================================================================

WHAT THIS IS
------------
Plain HTML pages. No Next.js, no node_modules, no build step, no
localhost:3000. Supabase is loaded from a CDN inside each page, exactly
like your Vercel dashboard app. Total size: a few kilobytes.

HOW TO RUN WHILE DEVELOPING
---------------------------
Just double-click  login.html  and it opens in your browser. That is it.
(Email + password login works this way. Sign in with a super admin
account that already exists in your Supabase project.)

HOW TO PUBLISH (like your other app)
------------------------------------
Drop this whole folder onto Vercel (or Netlify) as a static site, or push
it to GitHub and connect it to Vercel. There is nothing to build.

FILES
-----
  login.html              Sign in (email + password)
  change-password.html    Forced "set your password" screen (first login)
  index.html              Sends you to the right dashboard
  config.js               Supabase URL + publishable key (safe to ship)
  auth.js                 Shared session check + page shell
  styles.css              Shared house styling (navy / blue)
  modules/superadmin/     dashboard.html, units.html, tasks.html
  modules/admin/          my-tasks.html, notifications.html
  supabase/functions/create-admin/index.ts   (see below)

THE FORCED PASSWORD CHANGE (what you asked for)
-----------------------------------------------
When a super admin creates an admin for a unit and gives a temporary
password, that admin - on first login - is sent to change-password.html
and cannot reach any page until they set a new password and confirm it.
Once set, the temporary password is deleted and they go to their
dashboard. This runs entirely in the browser (no server needed).

THE ONE SERVER-SIDE PIECE
-------------------------
Creating a new admin ACCOUNT needs the Supabase secret key, which must
never sit in browser code. So that single step calls a small Supabase
Edge Function: supabase/functions/create-admin/index.ts

Deploy it once (using the Supabase dashboard or CLI), and set its secret
SUPABASE_ANON_KEY. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided
by Supabase automatically. Everything else in the app needs no server.

NOTE ON KEYS
------------
config.js contains only the publishable (anon) key - safe to ship, just
like your Vercel config.js. The secret key is NOT in any browser file.

DATABASE
--------
Uses your existing ED1 tables (profiles, units, tasks, submissions,
notifications) and their row-level security. No schema change needed;
must_change_password and temp_password already exist.
