-- ============================================================
-- ED1 Task Manager - fix "new row violates row-level security policy"
-- on file upload, and allow the matching submission row to be saved.
-- Run this once in the Supabase SQL Editor. Safe to run again.
-- ============================================================

-- 0) Make sure the private "submissions" bucket exists.
insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 1) STORAGE policies (this is what your current error is about).
--    Uploads write a row into storage.objects, which is RLS-locked
--    by default, so the write is rejected until a policy allows it.
-- ------------------------------------------------------------

-- Allow any signed-in user to UPLOAD into the submissions bucket.
drop policy if exists "submissions: authenticated upload" on storage.objects;
create policy "submissions: authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions');

-- Allow any signed-in user to READ/DOWNLOAD from the submissions bucket
-- (needed for the super admin's signed-URL download links to work).
drop policy if exists "submissions: authenticated read" on storage.objects;
create policy "submissions: authenticated read"
  on storage.objects for select to authenticated
  using (bucket_id = 'submissions');

-- ------------------------------------------------------------
-- 2) TABLE policy on public.submissions.
--    Migration 002 only added a SELECT policy. Without an INSERT
--    policy, saving the submission row (right after the file upload)
--    would fail with the same RLS error. This adds it.
-- ------------------------------------------------------------
drop policy if exists "admin: insert submissions for own unit tasks" on public.submissions;
create policy "admin: insert submissions for own unit tasks"
  on public.submissions for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from public.tasks t
      where t.id = task_id
        and t.unit_id in (select public.current_user_units())
    )
  );

-- Super admins can do anything with submissions (read all, etc.).
drop policy if exists "superadmin: full access to submissions" on public.submissions;
create policy "superadmin: full access to submissions"
  on public.submissions for all
  using (public.current_user_role() = 'superadmin');
