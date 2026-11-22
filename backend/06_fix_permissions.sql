-- =====================================================================
-- CORRECCIÓN DE FONDO: "permission denied for table group_members" y
-- el rol que no se lee. Causa: las funciones de ayuda consultan otras
-- tablas y, aunque son SECURITY DEFINER, necesitan permisos explícitos
-- y evitar recursión entre políticas.
--
-- Este archivo:
--   1) Reafirma que las funciones son SECURITY DEFINER y pertenecen a un
--      rol con acceso (postgres), para que puedan leer las tablas por dentro.
--   2) Da permiso de ejecución a los usuarios autenticados.
--   3) Concede los GRANT básicos de tabla (RLS sigue mandando igualmente).
--
-- Ejecuta TODO este archivo en el SQL Editor de Supabase.
-- =====================================================================

-- 1. Asegurar dueño y SECURITY DEFINER de las funciones de ayuda.
alter function public.is_founder() owner to postgres;
alter function public.my_role() owner to postgres;
alter function public.is_group_member(uuid) owner to postgres;
alter function public.is_group_owner(uuid) owner to postgres;

-- 2. Permiso de ejecución para la app (rol 'authenticated' y 'anon').
grant execute on function public.is_founder() to authenticated, anon;
grant execute on function public.my_role() to authenticated, anon;
grant execute on function public.is_group_member(uuid) to authenticated, anon;
grant execute on function public.is_group_owner(uuid) to authenticated, anon;
grant execute on function public.redeem_teacher_invite(text) to authenticated;
grant execute on function public.create_group(text, boolean) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.quiz_ranking(uuid) to authenticated;

-- 3. GRANT de tablas al rol autenticado (RLS sigue filtrando filas).
grant select, insert, update, delete on
  public.profiles, public.groups, public.group_members, public.group_words,
  public.personal_data, public.quiz_sessions, public.quiz_answers,
  public.teacher_invites
to authenticated;

-- 4. Reescribir las funciones para fijar search_path y evitar sorpresas.
create or replace function public.is_founder()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'founder');
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function public.is_group_owner(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.groups where id = gid and owner_id = auth.uid());
$$;
