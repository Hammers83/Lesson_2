-- MIGRAZIONE SUPABASE: sistema notifiche
-- Eseguire una sola volta nel SQL Editor del progetto Supabase.
-- Non modifica la logica delle prenotazioni né il controllo del certificato.

create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null,
    message text not null,
    type text not null default 'info',
    is_read boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
    on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'notifications'
          and policyname = 'notifications_select_own'
    ) then
        create policy notifications_select_own
            on public.notifications for select
            to authenticated
            using (auth.uid() = user_id);
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'notifications'
          and policyname = 'notifications_insert_own'
    ) then
        create policy notifications_insert_own
            on public.notifications for insert
            to authenticated
            with check (auth.uid() = user_id);
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'notifications'
          and policyname = 'notifications_update_own'
    ) then
        create policy notifications_update_own
            on public.notifications for update
            to authenticated
            using (auth.uid() = user_id)
            with check (auth.uid() = user_id);
    end if;
end $$;

-- Abilita il realtime sulla tabella solo se non è già presente nella publication.
do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'notifications'
    ) then
        alter publication supabase_realtime add table public.notifications;
    end if;
end $$;
