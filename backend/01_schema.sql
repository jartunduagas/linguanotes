-- =====================================================================
-- LinguaNotes — Esquema de base de datos (Fase 2: cuentas, roles, grupos)
-- Pega TODO este archivo en: Supabase → tu proyecto → SQL Editor → New query → Run
-- Es idempotente en lo posible: puedes re-ejecutarlo sin romper lo existente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERFILES  (extiende auth.users con nombre visible y rol)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Estudiante',
  role        text not null default 'generic' check (role in ('founder','teacher','generic')),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Al registrarse un usuario en Auth, se crea su perfil automáticamente (rol genérico).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Estudiante'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Función de ayuda: ¿el usuario actual es fundador?
create or replace function public.is_founder()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'founder');
$$;

-- Función de ayuda: rol del usuario actual
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 2. CÓDIGOS DE INVITACIÓN DE PROFESOR
-- ---------------------------------------------------------------------
create table if not exists public.teacher_invites (
  code        text primary key,
  created_by  uuid not null references public.profiles(id),
  max_uses    int not null default 1,
  used_count  int not null default 0,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.teacher_invites enable row level security;

-- ---------------------------------------------------------------------
-- 3. GRUPOS
-- ---------------------------------------------------------------------
create table if not exists public.groups (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  join_code            text not null unique,
  owner_id             uuid not null references public.profiles(id) on delete cascade,
  is_open              boolean not null default true,
  allow_student_words  boolean not null default true,
  created_at           timestamptz not null default now(),
  closed_at            timestamptz
);
alter table public.groups enable row level security;

-- ---------------------------------------------------------------------
-- 4. MIEMBROS DE GRUPO
-- ---------------------------------------------------------------------
create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_members enable row level security;

-- ¿El usuario actual es miembro de ese grupo?
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

-- ¿El usuario actual es el dueño (profesor) de ese grupo?
create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.groups where id = gid and owner_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 5. PALABRAS DEL GRUPO (compartidas)
-- ---------------------------------------------------------------------
create table if not exists public.group_words (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  added_by    uuid not null references public.profiles(id),
  term        text not null,
  en          text default '',
  es          text default '',
  is_verb     boolean default false,
  is_noun     boolean default false,
  gender      text default '',
  prepositions jsonb default '[]'::jsonb,
  notes       text default '',
  created_at  timestamptz not null default now()
);
alter table public.group_words enable row level security;

-- ---------------------------------------------------------------------
-- 6. NOTAS PERSONALES (sincronización multi-dispositivo)
--    Guardamos TODO el estado del usuario como un documento JSON.
-- ---------------------------------------------------------------------
create table if not exists public.personal_data (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.personal_data enable row level security;

-- ---------------------------------------------------------------------
-- 7. QUIZ EN VIVO
-- ---------------------------------------------------------------------
create table if not exists public.quiz_sessions (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  modes      jsonb not null default '[]'::jsonb,   -- ['translation','preposition','conjugation','gender']
  status     text not null default 'running' check (status in ('running','finished')),
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);
alter table public.quiz_sessions enable row level security;

create table if not exists public.quiz_answers (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.quiz_sessions(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  is_correct  boolean not null,
  answered_at timestamptz not null default now()
);
alter table public.quiz_answers enable row level security;
