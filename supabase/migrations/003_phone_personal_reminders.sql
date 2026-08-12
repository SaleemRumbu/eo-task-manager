-- ============================================================
-- ED1 Task Manager — phone field, personal tasks, (reminders use
-- the existing notifications table). Run once in the SQL Editor.
-- ============================================================

-- 1) Phone number on admin profiles
alter table public.profiles add column if not exists phone text;

-- 2) Personal to-do list for the super admin (not tied to a unit)
create table if not exists public.personal_tasks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.personal_tasks enable row level security;

drop policy if exists "own personal tasks" on public.personal_tasks;
create policy "own personal tasks"
  on public.personal_tasks for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Reminders / approvals / rejections all use the existing public.notifications
-- table, so no change is needed there.
