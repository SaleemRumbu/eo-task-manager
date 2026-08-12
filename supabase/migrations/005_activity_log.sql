-- ============================================================
-- ED1 Task Manager — activity log (super admin audit trail)
-- Run once in the SQL Editor.
-- ============================================================
create table if not exists public.activity_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_created_idx on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;

-- Anyone signed in may record their own action...
drop policy if exists "log own actions" on public.activity_log;
create policy "log own actions"
  on public.activity_log for insert
  with check (actor_id = auth.uid());

-- ...but only the super admin can read the log.
drop policy if exists "superadmin reads log" on public.activity_log;
create policy "superadmin reads log"
  on public.activity_log for select
  using (public.current_user_role() = 'superadmin');
