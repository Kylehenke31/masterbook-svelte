-- Per-feature permissions for project members, plus pending invites.
--
-- The three-role enum (admin / accounting / crew) could not express what a
-- production actually needs: a Production Designer who edits her own creative
-- department, reads the others, files her own expenses, and touches nothing
-- else. Members now carry a permissions map — feature key -> 'read' | 'edit',
-- absent meaning no access — and the roles that remain are presets rather
-- than the whole story.
--
-- ── What this enforces, and what it does not ──
-- WRITES to the financial tables are enforced here: purchases, cc_logs,
-- budgets, credit_cards, petty_cash. That is where a bypass fabricates
-- accounting records, which is the failure that matters on an audit trail.
--
-- READS stay open to project members and are hidden by the interface instead.
-- This is deliberate and worth stating plainly: it is not a security boundary.
-- The submission form's own pickers read the card list, the envelope list and
-- the budget lines, and My Book reads the ledger — restricting those at the
-- database would break the app for exactly the people this feature exists to
-- invite. Read restriction belongs with a later pass that reworks those
-- pickers to not need blanket access.

alter table public.project_members
  add column if not exists permissions jsonb not null default '{}'::jsonb;

comment on column public.project_members.permissions is
  'Feature key -> ''read'' | ''edit''. Absent means no access. See src/svelte/lib/features.js '
  'for the canonical key list. Ignored for role = admin, who has edit on everything.';

-- ── Does this member hold at least this level on this feature? ────────────
-- SECURITY DEFINER for the same reason as is_project_member: policies consult
-- it, and it must not depend on the caller being able to read the membership
-- row it is reading.
create or replace function public.has_feature(
  p_project_id uuid,
  p_feature    text,
  p_min_level  text default 'read'
)
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
      and (
        -- Admins hold every feature, including ones added later.
        m.role = 'admin'
        -- 'accounting' predates per-feature grants; honour what it named.
        or (m.role = 'accounting' and p_feature in (
              'budget','insurance','files','calendar','personnel','vendors',
              'expenses','purchase_orders','credit_cards','petty_cash'))
        or (p_min_level = 'edit' and m.permissions ->> p_feature = 'edit')
        or (p_min_level = 'read' and m.permissions ->> p_feature in ('read','edit'))
      )
  );
$$;

grant execute on function public.has_feature(uuid, text, text) to authenticated;

-- ── Purchases ────────────────────────────────────────────────────────────
-- Reviewing an expense is 'edit' on Expenses. Filing one's own is open to any
-- member: being able to submit is usually the whole reason someone is invited,
-- and a person who can file but cannot revisit their own draft has been handed
-- a write-only hole.
drop policy if exists purchases_update on public.purchases;
drop policy if exists purchases_delete on public.purchases;
drop policy if exists purchases_insert on public.purchases;

create policy purchases_insert on public.purchases
  for insert to authenticated
  with check (
    public.is_project_member(project_id)
    and (
      public.has_feature(project_id, 'expenses', 'edit')
      or data ->> 'submittedByUserId' = (select auth.uid())::text
    )
  );

create policy purchases_update on public.purchases
  for update to authenticated
  using (
    public.is_project_member(project_id)
    and not public.is_cc_log_locked(public.try_uuid(data ->> 'ccLogId'))
    and (
      public.has_feature(project_id, 'expenses', 'edit')
      or (
        data ->> 'submittedByUserId' = (select auth.uid())::text
        and coalesce(data ->> 'status', '') in ('Draft', 'Submitted', 'Rejected')
      )
    )
  )
  with check (
    public.is_project_member(project_id)
    and (
      public.has_feature(project_id, 'expenses', 'edit')
      or data ->> 'submittedByUserId' = (select auth.uid())::text
    )
  );

create policy purchases_delete on public.purchases
  for delete to authenticated
  using (
    public.is_project_member(project_id)
    and not public.is_cc_log_locked(public.try_uuid(data ->> 'ccLogId'))
    and (
      public.has_feature(project_id, 'expenses', 'edit')
      or (
        data ->> 'submittedByUserId' = (select auth.uid())::text
        and coalesce(data ->> 'status', '') in ('Draft', 'Submitted', 'Rejected')
      )
    )
  );

-- ── Credit Card Logs ─────────────────────────────────────────────────────
drop policy if exists cc_logs_insert on public.cc_logs;
drop policy if exists cc_logs_update on public.cc_logs;

create policy cc_logs_insert on public.cc_logs
  for insert to authenticated
  with check (public.has_feature(project_id, 'credit_cards', 'edit'));

-- Locking is ordinary accounting work; reopening unfreezes already-submitted
-- charges and stays with admins.
create policy cc_logs_update on public.cc_logs
  for update to authenticated
  using (
    public.is_project_member(project_id)
    and (
      status = 'open'
      and public.has_feature(project_id, 'credit_cards', 'edit')
      or public.has_project_role(project_id, array['admin']::public.project_role[])
    )
  )
  with check (public.is_project_member(project_id));

-- ── Financial section blobs: writes need the matching grant ──────────────
do $$
declare
  t text;
  f text;
  pairs text[][] := array[
    ['budgets','budget'], ['credit_cards','credit_cards'], ['petty_cash','petty_cash']
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    t := pairs[i][1];
    f := pairs[i][2];
    execute format('drop policy if exists member_all on public.%I', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    -- Reads stay project-wide: the submission form's pickers depend on them.
    execute format(
      'create policy %I_select on public.%I for select to authenticated
         using (public.is_project_member(project_id))', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated
         using (public.has_feature(project_id, %L, ''edit''))
         with check (public.has_feature(project_id, %L, ''edit''))', t, t, f, f);
  end loop;
end;
$$;

-- ── Pending invites ──────────────────────────────────────────────────────
-- Someone can be invited before they have an account. The invite holds the
-- intended permissions; signing up with that email converts it to membership.
-- No email is sent yet — that is deliberately a later, separate piece of work.
create table public.project_invites (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  email       text not null,
  role        public.project_role not null default 'crew',
  permissions jsonb not null default '{}'::jsonb,
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamp with time zone not null default now(),
  accepted_at timestamp with time zone,
  unique (project_id, email)
);

alter table public.project_invites enable row level security;

create policy project_invites_admin_all on public.project_invites
  for all to authenticated
  using (public.has_project_role(project_id, array['admin']::public.project_role[]))
  with check (public.has_project_role(project_id, array['admin']::public.project_role[]));

-- A signed-in user may see and accept an invite addressed to their own email.
create policy project_invites_see_own on public.project_invites
  for select to authenticated
  using (lower(email) = lower((select auth.jwt() ->> 'email')));

-- ── Accepting an invite ──────────────────────────────────────────────────
-- SECURITY DEFINER: the invitee is not yet a member, so they cannot write to
-- project_members under their own rights. This is the one sanctioned way in,
-- and it only ever acts on an invite addressed to the caller's own email.
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
    insert into public.project_members (project_id, user_id, role, permissions)
    values (inv.project_id, (select auth.uid()), inv.role, inv.permissions)
    on conflict (project_id, user_id) do update
      set role = excluded.role, permissions = excluded.permissions;
    update public.project_invites set accepted_at = now() where id = inv.id;
    claimed := claimed + 1;
  end loop;
  return claimed;
end;
$$;

grant execute on function public.accept_project_invites() to authenticated;
