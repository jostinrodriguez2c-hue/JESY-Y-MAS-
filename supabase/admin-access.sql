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

insert into public.profiles (id, full_name, role)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'full_name', ''),
  'support'
from auth.users as users
on conflict (id) do nothing;

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
  code_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.admin_access_requests enable row level security;
alter table public.admin_activation_codes enable row level security;

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

  if p_code is null or p_code !~ '^[0-9a-f]{32}$' then
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

  update public.admin_access_requests
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = access_request.id;

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
revoke all on function public.reject_admin_access_request(uuid) from public;
revoke all on function public.hash_admin_activation_code(text) from public, anon, authenticated;
grant execute on function public.issue_admin_activation_code(uuid, text) to authenticated;
grant execute on function public.reject_admin_access_request(uuid) to authenticated;

create or replace function public.consume_admin_activation_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activation_code text;
  approved_name text;
  activation_id uuid;
begin
  activation_code := lower(trim(new.raw_user_meta_data ->> 'activation_code'));
  if activation_code is null or activation_code = '' then
    raise exception 'ACCESS_REQUEST_REQUIRED'
      using errcode = 'P0001';
  end if;

  if new.email is null then
    raise exception 'INVALID_ACTIVATION_CODE'
      using errcode = 'P0001';
  end if;

  select id, full_name
    into activation_id, approved_name
    from public.admin_activation_codes
    where email = lower(trim(new.email))
      and code_hash = public.hash_admin_activation_code(activation_code)
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

  new.raw_user_meta_data :=
    jsonb_set(
      coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'activation_code',
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
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
