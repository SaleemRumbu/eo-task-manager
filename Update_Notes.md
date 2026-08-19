# ED1 Task Manager — Update Notes (this batch)

## What changed

1. **Admins can create personal tasks.** In "My Tasks", the "+ New task"
   window now has a Type choice: *Unit task* (shared with the unit, as
   before) or *Personal (only me)*. Personal tasks are private to that
   admin, need no due date, notify no one, and are marked done / reopened
   from the task window (no review step).

2. **Task lists sort newest first.** Both the admin "My Tasks" list and the
   super admin "Tasks" list now show the most recently created task at the
   top (and the CSV export matches).

3. **Dashboard time filters use the task date.** "Today", "This week", etc.
   already filter on the date a task was created (its entered date), not the
   due date. No change was needed; confirmed on both dashboards.

4. **Rejected count on the admin dashboard.** The admin dashboard now has a
   "Rejected" card; clicking it opens the admin's rejected tasks. (The super
   admin dashboard already had this.)

5. **Rejections reach the unit's admins.** Because unit tasks are shared,
   every admin on that unit already sees a task's rejection reason in the
   task window. On top of that, rejecting (or approving) a task now sends the
   unit's admins an in-app notification **and an email**, using the same
   Resend setup as new-task emails.

6. **Multi-unit admins.** An admin assigned to two or more units already sees
   every assigned unit's tasks on the dashboard and in "My Tasks", and can
   filter by each unit. No change was needed; confirmed.

## What you must do to apply it

1. **Run the new database migration** `008_admin_personal_tasks.sql` in the
   Supabase SQL Editor (and `007_storage_and_submission_policies.sql` if you
   have not already). Without 008, admins cannot save or see personal tasks.

2. **Redeploy the `notify-task` edge function.** It was updated to also send
   emails on approval and rejection. Copy the new
   `supabase/functions/notify-task/index.ts` into the function and deploy.
   The secrets (RESEND_API_KEY, FROM_EMAIL, APP_URL) stay the same.

3. **Republish the site** (Vercel etc.) so the updated pages go live.

No secret keys are in any of these files; the Resend key stays only in the
Supabase function secrets.
