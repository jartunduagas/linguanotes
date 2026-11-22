-- =====================================================================
-- LinguaNotes — Funciones RPC (lógica de servidor segura)
-- Ejecuta DESPUÉS de 01 y 02. Estas funciones se llaman desde la app.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Canjear un código de invitación de profesor.
-- Sube el rol del usuario actual a 'teacher' si el código es válido.
-- Nadie puede ascenderse sin un código creado por el fundador.
-- ---------------------------------------------------------------------
create or replace function public.redeem_teacher_invite(invite_code text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  inv record;
begin
  select * into inv from public.teacher_invites where code = invite_code for update;
  if not found then
    return 'invalid';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    return 'expired';
  end if;
  if inv.used_count >= inv.max_uses then
    return 'used_up';
  end if;

  update public.teacher_invites set used_count = used_count + 1 where code = invite_code;
  update public.profiles set role = 'teacher'
    where id = auth.uid() and role = 'generic'; -- no degradamos a un fundador
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------
-- Crear un grupo con un código numérico único de 6 dígitos.
-- Solo profesores/fundador (se valida por RLS en el insert).
-- ---------------------------------------------------------------------
create or replace function public.create_group(group_name text, allow_student_words boolean default true)
returns public.groups
language plpgsql security definer set search_path = public
as $$
declare
  new_code text;
  g public.groups;
  attempts int := 0;
begin
  if public.my_role() not in ('teacher','founder') then
    raise exception 'Solo los profesores pueden crear grupos';
  end if;

  loop
    new_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.groups where join_code = new_code);
    attempts := attempts + 1;
    if attempts > 50 then raise exception 'No se pudo generar un código único'; end if;
  end loop;

  insert into public.groups (name, join_code, owner_id, allow_student_words)
  values (group_name, new_code, auth.uid(), allow_student_words)
  returning * into g;

  -- el profesor también queda como miembro de su propio grupo
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid())
  on conflict do nothing;

  return g;
end;
$$;

-- ---------------------------------------------------------------------
-- Unirse a un grupo por código. Devuelve el grupo o un error legible.
-- ---------------------------------------------------------------------
create or replace function public.join_group(code text)
returns public.groups
language plpgsql security definer set search_path = public
as $$
declare
  g public.groups;
begin
  select * into g from public.groups where join_code = code;
  if not found then raise exception 'Código no válido'; end if;
  if not g.is_open then raise exception 'Este grupo está cerrado'; end if;

  insert into public.group_members (group_id, user_id) values (g.id, auth.uid())
  on conflict do nothing;
  return g;
end;
$$;

-- ---------------------------------------------------------------------
-- Ranking de una sesión de quiz: aciertos por participante.
-- Devuelve nombre + aciertos ordenados de mayor a menor.
-- ---------------------------------------------------------------------
create or replace function public.quiz_ranking(sid uuid)
returns table(user_id uuid, display_name text, correct int, total int)
language sql security definer set search_path = public
as $$
  select
    a.user_id,
    p.display_name,
    sum(case when a.is_correct then 1 else 0 end)::int as correct,
    count(*)::int as total
  from public.quiz_answers a
  join public.profiles p on p.id = a.user_id
  where a.session_id = sid
  group by a.user_id, p.display_name
  order by correct desc, total asc;
$$;
