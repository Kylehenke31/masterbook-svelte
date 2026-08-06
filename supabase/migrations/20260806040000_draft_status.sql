-- Recognise 'Draft' as a state its author still controls.
--
-- Saving to your profile produced status 'Submitted', which was doubly wrong:
-- it reads as the opposite of what it is, and the Review Queue filters on that
-- exact value — so an unfinished draft appeared to approvers as work awaiting
-- their decision. Drafts are now 'Draft'.
--
-- 'Submitted' stays in the author-editable set alongside it. No record
-- currently carries it, but the policy should not orphan one that turns up in
-- a project this migration cannot see — the cost of tolerating it is nothing,
-- and the cost of locking someone out of their own draft is a support call.

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
        and coalesce(data ->> 'status', '') in ('Draft', 'Submitted', 'Rejected')
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
        and coalesce(data ->> 'status', '') in ('Draft', 'Submitted', 'Rejected')
      )
    )
  );
