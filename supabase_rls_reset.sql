-- supabase_rls_reset.sql
-- Run in Supabase SQL Editor (project database)

-- =====================================================
-- Helper functions (SECURITY DEFINER, no recursion)
-- =====================================================

create or replace function public.is_member_of_society(p_society_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    where m.society_id = p_society_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_role(p_society_id uuid, p_roles text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    where m.society_id = p_society_id
      and m.user_id = auth.uid()
      and m.role = any(p_roles)
  );
$$;

grant execute on function public.is_member_of_society(uuid) to authenticated;
grant execute on function public.has_role(uuid, text[]) to authenticated;

-- =====================================================
-- Schema defaults and required columns
-- =====================================================

-- profiles
alter table public.profiles
  add column if not exists id uuid;

alter table public.profiles
  add column if not exists created_at timestamptz not null default now();

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  add column if not exists active_society_id uuid null;

alter table public.profiles
  add column if not exists active_member_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_pkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_pkey primary key (id);
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- members
alter table public.members
  add column if not exists paid boolean not null default false;

alter table public.members
  add column if not exists amount_paid_pence integer not null default 0;

alter table public.members
  add column if not exists created_at timestamptz not null default now();

alter table public.members
  add column if not exists display_name text;

alter table public.members
  add column if not exists paid_at timestamptz null;

-- societies
alter table public.societies
  add column if not exists created_at timestamptz not null default now();

alter table public.societies
  add column if not exists join_code text;

create or replace function public.generate_join_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
  idx int;
begin
  for i in 1..6 loop
    idx := floor(random() * length(chars) + 1);
    code := code || substr(chars, idx, 1);
  end loop;
  return code;
end;
$$;

alter table public.societies
  alter column join_code set default public.generate_join_code();

create unique index if not exists societies_join_code_key on public.societies(join_code);

-- =====================================================
-- RPC helpers for admin member actions
-- =====================================================

create or replace function public.admin_add_member(
  p_society_id uuid,
  p_user_id uuid,
  p_name text,
  p_display_name text,
  p_email text,
  p_role text
)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.members;
begin
  if not public.has_role(p_society_id, array['captain','treasurer']) then
    raise exception 'Not authorized';
  end if;

  insert into public.members (society_id, user_id, name, display_name, email, role)
  values (p_society_id, p_user_id, p_name, p_display_name, p_email, coalesce(p_role, 'member'))
  returning * into result;

  return result;
end;
$$;

create or replace function public.admin_update_member(
  p_member_id uuid,
  p_updates jsonb
)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_society_id uuid;
  result public.members;
begin
  select society_id into v_society_id
  from public.members
  where id = p_member_id;

  if v_society_id is null then
    raise exception 'Member not found';
  end if;

  if not public.has_role(v_society_id, array['captain','treasurer']) then
    raise exception 'Not authorized';
  end if;

  update public.members
  set
    name = case when p_updates ? 'name' then p_updates->>'name' else name end,
    display_name = case when p_updates ? 'display_name' then p_updates->>'display_name' else display_name end,
    email = case when p_updates ? 'email' then p_updates->>'email' else email end,
    role = case when p_updates ? 'role' then p_updates->>'role' else role end,
    paid = case when p_updates ? 'paid' then (p_updates->>'paid')::boolean else paid end,
    paid_at = case when p_updates ? 'paid_at' then (p_updates->>'paid_at')::timestamptz else paid_at end,
    amount_paid_pence = case when p_updates ? 'amount_paid_pence' then (p_updates->>'amount_paid_pence')::integer else amount_paid_pence end,
    handicap = case when p_updates ? 'handicap' then (p_updates->>'handicap')::numeric else handicap end,
    sex = case when p_updates ? 'sex' then p_updates->>'sex' else sex end,
    status = case when p_updates ? 'status' then p_updates->>'status' else status end,
    updated_at = now()
  where id = p_member_id
  returning * into result;

  return result;
end;
$$;

create or replace function public.admin_delete_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_society_id uuid;
begin
  select society_id into v_society_id
  from public.members
  where id = p_member_id;

  if v_society_id is null then
    raise exception 'Member not found';
  end if;

  if not public.has_role(v_society_id, array['captain','treasurer']) then
    raise exception 'Not authorized';
  end if;

  delete from public.members where id = p_member_id;
end;
$$;

grant execute on function public.admin_add_member(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_update_member(uuid, jsonb) to authenticated;
grant execute on function public.admin_delete_member(uuid) to authenticated;

-- =====================================================
-- RPC helper for join-by-code (keeps societies SELECT strict)
-- =====================================================

create or replace function public.get_society_by_code(p_join_code text)
returns public.societies
language sql
security definer
set search_path = public
as $$
  select *
  from public.societies
  where join_code = upper(trim(p_join_code))
  limit 1;
$$;

grant execute on function public.get_society_by_code(text) to authenticated;

-- =====================================================
-- Enable RLS
-- =====================================================

alter table public.societies enable row level security;
alter table public.members enable row level security;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_payments enable row level security;
alter table public.event_expenses enable row level security;

-- =====================================================
-- Societies policies
-- =====================================================

drop policy if exists societies_select_member on public.societies;
drop policy if exists societies_insert_creator on public.societies;
drop policy if exists societies_update_roles on public.societies;

create policy societies_select_member
  on public.societies
  for select
  to authenticated
  using (public.is_member_of_society(id));

create policy societies_insert_creator
  on public.societies
  for insert
  to authenticated
  with check (created_by = auth.uid());

create policy societies_update_roles
  on public.societies
  for update
  to authenticated
  using (public.has_role(id, array['captain','treasurer','secretary']))
  with check (public.has_role(id, array['captain','treasurer','secretary']));

-- =====================================================
-- Profiles policies
-- =====================================================

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- =====================================================
-- Members policies (no recursion)
-- =====================================================

drop policy if exists members_select_society on public.members;
drop policy if exists members_insert_self on public.members;
drop policy if exists members_update_self on public.members;

create policy members_select_society
  on public.members
  for select
  to authenticated
  using (public.is_member_of_society(society_id));

create policy members_insert_self
  on public.members
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy members_update_self
  on public.members
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================
-- Events policies
-- =====================================================

drop policy if exists events_select_society on public.events;
drop policy if exists events_insert_roles on public.events;
drop policy if exists events_update_roles on public.events;
drop policy if exists events_delete_roles on public.events;

create policy events_select_society
  on public.events
  for select
  to authenticated
  using (public.is_member_of_society(society_id));

create policy events_insert_roles
  on public.events
  for insert
  to authenticated
  with check (public.has_role(society_id, array['captain','secretary','handicapper']));

create policy events_update_roles
  on public.events
  for update
  to authenticated
  using (public.has_role(society_id, array['captain','secretary','handicapper']))
  with check (public.has_role(society_id, array['captain','secretary','handicapper']));

create policy events_delete_roles
  on public.events
  for delete
  to authenticated
  using (public.has_role(society_id, array['captain']));

-- =====================================================
-- Event payments policies
-- =====================================================

drop policy if exists event_payments_select_society on public.event_payments;
drop policy if exists event_payments_insert_roles on public.event_payments;
drop policy if exists event_payments_update_roles on public.event_payments;
drop policy if exists event_payments_delete_roles on public.event_payments;

create policy event_payments_select_society
  on public.event_payments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_payments.event_id
        and public.is_member_of_society(e.society_id)
    )
  );

create policy event_payments_insert_roles
  on public.event_payments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_payments.event_id
        and public.has_role(e.society_id, array['captain','treasurer'])
    )
  );

create policy event_payments_update_roles
  on public.event_payments
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_payments.event_id
        and public.has_role(e.society_id, array['captain','treasurer'])
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_payments.event_id
        and public.has_role(e.society_id, array['captain','treasurer'])
    )
  );

create policy event_payments_delete_roles
  on public.event_payments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_payments.event_id
        and public.has_role(e.society_id, array['captain','treasurer'])
    )
  );

-- =====================================================
-- Event expenses policies
-- =====================================================

drop policy if exists event_expenses_select_society on public.event_expenses;
drop policy if exists event_expenses_insert_roles on public.event_expenses;
drop policy if exists event_expenses_update_roles on public.event_expenses;
drop policy if exists event_expenses_delete_roles on public.event_expenses;

create policy event_expenses_select_society
  on public.event_expenses
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_expenses.event_id
        and public.is_member_of_society(e.society_id)
    )
  );

create policy event_expenses_insert_roles
  on public.event_expenses
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_expenses.event_id
        and public.has_role(e.society_id, array['captain','treasurer'])
    )
  );

create policy event_expenses_update_roles
  on public.event_expenses
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_expenses.event_id
        and public.has_role(e.society_id, array['captain','treasurer'])
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_expenses.event_id
        and public.has_role(e.society_id, array['captain','treasurer'])
    )
  );

create policy event_expenses_delete_roles
  on public.event_expenses
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_expenses.event_id
        and public.has_role(e.society_id, array['captain','treasurer'])
    )
  );
