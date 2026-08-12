-- Let a project's owner claim admin on it.
--
-- Creating a project is supposed to make you its admin, via the
-- on_project_created trigger. When that does not happen — the row reaching the
-- database by a path that did not fire the trigger, or an upsert resolving to
-- an UPDATE because the row already existed — the project becomes permanently
-- unusable, and there is no way out from the client.
--
-- That dead end is by design in project_members_admin_write:
--
--   for all using (has_project_role(project_id, array['admin']))
--
-- You must already be an admin to grant anyone membership, including yourself.
-- Correct for stopping people adding themselves to other people's projects,
-- and it also means a project with no members can never gain one. The owner is
-- locked out of their own project with no recourse: every write is refused,
-- and the refusal surfaces far from the cause — most often as "new row
-- violates row-level security policy" while uploading a receipt.
--
-- This is the one safe exception. It is security definer, so it bypasses the
-- policy above, and it grants admin to exactly one person: the account
-- recorded as the project's owner, asking for itself. It cannot be used to
-- join a project you do not own, or to promote anybody else.

create or replace function public.claim_project_admin(p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.projects where id = p_project_id;

  -- No such project, or not yours: nothing happens, and the caller is told
  -- nothing about whose it is.
  if v_owner is null or v_owner is distinct from (select auth.uid()) then
    return false;
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, v_owner, 'admin')
  on conflict (project_id, user_id) do update set role = 'admin';

  return true;
end;
$$;

grant execute on function public.claim_project_admin(uuid) to authenticated;
