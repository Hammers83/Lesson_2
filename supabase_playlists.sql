-- Playlist delle lezioni
-- Eseguire una sola volta nel SQL Editor di Supabase.

create table if not exists public.lesson_playlists (
    id uuid primary key default gen_random_uuid(),
    lesson_id uuid not null references public.lessons(id) on delete cascade,
    title text not null,
    file_path text not null,
    file_name text not null,
    file_type text,
    file_url text,
    uploaded_by uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.lesson_playlists enable row level security;

drop policy if exists "Authenticated users can view lesson playlists" on public.lesson_playlists;
drop policy if exists "Admins can insert lesson playlists" on public.lesson_playlists;
drop policy if exists "Admins can delete lesson playlists" on public.lesson_playlists;

create policy "Authenticated users can view lesson playlists"
on public.lesson_playlists for select
to authenticated
using (true);

create policy "Admins can insert lesson playlists"
on public.lesson_playlists for insert
to authenticated
with check (
    uploaded_by = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);

create policy "Admins can delete lesson playlists"
on public.lesson_playlists for delete
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- Bucket pubblico per poter riprodurre/scaricare facilmente i file.
insert into storage.buckets (id, name, public)
values ('playlists', 'playlists', true)
on conflict (id) do update set public = true;

drop policy if exists "Authenticated users can view playlist files" on storage.objects;
drop policy if exists "Admins can upload playlist files" on storage.objects;
drop policy if exists "Admins can delete playlist files" on storage.objects;

create policy "Authenticated users can view playlist files"
on storage.objects for select
to authenticated
using (bucket_id = 'playlists');

create policy "Admins can upload playlist files"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'playlists'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
    and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Admins can delete playlist files"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'playlists'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
    and (storage.foldername(name))[1] = auth.uid()::text
);
