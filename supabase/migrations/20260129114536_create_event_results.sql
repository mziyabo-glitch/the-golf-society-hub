create table if not exists public.event_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  member_id uuid not null,
  points int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, member_id)
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_event_results_updated_at on public.event_results;
create trigger trg_event_results_updated_at
before update on public.event_results
for each row
execute function public.set_updated_at();

alter table public.event_results enable row level security;

drop policy if exists "event_results_read" on public.event_results;
create policy "event_results_read"
on public.event_results for select
to authenticated
using (true);

drop policy if exists "event_results_insert" on public.event_results;
create policy "event_results_insert"
on public.event_results for insert
to authenticated
with check (true);

drop policy if exists "event_results_update" on public.event_results;
create policy "event_results_update"
on public.event_results for update
to authenticated
using (true);
