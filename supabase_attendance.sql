-- MIGRAZIONE SUPABASE: registro presenze lezioni
-- Eseguire una sola volta nel SQL Editor del progetto Supabase.

create table if not exists public.attendance_records (
    id uuid primary key default gen_random_uuid(),
    lesson_id uuid not null references public.lessons(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete set null,
    guest_name text,
    status text not null default 'present' check (status in ('present', 'absent')),
    checked_by uuid not null references public.profiles(id) on delete restrict,
    checked_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint attendance_participant_check check (
        user_id is not null or nullif(trim(guest_name), '') is not null
    )
);

drop index if exists public.attendance_lesson_user_unique;

create unique index if not exists attendance_lesson_user_unique
    on public.attendance_records (lesson_id, user_id);

create index if not exists attendance_lesson_idx
    on public.attendance_records (lesson_id);

create index if not exists attendance_checked_at_idx
    on public.attendance_records (checked_at desc);

alter table public.attendance_records enable row level security;

drop policy if exists "Admins can view attendance" on public.attendance_records;
drop policy if exists "Admins can insert attendance" on public.attendance_records;
drop policy if exists "Admins can update attendance" on public.attendance_records;
drop policy if exists "Admins can delete attendance" on public.attendance_records;

create policy "Admins can view attendance"
on public.attendance_records for select
to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.is_admin = true
    )
);

create policy "Admins can insert attendance"
on public.attendance_records for insert
to authenticated
with check (
    checked_by = auth.uid()
    and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.is_admin = true
    )
);

create policy "Admins can update attendance"
on public.attendance_records for update
to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.is_admin = true
    )
)
with check (
    checked_by = auth.uid()
    and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.is_admin = true
    )
);

create policy "Admins can delete attendance"
on public.attendance_records for delete
to authenticated
using (
    exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.is_admin = true
    )
);
