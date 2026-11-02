-- Safe repair for an existing activity_log table and its dashboard RPC.
-- Run after schema.sql and after public.profiles exists.

alter table public.activity_log
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists actor_id uuid,
  add column if not exists action text not null default 'legacy',
  add column if not exists entity_type text not null default 'legacy',
  add column if not exists entity_id uuid,
  add column if not exists details jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists activity_log_created_at_desc
  on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;
revoke all on public.activity_log from anon, authenticated;

drop function if exists public.list_admin_activity(integer);
drop function if exists public.list_admin_activity(integer, integer);

create function public.list_admin_activity(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  actor_name text,
  actor_email text,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
begin
  select profile.role
    into caller_role
    from public.profiles as profile
    where profile.id = (select auth.uid());

  if coalesce(caller_role, '') not in ('admin', 'superadmin') then
    raise exception 'Only admins can view the activity history'
      using errcode = '42501';
  end if;

  return query
    select
      activity.id,
      coalesce(profile.full_name, ''),
      users.email::text,
      activity.action,
      activity.entity_type,
      activity.entity_id,
      activity.details,
      activity.created_at,
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

notify pgrst, 'reload schema';
