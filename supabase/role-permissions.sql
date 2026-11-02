-- Run after admin-access.sql to enable custom roles and per-action permissions.

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute pg_catalog.format(
      'alter table public.profiles drop constraint %I',
      constraint_row.conname
    );
  end loop;
end;
$$;

create table if not exists public.admin_roles (
  role_key text primary key check (role_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  display_name text not null check (length(trim(display_name)) between 2 and 60),
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists admin_roles_display_name_lower
  on public.admin_roles (lower(display_name));

insert into public.admin_roles (role_key, display_name, permissions, is_system)
values
  ('support', 'Soporte', '{"quotes.view":true}'::jsonb, true),
  ('editor', 'Editor', '{"projects.view":true,"projects.create":true,"projects.update":true,"projects.publish":true,"services.view":true,"services.create":true,"services.update":true,"services.publish":true}'::jsonb, true),
  ('admin', 'Admin', '{"quotes.view":true,"quotes.update":true,"quotes.hide":true,"projects.view":true,"projects.create":true,"projects.update":true,"projects.delete":true,"projects.publish":true,"services.view":true,"services.create":true,"services.update":true,"services.delete":true,"services.publish":true,"access_requests.view":true,"access_requests.reject":true,"activity_history.view":true,"role_assignments.view":true,"role_assignments.manage":true}'::jsonb, true),
  ('superadmin', 'Superadmin', '{"quotes.view":true,"quotes.update":true,"quotes.hide":true,"projects.view":true,"projects.create":true,"projects.update":true,"projects.delete":true,"projects.publish":true,"services.view":true,"services.create":true,"services.update":true,"services.delete":true,"services.publish":true,"access_requests.view":true,"access_requests.reject":true,"activity_history.view":true,"role_assignments.view":true,"role_assignments.manage":true}'::jsonb, true)
on conflict (role_key) do nothing;

update public.admin_roles
set permissions = permissions || '{"role_assignments.view":true,"role_assignments.manage":true}'::jsonb
where role_key in ('admin', 'superadmin');

create table if not exists public.admin_user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null references public.admin_roles(role_key) on delete restrict,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_key)
);

insert into public.admin_user_roles (user_id, role_key)
select profile.id, profile.role
from public.profiles as profile
join public.admin_roles as role on role.role_key = profile.role
on conflict (user_id, role_key) do nothing;

alter table public.admin_user_roles enable row level security;
revoke all on public.admin_user_roles from anon, authenticated;

alter table public.admin_roles enable row level security;
revoke all on public.admin_roles from anon, authenticated;

create or replace function public.valid_admin_permissions(p_permissions jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_permissions) = 'object'
    and not exists (
      select 1
      from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) as permission
      where permission.key not in (
        'quotes.view', 'quotes.update', 'quotes.hide',
        'projects.view', 'projects.create', 'projects.update', 'projects.delete', 'projects.publish',
        'services.view', 'services.create', 'services.update', 'services.delete', 'services.publish',
        'access_requests.view', 'access_requests.reject',
        'activity_history.view', 'role_assignments.view', 'role_assignments.manage'
      )
      or jsonb_typeof(permission.value) <> 'boolean'
    )
    and (
      (p_permissions -> 'quotes.update' is distinct from 'true'::jsonb
        and p_permissions -> 'quotes.hide' is distinct from 'true'::jsonb)
      or p_permissions -> 'quotes.view' = 'true'::jsonb
    )
    and (
      (p_permissions -> 'projects.update' is distinct from 'true'::jsonb
        and p_permissions -> 'projects.delete' is distinct from 'true'::jsonb
        and p_permissions -> 'projects.publish' is distinct from 'true'::jsonb)
      or p_permissions -> 'projects.view' = 'true'::jsonb
    )
    and (
      p_permissions -> 'projects.publish' is distinct from 'true'::jsonb
      or p_permissions -> 'projects.update' = 'true'::jsonb
    )
    and (
      (p_permissions -> 'services.update' is distinct from 'true'::jsonb
        and p_permissions -> 'services.delete' is distinct from 'true'::jsonb
        and p_permissions -> 'services.publish' is distinct from 'true'::jsonb)
      or p_permissions -> 'services.view' = 'true'::jsonb
    )
    and (
      p_permissions -> 'services.publish' is distinct from 'true'::jsonb
      or p_permissions -> 'services.update' = 'true'::jsonb
    )
    and (
      p_permissions -> 'access_requests.reject' is distinct from 'true'::jsonb
      or p_permissions -> 'access_requests.view' = 'true'::jsonb
    )
    and (
      p_permissions -> 'role_assignments.manage' is distinct from 'true'::jsonb
      or p_permissions -> 'role_assignments.view' = 'true'::jsonb
    ),
    false
  )
$$;

create or replace function public.has_admin_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select (role.permissions ->> p_permission)::boolean
      from public.profiles as profile
      join public.admin_roles as role on role.role_key = profile.role
      where profile.id = (select auth.uid())
        and jsonb_typeof(role.permissions -> p_permission) = 'boolean'
    ),
    false
  )
$$;

revoke all on function public.valid_admin_permissions(jsonb) from public, anon, authenticated;
revoke all on function public.has_admin_permission(text) from public, anon;
grant execute on function public.has_admin_permission(text) to authenticated;

create or replace function public.get_my_admin_permissions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(role.permissions, '{}'::jsonb)
  from public.profiles as profile
  join public.admin_roles as role on role.role_key = profile.role
  where profile.id = (select auth.uid())
$$;

revoke all on function public.get_my_admin_permissions() from public, anon;
grant execute on function public.get_my_admin_permissions() to authenticated;

create or replace function public.list_admin_roles()
returns table (
  role_key text,
  display_name text,
  permissions jsonb,
  is_system boolean,
  assigned_users bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_primary_superadmin() then
    raise exception 'Only the primary superadmin can manage roles'
      using errcode = '42501';
  end if;

  return query
    select role.role_key, role.display_name, role.permissions, role.is_system,
      (select count(*) from public.profiles as profile where profile.role = role.role_key)
    from public.admin_roles as role
    order by role.is_system desc, role.display_name;
end;
$$;

create or replace function public.add_admin_role(
  p_role_key text,
  p_display_name text,
  p_permissions jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_primary_superadmin() then
    raise exception 'Only the primary superadmin can manage roles'
      using errcode = '42501';
  end if;
  if p_role_key is null or p_role_key !~ '^[a-z][a-z0-9_]{1,39}$'
    or p_role_key in ('support', 'editor', 'admin', 'superadmin') then
    raise exception 'Invalid or reserved role identifier'
      using errcode = '22023';
  end if;
  if p_display_name is null or length(trim(p_display_name)) not between 2 and 60 then
    raise exception 'Role name must contain between 2 and 60 characters'
      using errcode = '22023';
  end if;
  if not public.valid_admin_permissions(p_permissions) then
    raise exception 'Invalid role permissions'
      using errcode = '22023';
  end if;

  insert into public.admin_roles (role_key, display_name, permissions)
  values (p_role_key, trim(p_display_name), p_permissions);
  perform public.write_admin_activity(
    auth.uid(), 'role.created', 'admin_role', null,
    jsonb_build_object('role', p_role_key, 'name', trim(p_display_name), 'permissions', p_permissions)
  );
  return true;
end;
$$;

create or replace function public.update_admin_role(
  p_role_key text,
  p_display_name text,
  p_permissions jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_role public.admin_roles%rowtype;
begin
  if not public.is_primary_superadmin() then
    raise exception 'Only the primary superadmin can manage roles'
      using errcode = '42501';
  end if;
  if p_display_name is null or length(trim(p_display_name)) not between 2 and 60 then
    raise exception 'Role name must contain between 2 and 60 characters'
      using errcode = '22023';
  end if;
  if not public.valid_admin_permissions(p_permissions) then
    raise exception 'Invalid role permissions'
      using errcode = '22023';
  end if;

  select * into existing_role
  from public.admin_roles
  where role_key = p_role_key
  for update;
  if not found then
    raise exception 'Role not found'
      using errcode = 'P0002';
  end if;
  if existing_role.role_key = 'superadmin' then
    raise exception 'The superadmin role cannot be edited'
      using errcode = '42501';
  end if;

  update public.admin_roles
  set display_name = trim(p_display_name), permissions = p_permissions
  where role_key = p_role_key;
  perform public.write_admin_activity(
    auth.uid(), 'role.updated', 'admin_role', null,
    jsonb_build_object(
      'role', p_role_key,
      'name', trim(p_display_name),
      'previous_permissions', existing_role.permissions,
      'permissions', p_permissions
    )
  );
  return true;
end;
$$;

create or replace function public.delete_admin_role(p_role_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_role public.admin_roles%rowtype;
  assigned_count bigint;
begin
  if not public.is_primary_superadmin() then
    raise exception 'Only the primary superadmin can manage roles'
      using errcode = '42501';
  end if;

  select * into existing_role
  from public.admin_roles
  where role_key = p_role_key
  for update;
  if not found then
    raise exception 'Role not found'
      using errcode = 'P0002';
  end if;
  if existing_role.is_system then
    raise exception 'Built-in roles cannot be deleted'
      using errcode = '42501';
  end if;

  select count(*) into assigned_count
  from public.profiles
  where role = p_role_key;
  if assigned_count > 0 then
    raise exception 'Reassign all users before deleting this role'
      using errcode = '23503';
  end if;

  delete from public.admin_roles where role_key = p_role_key;
  perform public.write_admin_activity(
    auth.uid(), 'role.deleted', 'admin_role', null,
    jsonb_build_object(
      'role', p_role_key,
      'name', existing_role.display_name,
      'permissions', existing_role.permissions
    )
  );
  return true;
end;
$$;

drop function if exists public.list_admin_role_users();
create function public.list_admin_role_users()
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
  primary_id uuid;
begin
  if not public.is_primary_superadmin() then
    raise exception 'Only the primary superadmin can manage roles'
      using errcode = '42501';
  end if;

  select settings.primary_superadmin_id
    into primary_id
    from public.admin_role_settings as settings
    where settings.singleton = true;

  return query
    select profile.id, users.email::text, coalesce(profile.full_name::text, ''),
      profile.role::text, profile.id = primary_id, profile.id = primary_id
    from public.profiles as profile
    join auth.users as users on users.id = profile.id
    order by profile.full_name, users.email;
end;
$$;

create or replace function public.set_admin_user_role(p_user_id uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  primary_id uuid;
begin
  if not public.is_primary_superadmin() then
    raise exception 'Only the primary superadmin can change account roles'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.admin_roles where role_key = p_role) then
    raise exception 'Role not found'
      using errcode = '22023';
  end if;

  select settings.primary_superadmin_id
    into primary_id
    from public.admin_role_settings as settings
    where settings.singleton = true;

  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role'
      using errcode = '42501';
  end if;
  if p_user_id = primary_id and p_role <> 'superadmin' then
    raise exception 'The primary superadmin role cannot be removed'
      using errcode = '42501';
  end if;

  update public.profiles
    set role = p_role, updated_at = now()
    where id = p_user_id;
  if not found then
    raise exception 'Account profile not found'
      using errcode = 'P0002';
  end if;
  return true;
end;
$$;

drop function if exists public.list_admin_activity(integer);
drop function if exists public.list_admin_activity(integer, integer);

create function public.list_admin_activity(
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
begin
  if not public.has_admin_permission('activity_history.view') then
    raise exception 'This account cannot view the activity history'
      using errcode = '42501';
  end if;

  return query
    select activity.id::text, coalesce(profile.full_name::text, ''),
      users.email::text, activity.action::text, activity.entity_type::text,
      activity.entity_id::text, to_jsonb(activity.details),
      activity.created_at::text, count(*) over ()::bigint
    from public.activity_log as activity
    left join public.profiles as profile on profile.id = activity.actor_id
    left join auth.users as users on users.id = activity.actor_id
    order by activity.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace function public.reject_admin_access_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_admin_permission('access_requests.reject') then
    raise exception 'This account cannot reject access requests'
      using errcode = '42501';
  end if;

  update public.admin_access_requests
    set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_request_id and status = 'pending';
  if not found then
    raise exception 'The access request is no longer pending'
      using errcode = 'P0002';
  end if;
  return true;
end;
$$;

create or replace function public.guard_admin_quote_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (to_jsonb(old) - 'hidden_from_admin')
      is distinct from (to_jsonb(new) - 'hidden_from_admin')
    and not public.has_admin_permission('quotes.update') then
    raise exception 'This account cannot update quote details or status'
      using errcode = '42501';
  end if;
  if (to_jsonb(old) ->> 'status') is distinct from (to_jsonb(new) ->> 'status')
    and not public.has_admin_permission('quotes.update') then
    raise exception 'This account cannot update quotes'
      using errcode = '42501';
  end if;
  if (to_jsonb(old) ->> 'hidden_from_admin') is distinct from (to_jsonb(new) ->> 'hidden_from_admin')
    and not public.has_admin_permission('quotes.hide') then
    raise exception 'This account cannot hide quotes'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_admin_catalog_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  permission_name text;
  old_visibility text;
  new_visibility text;
begin
  if tg_table_name = 'projects' then
    permission_name := 'projects.publish';
  else
    permission_name := 'services.publish';
  end if;
  old_visibility := coalesce(to_jsonb(old) ->> 'published', to_jsonb(old) ->> 'is_published', to_jsonb(old) ->> 'active');
  new_visibility := coalesce(to_jsonb(new) ->> 'published', to_jsonb(new) ->> 'is_published', to_jsonb(new) ->> 'active');
  if old_visibility is distinct from new_visibility
    and not public.has_admin_permission(permission_name) then
    raise exception 'This account cannot change public visibility'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_admin_quote_update on public.quote_requests;
create trigger guard_admin_quote_update
before update on public.quote_requests
for each row execute procedure public.guard_admin_quote_update();

drop trigger if exists guard_admin_catalog_publish_projects on public.projects;
create trigger guard_admin_catalog_publish_projects
before update on public.projects
for each row execute procedure public.guard_admin_catalog_publish();

drop trigger if exists guard_admin_catalog_publish_services on public.services;
create trigger guard_admin_catalog_publish_services
before update on public.services
for each row execute procedure public.guard_admin_catalog_publish();

drop policy if exists "admins read quote requests" on public.quote_requests;
create policy "admins read quote requests" on public.quote_requests
for select to authenticated
using (public.has_admin_permission('quotes.view'));

drop policy if exists "admins update quote requests" on public.quote_requests;
create policy "admins update quote requests" on public.quote_requests
for update to authenticated
using (public.has_admin_permission('quotes.update') or public.has_admin_permission('quotes.hide'))
with check (public.has_admin_permission('quotes.update') or public.has_admin_permission('quotes.hide'));

drop policy if exists "admins read access requests" on public.admin_access_requests;
create policy "admins read access requests" on public.admin_access_requests
for select to authenticated
using (public.has_admin_permission('access_requests.view'));

drop policy if exists "public read published projects" on public.projects;
drop policy if exists "admins manage projects" on public.projects;
drop policy if exists "role permissions read projects" on public.projects;
drop policy if exists "role permissions insert projects" on public.projects;
drop policy if exists "role permissions update projects" on public.projects;
drop policy if exists "role permissions delete projects" on public.projects;
create policy "public read published projects" on public.projects
for select to anon
using (
  coalesce(to_jsonb(projects) ->> 'published', to_jsonb(projects) ->> 'is_published') = 'true'
);
create policy "role permissions read projects" on public.projects
for select to authenticated
using (
  coalesce(to_jsonb(projects) ->> 'published', to_jsonb(projects) ->> 'is_published') = 'true'
  or public.has_admin_permission('projects.view')
);
create policy "role permissions insert projects" on public.projects
for insert to authenticated
with check (public.has_admin_permission('projects.create'));
create policy "role permissions update projects" on public.projects
for update to authenticated
using (public.has_admin_permission('projects.update'))
with check (public.has_admin_permission('projects.update'));
create policy "role permissions delete projects" on public.projects
for delete to authenticated
using (public.has_admin_permission('projects.delete'));

drop policy if exists "public read published services" on public.services;
drop policy if exists "admins manage services" on public.services;
drop policy if exists "role permissions read services" on public.services;
drop policy if exists "role permissions insert services" on public.services;
drop policy if exists "role permissions update services" on public.services;
drop policy if exists "role permissions delete services" on public.services;
create policy "public read published services" on public.services
for select to anon
using (
  coalesce(to_jsonb(services) ->> 'active', to_jsonb(services) ->> 'is_published') = 'true'
);
create policy "role permissions read services" on public.services
for select to authenticated
using (
  coalesce(to_jsonb(services) ->> 'active', to_jsonb(services) ->> 'is_published') = 'true'
  or public.has_admin_permission('services.view')
);
create policy "role permissions insert services" on public.services
for insert to authenticated
with check (public.has_admin_permission('services.create'));
create policy "role permissions update services" on public.services
for update to authenticated
using (public.has_admin_permission('services.update'))
with check (public.has_admin_permission('services.update'));
create policy "role permissions delete services" on public.services
for delete to authenticated
using (public.has_admin_permission('services.delete'));

drop policy if exists "Admins upload catalog images" on storage.objects;
drop policy if exists "Role permissions upload catalog images" on storage.objects;
create policy "Role permissions upload catalog images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'catalog-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      ((storage.foldername(name))[2] = 'projects' and (
        public.has_admin_permission('projects.create')
        or public.has_admin_permission('projects.update')
      ))
      or ((storage.foldername(name))[2] = 'services' and (
        public.has_admin_permission('services.create')
        or public.has_admin_permission('services.update')
      ))
    )
  );

revoke all on function public.list_admin_roles() from public, anon;
revoke all on function public.add_admin_role(text, text, jsonb) from public, anon;
revoke all on function public.update_admin_role(text, text, jsonb) from public, anon;
revoke all on function public.delete_admin_role(text) from public, anon;
revoke all on function public.list_admin_role_users() from public, anon;
revoke all on function public.set_admin_user_role(uuid, text) from public, anon;
revoke all on function public.list_admin_activity(integer, integer) from public, anon;
revoke all on function public.reject_admin_access_request(uuid) from public, anon;
revoke all on function public.guard_admin_quote_update() from public, anon, authenticated;
revoke all on function public.guard_admin_catalog_publish() from public, anon, authenticated;

grant execute on function public.list_admin_roles() to authenticated;
grant execute on function public.add_admin_role(text, text, jsonb) to authenticated;
grant execute on function public.update_admin_role(text, text, jsonb) to authenticated;
grant execute on function public.delete_admin_role(text) to authenticated;
grant execute on function public.list_admin_role_users() to authenticated;
grant execute on function public.set_admin_user_role(uuid, text) to authenticated;
grant execute on function public.list_admin_activity(integer, integer) to authenticated;
grant execute on function public.reject_admin_access_request(uuid) to authenticated;

create or replace function public.access_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.admin_user_roles as assigned
      where assigned.user_id = (select auth.uid())
    ) then coalesce(
      (
        select assigned.role_key
        from public.admin_user_roles as assigned
        where assigned.user_id = (select auth.uid())
          and assigned.role_key in ('superadmin', 'admin', 'editor', 'support')
        order by case assigned.role_key
          when 'superadmin' then 1
          when 'admin' then 2
          when 'editor' then 3
          else 4
        end
        limit 1
      ),
      'support'
    )
    else (
      select profile.role::text
      from public.profiles as profile
      where profile.id = (select auth.uid())
    )
  end
$$;

create or replace function public.has_admin_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select bool_or((role.permissions ->> p_permission)::boolean)
      from public.admin_user_roles as assigned
      join public.admin_roles as role on role.role_key = assigned.role_key
      where assigned.user_id = (select auth.uid())
        and jsonb_typeof(role.permissions -> p_permission) = 'boolean'
        and (
          p_permission not in ('role_assignments.view', 'role_assignments.manage')
          or public.access_admin_role() in ('admin', 'superadmin')
        )
    ),
    false
  )
$$;

create or replace function public.get_my_admin_permissions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_object_agg(permission.key, permission.allowed)
      from (
        select entry.key, bool_or(entry.value = 'true'::jsonb) as allowed
        from public.admin_user_roles as assigned
        join public.admin_roles as role on role.role_key = assigned.role_key
        cross join lateral jsonb_each(role.permissions) as entry
        where assigned.user_id = (select auth.uid())
          and (
            entry.key not in ('role_assignments.view', 'role_assignments.manage')
            or public.access_admin_role() in ('admin', 'superadmin')
          )
        group by entry.key
      ) as permission
    ),
    '{}'::jsonb
  )
$$;

create or replace function public.list_admin_roles()
returns table (
  role_key text,
  display_name text,
  permissions jsonb,
  is_system boolean,
  assigned_users bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_primary_superadmin()
    and not public.has_admin_permission('role_assignments.view') then
    raise exception 'Only admins and superadmins can view assignable roles'
      using errcode = '42501';
  end if;

  return query
    select role.role_key, role.display_name, role.permissions, role.is_system,
      (select count(*) from public.admin_user_roles as assigned where assigned.role_key = role.role_key)
    from public.admin_roles as role
    order by role.is_system desc, role.display_name;
end;
$$;

drop function if exists public.list_admin_role_users();
create function public.list_admin_role_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  is_primary_superadmin boolean,
  can_manage_superadmin_role boolean,
  assigned_roles text[],
  is_activated boolean,
  account_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  primary_id uuid;
begin
  if not public.has_admin_permission('role_assignments.view') then
    raise exception 'Only admins and superadmins can view assigned roles'
      using errcode = '42501';
  end if;

  select settings.primary_superadmin_id
    into primary_id
    from public.admin_role_settings as settings
    where settings.singleton = true;

  return query
    select users.id,
      users.email::text,
      coalesce(profile.full_name::text, users.raw_user_meta_data ->> 'full_name', ''),
      public.access_admin_role_for_user(users.id),
      coalesce(profile.id = primary_id, false),
      public.is_primary_superadmin(),
      coalesce(
        array_agg(assigned.role_key order by role.display_name)
          filter (where assigned.role_key is not null),
        array[]::text[]
      ),
      (users.email_confirmed_at is not null and (users.banned_until is null or users.banned_until <= now())),
      case
        when users.banned_until is not null and users.banned_until > now() then 'Deshabilitada'
        when users.email_confirmed_at is null then 'Pendiente de confirmar correo'
        else 'Activa'
      end
    from auth.users as users
    left join public.profiles as profile on profile.id = users.id
    left join public.admin_user_roles as assigned on assigned.user_id = users.id
    left join public.admin_roles as role on role.role_key = assigned.role_key
    group by users.id, users.email, users.raw_user_meta_data, users.email_confirmed_at,
      users.banned_until, profile.id, profile.full_name, profile.role

    union all

    select
      null::uuid,
      access_request.email::text,
      access_request.full_name::text,
      null::text,
      false,
      public.is_primary_superadmin(),
      array[]::text[],
      false,
      case access_request.status
        when 'approved' then 'Aprobada · pendiente de activar'
        else 'Solicitud pendiente'
      end
    from public.admin_access_requests as access_request
    where access_request.status in ('pending', 'approved')
      and not exists (
        select 1
        from auth.users as users
        where lower(users.email) = lower(access_request.email)
      )
    order by 3, 2;
end;
$$;

create or replace function public.access_admin_role_for_user(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.admin_user_roles as assigned
      where assigned.user_id = p_user_id
    ) then coalesce(
      (
        select assigned.role_key
        from public.admin_user_roles as assigned
        where assigned.user_id = p_user_id
          and assigned.role_key in ('superadmin', 'admin', 'editor', 'support')
        order by case assigned.role_key
          when 'superadmin' then 1
          when 'admin' then 2
          when 'editor' then 3
          else 4
        end
        limit 1
      ),
      'support'
    )
    else (select profile.role::text from public.profiles as profile where profile.id = p_user_id)
  end
$$;

create or replace function public.assign_admin_user_role(p_user_id uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  primary_id uuid;
  role_name text;
begin
  if public.access_admin_role() not in ('admin', 'superadmin')
    or not public.has_admin_permission('role_assignments.manage') then
    raise exception 'Only admins and superadmins can assign roles'
      using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot assign roles to your own account'
      using errcode = '42501';
  end if;

  select primary_superadmin_id into primary_id
  from public.admin_role_settings where singleton = true;
  if p_user_id = primary_id then
    raise exception 'The primary superadmin account is protected'
      using errcode = '42501';
  end if;
  if p_role = 'superadmin' and not public.is_primary_superadmin() then
    raise exception 'Only the primary superadmin can assign the superadmin role'
      using errcode = '42501';
  end if;

  perform 1
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'Account profile not found'
      using errcode = 'P0002';
  end if;

  select display_name into role_name
  from public.admin_roles where role_key = p_role;
  if not found then
    raise exception 'Role not found'
      using errcode = 'P0002';
  end if;

  insert into public.admin_user_roles (user_id, role_key, assigned_by)
  values (p_user_id, p_role, auth.uid());
  perform public.write_admin_activity(
    auth.uid(), 'role.assigned', 'profile', p_user_id,
    jsonb_build_object('role', p_role, 'name', role_name)
  );
  return true;
end;
$$;

create or replace function public.remove_admin_user_role(p_user_id uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  primary_id uuid;
  role_name text;
  assigned_count bigint;
begin
  if public.access_admin_role() not in ('admin', 'superadmin')
    or not public.has_admin_permission('role_assignments.manage') then
    raise exception 'Only admins and superadmins can remove roles'
      using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove roles from your own account'
      using errcode = '42501';
  end if;

  select primary_superadmin_id into primary_id
  from public.admin_role_settings where singleton = true;
  if p_user_id = primary_id then
    raise exception 'The primary superadmin account is protected'
      using errcode = '42501';
  end if;
  if p_role = 'superadmin' and not public.is_primary_superadmin() then
    raise exception 'Only the primary superadmin can remove the superadmin role'
      using errcode = '42501';
  end if;

  perform 1
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'Account profile not found'
      using errcode = 'P0002';
  end if;

  select display_name into role_name
  from public.admin_roles where role_key = p_role;
  if not found then
    raise exception 'Role not found'
      using errcode = 'P0002';
  end if;

  select count(*) into assigned_count
  from public.admin_user_roles where user_id = p_user_id;
  if assigned_count <= 1 then
    raise exception 'Every account must keep at least one role'
      using errcode = '23514';
  end if;

  delete from public.admin_user_roles
  where user_id = p_user_id and role_key = p_role;
  if not found then
    raise exception 'The account does not have this role'
      using errcode = 'P0002';
  end if;
  perform public.write_admin_activity(
    auth.uid(), 'role.unassigned', 'profile', p_user_id,
    jsonb_build_object('role', p_role, 'name', role_name)
  );
  return true;
end;
$$;

create or replace function public.set_admin_user_role(p_user_id uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.assign_admin_user_role(p_user_id, p_role);
end;
$$;

create or replace function public.delete_admin_role(p_role_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_role public.admin_roles%rowtype;
  assigned_count bigint;
begin
  if not public.is_primary_superadmin() then
    raise exception 'Only the primary superadmin can manage role definitions'
      using errcode = '42501';
  end if;
  select * into existing_role
  from public.admin_roles where role_key = p_role_key for update;
  if not found then
    raise exception 'Role not found'
      using errcode = 'P0002';
  end if;
  if existing_role.is_system then
    raise exception 'Built-in roles cannot be deleted'
      using errcode = '42501';
  end if;
  select count(*) into assigned_count
  from public.admin_user_roles where role_key = p_role_key;
  if assigned_count > 0 then
    raise exception 'Reassign all users before deleting this role'
      using errcode = '23503';
  end if;

  delete from public.admin_roles where role_key = p_role_key;
  perform public.write_admin_activity(
    auth.uid(), 'role.deleted', 'admin_role', null,
    jsonb_build_object(
      'role', p_role_key,
      'name', existing_role.display_name,
      'permissions', existing_role.permissions
    )
  );
  return true;
end;
$$;

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
  insert into public.admin_user_roles (user_id, role_key)
  values (new.id, 'support')
  on conflict (user_id, role_key) do nothing;
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

revoke all on function public.access_admin_role_for_user(uuid) from public, anon, authenticated;
revoke all on function public.assign_admin_user_role(uuid, text) from public, anon;
revoke all on function public.remove_admin_user_role(uuid, text) from public, anon;
revoke all on function public.list_admin_role_users() from public, anon;
revoke all on function public.set_admin_user_role(uuid, text) from public, anon;
grant execute on function public.assign_admin_user_role(uuid, text) to authenticated;
grant execute on function public.remove_admin_user_role(uuid, text) to authenticated;
grant execute on function public.list_admin_role_users() to authenticated;
grant execute on function public.set_admin_user_role(uuid, text) to authenticated;

create or replace function public.access_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.admin_user_roles as assigned
      where assigned.user_id = (select auth.uid())
    ) then coalesce(
      (
        select assigned.role_key
        from public.admin_user_roles as assigned
        where assigned.user_id = (select auth.uid())
          and assigned.role_key in ('superadmin', 'admin', 'editor', 'support')
        order by case assigned.role_key
          when 'superadmin' then 1
          when 'admin' then 2
          when 'editor' then 3
          else 4
        end
        limit 1
      ),
      'support'
    )
    else (
      select profile.role::text
      from public.profiles as profile
      where profile.id = (select auth.uid())
    )
  end
$$;

create or replace function public.access_admin_role_for_user(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.admin_user_roles as assigned
      where assigned.user_id = p_user_id
    ) then coalesce(
      (
        select assigned.role_key
        from public.admin_user_roles as assigned
        where assigned.user_id = p_user_id
          and assigned.role_key in ('superadmin', 'admin', 'editor', 'support')
        order by case assigned.role_key
          when 'superadmin' then 1
          when 'admin' then 2
          when 'editor' then 3
          else 4
        end
        limit 1
      ),
      'support'
    )
    else (select profile.role::text from public.profiles as profile where profile.id = p_user_id)
  end
$$;

create or replace function public.has_admin_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select bool_or((role.permissions ->> p_permission)::boolean)
      from public.admin_user_roles as assigned
      join public.admin_roles as role on role.role_key = assigned.role_key
      where assigned.user_id = (select auth.uid())
        and jsonb_typeof(role.permissions -> p_permission) = 'boolean'
        and (
          p_permission not in ('role_assignments.view', 'role_assignments.manage')
          or public.access_admin_role() in ('admin', 'superadmin')
        )
    ),
    false
  )
$$;

create or replace function public.get_my_admin_permissions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_object_agg(permission.key, permission.allowed)
      from (
        select entry.key, bool_or(entry.value = 'true'::jsonb) as allowed
        from public.admin_user_roles as assigned
        join public.admin_roles as role on role.role_key = assigned.role_key
        cross join lateral jsonb_each(role.permissions) as entry
        where assigned.user_id = (select auth.uid())
          and (
            entry.key not in ('role_assignments.view', 'role_assignments.manage')
            or public.access_admin_role() in ('admin', 'superadmin')
          )
        group by entry.key
      ) as permission
    ),
    '{}'::jsonb
  )
$$;

create or replace function public.list_admin_roles()
returns table (
  role_key text,
  display_name text,
  permissions jsonb,
  is_system boolean,
  assigned_users bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_primary_superadmin()
    and not public.has_admin_permission('role_assignments.view') then
    raise exception 'Only admins and superadmins can view assignable roles'
      using errcode = '42501';
  end if;

  return query
    select role.role_key, role.display_name, role.permissions, role.is_system,
      (select count(*) from public.admin_user_roles as assigned where assigned.role_key = role.role_key)
    from public.admin_roles as role
    order by role.is_system desc, role.display_name;
end;
$$;

drop function if exists public.list_admin_role_users();
create function public.list_admin_role_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  is_primary_superadmin boolean,
  can_manage_superadmin_role boolean,
  assigned_roles text[],
  is_activated boolean,
  account_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  primary_id uuid;
begin
  if not public.has_admin_permission('role_assignments.view') then
    raise exception 'Only admins and superadmins can view assigned roles'
      using errcode = '42501';
  end if;

  select settings.primary_superadmin_id
    into primary_id
    from public.admin_role_settings as settings
    where settings.singleton = true;

  return query
    select users.id,
      users.email::text,
      coalesce(profile.full_name::text, users.raw_user_meta_data ->> 'full_name', ''),
      public.access_admin_role_for_user(users.id),
      coalesce(profile.id = primary_id, false),
      public.is_primary_superadmin(),
      coalesce(
        array_agg(assigned.role_key order by role.display_name)
          filter (where assigned.role_key is not null),
        array[]::text[]
      ),
      (users.email_confirmed_at is not null and (users.banned_until is null or users.banned_until <= now())),
      case
        when users.banned_until is not null and users.banned_until > now() then 'Deshabilitada'
        when users.email_confirmed_at is null then 'Pendiente de confirmar correo'
        else 'Activa'
      end
    from auth.users as users
    left join public.profiles as profile on profile.id = users.id
    left join public.admin_user_roles as assigned on assigned.user_id = users.id
    left join public.admin_roles as role on role.role_key = assigned.role_key
    group by users.id, users.email, users.raw_user_meta_data, users.email_confirmed_at,
      users.banned_until, profile.id, profile.full_name, profile.role

    union all

    select
      null::uuid,
      access_request.email::text,
      access_request.full_name::text,
      null::text,
      false,
      public.is_primary_superadmin(),
      array[]::text[],
      false,
      case access_request.status
        when 'approved' then 'Aprobada · pendiente de activar'
        else 'Solicitud pendiente'
      end
    from public.admin_access_requests as access_request
    where access_request.status in ('pending', 'approved')
      and not exists (
        select 1
        from auth.users as users
        where lower(users.email) = lower(access_request.email)
      )
    order by 3, 2;
end;
$$;

create or replace function public.assign_admin_user_role(p_user_id uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  primary_id uuid;
  role_name text;
begin
  if public.access_admin_role() not in ('admin', 'superadmin')
    or not public.has_admin_permission('role_assignments.manage') then
    raise exception 'Only admins and superadmins can assign roles'
      using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot assign roles to your own account'
      using errcode = '42501';
  end if;

  select primary_superadmin_id into primary_id
  from public.admin_role_settings where singleton = true;
  if p_user_id = primary_id then
    raise exception 'The primary superadmin account is protected'
      using errcode = '42501';
  end if;
  if p_role = 'superadmin' and not public.is_primary_superadmin() then
    raise exception 'Only the primary superadmin can assign the superadmin role'
      using errcode = '42501';
  end if;

  perform 1
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'Account profile not found'
      using errcode = 'P0002';
  end if;

  select display_name into role_name
  from public.admin_roles where role_key = p_role;
  if not found then
    raise exception 'Role not found'
      using errcode = 'P0002';
  end if;

  insert into public.admin_user_roles (user_id, role_key, assigned_by)
  values (p_user_id, p_role, auth.uid());
  perform public.write_admin_activity(
    auth.uid(), 'role.assigned', 'profile', p_user_id,
    jsonb_build_object('role', p_role, 'name', role_name)
  );
  return true;
end;
$$;

create or replace function public.remove_admin_user_role(p_user_id uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  primary_id uuid;
  role_name text;
  assigned_count bigint;
begin
  if public.access_admin_role() not in ('admin', 'superadmin')
    or not public.has_admin_permission('role_assignments.manage') then
    raise exception 'Only admins and superadmins can remove roles'
      using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove roles from your own account'
      using errcode = '42501';
  end if;

  select primary_superadmin_id into primary_id
  from public.admin_role_settings where singleton = true;
  if p_user_id = primary_id then
    raise exception 'The primary superadmin account is protected'
      using errcode = '42501';
  end if;
  if p_role = 'superadmin' and not public.is_primary_superadmin() then
    raise exception 'Only the primary superadmin can remove the superadmin role'
      using errcode = '42501';
  end if;

  perform 1
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'Account profile not found'
      using errcode = 'P0002';
  end if;

  select display_name into role_name
  from public.admin_roles where role_key = p_role;
  if not found then
    raise exception 'Role not found'
      using errcode = 'P0002';
  end if;

  select count(*) into assigned_count
  from public.admin_user_roles where user_id = p_user_id;
  if assigned_count <= 1 then
    raise exception 'Every account must keep at least one role'
      using errcode = '23514';
  end if;

  delete from public.admin_user_roles
  where user_id = p_user_id and role_key = p_role;
  if not found then
    raise exception 'The account does not have this role'
      using errcode = 'P0002';
  end if;
  perform public.write_admin_activity(
    auth.uid(), 'role.unassigned', 'profile', p_user_id,
    jsonb_build_object('role', p_role, 'name', role_name)
  );
  return true;
end;
$$;

create or replace function public.set_admin_user_role(p_user_id uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.assign_admin_user_role(p_user_id, p_role);
end;
$$;

create or replace function public.delete_admin_role(p_role_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_role public.admin_roles%rowtype;
  assigned_count bigint;
begin
  if not public.is_primary_superadmin() then
    raise exception 'Only the primary superadmin can manage role definitions'
      using errcode = '42501';
  end if;
  select * into existing_role
  from public.admin_roles where role_key = p_role_key for update;
  if not found then
    raise exception 'Role not found'
      using errcode = 'P0002';
  end if;
  if existing_role.is_system then
    raise exception 'Built-in roles cannot be deleted'
      using errcode = '42501';
  end if;
  select count(*) into assigned_count
  from public.admin_user_roles where role_key = p_role_key;
  if assigned_count > 0 then
    raise exception 'Reassign all users before deleting this role'
      using errcode = '23503';
  end if;

  delete from public.admin_roles where role_key = p_role_key;
  perform public.write_admin_activity(
    auth.uid(), 'role.deleted', 'admin_role', null,
    jsonb_build_object(
      'role', p_role_key,
      'name', existing_role.display_name,
      'permissions', existing_role.permissions
    )
  );
  return true;
end;
$$;

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
  insert into public.admin_user_roles (user_id, role_key)
  values (new.id, 'support')
  on conflict (user_id, role_key) do nothing;
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
revoke all on function public.access_admin_role_for_user(uuid) from public, anon, authenticated;
revoke all on function public.assign_admin_user_role(uuid, text) from public, anon;
revoke all on function public.remove_admin_user_role(uuid, text) from public, anon;
revoke all on function public.list_admin_role_users() from public, anon;
revoke all on function public.set_admin_user_role(uuid, text) from public, anon;
grant execute on function public.assign_admin_user_role(uuid, text) to authenticated;
grant execute on function public.remove_admin_user_role(uuid, text) to authenticated;
grant execute on function public.list_admin_role_users() to authenticated;
grant execute on function public.set_admin_user_role(uuid, text) to authenticated;

notify pgrst, 'reload schema';
