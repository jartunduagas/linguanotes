-- =====================================================================
-- CORRECCIÓN: la política de lectura de 'profiles' era demasiado compleja
-- y podía impedir que la app leyera tu propio perfil (y por tanto tu rol).
-- La partimos en políticas simples. Varias políticas de SELECT se combinan
-- con OR, así que basta con que UNA te dé permiso.
-- Ejecuta este archivo en el SQL Editor de Supabase (una sola vez).
-- =====================================================================

-- Quitar la política antigua compleja
drop policy if exists profiles_select on public.profiles;

-- 1. SIEMPRE puedes leer tu propio perfil (lo más importante).
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

-- 2. El fundador puede leer todos los perfiles.
drop policy if exists profiles_select_founder on public.profiles;
create policy profiles_select_founder on public.profiles
  for select using (public.is_founder());

-- 3. Puedes leer el perfil de quienes comparten algún grupo contigo.
drop policy if exists profiles_select_groupmates on public.profiles;
create policy profiles_select_groupmates on public.profiles
  for select using (
    exists (
      select 1 from public.group_members gm1
      join public.group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid() and gm2.user_id = public.profiles.id
    )
  );
