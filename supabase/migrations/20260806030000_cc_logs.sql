-- Credit Card Logs as a first-class record, with a lock that actually holds.
--
-- A "log" used to be nothing but a number stamped onto some charges plus a PDF
-- the browser downloaded. Nothing was stored, so there was nothing to lock,
-- reopen, or list — and a charge could be swept into several logs, because
-- ccLogNumbers was an append-only array and "Generate Full Log" re-included
-- everything each time.
--
-- The model this replaces it with:
--   * each card has exactly one OPEN log at any moment
--   * qualifying charges accumulate into it
--   * packaging locks that log and opens the next, numbered sequentially
--   * a charge belongs to exactly one log, for good
--
-- Locking freezes the charges themselves. That is the point of packaging: the
-- log PDF states what was submitted, and if the underlying charges could still
-- be edited afterwards the PDF would quietly stop being true. Enforced in RLS
-- for the same reason the submission lock is — a freeze that only exists in
-- the UI is not a freeze.

create table public.cc_logs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  -- "VISA 9773" — cards live in a localStorage blob and have no stable id of
  -- their own, so a log is tied to the card by the same key the app uses.
  card_key    text not null,
  log_number  text not null,                       -- zero-padded: "001"
  status      text not null default 'open'
              check (status in ('open', 'locked')),
  created_at  timestamp with time zone not null default now(),
  locked_at   timestamp with time zone,
  locked_by   uuid references auth.users(id) on delete set null,
  reopened_at timestamp with time zone,
  reopened_by uuid references auth.users(id) on delete set null,

  unique (project_id, card_key, log_number)
);

create index cc_logs_open_idx on public.cc_logs (project_id, card_key) where status = 'open';

-- One open log per card. Without this, two browsers packaging at once could
-- each open a "next" log and the numbering would fork.
create unique index cc_logs_one_open_per_card
  on public.cc_logs (project_id, card_key) where status = 'open';

alter table public.cc_logs enable row level security;

create policy cc_logs_select on public.cc_logs
  for select to authenticated
  using (public.is_project_member(project_id));

-- Anyone on the project may package a log; that is ordinary accounting work.
create policy cc_logs_insert on public.cc_logs
  for insert to authenticated
  with check (public.is_project_member(project_id));

-- Reopening a locked log is an admin decision — it unfreezes real charges that
-- were already submitted, so it should not be something a crew member can do
-- quietly. Locking (open -> locked) is allowed to any member.
create policy cc_logs_update on public.cc_logs
  for update to authenticated
  using (
    public.is_project_member(project_id)
    and (
      status = 'open'
      or public.has_project_role(project_id, array['admin']::public.project_role[])
    )
  )
  with check (public.is_project_member(project_id));

create policy cc_logs_delete on public.cc_logs
  for delete to authenticated
  using (public.has_project_role(project_id, array['admin']::public.project_role[]));

-- ── Is the charge frozen? ────────────────────────────────────────────────
-- SECURITY DEFINER so the purchases policy can consult cc_logs without the
-- caller needing to see the row, and so it cannot be defeated by a policy on
-- cc_logs itself. Null id (a charge on no log) is not locked.
create or replace function public.is_cc_log_locked(p_log_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cc_logs l
    where l.id = p_log_id and l.status = 'locked'
  );
$$;

grant execute on function public.is_cc_log_locked(uuid) to authenticated;

-- ── Fold the freeze into the purchases lock ──────────────────────────────
-- Reopening the log is what unfreezes these, which is why the lock lives on
-- cc_logs rather than as a flag on the purchase: a flag in the same jsonb the
-- user is editing is a lock you can ask nicely to remove.
drop policy if exists purchases_update on public.purchases;
drop policy if exists purchases_delete on public.purchases;

create policy purchases_update on public.purchases
  for update to authenticated
  using (
    public.is_project_member(project_id)
    and not public.is_cc_log_locked(public.try_uuid(data ->> 'ccLogId'))
    and (
      public.has_project_role(project_id, array['admin','accounting']::public.project_role[])
      or (
        data ->> 'submittedByUserId' = (select auth.uid())::text
        and coalesce(data ->> 'status', '') in ('Submitted', 'Rejected')
      )
    )
  )
  with check (
    public.is_project_member(project_id)
    and (
      public.has_project_role(project_id, array['admin','accounting']::public.project_role[])
      or data ->> 'submittedByUserId' = (select auth.uid())::text
    )
  );

create policy purchases_delete on public.purchases
  for delete to authenticated
  using (
    public.is_project_member(project_id)
    and not public.is_cc_log_locked(public.try_uuid(data ->> 'ccLogId'))
    and (
      public.has_project_role(project_id, array['admin','accounting']::public.project_role[])
      or (
        data ->> 'submittedByUserId' = (select auth.uid())::text
        and coalesce(data ->> 'status', '') in ('Submitted', 'Rejected')
      )
    )
  );
