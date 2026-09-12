-- Odyssey Journal — Supabase schema
-- Run this once in the SQL editor of your Supabase project.
--
-- The journal stores everything as key/value records, which keeps the client
-- simple and means new features need no migration. Row level security is what
-- makes that safe: a signed-in user can only ever touch their own rows.

create table if not exists public.journal_kv (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  k          text        not null,
  v          text,
  updated_at timestamptz not null default now(),
  primary key (user_id, k)
);

alter table public.journal_kv enable row level security;

-- One policy per verb, all scoped to the row's owner. Without these the anon
-- key would expose every user's journal.
drop policy if exists "own rows: read"   on public.journal_kv;
drop policy if exists "own rows: insert" on public.journal_kv;
drop policy if exists "own rows: update" on public.journal_kv;
drop policy if exists "own rows: delete" on public.journal_kv;

create policy "own rows: read"   on public.journal_kv for select using (auth.uid() = user_id);
create policy "own rows: insert" on public.journal_kv for insert with check (auth.uid() = user_id);
create policy "own rows: update" on public.journal_kv for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows: delete" on public.journal_kv for delete using (auth.uid() = user_id);

-- Listing a user's own keys is a common read; this keeps it cheap as the
-- journal grows.
create index if not exists journal_kv_user_idx on public.journal_kv (user_id);
