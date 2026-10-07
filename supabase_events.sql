-- MIGRAZIONE SUPABASE: eventi organizzati completi
-- Eseguire nel SQL Editor Supabase dopo la versione precedente.

create table if not exists public.events (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    datetime timestamptz not null,
    location text,
    address text,
    capacity integer not null default 20 check (capacity > 0),
    price numeric(10,2) not null default 0 check (price >= 0),
    registration_deadline timestamptz,
    status text not null default 'open' check (status in ('draft','open','closed','cancelled')),
    cover_url text,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.events add column if not exists address text;
alter table public.events add column if not exists price numeric(10,2) not null default 0;
alter table public.events add column if not exists registration_deadline timestamptz;
alter table public.events add column if not exists status text not null default 'open';
alter table public.events add column if not exists cover_url text;
alter table public.events add column if not exists updated_at timestamptz not null default now();

update public.events
set status = 'open'
where status is null or status not in ('draft','open','closed','cancelled');

alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
    check (status in ('draft','open','closed','cancelled'));

create table if not exists public.event_bookings (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint event_bookings_unique unique (event_id, user_id)
);

create index if not exists events_datetime_idx on public.events (datetime);
create index if not exists events_status_datetime_idx on public.events (status, datetime);
create index if not exists event_bookings_event_idx on public.event_bookings (event_id);
create index if not exists event_bookings_user_idx on public.event_bookings (user_id);

alter table public.events enable row level security;
alter table public.event_bookings enable row level security;

drop policy if exists events_select_authenticated on public.events;
create policy events_select_authenticated on public.events
for select to authenticated using (true);

drop policy if exists events_insert_admin on public.events;
create policy events_insert_admin on public.events
for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

drop policy if exists events_update_admin on public.events;
create policy events_update_admin on public.events
for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

drop policy if exists events_delete_admin on public.events;
create policy events_delete_admin on public.events
for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

drop policy if exists event_bookings_select_authenticated on public.event_bookings;
create policy event_bookings_select_authenticated on public.event_bookings
for select to authenticated
using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);

-- Le iscrizioni vengono create tramite RPC atomica, così la capienza
-- non può essere superata da due iscrizioni simultanee.
drop policy if exists event_bookings_insert_own on public.event_bookings;

drop function if exists public.book_event(uuid);
create or replace function public.book_event(p_event_id uuid)
returns public.event_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
    v_event public.events%rowtype;
    v_booking public.event_bookings%rowtype;
    v_user_id uuid := auth.uid();
    v_count integer;
begin
    if v_user_id is null then
        raise exception 'Utente non autenticato';
    end if;

    if not exists (
        select 1 from public.profiles
        where id = v_user_id and is_admin = false
    ) then
        raise exception 'Solo le allieve possono iscriversi agli eventi';
    end if;

    select * into v_event
    from public.events
    where id = p_event_id
    for update;

    if not found then
        raise exception 'Evento non trovato';
    end if;

    if v_event.status <> 'open' then
        raise exception 'Le iscrizioni per questo evento non sono aperte';
    end if;

    if v_event.registration_deadline is not null
       and now() > v_event.registration_deadline then
        raise exception 'Il termine per le iscrizioni è scaduto';
    end if;

    select * into v_booking
    from public.event_bookings
    where event_id = p_event_id and user_id = v_user_id;

    if found then
        return v_booking;
    end if;

    select count(*) into v_count
    from public.event_bookings
    where event_id = p_event_id;

    if v_count >= v_event.capacity then
        raise exception 'Evento al completo';
    end if;

    insert into public.event_bookings(event_id, user_id)
    values (p_event_id, v_user_id)
    returning * into v_booking;

    return v_booking;
end;
$$;

revoke all on function public.book_event(uuid) from public;
grant execute on function public.book_event(uuid) to authenticated;

drop policy if exists event_bookings_delete_own on public.event_bookings;
create policy event_bookings_delete_own on public.event_bookings
for delete to authenticated using (user_id = auth.uid());

-- Copertine evento: bucket pubblico, upload riservato all'istruttore.
insert into storage.buckets (id, name, public)
values ('event-covers', 'event-covers', true)
on conflict (id) do update set public = true;

drop policy if exists "Admins can upload event covers" on storage.objects;
create policy "Admins can upload event covers"
on storage.objects for insert to authenticated
with check (
    bucket_id = 'event-covers'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);

drop policy if exists "Admins can update event covers" on storage.objects;
create policy "Admins can update event covers"
on storage.objects for update to authenticated
using (
    bucket_id = 'event-covers'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
)
with check (
    bucket_id = 'event-covers'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);

drop policy if exists "Admins can delete event covers" on storage.objects;
create policy "Admins can delete event covers"
on storage.objects for delete to authenticated
using (
    bucket_id = 'event-covers'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);

-- Admin: notifica in modo sicuro tutte le allieve già iscritte.
drop function if exists public.notify_event_attendees(uuid,text,text,text);
create or replace function public.notify_event_attendees(
    p_event_id uuid,
    p_title text,
    p_message text,
    p_type text default 'info'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and is_admin = true
    ) then
        raise exception 'Solo l''istruttore può inviare notifiche evento';
    end if;

    insert into public.notifications(user_id, title, message, type, is_read)
    select eb.user_id, p_title, p_message, p_type, false
    from public.event_bookings eb
    where eb.event_id = p_event_id;

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

revoke all on function public.notify_event_attendees(uuid,text,text,text) from public;
grant execute on function public.notify_event_attendees(uuid,text,text,text) to authenticated;

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
    ) then
        alter publication supabase_realtime add table public.events;
    end if;
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_bookings'
    ) then
        alter publication supabase_realtime add table public.event_bookings;
    end if;
end $$;


-- Partecipanti visibili alle allieve per favorire l'organizzazione condivisa
-- del viaggio verso lezioni ed eventi. Nessun recapito viene esposto.
drop function if exists public.get_lesson_participants(uuid[]);
create or replace function public.get_lesson_participants(p_lesson_ids uuid[])
returns table (
    lesson_id uuid,
    user_id uuid,
    nome text,
    cognome text
)
language sql
security definer
set search_path = public
as $$
    select b.lesson_id, p.id, p.nome, p.cognome
    from public.bookings b
    join public.profiles p on p.id = b.user_id
    where b.lesson_id = any(p_lesson_ids)
      and p.is_admin = false
      and auth.uid() is not null;
$$;

drop function if exists public.get_event_participants(uuid[]);
create or replace function public.get_event_participants(p_event_ids uuid[])
returns table (
    event_id uuid,
    user_id uuid,
    nome text,
    cognome text
)
language sql
security definer
set search_path = public
as $$
    select eb.event_id, p.id, p.nome, p.cognome
    from public.event_bookings eb
    join public.profiles p on p.id = eb.user_id
    where eb.event_id = any(p_event_ids)
      and p.is_admin = false
      and auth.uid() is not null;
$$;

revoke all on function public.get_lesson_participants(uuid[]) from public;
grant execute on function public.get_lesson_participants(uuid[]) to authenticated;

revoke all on function public.get_event_participants(uuid[]) from public;
grant execute on function public.get_event_participants(uuid[]) to authenticated;
