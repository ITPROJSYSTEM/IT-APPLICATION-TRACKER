create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'app_code'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'project_code'
  ) then
    alter table public.projects rename column app_code to project_code;
  end if;
end
$$;

create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  project_code text unique not null,
  name text not null,
  department text not null,
  division text not null,
  dev_assignee text not null,
  owner text,
  status text not null,
  priority text not null default 'Medium',
  start_date date,
  due_date date,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  environment text not null default 'Development',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.projects add column if not exists project_code text;
alter table public.projects add column if not exists owner text;
alter table public.projects add column if not exists priority text not null default 'Medium';
alter table public.projects add column if not exists start_date date;
alter table public.projects add column if not exists due_date date;
alter table public.projects add column if not exists progress integer not null default 0;
alter table public.projects add column if not exists environment text not null default 'Development';
alter table public.projects add column if not exists updated_at timestamptz not null default now();
alter table public.projects add column if not exists deleted_at timestamptz;

create unique index if not exists projects_project_code_key on public.projects(project_code);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'test_cases'
      and column_name = 'case_code'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'test_cases'
      and column_name = 'test_case_code'
  ) then
    alter table public.test_cases rename column case_code to test_case_code;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'test_cases'
      and column_name = 'title'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'test_cases'
      and column_name = 'test_details'
  ) then
    alter table public.test_cases rename column title to test_details;
  end if;
end
$$;

create table if not exists public.test_cases (
  id uuid primary key default uuid_generate_v4(),
  record_key text unique not null,
  test_case_code text not null,
  project_id uuid references public.projects(id) on delete set null,
  project_name text not null,
  test_details text not null,
  tester text not null,
  qa_remarks text not null default '',
  developer_remarks text not null default '',
  status text not null,
  date_tested date,
  defects integer not null default 0 check (defects >= 0),
  attachment jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.test_cases add column if not exists record_key text;
alter table public.test_cases add column if not exists test_case_code text;
alter table public.test_cases add column if not exists project_name text;
alter table public.test_cases add column if not exists test_details text;
alter table public.test_cases add column if not exists qa_remarks text not null default '';
alter table public.test_cases add column if not exists developer_remarks text not null default '';
alter table public.test_cases add column if not exists date_tested date;
alter table public.test_cases add column if not exists attachment jsonb;
alter table public.test_cases add column if not exists updated_at timestamptz not null default now();
alter table public.test_cases add column if not exists deleted_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'test_cases'
      and column_name = 'module'
  ) then
    alter table public.test_cases alter column module drop not null;
  end if;
end
$$;

update public.test_cases
set record_key = coalesce(record_key, test_case_code, id::text),
    project_name = coalesce(project_name, ''),
    test_details = coalesce(test_details, module, '')
where record_key is null
   or project_name is null
   or test_details is null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.test_cases'::regclass
      and contype = 'c'
      and conname like '%status%'
  loop
    execute format('alter table public.test_cases drop constraint if exists %I', constraint_name);
  end loop;
end
$$;

create unique index if not exists test_cases_record_key_key on public.test_cases(record_key);
create index if not exists test_cases_project_id_idx on public.test_cases(project_id);
create index if not exists test_cases_deleted_at_idx on public.test_cases(deleted_at);

create table if not exists public.project_modifications (
  id uuid primary key default uuid_generate_v4(),
  record_key text unique not null,
  record_code text not null,
  project_id uuid references public.projects(id) on delete set null,
  project_name text not null,
  details text not null,
  developer_remarks text not null default '',
  status text not null,
  date_modified date,
  created_by text not null default '',
  attachment jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists project_modifications_project_id_idx on public.project_modifications(project_id);
create index if not exists project_modifications_deleted_at_idx on public.project_modifications(deleted_at);

create table if not exists public.task_calendar_activities (
  id uuid primary key default uuid_generate_v4(),
  activity_code text unique not null,
  activity_date date not null,
  details text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists task_calendar_activities_activity_date_idx on public.task_calendar_activities(activity_date);
create index if not exists task_calendar_activities_deleted_at_idx on public.task_calendar_activities(deleted_at);

create table if not exists public.attachments (
  id uuid primary key default uuid_generate_v4(),
  owner_table text not null,
  owner_key text not null,
  file_name text not null,
  file_type text not null default '',
  original_size integer not null default 0,
  stored_size integer not null default 0,
  data_url text not null,
  compressed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(owner_table, owner_key, file_name)
);

create index if not exists attachments_owner_idx on public.attachments(owner_table, owner_key);
create index if not exists attachments_deleted_at_idx on public.attachments(deleted_at);

create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  table_name text not null,
  record_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  changed_by text,
  changed_at timestamptz not null default now()
);

create index if not exists audit_logs_table_record_idx on public.audit_logs(table_name, record_id);
create index if not exists audit_logs_changed_at_idx on public.audit_logs(changed_at);

insert into public.projects (
  project_code,
  name,
  department,
  division,
  dev_assignee,
  owner,
  status,
  priority,
  start_date,
  due_date,
  progress,
  environment,
  deleted_at
)
select
  item ->> 'id',
  item ->> 'name',
  item ->> 'department',
  item ->> 'division',
  item ->> 'devAssignee',
  item ->> 'owner',
  item ->> 'status',
  coalesce(nullif(item ->> 'priority', ''), 'Medium'),
  case when item ->> 'startDate' ~ '^\d{4}-\d{2}-\d{2}$' then (item ->> 'startDate')::date else null end,
  case when item ->> 'dueDate' ~ '^\d{4}-\d{2}-\d{2}$' then (item ->> 'dueDate')::date else null end,
  case when item ->> 'progress' ~ '^\d+$' then (item ->> 'progress')::integer else 0 end,
  coalesce(nullif(item ->> 'environment', ''), 'Development'),
  null
from public.app_data
cross join lateral jsonb_array_elements(data) as item
where data_key = 'it-application-tracker-projects'
  and jsonb_typeof(data) = 'array'
  and nullif(item ->> 'id', '') is not null
on conflict (project_code) do update
set name = excluded.name,
    department = excluded.department,
    division = excluded.division,
    dev_assignee = excluded.dev_assignee,
    owner = excluded.owner,
    status = excluded.status,
    priority = excluded.priority,
    start_date = excluded.start_date,
    due_date = excluded.due_date,
    progress = excluded.progress,
    environment = excluded.environment,
    deleted_at = null;

insert into public.test_cases (
  record_key,
  test_case_code,
  project_id,
  project_name,
  test_details,
  tester,
  qa_remarks,
  developer_remarks,
  status,
  date_tested,
  defects,
  attachment,
  deleted_at
)
select
  coalesce(nullif(item ->> 'rowKey', ''), item ->> 'id'),
  item ->> 'id',
  projects.id,
  item ->> 'project',
  item ->> 'module',
  item ->> 'tester',
  coalesce(item ->> 'testerRemarks', ''),
  coalesce(item ->> 'devRemarks', ''),
  item ->> 'status',
  case when item ->> 'lastRun' ~ '^\d{4}-\d{2}-\d{2}$' then (item ->> 'lastRun')::date else null end,
  case when item ->> 'defects' ~ '^\d+$' then (item ->> 'defects')::integer else 0 end,
  case when jsonb_typeof(item -> 'attachment') = 'object' then item -> 'attachment' else null end,
  null
from public.app_data
cross join lateral jsonb_array_elements(data) as item
left join public.projects on projects.name = item ->> 'project'
where data_key = 'it-application-tracker-test-cases'
  and jsonb_typeof(data) = 'array'
  and nullif(item ->> 'id', '') is not null
on conflict (record_key) do update
set test_case_code = excluded.test_case_code,
    project_id = excluded.project_id,
    project_name = excluded.project_name,
    test_details = excluded.test_details,
    tester = excluded.tester,
    qa_remarks = excluded.qa_remarks,
    developer_remarks = excluded.developer_remarks,
    status = excluded.status,
    date_tested = excluded.date_tested,
    defects = excluded.defects,
    attachment = excluded.attachment,
    deleted_at = null;

insert into public.project_modifications (
  record_key,
  record_code,
  project_id,
  project_name,
  details,
  developer_remarks,
  status,
  date_modified,
  created_by,
  attachment,
  deleted_at
)
select
  coalesce(nullif(item ->> 'rowKey', ''), item ->> 'id'),
  item ->> 'id',
  projects.id,
  item ->> 'project',
  item ->> 'module',
  coalesce(item ->> 'devRemarks', ''),
  item ->> 'status',
  case when item ->> 'lastRun' ~ '^\d{4}-\d{2}-\d{2}$' then (item ->> 'lastRun')::date else null end,
  coalesce(item ->> 'tester', ''),
  case when jsonb_typeof(item -> 'attachment') = 'object' then item -> 'attachment' else null end,
  null
from public.app_data
cross join lateral jsonb_array_elements(data) as item
left join public.projects on projects.name = item ->> 'project'
where data_key = 'it-application-tracker-project-modification-records'
  and jsonb_typeof(data) = 'array'
  and nullif(item ->> 'id', '') is not null
on conflict (record_key) do update
set record_code = excluded.record_code,
    project_id = excluded.project_id,
    project_name = excluded.project_name,
    details = excluded.details,
    developer_remarks = excluded.developer_remarks,
    status = excluded.status,
    date_modified = excluded.date_modified,
    created_by = excluded.created_by,
    attachment = excluded.attachment,
    deleted_at = null;

insert into public.task_calendar_activities (
  activity_code,
  activity_date,
  details,
  deleted_at
)
select
  item ->> 'id',
  case when item ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$' then (item ->> 'date')::date else current_date end,
  item ->> 'details',
  null
from public.app_data
cross join lateral jsonb_array_elements(data) as item
where data_key = 'it-application-tracker-task-calendar-activities'
  and jsonb_typeof(data) = 'array'
  and nullif(item ->> 'id', '') is not null
on conflict (activity_code) do update
set activity_date = excluded.activity_date,
    details = excluded.details,
    deleted_at = null;

insert into public.attachments (
  owner_table,
  owner_key,
  file_name,
  file_type,
  original_size,
  stored_size,
  data_url,
  compressed,
  deleted_at
)
select
  source.owner_table,
  source.owner_key,
  source.attachment ->> 'name',
  coalesce(source.attachment ->> 'type', ''),
  case when source.attachment ->> 'originalSize' ~ '^\d+$' then (source.attachment ->> 'originalSize')::integer else 0 end,
  case when source.attachment ->> 'storedSize' ~ '^\d+$' then (source.attachment ->> 'storedSize')::integer else 0 end,
  source.attachment ->> 'dataUrl',
  case
    when lower(coalesce(source.attachment ->> 'compressed', '')) in ('true', 'false')
      then (source.attachment ->> 'compressed')::boolean
    else false
  end,
  null
from (
  select
    'test_cases' as owner_table,
    coalesce(nullif(item ->> 'rowKey', ''), item ->> 'id') as owner_key,
    item -> 'attachment' as attachment
  from public.app_data
  cross join lateral jsonb_array_elements(data) as item
  where data_key = 'it-application-tracker-test-cases'
    and jsonb_typeof(data) = 'array'
    and jsonb_typeof(item -> 'attachment') = 'object'
  union all
  select
    'project_modifications' as owner_table,
    coalesce(nullif(item ->> 'rowKey', ''), item ->> 'id') as owner_key,
    item -> 'attachment' as attachment
  from public.app_data
  cross join lateral jsonb_array_elements(data) as item
  where data_key = 'it-application-tracker-project-modification-records'
    and jsonb_typeof(data) = 'array'
    and jsonb_typeof(item -> 'attachment') = 'object'
) as source
where nullif(source.owner_key, '') is not null
  and nullif(source.attachment ->> 'name', '') is not null
  and nullif(source.attachment ->> 'dataUrl', '') is not null
on conflict (owner_table, owner_key, file_name) do update
set file_type = excluded.file_type,
    original_size = excluded.original_size,
    stored_size = excluded.stored_size,
    data_url = excluded.data_url,
    compressed = excluded.compressed,
    deleted_at = null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
as $$
declare
  next_record_id text;
  old_row jsonb;
  new_row jsonb;
begin
  old_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  new_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  next_record_id := coalesce(
    new_row ->> 'record_key',
    old_row ->> 'record_key',
    new_row ->> 'project_code',
    old_row ->> 'project_code',
    new_row ->> 'activity_code',
    old_row ->> 'activity_code',
    new_row ->> 'id',
    old_row ->> 'id'
  );

  insert into public.audit_logs(table_name, record_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    next_record_id,
    tg_op,
    nullif(old_row, '{}'::jsonb),
    nullif(new_row, '{}'::jsonb),
    coalesce(current_setting('request.jwt.claim.email', true), current_user)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'projects',
    'test_cases',
    'project_modifications',
    'task_calendar_activities',
    'attachments'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );

    execute format('drop trigger if exists audit_%I_changes on public.%I', table_name, table_name);
    execute format(
      'create trigger audit_%I_changes after insert or update or delete on public.%I for each row execute function public.write_audit_log()',
      table_name,
      table_name
    );
  end loop;
end
$$;

alter table public.projects enable row level security;
alter table public.test_cases enable row level security;
alter table public.project_modifications enable row level security;
alter table public.task_calendar_activities enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_logs enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table
  public.projects,
  public.test_cases,
  public.project_modifications,
  public.task_calendar_activities,
  public.attachments,
  public.audit_logs,
  public.app_data
to anon, authenticated;

drop policy if exists "App users can read projects" on public.projects;
create policy "App users can read projects"
  on public.projects for select
  to anon, authenticated
  using (true);

drop policy if exists "App users can manage projects" on public.projects;
create policy "App users can manage projects"
  on public.projects for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "App users can read test cases" on public.test_cases;
create policy "App users can read test cases"
  on public.test_cases for select
  to anon, authenticated
  using (true);

drop policy if exists "App users can manage test cases" on public.test_cases;
create policy "App users can manage test cases"
  on public.test_cases for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "App users can read project modifications" on public.project_modifications;
create policy "App users can read project modifications"
  on public.project_modifications for select
  to anon, authenticated
  using (true);

drop policy if exists "App users can manage project modifications" on public.project_modifications;
create policy "App users can manage project modifications"
  on public.project_modifications for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "App users can read task activities" on public.task_calendar_activities;
create policy "App users can read task activities"
  on public.task_calendar_activities for select
  to anon, authenticated
  using (true);

drop policy if exists "App users can manage task activities" on public.task_calendar_activities;
create policy "App users can manage task activities"
  on public.task_calendar_activities for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "App users can read attachments" on public.attachments;
create policy "App users can read attachments"
  on public.attachments for select
  to anon, authenticated
  using (true);

drop policy if exists "App users can manage attachments" on public.attachments;
create policy "App users can manage attachments"
  on public.attachments for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "App users can read audit logs" on public.audit_logs;
create policy "App users can read audit logs"
  on public.audit_logs for select
  to anon, authenticated
  using (true);

drop policy if exists "App can write audit logs" on public.audit_logs;
create policy "App can write audit logs"
  on public.audit_logs for insert
  to anon, authenticated
  with check (true);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'projects',
    'test_cases',
    'project_modifications',
    'task_calendar_activities',
    'attachments',
    'app_data'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;
