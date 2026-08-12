-- ============================================================
-- ED1 Task Manager — archive support for tasks and units.
-- Run once in the SQL Editor.
-- ============================================================
alter table public.tasks add column if not exists archived_at timestamptz;
alter table public.units add column if not exists archived_at timestamptz;

create index if not exists tasks_archived_idx on public.tasks (archived_at);
create index if not exists units_archived_idx on public.units (archived_at);
