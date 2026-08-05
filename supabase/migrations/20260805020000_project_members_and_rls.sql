-- Move access control from single-owner to project membership.
--
-- Before this migration a project was visible only to projects.owner_id, and
-- every other table resolved back to that same check. A second user could not
-- see a project at all, which makes the submit → review → approve workflow
-- impossible: the person submitting and the person approving have to be
-- different people looking at the same data.
--
-- After this migration, access is "are you a member of this project", and
-- what you may do is determined by your role in it.
--
-- ── The recursion trap ────────────────────────────────────────────────────
-- The membership test MUST live in a SECURITY DEFINER function. A policy on
-- project_members that queries project_members would re-enter its own policy
-- and recurse until Postgres aborts. SECURITY DEFINER makes the lookup run as
-- the function owner with RLS bypassed, which terminates the recursion. This
-- is the single most important detail in this file — an ordinary inlined
-- EXISTS works fine on every other table and deadlocks on this one.
--
-- Both functions pin search_path to empty and schema-qualify everything, so a
-- caller cannot shadow `public` with their own tables and change what the
-- security-definer body resolves to.

-- ── Roles ─────────────────────────────────────────────────────────────────

create type public.project_role as enum ('admin', 'accounting', 'crew');

comment on type public.project_role is
  'admin: full control including membership. accounting: may approve/reject '
  'submissions. crew: may submit and see their own submissions.';

-- ── Profiles ──────────────────────────────────────────────────────────────
-- auth.users is not readable from the client, so a card assigned to a person
-- has no way to display that person''s name. profiles mirrors the parts that
-- are safe to expose to co-members.

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamp with time zone not null default now(),
  updated_at   timestamp with time zone not null default now()
);

create trigger touch_profiles
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── Membership ────────────────────────────────────────────────────────────

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id)      on delete cascade,
  role       public.project_role not null default 'crew',
  created_at timestamp with time zone not null default now(),
  primary key (project_id, user_id)
);

create index project_members_user_id_idx on public.project_members (user_id);

-- ── Backfill ──────────────────────────────────────────────────────────────
-- Every existing user gets a profile, and every existing project owner
-- becomes an admin of their own project. Without this the owner would lose
-- access to their own data the moment the policies below take effect.

insert into public.profiles (id, email, display_name)
select id, email, raw_user_meta_data ->> 'display_name'
from auth.users
on conflict (id) do nothing;

insert into public.project_members (project_id, user_id, role)
select id, owner_id, 'admin'
from public.projects
on conflict (project_id, user_id) do nothing;

-- ── Membership helpers ────────────────────────────────────────────────────

create function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members m
    where m.project_id = p_project_id
      and m.user_id = (select auth.uid())
  );
$$;

create function public.has_project_role(p_project_id uuid, p_roles public.project_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members m
    where m.project_id = p_project_id
      and m.user_id = (select auth.uid())
      and m.role = any(p_roles)
  );
$$;

grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.has_project_role(uuid, public.project_role[]) to authenticated;

-- ── Keep membership in step with project creation ─────────────────────────
-- A user creating a project is not yet a member of it, so without this they
-- would insert a project and immediately lose sight of it.

create function public.add_owner_as_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'admin')
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_project_created
  after insert on public.projects
  for each row execute function public.add_owner_as_admin();

-- Give every new auth user a profile row.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Policies: profiles ────────────────────────────────────────────────────

alter table public.profiles enable row level security;

-- You can always see yourself. You can also see anyone you share a project
-- with, which is what lets the UI show "Kyle Henke" next to a card or a
-- submission rather than a bare uuid.
create policy profiles_select_self_or_comember on public.profiles
  for select using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.project_members mine
      join public.project_members theirs on theirs.project_id = mine.project_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = profiles.id
    )
  );

create policy profiles_update_self on public.profiles
  for update using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ── Policies: project_members ─────────────────────────────────────────────

alter table public.project_members enable row level security;

-- Note both of these route through the SECURITY DEFINER helpers. Writing the
-- EXISTS inline here is what causes infinite recursion.
create policy project_members_select on public.project_members
  for select using (public.is_project_member(project_id));

create policy project_members_admin_write on public.project_members
  for all using (public.has_project_role(project_id, array['admin']::public.project_role[]))
  with check (public.has_project_role(project_id, array['admin']::public.project_role[]));

-- ── Policies: projects ────────────────────────────────────────────────────

drop policy if exists "projects: owner access" on public.projects;

create policy projects_member_select on public.projects
  for select using (public.is_project_member(id));

-- Creating a project you own is always allowed; the trigger above then makes
-- you its admin. Updates and deletes stay with admins.
create policy projects_insert_own on public.projects
  for insert with check (owner_id = (select auth.uid()));

create policy projects_admin_update on public.projects
  for update using (public.has_project_role(id, array['admin']::public.project_role[]))
  with check (public.has_project_role(id, array['admin']::public.project_role[]));

create policy projects_admin_delete on public.projects
  for delete using (public.has_project_role(id, array['admin']::public.project_role[]));

-- ── Policies: every project-scoped table ──────────────────────────────────
-- All of these carried an identical owner_all policy resolving through
-- projects.owner_id. They are rewritten in one loop so the predicate is
-- written once and cannot drift between tables — the failure mode being that
-- one forgotten table keeps owner-scoping and silently blanks for everyone
-- who is not the owner.

do $$
declare
  t text;
  project_scoped text[] := array[
    'budgets', 'calendars', 'call_sheets', 'channels', 'creative',
    'credit_cards', 'insurance', 'messages', 'personnel', 'petty_cash',
    'purchases', 'schedules', 'vendors'
  ];
begin
  foreach t in array project_scoped loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('drop policy if exists %I on public.%I', t || ': via project owner', t);
    execute format(
      'create policy member_all on public.%I
         for all using (public.is_project_member(project_id))
         with check (public.is_project_member(project_id))', t);
  end loop;
end;
$$;

-- purchases carried a differently-named policy than the rest.
drop policy if exists "purchases: via project owner" on public.purchases;
