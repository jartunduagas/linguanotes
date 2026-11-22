-- =====================================================================
-- Crear / renovar el CÓDIGO DE PROFESOR anual (usos ilimitados).
-- Ejecútalo tú (el fundador) cuando quieras generar o renovar el código.
-- Cambia 'PROFE-2026' por el código que quieras repartir.
-- =====================================================================

insert into public.teacher_invites (code, created_by, max_uses, expires_at)
values (
  'PROFE-2026',                                   -- el código que repartes
  (select id from public.profiles where role = 'founder' limit 1),
  2147483647,                                     -- "ilimitado" (número muy grande)
  now() + interval '1 year'                       -- caduca en 1 año
)
on conflict (code) do update
  set expires_at = now() + interval '1 year';     -- renovar un año más

-- Para ver los códigos activos:
-- select code, expires_at from public.teacher_invites order by expires_at desc;
