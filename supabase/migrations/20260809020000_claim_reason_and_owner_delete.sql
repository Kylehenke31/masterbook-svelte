-- Two problems, both caused by an owner having no membership on their own
-- project: they cannot grant themselves one, and they cannot delete the
-- project either. Both operations are gated on being an admin already.
--
-- claim_project_admin returning a bare false was the immediate obstacle to
-- fixing it: "no such project" and "that project is not yours" are completely
-- different faults needing completely different responses, and it reported
-- them identically. It now says which.

drop function if exists public.claim_project_admin(uuid);

create or replace function public.claim_project_admin(p_project_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_me    uuid := (select auth.uid());
begin
  if v_me is null then
    return 'not_signed_in';
  end if;

  select owner_id into v_owner from public.projects where id = p_project_id;

  -- No row at all. The project exists only on somebody's device, which is a
  -- different problem from a permissions one and needs saying so.
  if not found then
    return 'no_such_project';
  end if;

  if v_owner is null then
    return 'no_owner_recorded';
  end if;

  if v_owner is distinct from v_me then
    return 'not_owner';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, v_me, 'admin')
  on conflict (project_id, user_id) do update set role = 'admin';

  return 'granted';
end;
$$;

grant execute on function public.claim_project_admin(uuid) to authenticated;

-- Deleting a project you own but are not a member of.
--
-- projects_admin_delete tests membership, so a project whose creating trigger
-- never fired cannot be deleted by anyone — including the person who made it.
-- That leaves rows nobody can see or remove. Ownership is the right authority
-- here for the same reason it is in claim_project_admin: it is recorded on the
-- row itself and cannot be granted by the caller.
create or replace function public.delete_owned_project(p_project_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_me    uuid := (select auth.uid());
begin
  if v_me is null then
    return 'not_signed_in';
  end if;

  select owner_id into v_owner from public.projects where id = p_project_id;
  if not found then
    return 'no_such_project';
  end if;
  if v_owner is distinct from v_me then
    return 'not_owner';
  end if;

  -- Everything project-scoped cascades from this row.
  delete from public.projects where id = p_project_id;
  return 'deleted';
end;
$$;

grant execute on function public.delete_owned_project(uuid) to authenticated;

-- What projects does this account own, regardless of membership?
--
-- cloudLoadProjects only returns projects you belong to, so an orphan is
-- invisible from the client and indistinguishable from one that was never
-- saved. Owners need to be able to see their own strays in order to claim or
-- remove them.
create or replace function public.my_owned_projects()
returns table (id uuid, title text, is_member boolean)
language sql
security definer
set search_path = ''
as $$
  select p.id,
         coalesce(p.data ->> 'title', '(untitled)') as title,
         exists (
           select 1 from public.project_members m
           where m.project_id = p.id and m.user_id = (select auth.uid())
         ) as is_member
  from public.projects p
  where p.owner_id = (select auth.uid());
$$;

grant execute on function public.my_owned_projects() to authenticated;
