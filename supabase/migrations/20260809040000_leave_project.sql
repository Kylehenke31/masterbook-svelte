-- Let someone remove themselves from a project.
--
-- project_members_admin_write requires admin for any write to the table, which
-- is right for adding and promoting people but means a crew member cannot get
-- themselves off a project they no longer work on. Their only route out is
-- asking an admin, and a personal account screen that lists projects you
-- cannot leave is a list of complaints.
--
-- Security definer, and it removes exactly one row: the caller's own
-- membership. It cannot remove anybody else.
--
-- The last admin is refused. A project with no admins can never grant access
-- again — the same dead end claim_project_admin exists to dig projects out of
-- — so it is better to say no here than to create one on purpose.

create or replace function public.leave_project(p_project_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me         uuid := (select auth.uid());
  v_role       public.project_role;
  v_admin_count integer;
begin
  if v_me is null then
    return 'not_signed_in';
  end if;

  select role into v_role
  from public.project_members
  where project_id = p_project_id and user_id = v_me;

  if not found then
    return 'not_a_member';
  end if;

  if v_role = 'admin' then
    select count(*) into v_admin_count
    from public.project_members
    where project_id = p_project_id and role = 'admin';

    if v_admin_count <= 1 then
      return 'last_admin';
    end if;
  end if;

  delete from public.project_members
  where project_id = p_project_id and user_id = v_me;

  return 'left';
end;
$$;

grant execute on function public.leave_project(uuid) to authenticated;
