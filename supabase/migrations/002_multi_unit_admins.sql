-- ============================================================
-- ED1 Task Manager — allow one admin to belong to MANY units
-- Run this once in the Supabase SQL Editor.
-- Safe to run again; it uses "if not exists" / "drop ... if exists".
-- ============================================================

-- 1) Link table: which admin belongs to which unit (many-to-many)
create table if not exists public.profile_units (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  unit_id    uuid not null references public.units(id)    on delete cascade,
  primary key (profile_id, unit_id)
);

-- 2) Bring existing single-unit assignments across into the link table
insert into public.profile_units (profile_id, unit_id)
select id, unit_id from public.profiles
where unit_id is not null
on conflict do nothing;

-- 3) Security on the link table
alter table public.profile_units enable row level security;

drop policy if exists "superadmin: full access to profile_units" on public.profile_units;
create policy "superadmin: full access to profile_units"
  on public.profile_units for all using (public.current_user_role() = 'superadmin');

drop policy if exists "admin: read own unit links" on public.profile_units;
create policy "admin: read own unit links"
  on public.profile_units for select using (profile_id = auth.uid());

-- 4) Helper: the set of unit ids the current user belongs to
create or replace function public.current_user_units()
returns setof uuid language sql security definer stable as $$
  select unit_id from public.profile_units where profile_id = auth.uid()
$$;

-- 5) Update the admin policies to use ALL of the user's units (not one)
drop policy if exists "admin: read own unit" on public.units;
drop policy if exists "admin: read own units" on public.units;
create policy "admin: read own units"
  on public.units for select
  using (id in (select public.current_user_units()));

drop policy if exists "admin: read tasks for own unit" on public.tasks;
drop policy if exists "admin: read tasks for own units" on public.tasks;
create policy "admin: read tasks for own units"
  on public.tasks for select
  using (unit_id in (select public.current_user_units()));

drop policy if exists "admin: update own unit task status" on public.tasks;
drop policy if exists "admin: update own units task status" on public.tasks;
create policy "admin: update own units task status"
  on public.tasks for update
  using (unit_id in (select public.current_user_units()));

drop policy if exists "admin: read submissions for own unit tasks" on public.submissions;
drop policy if exists "admin: read submissions for own units tasks" on public.submissions;
create policy "admin: read submissions for own units tasks"
  on public.submissions for select
  using (exists (
    select 1 from public.tasks t
    where t.id = task_id and t.unit_id in (select public.current_user_units())
  ));

-- 6) The old "same single unit" profile-read policy is no longer needed
drop policy if exists "admin: read profiles in same unit" on public.profiles;
