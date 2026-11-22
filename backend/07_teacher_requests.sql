-- =====================================================================
-- Opción C: código de profesor ILIMITADO (anual) que crea una SOLICITUD,
-- y el FUNDADOR aprueba/rechaza manualmente.
-- Ejecuta TODO este archivo en el SQL Editor de Supabase.
-- =====================================================================

-- 1. Tabla de solicitudes para ser profesor.
create table if not exists public.teacher_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  unique (user_id)   -- una solicitud por persona
);
alter table public.teacher_requests enable row level security;

grant select, insert, update, delete on public.teacher_requests to authenticated;

-- Ver: tu propia solicitud, o todas si eres fundador.
drop policy if exists treq_select on public.teacher_requests;
create policy treq_select on public.teacher_requests
  for select using (user_id = auth.uid() or public.is_founder());

-- Insertar: solo tu propia solicitud (la función de abajo lo hace de forma controlada).
drop policy if exists treq_insert on public.teacher_requests;
create policy treq_insert on public.teacher_requests
  for insert with check (user_id = auth.uid());

-- Actualizar (aprobar/rechazar): solo el fundador.
drop policy if exists treq_update on public.teacher_requests;
create policy treq_update on public.teacher_requests
  for update using (public.is_founder());

-- 2. Reemplazar la función de canje: ahora el código NO asciende directamente,
--    solo valida el código y crea una SOLICITUD pendiente.
create or replace function public.redeem_teacher_invite(invite_code text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  inv record;
  current_role_val text;
begin
  select role into current_role_val from public.profiles where id = auth.uid();
  if current_role_val in ('teacher','founder') then
    return 'already';   -- ya eres profesor/fundador
  end if;

  select * into inv from public.teacher_invites where code = invite_code;
  if not found then
    return 'invalid';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    return 'expired';
  end if;
  -- usos ilimitados: NO comprobamos used_count

  -- crear/renovar la solicitud como 'pending'
  insert into public.teacher_requests (user_id, status)
  values (auth.uid(), 'pending')
  on conflict (user_id) do update set status = 'pending', created_at = now(), decided_at = null;

  return 'requested';   -- solicitud enviada, pendiente de aprobación del fundador
end;
$$;

grant execute on function public.redeem_teacher_invite(text) to authenticated;

-- 3. Función para que el FUNDADOR apruebe o rechace una solicitud.
create or replace function public.decide_teacher_request(req_user_id uuid, approve boolean)
returns text
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_founder() then
    raise exception 'Solo el fundador puede aprobar solicitudes';
  end if;

  update public.teacher_requests
    set status = case when approve then 'approved' else 'rejected' end,
        decided_at = now()
  where user_id = req_user_id;

  if approve then
    update public.profiles set role = 'teacher'
    where id = req_user_id and role = 'generic';
  end if;

  return 'ok';
end;
$$;

grant execute on function public.decide_teacher_request(uuid, boolean) to authenticated;

-- 4. Vista de solicitudes pendientes con el nombre y correo (solo la usa el fundador).
create or replace function public.pending_teacher_requests()
returns table(user_id uuid, display_name text, email text, created_at timestamptz)
language sql security definer set search_path = public
as $$
  select r.user_id, p.display_name, u.email, r.created_at
  from public.teacher_requests r
  join public.profiles p on p.id = r.user_id
  join auth.users u on u.id = r.user_id
  where r.status = 'pending' and public.is_founder()
  order by r.created_at;
$$;

grant execute on function public.pending_teacher_requests() to authenticated;
