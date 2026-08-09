-- Committing a purchase is restricted to admins and accountants.
--
-- Reviewing and committing are deliberately different powers. Reviewing is
-- 'edit on Expenses', which a coordinator can reasonably hold so they can help
-- work through the queue. Committing is what puts money in the budget and
-- files paperwork into the production's Dropbox, and that belongs to the
-- people accountable for the books.
--
-- This has to live in the policy rather than the interface. purchases_update
-- grants updates on the Expenses grant, so a member holding it can already
-- write any field on any purchase through PostgREST — hiding the Commit button
-- would stop nobody who could read the network tab. The app's canCommitPurchase
-- mirrors this rule so the button matches what the server will allow, but this
-- is the rule.
--
-- Expressed as a with-check on the resulting row rather than a transition
-- check: "you may not leave this row in Committed unless you are admin or
-- accounting". That also stops a non-committer editing a record that is
-- already committed, which is the same protection by the same reasoning — a
-- committed record's paperwork is filed and its money is in the budget.

drop policy if exists purchases_update on public.purchases;

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
    -- You may not modify an already-committed record unless you could have
    -- committed it yourself.
    and (
      coalesce(data ->> 'status', '') <> 'Committed'
      or public.has_project_role(project_id, array['admin','accounting']::public.project_role[])
    )
  )
  with check (
    public.is_project_member(project_id)
    and (
      public.has_feature(project_id, 'expenses', 'edit')
      or data ->> 'submittedByUserId' = (select auth.uid())::text
    )
    -- ...and you may not leave one in Committed either, which is what stops a
    -- reviewer promoting a record they have merely approved.
    and (
      coalesce(data ->> 'status', '') <> 'Committed'
      or public.has_project_role(project_id, array['admin','accounting']::public.project_role[])
    )
  );

-- Deleting a committed record has to follow the same rule, or the protection
-- is decorative: a reviewer who cannot edit a committed PO but can delete it
-- outright has a bigger hammer, not a smaller one. Deleting one takes its
-- money back out of the budget while its paperwork stays filed in Dropbox.

drop policy if exists purchases_delete on public.purchases;

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
    and (
      coalesce(data ->> 'status', '') <> 'Committed'
      or public.has_project_role(project_id, array['admin','accounting']::public.project_role[])
    )
  );
