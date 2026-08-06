-- Create the storage bucket receipts are actually stored in.
--
-- db.js has uploaded receipts to a bucket named "tempdocs" since the receipt
-- pipeline shipped. That bucket was never created, so every upload failed with
-- "Bucket not found" — and because uploadDraftReceipt swallows the error and
-- returns null, every draft was saved with receiptUrl: null and nobody was
-- told. The same silent-failure shape as the missing credit_cards table.
--
-- ── Why the path convention changes ──
-- The old path was {user_id}/{project_id}/{purchase_id}.pdf, which scopes a
-- receipt to the person who uploaded it. That cannot support the review
-- workflow: an approver has to read a receipt somebody else submitted. Since
-- the bucket never existed there are no objects to migrate, so the convention
-- is corrected now, to {project_id}/{purchase_id}.pdf — access follows project
-- membership, exactly like every other table.
--
-- The bucket is private. Reads go through the authenticated client, which is
-- subject to the policies below.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- A malformed object name would make `(storage.foldername(name))[1]::uuid`
-- raise inside a policy, and an error in a policy aborts the whole query
-- rather than just denying the row. Parse defensively instead: an unparseable
-- prefix yields null, is_project_member(null) is false, and the row is denied.
create or replace function public.try_uuid(t text)
returns uuid
language plpgsql
immutable
as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function public.try_uuid(text) to authenticated;

-- One policy per operation. Membership in the project named by the first path
-- segment is the whole test.
create policy "receipts: members can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_project_member(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "receipts: members can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.is_project_member(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "receipts: members can replace"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_project_member(public.try_uuid((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'receipts'
    and public.is_project_member(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "receipts: members can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_project_member(public.try_uuid((storage.foldername(name))[1]))
  );
