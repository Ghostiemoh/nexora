-- Nexora dataset sync: a private bucket for dataset blobs the server cannot read.
--
-- Phase 1 kept datasets on the device that imported them. This is Phase 2, and it
-- changes what the product promises: rows now leave the machine. They leave
-- compressed, then sealed with the account data key, so what lands here is bytes
-- the server has no means to interpret — but "we cannot read it" is a different
-- claim from "it never left", and the copy in the app says the former now.
--
-- Datasets do not go in `sync_records`. That table caps ciphertext at 1 MB, which
-- is the right ceiling for a recipe and useless for a workbook. A row in
-- sync_records still points at each blob, so the merge engine, the revision
-- trigger and the tombstones all keep working unchanged; only the bytes moved.

-- Re-runnable, for the same reason 0001 is: Postgres has no
-- CREATE POLICY IF NOT EXISTS, so each policy is dropped first.

-- ── the bucket ───────────────────────────────────────────────────────────────
-- Private. A public bucket would serve these blobs to anyone holding the URL,
-- and while they are encrypted, handing out ciphertext for offline attack is not
-- a thing to do by accident.
--
-- The ceiling is 50 MiB against a 25 MB upload limit in the app. Parsed rows are
-- JSON objects that repeat every column name on every row, so the serialized form
-- runs well past the original file; compression before sealing pulls it back
-- under, and the headroom covers the case where it does not.

insert into storage.buckets (id, name, public, file_size_limit)
values ('datasets', 'datasets', false, 52428800)
on conflict (id) do update
  set public = false,
      file_size_limit = 52428800;

-- ── who may touch a blob ─────────────────────────────────────────────────────
-- Every object is stored under `<user id>/<blinded dataset id>`, so ownership is
-- decided by the first path segment rather than by a column someone could forge.
-- `storage.foldername(name)` splits the path; element 1 is that segment.
--
-- `(select auth.uid())` rather than a bare `auth.uid()`: the subselect is
-- evaluated once per statement instead of once per row, which matters when a
-- device lists a few hundred objects.

drop policy if exists "dataset blobs are readable only by their owner" on storage.objects;
create policy "dataset blobs are readable only by their owner"
  on storage.objects for select
  using (
    bucket_id = 'datasets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "dataset blobs are writable only by their owner" on storage.objects;
create policy "dataset blobs are writable only by their owner"
  on storage.objects for insert
  with check (
    bucket_id = 'datasets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "dataset blobs are updatable only by their owner" on storage.objects;
create policy "dataset blobs are updatable only by their owner"
  on storage.objects for update
  using (
    bucket_id = 'datasets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'datasets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "dataset blobs are deletable only by their owner" on storage.objects;
create policy "dataset blobs are deletable only by their owner"
  on storage.objects for delete
  using (
    bucket_id = 'datasets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
