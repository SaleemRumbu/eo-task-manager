# ED1 Task Manager — Email Notifications on Task Creation

## What this does

When a task is created for a unit, by anyone (a super admin or an admin),
the app now automatically:

1. writes an in-app notification (the bell) for the right people, and
2. sends them an email saying a new task needs their attention.

**Who gets notified:** every admin assigned to that unit, plus the super
admin(s). **The person who created the task is left out**, because they
already know. Personal tasks (no unit) notify no one.

This works for single task creation, for admin-created tasks, and for bulk
CSV/Excel imports (one email per imported task, as requested).

## What was changed in the app

- New server function: `supabase/functions/notify-task/index.ts`
- `modules/superadmin/tasks.html` — single create and bulk import now call it
- `modules/admin/my-tasks.html` — admin-created tasks now call it

No database changes are needed. The function runs with the service-role key,
so it can read profiles and write notifications without any new policy.

---

## One-time setup (about 15 minutes)

### Step 1 — Create a Resend account and get an API key

1. Go to https://resend.com and sign up (free).
2. In the Resend dashboard open **API Keys → Create API Key**. Copy the key
   (it starts with `re_`). You will paste it in Step 3.

### Step 2 — Verify your domain (so mail comes from rumbuindustries.com)

1. In Resend open **Domains → Add Domain** and enter `rumbuindustries.com`.
2. Resend shows a few DNS records (SPF, DKIM). Whoever manages your domain's
   DNS adds those records once. When Resend shows the domain as **Verified**,
   mail can be sent from an address like `tasks@rumbuindustries.com`.

> You can test before the domain is verified: leave `FROM_EMAIL` unset and
> Resend's sandbox sender `onboarding@resend.dev` is used, but it will only
> deliver to the email address you signed up to Resend with. Verify the
> domain for real delivery to your admins.

### Step 3 — Deploy the function and set its secrets

**Using the Supabase dashboard (no tools to install):**

1. Open your project → **Edge Functions → Deploy a new function** (or
   **Create function**). Name it exactly `notify-task`.
2. Paste the entire contents of `supabase/functions/notify-task/index.ts`
   into the editor and deploy.
3. Open the `notify-task` function → **Secrets** (or **Settings → Secrets**)
   and add:
   - `RESEND_API_KEY` = the `re_...` key from Step 1
   - `FROM_EMAIL` = `ED1 Task Manager <tasks@rumbuindustries.com>`
   - `APP_URL` = the web address of your published app, e.g.
     `https://your-app.vercel.app` (used for the "Open ED1 Task Manager"
     button in the email; you can leave it blank and the button is hidden)

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase
   automatically — do not add them.

**Or using the Supabase CLI (if you prefer the terminal):**

```
supabase functions deploy notify-task
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
supabase secrets set FROM_EMAIL="ED1 Task Manager <tasks@rumbuindustries.com>"
supabase secrets set APP_URL="https://your-app.vercel.app"
```

### Step 4 — Publish the updated pages

Re-upload / redeploy this folder to Vercel (or wherever the app is hosted),
exactly as you do now. The three changed HTML files must be the live ones.

---

## Test it

1. Sign in as the super admin and create a unit task for a unit that has at
   least one admin assigned.
2. That admin should receive the email within a few seconds and see the bell
   notification. You (the creator) should **not** get an email.
3. Have an admin create a task in their unit: the other unit admins and the
   super admin get the mail, that admin does not.

If an email does not arrive, check **Edge Functions → notify-task → Logs** in
Supabase. The most common causes are: `RESEND_API_KEY` not set, the domain
not yet verified in Resend, or the recipient having no email on their profile.

## Notes

- If mail sending ever fails, task creation still succeeds — notifications are
  best-effort and never block the task.
- The free Resend tier (about 3,000 emails/month) is far above what this app
  needs. If you ever exceed it, upgrade the Resend plan; no code change.
