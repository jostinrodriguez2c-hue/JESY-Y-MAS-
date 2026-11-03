-- Run after admin-access.sql and role-permissions.sql.
-- Deploy the Edge Function with: supabase functions deploy staff-actions
-- For email later, add RESEND_API_KEY and RESEND_FROM_EMAIL as Edge Function secrets.
-- Only the staff-actions Edge Function may read or write this table.

create table if not exists public.admin_staff_actions (
  id uuid primary key default gen_random_uuid(),
  action_type text not null
    check (action_type in ('warning', 'dismissal', 'restoration')),
  action_status text not null default 'pending'
    check (action_status in ('pending', 'completed', 'failed')),
  target_user_id uuid not null,
  target_email text not null,
  target_full_name text not null default '',
  actor_user_id uuid not null,
  actor_email text not null,
  reason text,
  email_status text not null default 'not_applicable'
    check (email_status in ('not_applicable', 'pending', 'sent', 'failed')),
  email_error text,
  action_error text,
  created_at timestamptz not null default now(),
  check (action_type <> 'warning' or length(trim(coalesce(reason, ''))) > 0),
  check (reason is null or length(reason) <= 2000)
);

create index if not exists admin_staff_actions_target_created
  on public.admin_staff_actions (target_user_id, created_at desc);

alter table public.admin_staff_actions enable row level security;
revoke all on public.admin_staff_actions from public, anon, authenticated;
grant all on public.admin_staff_actions to service_role;

create table if not exists public.admin_staff_access (
  user_id uuid primary key,
  disabled_at timestamptz not null default now(),
  disabled_by uuid not null,
  reason text
);

alter table public.admin_staff_access enable row level security;
revoke all on public.admin_staff_access from public, anon, authenticated;
grant all on public.admin_staff_access to service_role;

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
      from public.admin_staff_access as disabled
      where disabled.user_id = (select auth.uid())
    ) then null
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

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.access_admin_role()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.access_admin_role() in ('superadmin', 'admin'), false)
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
      from public.admin_staff_access as disabled
      where disabled.user_id = p_user_id
    ) then null
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
    else (
      select profile.role::text
      from public.profiles as profile
      where profile.id = p_user_id
    )
  end
$$;

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
      and not exists (
        select 1
        from public.admin_staff_access as disabled
        where disabled.user_id = (select auth.uid())
      )
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
      select bool_or((role.permissions ->> p_permission)::boolean)
      from public.admin_user_roles as assigned
      join public.admin_roles as role on role.role_key = assigned.role_key
      where assigned.user_id = (select auth.uid())
        and public.access_admin_role() is not null
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
  select case
    when public.access_admin_role() is null then '{}'::jsonb
    else coalesce(
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
  end
$$;

revoke all on function public.access_admin_role() from public, anon;
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.access_admin_role_for_user(uuid) from public, anon, authenticated;
revoke all on function public.is_primary_superadmin() from public, anon;
revoke all on function public.has_admin_permission(text) from public, anon;
revoke all on function public.get_my_admin_permissions() from public, anon;
grant execute on function public.access_admin_role() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_primary_superadmin() to authenticated;
grant execute on function public.has_admin_permission(text) to authenticated;
grant execute on function public.get_my_admin_permissions() to authenticated;
