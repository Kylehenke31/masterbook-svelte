-- Position on an invite, phone on a profile.
--
-- Between them these are what the Crew List needs to fill a row in: a job
-- title, a name, an address and a number. The name and address were already
-- known; the other two had to be typed in again by whoever was keeping the
-- crew list, from information the person had already given when they joined.

-- ── Phone ────────────────────────────────────────────────────────────────
-- On the profile rather than on the membership: a phone number belongs to a
-- person, not to their place on one job, and someone on three productions
-- should not have to correct it three times.
alter table public.profiles
  add column if not exists phone text;

-- Carried through signup the same way display_name is. Supabase puts whatever
-- the client passes in options.data onto raw_user_meta_data, and this trigger
-- is what turns that into a profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, phone)
  values (new.id,
          new.email,
          new.raw_user_meta_data ->> 'display_name',
          new.raw_user_meta_data ->> 'phone')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ── Position ─────────────────────────────────────────────────────────────
-- On both the invite and the membership. The invite is where an admin says
-- what someone is being brought on as; the membership is where it has to
-- survive, because the invite row is spent once accepted and the Crew List
-- reads members, not invites.
alter table public.project_invites
  add column if not exists position text;

alter table public.project_members
  add column if not exists position text;

-- Acceptance carries the position across.
--
-- Rewritten rather than altered: `do update` must not blank an existing
-- position when someone is re-invited without one. An admin sending a second
-- invite to fix permissions should not silently un-title the person, so the
-- new value only wins when there is one.
create or replace function public.accept_project_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed integer := 0;
  inv record;
begin
  for inv in
    select * from public.project_invites
    where lower(email) = lower((select auth.jwt() ->> 'email'))
      and accepted_at is null
  loop
    insert into public.project_members (project_id, user_id, role, permissions, position)
    values (inv.project_id, (select auth.uid()), inv.role, inv.permissions, inv.position)
    on conflict (project_id, user_id) do update
      set role        = excluded.role,
          permissions = excluded.permissions,
          position    = coalesce(nullif(excluded.position, ''), public.project_members.position);
    update public.project_invites set accepted_at = now() where id = inv.id;
    claimed := claimed + 1;
  end loop;
  return claimed;
end;
$$;

grant execute on function public.accept_project_invites() to authenticated;
