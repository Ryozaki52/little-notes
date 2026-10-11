alter table public.notes
    add column if not exists calendar_date date;

create index if not exists notes_user_calendar_date_idx
    on public.notes (user_id, calendar_date)
    where calendar_date is not null;
