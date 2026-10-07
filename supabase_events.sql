-- Eventi organizzati
create table if not exists public.events (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    datetime timestamptz not null,
    location text,
    capacity integer not null default 20 check (capacity > 0),
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.event_bookings (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint event_bookings_unique unique (event_id, user_id)
);

create index if not exists events_datetime_idx on public.events (datetime);
create index if not exists event_bookings_event_idx on public.event_bookings (event_id);
create index if not exists event_bookings_user_idx on public.event_bookings (user_id);

alter table public.events enable row level security;
alter table public.event_bookings enable row level security;

drop policy if exists events_select_authenticated on public.events;
create policy events_select_authenticated
on public.events for select
to authenticated
using (true);

drop policy if exists events_insert_admin on public.events;
create policy events_insert_admin
on public.events for insert
to authenticated
with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);

drop policy if exists events_update_admin on public.events;
create policy events_update_admin
on public.events for update
to authenticated
using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
)
with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);

drop policy if exists events_delete_admin on public.events;
create policy events_delete_admin
on public.events for delete
to authenticated
using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);

drop policy if exists event_bookings_select_authenticated on public.event_bookings;
create policy event_bookings_select_authenticated
on public.event_bookings for select
to authenticated
using (true);

drop policy if exists event_bookings_insert_own on public.event_bookings;
create policy event_bookings_insert_own
on public.event_bookings for insert
to authenticated
with check (
    user_id = auth.uid()
    and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.is_admin = false
    )
);

drop policy if exists event_bookings_delete_own on public.event_bookings;
create policy event_bookings_delete_own
on public.event_bookings for delete
to authenticated
using (user_id = auth.uid());

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'events'
    ) then
        alter publication supabase_realtime add table public.events;
    end if;
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'event_bookings'
    ) then
        alter publication supabase_realtime add table public.event_bookings;
    end if;
end $$;
