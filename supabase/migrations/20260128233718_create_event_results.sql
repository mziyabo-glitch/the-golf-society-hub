-- Create event_results to store points per member per event
create table if not exists public.event_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  member_id uuid not null,
  points int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_results_event_member_unique unique (event_id, member_id)
);

-- Optional indexes (helps queries)
create index if not exists event_results_event_id_idx on public.event_results (event_id);
create index if not exists event_results_member_id_idx on public.event_results (member_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_event_results_updated_at on public.event_results;
create trigger set_event_results_updated_at
before update on public.event_results
for each row execute procedure public.set_updated_at();
