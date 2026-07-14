create extension if not exists "uuid-ossp";

create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  app_code text unique not null,
  name text not null,
  department text not null,
  division text not null,
  dev_assignee text not null,
  owner text not null,
  status text not null check (status in ('Planning', 'In Progress', 'UAT', 'Blocked', 'Live')),
  priority text not null check (priority in ('Low', 'Medium', 'High', 'Critical')),
  start_date date not null,
  due_date date not null,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  environment text not null default 'Development',
  created_at timestamptz not null default now()
);

create table if not exists public.test_cases (
  id uuid primary key default uuid_generate_v4(),
  case_code text unique not null,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  module text not null,
  tester text not null,
  status text not null check (status in ('Not Started', 'Passed', 'Failed', 'Blocked')),
  last_run date,
  defects integer not null default 0 check (defects >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.app_data (
  data_key text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;
alter table public.test_cases enable row level security;
alter table public.app_data enable row level security;

create policy "Authenticated users can read projects"
  on public.projects for select
  to authenticated
  using (true);

create policy "Authenticated users can manage projects"
  on public.projects for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can read test cases"
  on public.test_cases for select
  to authenticated
  using (true);

create policy "Authenticated users can manage test cases"
  on public.test_cases for all
  to authenticated
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_data'
      and policyname = 'Public users can read shared app data'
  ) then
    create policy "Public users can read shared app data"
      on public.app_data for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_data'
      and policyname = 'Public users can update shared app data'
  ) then
    create policy "Public users can update shared app data"
      on public.app_data for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_data'
  ) then
    alter publication supabase_realtime add table public.app_data;
  end if;
end
$$;
