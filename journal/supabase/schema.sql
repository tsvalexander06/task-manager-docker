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

-- ---------------------------------------------------------------------------
-- Screenshots
--
-- Chart captures are the bulk of a journal by size, so they live in Storage
-- rather than in journal_kv. Each user gets a folder named after their id, and
-- the policies below are what confine them to it: the first path segment must
-- equal the caller's uid.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do nothing;

drop policy if exists "screenshots: read own"   on storage.objects;
drop policy if exists "screenshots: insert own" on storage.objects;
drop policy if exists "screenshots: update own" on storage.objects;
drop policy if exists "screenshots: delete own" on storage.objects;

create policy "screenshots: read own" on storage.objects
  for select using (
    bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "screenshots: insert own" on storage.objects
  for insert with check (
    bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "screenshots: update own" on storage.objects
  for update using (
    bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "screenshots: delete own" on storage.objects
  for delete using (
    bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- The bucket is private, so the app hands out short-lived signed URLs. Nothing
-- is readable by guessing a path.
