-- ============================================================
-- ED1 Task Manager — fold personal tasks into the tasks table so
-- they share dates, status and filters. Run once in the SQL Editor.
-- ============================================================

-- 1) Let a task be personal (no unit) and let due date be optional
alter table public.tasks alter column unit_id  drop not null;
alter table public.tasks alter column due_date drop not null;
alter table public.tasks add column if not exists owner_id uuid references public.profiles(id) on delete cascade;
-- A task is EITHER a unit task (unit_id set) OR a personal task (owner_id set).

-- 2) Move any existing personal_tasks rows into tasks, then drop that table
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'personal_tasks') then
    insert into public.tasks (title, owner_id, assigned_by, unit_id, due_date, priority, status, created_at)
    select pt.title, pt.owner_id, pt.owner_id, null, null, 'medium',
           case when pt.done then 'approved' else 'in_progress' end, pt.created_at
    from public.personal_tasks pt;
    drop table public.personal_tasks;
  end if;
end $$;

-- Note: admins never see personal tasks because their read policy matches on
-- unit_id, and personal tasks have unit_id = null. Super admin keeps full access.
