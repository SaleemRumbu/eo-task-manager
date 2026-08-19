-- ============================================================
-- ED1 Task Manager — let ADMINS keep their own personal tasks.
-- A personal task has owner_id = the person and unit_id = null.
-- These policies are additive: unit-task rules are unchanged, and
-- because unit tasks have owner_id = null, nothing here exposes them.
-- Run once in the Supabase SQL Editor. Safe to run again.
-- ============================================================

-- See your own personal tasks.
drop policy if exists "own personal tasks: select" on public.tasks;
create policy "own personal tasks: select"
  on public.tasks for select
  using (owner_id = auth.uid());

-- Create a personal task for yourself (must have no unit).
drop policy if exists "own personal tasks: insert" on public.tasks;
create policy "own personal tasks: insert"
  on public.tasks for insert to authenticated
  with check (owner_id = auth.uid() and unit_id is null);

-- Update your own personal task (mark done, reopen, edit).
drop policy if exists "own personal tasks: update" on public.tasks;
create policy "own personal tasks: update"
  on public.tasks for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Delete your own personal task.
drop policy if exists "own personal tasks: delete" on public.tasks;
create policy "own personal tasks: delete"
  on public.tasks for delete
  using (owner_id = auth.uid());
