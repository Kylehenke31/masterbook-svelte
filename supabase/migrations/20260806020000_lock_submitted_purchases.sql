-- Lock a submission against its author once it is awaiting review.
--
-- The review process is meant to be airtight: once an expense is submitted,
-- the person who filed it can see it but cannot change it. Until now every
-- project member could edit or delete any purchase at any time — the
-- member_all policy made no distinction between the submitter, an approver,
-- and an unrelated crew member.
--
-- Enforced here rather than in the UI. A rule that only exists in the client
-- is a suggestion: anyone can call the REST endpoint directly, and on a
-- product billed as an audit trail that distinction is the whole point.
--
-- ── Who may change a purchase ──
--   admin / accounting  — always. They are the reviewers; correcting a
--                         submission is their job.
--   the author          — only while it is still theirs to work on:
--                         'Submitted' (a draft saved to their profile) or
--                         'Rejected' (kicked back for correction).
--   anyone else         — never.
--
-- Reading stays open to the whole project. Members are expected to see the
-- production's books; it is *changing* a record under review that has to be
-- restricted.
--
-- Note the author test reads data->>'submittedByUserId' from the EXISTING row
-- in USING, and from the PROPOSED row in WITH CHECK. Both are needed: USING
-- decides which rows you may touch, WITH CHECK decides what you may leave
-- behind — without the latter an author could edit a rejected submission and
-- reassign its authorship on the way through.

-- Replace the blanket policy with per-operation rules.
drop policy if exists member_all on public.purchases;

create policy purchases_select on public.purchases
  for select to authenticated
  using (public.is_project_member(project_id));

create policy purchases_insert on public.purchases
  for insert to authenticated
  with check (public.is_project_member(project_id));

create policy purchases_update on public.purchases
  for update to authenticated
  using (
    public.is_project_member(project_id)
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
    and (
      public.has_project_role(project_id, array['admin','accounting']::public.project_role[])
      or (
        data ->> 'submittedByUserId' = (select auth.uid())::text
        and coalesce(data ->> 'status', '') in ('Submitted', 'Rejected')
      )
    )
  );
