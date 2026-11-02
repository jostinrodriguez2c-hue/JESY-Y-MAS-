-- JESY Y MAS - esquema inicial para Supabase
-- Ejecutar en Supabase > SQL Editor.
-- Revisa las políticas antes de publicar. No uses la service_role key en el navegador.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'support'
    check (role in ('superadmin','admin','editor','support')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'support')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('superadmin','admin'), false)
$$;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  description text,
  image_url text,
  is_published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  description text,
  location text,
  category text,
  cover_image text,
  is_published boolean not null default false,
  completed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  company text,
  email text not null,
  phone text not null,
  location text not null,
  service text not null,
  budget text,
  details text not null,
  status text not null default 'pending'
    check (status in ('pending','reviewing','sent','approved','rejected','closed')),
  internal_notes text,
  assigned_to uuid references public.profiles(id),
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

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.projects enable row level security;
alter table public.quote_requests enable row level security;
alter table public.activity_log enable row level security;

-- Perfiles: cada usuario puede leer su perfil; admins pueden leer perfiles.
drop policy if exists "profile read self or admin" on public.profiles;
create policy "profile read self or admin" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or public.is_admin());

-- No se permite cambiar roles desde el cliente. Los cambios de rol se hacen
-- desde SQL Editor por el propietario del proyecto o mediante una función segura futura.
-- Los perfiles y roles se administran inicialmente desde SQL Editor.\n-- Así se evita que un usuario modifique su propio rol desde el navegador.\n\n-- Servicios y proyectos publicados visibles al público.
drop policy if exists "public read published services" on public.services;
create policy "public read published services" on public.services
for select to anon, authenticated
using (is_published = true or public.is_admin());

drop policy if exists "admins manage services" on public.services;
create policy "admins manage services" on public.services
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "public read published projects" on public.projects;
create policy "public read published projects" on public.projects
for select to anon, authenticated
using (is_published = true or public.is_admin());

drop policy if exists "admins manage projects" on public.projects;
create policy "admins manage projects" on public.projects
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- El público solo puede crear solicitudes. No puede leer ni modificar solicitudes.
drop policy if exists "public create quote request" on public.quote_requests;
create policy "public create quote request" on public.quote_requests
for insert to anon, authenticated
with check (
  length(trim(full_name)) between 2 and 120
  and length(trim(email)) between 5 and 160
  and length(trim(phone)) between 5 and 40
  and length(trim(details)) between 5 and 4000
);

drop policy if exists "admins read quote requests" on public.quote_requests;
create policy "admins read quote requests" on public.quote_requests
for select to authenticated
using (public.is_admin() or public.current_user_role() = 'support');

drop policy if exists "admins update quote requests" on public.quote_requests;
create policy "admins update quote requests" on public.quote_requests
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read activity" on public.activity_log;
create policy "admins read activity" on public.activity_log
for select to authenticated
using (public.is_admin());

drop policy if exists "admins insert activity" on public.activity_log;
create policy "admins insert activity" on public.activity_log
for insert to authenticated
with check (public.is_admin() and actor_id = (select auth.uid()));

-- Datos iniciales de los siete servicios.
insert into public.services (title, slug, description, is_published, sort_order)
values
('Construcción','construccion','Ejecución de proyectos de construcción.',true,1),
('Diseño y planos','diseno-y-planos','Diseño y documentación técnica.',true,2),
('Instalaciones eléctricas','instalaciones-electricas','Soluciones para instalaciones y adecuaciones eléctricas.',true,3),
('Remodelaciones','remodelaciones','Renovación y mejora de espacios.',true,4),
('Supervisión de obras','supervision-de-obras','Seguimiento técnico y control de ejecución.',true,5),
('Obras civiles','obras-civiles','Trabajos de infraestructura y desarrollo civil.',true,6),
('Consultoría de ingeniería','consultoria-de-ingenieria','Asesoría y orientación técnica.',true,7)
on conflict (slug) do nothing;

-- CONFIGURACIÓN DEL PRIMER SUPERADMINISTRADOR:
-- 1) Crea tu usuario desde Supabase Authentication > Users.
-- 2) Copia su UUID.
-- 3) Ejecuta manualmente esta instrucción sustituyendo el UUID:
-- update public.profiles set role = 'superadmin', full_name = 'Tu nombre'
-- where id = 'UUID-DEL-USUARIO';
--
-- Para agregar administradores posteriormente, el superadmin debe asignar
-- roles desde un flujo backend seguro. No habilites registro público de admins.
