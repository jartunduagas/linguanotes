-- =====================================================================
-- CORRECCIÓN: permitir que un usuario edite su propio perfil (nombre),
-- sin poder cambiarse el rol. La política anterior tenía una condición
-- circular que bloqueaba la actualización del nombre.
-- Ejecuta este archivo en el SQL Editor de Supabase (una sola vez).
-- =====================================================================

-- 1. Política simple: puedes actualizar tu propia fila.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- 2. Trigger que impide que un NO-fundador cambie su propio rol.
--    (El fundador sí puede cambiar roles; esta es la protección real.)
create or replace function public.prevent_role_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- permitir el cambio solo si quien ejecuta es fundador
    if not public.is_founder() then
      new.role := old.role;  -- revertir el intento de cambiar el rol
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_change on public.profiles;
create trigger trg_prevent_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_change();
