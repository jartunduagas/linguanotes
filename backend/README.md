# Backend de LinguaNotes (Supabase) — Instrucciones

Sigue estos pasos **en orden** en tu proyecto de Supabase.

## Paso A — Ejecutar el SQL

1. Entra a [supabase.com](https://supabase.com) → tu proyecto.
2. Menú izquierdo → **SQL Editor** → **New query**.
3. Copia y pega el contenido de **`01_schema.sql`** → pulsa **Run**.
4. Repite con **`02_policies.sql`** → **Run**.
5. Repite con **`03_functions.sql`** → **Run**.

Si algún paso da error, cópiame el mensaje y lo arreglamos.

## Paso B — Crear TU cuenta y marcarte como Fundador

1. Primero necesitas registrarte en la app (lo haremos cuando esté el login).
   Alternativamente, crea el usuario en Supabase → **Authentication** → **Users** → **Add user**
   (con tu email y una contraseña).
2. Una vez exista tu usuario, ve a **SQL Editor** y ejecuta (cambia el email por el tuyo):

   ```sql
   update public.profiles
   set role = 'founder'
   where id = (select id from auth.users where email = 'TU_EMAIL_AQUI');
   ```

3. Listo: tu cuenta ya es fundador.

## Paso C — Crear códigos de invitación de profesor (cuando quieras)

Como fundador, para generar un código que convierta a alguien en profesor:

```sql
insert into public.teacher_invites (code, created_by, max_uses, expires_at)
values ('PROF-2026', (select id from public.profiles where role='founder' limit 1), 5, now() + interval '30 days');
```

Ese código (`PROF-2026`) permite 5 usos durante 30 días. Repártelo a tus profesores de confianza;
ellos lo introducen en la app para volverse profesores.

## Paso D — Configuración de Auth (importante)

En **Authentication → Providers → Email**, para empezar rápido con tus compañeros:
- Puedes **desactivar "Confirm email"** temporalmente para que no haga falta verificar el correo
  (más cómodo en pruebas). En producción conviene reactivarlo.

## Sobre la seguridad

- La clave **anon/publishable** es pública a propósito; la protección real son las políticas
  **RLS** de `02_policies.sql`. Nunca pongas la clave **service_role** en la app ni en el repo.
- Como puede haber **menores**, pedimos el mínimo de datos: email (para login) y un nombre visible.
