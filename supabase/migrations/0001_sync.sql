-- Nexora cross-device sync: storage for ciphertext the server cannot read.
--
-- Two tables, both locked to their owner by row level security. Neither holds a
-- key, a column name, a cell value, or the name of the thing a row points at.
-- The record id is an HMAC computed under a key derived from the account data
-- key, so it is stable across a user's devices and opaque to everyone else,
-- including us.

-- ── the vault ────────────────────────────────────────────────────────────────
-- One random data key per account, stored only in wrapped form: once per
-- credential (password, passphrase, each recovery code). Every entry is an
-- AES-GCM blob whose unwrapping key is derived on the device and never sent, so
-- this table is inert without something the user supplies.

create table if not exists public.sync_vault (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  wrapped_keys jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.sync_vault enable row level security;

create policy "vault is readable only by its owner"
  on public.sync_vault for select
  using (auth.uid() = user_id);

create policy "vault is writable only by its owner"
  on public.sync_vault for insert
  with check (auth.uid() = user_id);

create policy "vault is updatable only by its owner"
  on public.sync_vault for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "vault is deletable only by its owner"
  on public.sync_vault for delete
  using (auth.uid() = user_id);

-- ── the records ──────────────────────────────────────────────────────────────
-- `revision` is monotonic per row and assigned here, by the database, because
-- the sync engine deliberately does not compare two devices' clocks: a laptop
-- running four minutes fast would win every race it should lose.
--
-- `content_updated_at` is the writing device's own epoch milliseconds and is
-- used only to break a genuine conflict. It is kept separate from `updated_at`,
-- which is this server's clock, so the two are never accidentally compared.

create table if not exists public.sync_records (
  user_id            uuid not null references auth.users (id) on delete cascade,
  record_id          text not null,
  revision           bigint not null default 1,
  iv                 text not null,
  ciphertext         text not null,
  content_updated_at bigint not null,
  deleted            boolean not null default false,
  updated_at         timestamptz not null default now(),
  primary key (user_id, record_id)
);

create index if not exists sync_records_user_revision_idx
  on public.sync_records (user_id, revision);

alter table public.sync_records enable row level security;

create policy "records are readable only by their owner"
  on public.sync_records for select
  using (auth.uid() = user_id);

create policy "records are writable only by their owner"
  on public.sync_records for insert
  with check (auth.uid() = user_id);

create policy "records are updatable only by their owner"
  on public.sync_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "records are deletable only by their owner"
  on public.sync_records for delete
  using (auth.uid() = user_id);

-- ── revision bookkeeping ─────────────────────────────────────────────────────
-- The client never sets `revision`. It is bumped here so that "has anyone else
-- changed this since I last looked" has an answer that does not depend on any
-- device being honest about the time.

create or replace function public.bump_sync_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.revision   := coalesce(old.revision, 0) + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sync_records_bump on public.sync_records;
create trigger sync_records_bump
  before insert or update on public.sync_records
  for each row execute function public.bump_sync_revision();

-- A size ceiling, so a bug on one device cannot run up an unbounded bill. Phase
-- 1 payloads are recipes and a roster, measured in kilobytes.
alter table public.sync_records
  drop constraint if exists sync_records_ciphertext_size;
alter table public.sync_records
  add constraint sync_records_ciphertext_size
  check (octet_length(ciphertext) <= 1048576);
