-- Run once in Supabase SQL Editor after schema.sql.
-- Public visitors can request access, but only a superadmin can issue activation codes.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'support'
    check (role in ('superadmin', 'admin', 'editor', 'support')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.activity_log
  add column if not exists details jsonb;

create index if not exists activity_log_created_at_desc
  on public.activity_log (created_at desc);

insert into public.profiles (id, full_name, role)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'full_name', ''),
  'support'
from auth.users as users
on conflict (id) do nothing;

create table if not exists public.admin_role_settings (
  singleton boolean primary key default true check (singleton),
  primary_superadmin_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

insert into public.admin_role_settings (singleton)
values (true)
on conflict (singleton) do nothing;

update public.admin_role_settings
set primary_superadmin_id = (
  select profiles.id
  from public.profiles
  where profiles.role = 'superadmin'
  order by profiles.created_at, profiles.id
  limit 1
)
where singleton = true
  and primary_superadmin_id is null
  and exists (select 1 from public.profiles where role = 'superadmin');

create or replace function public.access_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profiles.role::text
  from public.profiles
  where profiles.id = (select auth.uid())
$$;

revoke all on function public.access_admin_role() from public, anon;
grant execute on function public.access_admin_role() to authenticated;

create or replace function public.is_primary_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_role_settings as settings
    join public.profiles as profile
      on profile.id = settings.primary_superadmin_id
    where settings.singleton = true
      and settings.primary_superadmin_id = (select auth.uid())
      and profile.role = 'superadmin'
  )
$$;

revoke all on function public.is_primary_superadmin() from public, anon;
grant execute on function public.is_primary_superadmin() to authenticated;

create or replace function public.write_admin_activity(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (actor_id, action, entity_type, entity_id, details)
  values (
    p_actor_id,
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_details, '{}'::jsonb)
  )
$$;

revoke all on function public.write_admin_activity(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.record_admin_activity(p_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(p_action, '') not in ('auth.login', 'auth.logout') then
    raise exception 'Invalid activity event'
      using errcode = '42501';
  end if;

  perform public.write_admin_activity(
    auth.uid(),
    p_action,
    'session',
    null,
    '{}'::jsonb
  );
  return true;
end;
$$;

revoke all on function public.record_admin_activity(text) from public, anon;
grant execute on function public.record_admin_activity(text) to authenticated;

create or replace function public.list_admin_role_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  is_primary_superadmin boolean,
  can_manage_superadmin_role boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  primary_id uuid;
begin
  caller_role := public.access_admin_role();
  if coalesce(caller_role, '') not in ('admin', 'superadmin') then
    raise exception 'Only admins can view account roles'
      using errcode = '42501';
  end if;

  select primary_superadmin_id
    into primary_id
    from public.admin_role_settings
    where singleton = true;

  return query
    select
      profiles.id,
      users.email::text,
      coalesce(profiles.full_name, ''),
      profiles.role::text,
      profiles.id = primary_id,
      auth.uid() = primary_id
    from public.profiles as profiles
    join auth.users as users on users.id = profiles.id
    order by profiles.full_name, users.email;
end;
$$;

drop function if exists public.list_admin_activity(integer);
drop function if exists public.list_admin_activity(integer, integer);

create or replace function public.list_admin_activity(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id text,
  actor_name text,
  actor_email text,
  action text,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at text,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
begin
  caller_role := public.access_admin_role();
  if coalesce(caller_role, '') not in ('admin', 'superadmin') then
    raise exception 'Only admins can view the activity history'
      using errcode = '42501';
  end if;

  return query
    select
      activity.id::text,
      coalesce(profile.full_name::text, ''),
      users.email::text,
      activity.action::text,
      activity.entity_type::text,
      activity.entity_id::text,
      to_jsonb(activity.details),
      activity.created_at::text,
      count(*) over ()::bigint
    from public.activity_log as activity
    left join public.profiles as profile on profile.id = activity.actor_id
    left join auth.users as users on users.id = activity.actor_id
    order by activity.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.list_admin_activity(integer, integer) from public, anon;
grant execute on function public.list_admin_activity(integer, integer) to authenticated;

create or replace function public.set_admin_user_role(p_user_id uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  primary_id uuid;
  target_role text;
begin
  caller_role := public.access_admin_role();
  select primary_superadmin_id
    into primary_id
    from public.admin_role_settings
    where singleton = true;

  if coalesce(caller_role, '') <> 'superadmin'
    or primary_id is null
    or auth.uid() <> primary_id then
    raise exception 'Only the primary superadmin can change account roles'
      using errcode = '42501';
  end if;

  if coalesce(p_role, '') not in ('support', 'editor', 'admin', 'superadmin') then
    raise exception 'Invalid account role'
      using errcode = '22023';
  end if;

  select profiles.role
    into target_role
    from public.profiles as profiles
    where profiles.id = p_user_id
    for update;

  if not found then
    raise exception 'Account profile not found'
      using errcode = 'P0002';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role'
      using errcode = '42501';
  end if;

  if p_user_id = primary_id and p_role <> 'superadmin' then
    raise exception 'The primary superadmin role cannot be removed'
      using errcode = '42501';
  end if;

  if (p_role = 'superadmin' or target_role = 'superadmin')
    and (primary_id is null or auth.uid() <> primary_id) then
    raise exception 'Only the primary superadmin can assign or remove superadmin'
      using errcode = '42501';
  end if;

  update public.profiles
    set role = p_role,
        updated_at = now()
    where id = p_user_id;

  return true;
end;
$$;

revoke all on function public.list_admin_role_users() from public, anon;
revoke all on function public.set_admin_user_role(uuid, text) from public, anon;
grant execute on function public.list_admin_role_users() to authenticated;
grant execute on function public.set_admin_user_role(uuid, text) to authenticated;

create table if not exists public.admin_access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text not null check (
    length(email) between 5 and 160
    and email = lower(trim(email))
    and position('@' in email) > 1
  ),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create unique index if not exists admin_access_requests_pending_email
  on public.admin_access_requests (lower(email))
  where status = 'pending';

create table if not exists public.admin_activation_codes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.admin_access_requests(id) on delete cascade,
  full_name text not null,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.admin_activation_codes
  drop constraint if exists admin_activation_codes_code_hash_key;

create index if not exists admin_activation_codes_email_code_hash
  on public.admin_activation_codes (email, code_hash)
  where used_at is null;

create table if not exists public.admin_activation_attempts (
  email text primary key,
  attempts integer not null default 0 check (attempts between 0 and 5),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);

create table if not exists public.admin_activation_tickets (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.admin_access_requests(id) on delete cascade,
  email text not null,
  full_name text not null,
  ticket_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.activity_log enable row level security;
revoke all on public.activity_log from anon, authenticated;

create or replace function public.audit_admin_table_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  previous_data jsonb;
  actor uuid;
  event_action text;
  event_details jsonb;
  entity uuid;
  item_name text;
begin
  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
  else
    row_data := to_jsonb(new);
  end if;
  entity := (row_data ->> 'id')::uuid;
  actor := auth.uid();
  item_name := coalesce(row_data ->> 'name', row_data ->> 'title', row_data ->> 'full_name', '');

  if tg_table_name = 'quote_requests' then
    if tg_op = 'INSERT' then
      event_action := 'quote.submitted';
      event_details := jsonb_build_object(
        'name', item_name,
        'service', row_data ->> 'service',
        'status', row_data ->> 'status'
      );
    elsif tg_op = 'UPDATE' then
      previous_data := to_jsonb(old);
      if previous_data ->> 'status' is distinct from row_data ->> 'status' then
        perform public.write_admin_activity(
          actor, 'quote.status_changed', 'quote_request', entity,
          jsonb_build_object(
            'name', item_name,
            'from_status', previous_data ->> 'status',
            'to_status', row_data ->> 'status'
          )
        );
      end if;
      if previous_data ->> 'hidden_from_admin' is distinct from row_data ->> 'hidden_from_admin' then
        perform public.write_admin_activity(
          actor, 'quote.hidden', 'quote_request', entity,
          jsonb_build_object('name', item_name, 'hidden', row_data ->> 'hidden_from_admin')
        );
      end if;
      if previous_data ->> 'status' is not distinct from row_data ->> 'status'
        and previous_data ->> 'hidden_from_admin' is not distinct from row_data ->> 'hidden_from_admin' then
        perform public.write_admin_activity(
          actor, 'quote.updated', 'quote_request', entity,
          jsonb_build_object('name', item_name)
        );
      end if;
      return new;
    else
      event_action := 'quote.deleted';
      event_details := jsonb_build_object('name', item_name);
    end if;
  elsif tg_table_name = 'admin_access_requests' then
    if tg_op = 'INSERT' then
      event_action := 'access_request.submitted';
      event_details := jsonb_build_object(
        'name', item_name,
        'email', row_data ->> 'email'
      );
    elsif tg_op = 'UPDATE' then
      previous_data := to_jsonb(old);
      if previous_data ->> 'status' is distinct from row_data ->> 'status' then
        event_action := 'access_request.' || (row_data ->> 'status');
        event_details := jsonb_build_object(
          'name', item_name,
          'email', row_data ->> 'email'
        );
      else
        return new;
      end if;
    else
      event_action := 'access_request.deleted';
      event_details := jsonb_build_object(
        'name', item_name,
        'email', row_data ->> 'email'
      );
    end if;
  elsif tg_table_name = 'profiles' then
    previous_data := to_jsonb(old);
    if previous_data ->> 'role' is distinct from row_data ->> 'role' then
      event_action := 'role.changed';
      event_details := jsonb_build_object(
        'name', item_name,
        'from_role', previous_data ->> 'role',
        'to_role', row_data ->> 'role'
      );
    else
      return new;
    end if;
  else
    event_action := case lower(substring(tg_table_name from 1 for length(tg_table_name) - 1))
      when 'project' then 'project'
      when 'servic' then 'service'
      else tg_table_name
    end || case tg_op
      when 'INSERT' then '.created'
      when 'UPDATE' then '.updated'
      else '.deleted'
    end;
    event_details := jsonb_build_object(
      'name', item_name,
      'status', coalesce(row_data ->> 'status', row_data ->> 'is_published', row_data ->> 'active')
    );
  end if;

  perform public.write_admin_activity(actor, event_action, tg_table_name, entity, event_details);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_admin_table_change() from public, anon, authenticated;

drop trigger if exists audit_quote_requests_changes on public.quote_requests;
create trigger audit_quote_requests_changes
after insert or update or delete on public.quote_requests
for each row execute procedure public.audit_admin_table_change();

drop trigger if exists audit_access_request_changes on public.admin_access_requests;
create trigger audit_access_request_changes
after insert or update or delete on public.admin_access_requests
for each row execute procedure public.audit_admin_table_change();

drop trigger if exists audit_projects_changes on public.projects;
create trigger audit_projects_changes
after insert or update or delete on public.projects
for each row execute procedure public.audit_admin_table_change();

drop trigger if exists audit_services_changes on public.services;
create trigger audit_services_changes
after insert or update or delete on public.services
for each row execute procedure public.audit_admin_table_change();

drop trigger if exists audit_profile_role_changes on public.profiles;
create trigger audit_profile_role_changes
after update on public.profiles
for each row execute procedure public.audit_admin_table_change();

alter table public.admin_access_requests enable row level security;
alter table public.admin_activation_codes enable row level security;
alter table public.admin_activation_attempts enable row level security;
alter table public.admin_activation_tickets enable row level security;

revoke all on public.admin_access_requests from anon, authenticated;
grant insert, select on public.admin_access_requests to anon, authenticated;

drop policy if exists "public request admin access" on public.admin_access_requests;
create policy "public request admin access" on public.admin_access_requests
for insert to anon, authenticated
with check (
  status = 'pending'
  and reviewed_at is null
  and reviewed_by is null
  and length(trim(full_name)) between 2 and 120
  and length(trim(email)) between 5 and 160
  and email = lower(trim(email))
  and position('@' in email) > 1
);

drop policy if exists "superadmins read access requests" on public.admin_access_requests;
drop policy if exists "admins read access requests" on public.admin_access_requests;
create policy "admins read access requests" on public.admin_access_requests
for select to authenticated
using (public.access_admin_role() in ('admin', 'superadmin'));

revoke all on public.admin_activation_codes from anon, authenticated;
revoke all on public.admin_activation_attempts from anon, authenticated;
revoke all on public.admin_activation_tickets from anon, authenticated;

create or replace function public.hash_admin_activation_code(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  crypto_schema text;
  hashed_code text;
begin
  select namespace_row.nspname
    into crypto_schema
    from pg_catalog.pg_extension extension_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = extension_row.extnamespace
    where extension_row.extname = 'pgcrypto';

  if crypto_schema is null then
    raise exception 'The pgcrypto extension is required'
      using errcode = '55000';
  end if;

  execute pg_catalog.format(
    'select pg_catalog.encode(%I.digest(pg_catalog.convert_to($1, %L), %L), %L)',
    crypto_schema,
    'UTF8',
    'sha256',
    'hex'
  )
  into hashed_code
  using p_code;

  return hashed_code;
end;
$$;

create or replace function public.issue_admin_activation_code(p_request_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_request public.admin_access_requests%rowtype;
begin
  if coalesce(public.access_admin_role(), '') <> 'superadmin' then
    raise exception 'Only a superadmin can approve access requests'
      using errcode = '42501';
  end if;

  if p_code is null or p_code !~ '^[0-9]{4}$' then
    raise exception 'Invalid activation code format'
      using errcode = '22023';
  end if;

  select *
    into access_request
    from public.admin_access_requests
    where id = p_request_id
      and status = 'pending'
    for update;

  if not found then
    raise exception 'The access request is no longer pending'
      using errcode = 'P0002';
  end if;

  delete from public.admin_activation_codes
    where email = access_request.email
      and used_at is null;

  delete from public.admin_activation_tickets
    where email = access_request.email
      and used_at is null;

  insert into public.admin_activation_codes (
    request_id, full_name, email, code_hash, created_by
  )
  values (
    access_request.id,
    access_request.full_name,
    access_request.email,
    public.hash_admin_activation_code(p_code),
    auth.uid()
  );

  insert into public.admin_activation_attempts (
    email, attempts, window_started_at, locked_until
  )
  values (
    access_request.email, 0, now(), null
  )
  on conflict (email) do update
    set attempts = 0,
        window_started_at = now(),
        locked_until = null;

  update public.admin_access_requests
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = access_request.id;

  return true;
end;
$$;

create or replace function public.prepare_admin_account_activation(
  p_email text,
  p_code text,
  p_ticket text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
  attempt_row public.admin_activation_attempts%rowtype;
  activation public.admin_activation_codes%rowtype;
begin
  normalized_email := lower(trim(coalesce(p_email, '')));
  if length(normalized_email) < 5
    or length(normalized_email) > 160
    or position('@' in normalized_email) < 2 then
    return false;
  end if;

  if not exists (
    select 1
    from public.admin_activation_codes
    where email = normalized_email
      and used_at is null
      and expires_at > now()
  ) then
    return false;
  end if;

  insert into public.admin_activation_attempts (email)
  values (normalized_email)
  on conflict (email) do nothing;

  select *
    into attempt_row
    from public.admin_activation_attempts
    where email = normalized_email
    for update;

  if attempt_row.locked_until > now() then
    return false;
  end if;

  if attempt_row.window_started_at <= now() - interval '24 hours' then
    update public.admin_activation_attempts
      set attempts = 0,
          window_started_at = now(),
          locked_until = null
      where email = normalized_email
    returning * into attempt_row;
  end if;

  if attempt_row.attempts >= 5 then
    return false;
  end if;

  if p_code is null or p_code !~ '^[0-9]{4}$' then
    update public.admin_activation_attempts
      set attempts = attempts + 1,
          locked_until = case when attempts + 1 >= 5
            then now() + interval '24 hours'
            else null
          end
      where email = normalized_email;
    return false;
  end if;

  if p_ticket is null or p_ticket !~ '^[a-fA-F0-9]{64}$' then
    return false;
  end if;

  select *
    into activation
    from public.admin_activation_codes
    where email = normalized_email
      and code_hash = public.hash_admin_activation_code(p_code)
      and used_at is null
      and expires_at > now()
    for update;

  if not found then
    update public.admin_activation_attempts
      set attempts = attempts + 1,
          locked_until = case when attempts + 1 >= 5
            then now() + interval '24 hours'
            else null
          end
      where email = normalized_email;
    return false;
  end if;

  delete from public.admin_activation_tickets
    where email = normalized_email
      and used_at is null;

  insert into public.admin_activation_tickets (
    request_id, email, full_name, ticket_hash
  )
  values (
    activation.request_id,
    activation.email,
    activation.full_name,
    public.hash_admin_activation_code(lower(p_ticket))
  );

  return true;
end;
$$;

create or replace function public.reject_admin_access_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.access_admin_role(), '') not in ('admin', 'superadmin') then
    raise exception 'Only an admin or superadmin can reject access requests'
      using errcode = '42501';
  end if;

  update public.admin_access_requests
    set status = 'rejected',
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = p_request_id
      and status = 'pending';

  if not found then
    raise exception 'The access request is no longer pending'
      using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.issue_admin_activation_code(uuid, text) from public;
revoke all on function public.prepare_admin_account_activation(text, text, text) from public;
revoke all on function public.reject_admin_access_request(uuid) from public;
revoke all on function public.hash_admin_activation_code(text) from public, anon, authenticated;
grant execute on function public.issue_admin_activation_code(uuid, text) to authenticated;
grant execute on function public.prepare_admin_account_activation(text, text, text) to anon, authenticated;
grant execute on function public.reject_admin_access_request(uuid) to authenticated;

create or replace function public.consume_admin_activation_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activation_ticket text;
  approved_name text;
  approved_email text;
  activation_request_id uuid;
  ticket_id uuid;
  activation_id uuid;
begin
  activation_ticket := lower(trim(new.raw_user_meta_data ->> 'activation_ticket'));
  if activation_ticket is null or activation_ticket = '' then
    raise exception 'ACCESS_REQUEST_REQUIRED'
      using errcode = 'P0001';
  end if;

  if new.email is null then
    raise exception 'INVALID_ACTIVATION_CODE'
      using errcode = 'P0001';
  end if;

  select id, request_id, email, full_name
    into ticket_id, activation_request_id, approved_email, approved_name
    from public.admin_activation_tickets
    where email = lower(trim(new.email))
      and ticket_hash = public.hash_admin_activation_code(activation_ticket)
      and used_at is null
      and expires_at > now()
    for update;

  if not found then
    raise exception 'INVALID_ACTIVATION_CODE'
      using errcode = 'P0001';
  end if;

  select id
    into activation_id
    from public.admin_activation_codes
    where request_id = activation_request_id
      and email = approved_email
      and used_at is null
      and expires_at > now()
    for update;

  if not found then
    raise exception 'INVALID_ACTIVATION_CODE'
      using errcode = 'P0001';
  end if;

  update public.admin_activation_codes
    set used_at = now()
    where id = activation_id;

  update public.admin_activation_tickets
    set used_at = now()
    where id = ticket_id;

  new.raw_user_meta_data :=
    jsonb_set(
      coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'activation_ticket',
      '{full_name}',
      to_jsonb(approved_name),
      true
    );

  return new;
end;
$$;

drop trigger if exists validate_admin_activation_code on auth.users;
create trigger validate_admin_activation_code
before insert on auth.users
for each row execute procedure public.consume_admin_activation_code();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'support'
  )
  on conflict (id) do nothing;
  perform public.write_admin_activity(
    new.id,
    'account.created',
    'profile',
    new.id,
    jsonb_build_object('name', coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

notify pgrst, 'reload schema';
