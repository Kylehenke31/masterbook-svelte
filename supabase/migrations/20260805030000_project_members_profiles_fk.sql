-- Let PostgREST embed a member's profile.
--
-- project_members.user_id references auth.users(id), which is correct but not
-- something PostgREST can traverse: auth.users is outside the exposed schema.
-- Selecting `project_members(user_id, role, profiles(display_name, email))`
-- therefore fails with PGRST200 "Could not find a relationship between
-- 'project_members' and 'profiles'", and the client silently falls back to an
-- empty member list — which reads exactly like "this project has no members".
--
-- Adding a second foreign key to profiles gives PostgREST the relationship it
-- needs. Both constraints stay: auth.users remains the identity of record, and
-- profiles is the client-visible projection of it.
--
-- This is safe with respect to ordering. profiles is populated for every
-- existing user by the backfill in 20260805020000, and the on_auth_user_created
-- trigger creates a profile at sign-up — so a profile always exists before
-- anyone can be added to a project.

alter table public.project_members
  add constraint project_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
