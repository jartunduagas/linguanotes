-- =====================================================================
-- LinguaNotes — Políticas de seguridad (RLS)
-- Ejecuta este archivo DESPUÉS de 01_schema.sql, en el SQL Editor de Supabase.
-- Define QUIÉN puede leer/escribir cada tabla. Es lo que protege los datos
-- aunque la clave pública (anon) sea visible.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()                    -- veo mi propio perfil
    or public.is_founder()             -- el fundador ve todos
    -- un usuario ve el nombre de otros con quienes comparte algún grupo:
    or exists (
      select 1 from public.group_members gm1
      join public.group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid() and gm2.user_id = public.profiles.id
    )
    -- y ve al dueño (profesor) de los grupos a los que pertenece:
    or exists (
      select 1 from public.groups g
      join public.group_members gm on gm.group_id = g.id
      where gm.user_id = auth.uid() and g.owner_id = public.profiles.id
    )
  );

-- Puedo actualizar mi nombre, pero NO puedo cambiarme el rol.
-- Solo el fundador puede cambiar roles (política aparte).
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles p where p.id = auth.uid()));

drop policy if exists profiles_update_founder on public.profiles;
create policy profiles_update_founder on public.profiles
  for update using (public.is_founder()) with check (public.is_founder());

-- ---------------------------------------------------------------------
-- TEACHER_INVITES  (solo el fundador los crea/ve/borra)
-- ---------------------------------------------------------------------
drop policy if exists invites_founder_all on public.teacher_invites;
create policy invites_founder_all on public.teacher_invites
  for all using (public.is_founder()) with check (public.is_founder());

-- ---------------------------------------------------------------------
-- GROUPS
-- ---------------------------------------------------------------------
-- Leer: el dueño, los miembros, o el fundador.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select using (
    owner_id = auth.uid() or public.is_group_member(id) or public.is_founder()
  );

-- Crear grupo: solo profesores o fundador, y el owner debe ser uno mismo.
drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert with check (
    owner_id = auth.uid() and public.my_role() in ('teacher','founder')
  );

-- Modificar/cerrar grupo: solo su dueño (o fundador).
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update using (owner_id = auth.uid() or public.is_founder());

-- Borrar grupo: solo su dueño (o fundador).
drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete using (owner_id = auth.uid() or public.is_founder());

-- ---------------------------------------------------------------------
-- GROUP_MEMBERS
-- ---------------------------------------------------------------------
-- Ver miembros: los del propio grupo, el dueño o el fundador.
drop policy if exists members_select on public.group_members;
create policy members_select on public.group_members
  for select using (
    user_id = auth.uid() or public.is_group_member(group_id)
    or public.is_group_owner(group_id) or public.is_founder()
  );

-- Unirse: solo puedes insertarte A TI MISMO, y solo si el grupo está abierto.
drop policy if exists members_insert_self on public.group_members;
create policy members_insert_self on public.group_members
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.groups g where g.id = group_id and g.is_open)
  );

-- Salir / ser expulsado: uno mismo, o el dueño del grupo, o el fundador.
drop policy if exists members_delete on public.group_members;
create policy members_delete on public.group_members
  for delete using (
    user_id = auth.uid() or public.is_group_owner(group_id) or public.is_founder()
  );

-- ---------------------------------------------------------------------
-- GROUP_WORDS
-- ---------------------------------------------------------------------
-- Ver palabras del grupo: miembros, dueño o fundador.
drop policy if exists gwords_select on public.group_words;
create policy gwords_select on public.group_words
  for select using (
    public.is_group_member(group_id) or public.is_group_owner(group_id) or public.is_founder()
  );

-- Añadir palabra: el dueño siempre; los alumnos solo si el grupo lo permite.
drop policy if exists gwords_insert on public.group_words;
create policy gwords_insert on public.group_words
  for insert with check (
    added_by = auth.uid()
    and (
      public.is_group_owner(group_id)
      or (public.is_group_member(group_id)
          and exists (select 1 from public.groups g where g.id = group_id and g.allow_student_words))
    )
  );

-- Editar/borrar palabra: quien la añadió o el dueño del grupo.
drop policy if exists gwords_update on public.group_words;
create policy gwords_update on public.group_words
  for update using (added_by = auth.uid() or public.is_group_owner(group_id));

drop policy if exists gwords_delete on public.group_words;
create policy gwords_delete on public.group_words
  for delete using (added_by = auth.uid() or public.is_group_owner(group_id));

-- ---------------------------------------------------------------------
-- PERSONAL_DATA  (cada quien solo ve y edita lo suyo)
-- ---------------------------------------------------------------------
drop policy if exists personal_all on public.personal_data;
create policy personal_all on public.personal_data
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- QUIZ_SESSIONS
-- ---------------------------------------------------------------------
-- Ver sesiones del grupo: miembros, dueño o fundador.
drop policy if exists qsessions_select on public.quiz_sessions;
create policy qsessions_select on public.quiz_sessions
  for select using (
    public.is_group_member(group_id) or public.is_group_owner(group_id) or public.is_founder()
  );

-- Crear/cerrar quiz: solo el dueño del grupo.
drop policy if exists qsessions_insert on public.quiz_sessions;
create policy qsessions_insert on public.quiz_sessions
  for insert with check (public.is_group_owner(group_id));

drop policy if exists qsessions_update on public.quiz_sessions;
create policy qsessions_update on public.quiz_sessions
  for update using (public.is_group_owner(group_id));

-- ---------------------------------------------------------------------
-- QUIZ_ANSWERS
-- ---------------------------------------------------------------------
-- Ver respuestas: las propias, o el dueño del grupo de esa sesión (para el ranking).
drop policy if exists qanswers_select on public.quiz_answers;
create policy qanswers_select on public.quiz_answers
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.quiz_sessions s
      where s.id = session_id and public.is_group_owner(s.group_id)
    )
    or exists (
      select 1 from public.quiz_sessions s
      where s.id = session_id and public.is_group_member(s.group_id)
    )
  );

-- Responder: solo tú mismo, y solo en sesiones de grupos a los que perteneces.
drop policy if exists qanswers_insert on public.quiz_answers;
create policy qanswers_insert on public.quiz_answers
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.quiz_sessions s
      where s.id = session_id and public.is_group_member(s.group_id)
    )
  );
