-- Create the credit_cards and petty_cash section tables.
--
-- The app has been writing to both since the Credit Cards and Petty Cash
-- features shipped (see sections.js SECTION_MAP), but neither table was ever
-- created. Every sync path swallows the resulting error into a console.warn
-- (sections.js saveSectionToCloud / loadSectionFromCloud /
-- syncAllSectionsFromCloud), so the failure has been silent: card and
-- envelope data has only ever existed in each browser's localStorage. It does
-- not sync between devices and is not backed up.
--
-- Shape and policy deliberately match the existing section tables (vendors,
-- schedules, etc.) exactly: one row per project, a jsonb blob, and an
-- owner_all policy resolving through projects.owner_id. That predicate is
-- rewritten to be membership-based in a later migration — these two are
-- created in the current style so there is exactly one pattern to change,
-- rather than two.

create table if not exists public.credit_cards (
  project_id uuid not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.petty_cash (
  project_id uuid not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now()
);

-- The client upserts on project_id (db.js saveSection), which requires a
-- unique constraint to resolve the conflict target. The existing section
-- tables use project_id as the primary key; match that.
alter table public.credit_cards
  add constraint credit_cards_pkey primary key (project_id);

alter table public.petty_cash
  add constraint petty_cash_pkey primary key (project_id);

alter table public.credit_cards
  add constraint credit_cards_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.petty_cash
  add constraint petty_cash_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.credit_cards enable row level security;
alter table public.petty_cash   enable row level security;

create policy owner_all on public.credit_cards
  using (exists (
    select 1 from public.projects
    where projects.id = credit_cards.project_id
      and projects.owner_id = auth.uid()
  ));

create policy owner_all on public.petty_cash
  using (exists (
    select 1 from public.projects
    where projects.id = petty_cash.project_id
      and projects.owner_id = auth.uid()
  ));
