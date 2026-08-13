-- Re-assert the policies on `projects`, and make them inspectable.
--
-- An insert was refused with "new row violates row-level security policy"
-- while the only condition on it, `owner_id = (select auth.uid())`, was
-- demonstrably satisfied — the client logged the id it sent and the subject
-- decoded from its own token, and they matched. A WITH CHECK that is true
-- cannot refuse the row, so the policy being enforced is not the one the
-- migration file describes: either projects_insert_own is absent (RLS on with
-- no INSERT policy denies everything, with this exact message), or it was
-- altered outside migrations. This schema was applied by hand in the dashboard
-- before migrations existed, so that is not far-fetched.
--
-- Dropping and recreating all four is idempotent and cheap. If they were
-- already correct this changes nothing; if one had drifted, this is the fix.

alter table public.projects enable row level security;

drop policy if exists projects_member_select on public.projects;
drop policy if exists projects_insert_own    on public.projects;
drop policy if exists projects_admin_update  on public.projects;
drop policy if exists projects_admin_delete  on public.projects;
-- Predates migrations; harmless if long gone.
drop policy if exists "projects: owner access" on public.projects;

-- You can see a project you belong to.
create policy projects_member_select on public.projects
  for select to authenticated
  using (public.is_project_member(id));

-- You can create a project, owned by you. The trigger on this insert is what
-- makes you its admin, so this is also the only route into membership.
create policy projects_insert_own on public.projects
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- Its admins can change it. The owner is included by way of the trigger above.
create policy projects_admin_update on public.projects
  for update to authenticated
  using (public.has_project_role(id, array['admin']::public.project_role[]))
  with check (public.has_project_role(id, array['admin']::public.project_role[]));

create policy projects_admin_delete on public.projects
  for delete to authenticated
  using (public.has_project_role(id, array['admin']::public.project_role[]));

-- PostgREST caches the schema; a policy change it has not noticed behaves
-- exactly like a policy that was never applied.
notify pgrst, 'reload schema';

-- Read back what is actually enforced.
--
-- Every diagnosis of this bug so far has been an argument from what the
-- migration files say, and each was wrong about what the database was doing.
-- This returns the policies as they exist. It exposes only the rules governing
-- a table the caller can already read, and only to signed-in users, but it is
-- a debugging aid rather than a feature — drop it once this is settled.
create or replace function public.debug_table_policies(p_table text)
returns table (policyname text, cmd text, permissive text, roles text, qual text, with_check text)
language sql
security definer
set search_path = ''
as $$
  select policyname::text, cmd::text, permissive::text,
         array_to_string(roles, ',')::text, coalesce(qual::text, ''), coalesce(with_check::text, '')
  from pg_policies
  where schemaname = 'public' and tablename = p_table;
$$;

grant execute on function public.debug_table_policies(text) to authenticated;
