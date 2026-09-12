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

-- ===========================================================================
-- SUBSCRIPTIONS
--
-- One plan, everything included. Access is decided here rather than in the
-- browser: a client-side check is a suggestion, since anyone can edit what runs
-- in their own tab. These policies are the actual gate.
--
-- The rule is deliberately asymmetric. Writing needs an active subscription;
-- reading never does. Someone whose card fails can still open their journal and
-- export every trade they ever wrote. Holding a trader's own record hostage is
-- both wrong and, where they have a right to their data, a problem.
-- ===========================================================================

create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text,
  stripe_customer_id   text unique,
  subscription_status  text not null default 'none',
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at           timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user reads their own row and nothing else. Nobody writes it from the
-- browser; only the Stripe webhook does, using the service role key.
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);

-- Give every new sign-up a profile, so the app always has a row to read.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed up before this existed.
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
on conflict (id) do nothing;

create or replace function public.has_active_subscription()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.subscription_status in ('active', 'trialing')
  );
$$;

-- ---------------------------------------------------------------------------
-- Re-declare the journal policies with writing gated on the subscription.
-- Reading is left exactly as it was.
-- ---------------------------------------------------------------------------
drop policy if exists "own rows: insert" on public.journal_kv;
drop policy if exists "own rows: update" on public.journal_kv;
drop policy if exists "own rows: delete" on public.journal_kv;

create policy "own rows: insert" on public.journal_kv
  for insert with check (auth.uid() = user_id and public.has_active_subscription());
create policy "own rows: update" on public.journal_kv
  for update using (auth.uid() = user_id and public.has_active_subscription())
           with check (auth.uid() = user_id and public.has_active_subscription());
-- Deleting your own row stays open: a lapsed subscriber may still want their
-- data gone, and blocking that would be the wrong side of the argument.
create policy "own rows: delete" on public.journal_kv
  for delete using (auth.uid() = user_id);

drop policy if exists "screenshots: insert own" on storage.objects;
drop policy if exists "screenshots: update own" on storage.objects;

create policy "screenshots: insert own" on storage.objects
  for insert with check (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_subscription()
  );
create policy "screenshots: update own" on storage.objects
  for update using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_subscription()
  );
