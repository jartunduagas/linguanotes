# Diseño: Cuentas, Roles y Grupos (Fase 2)

> Documento de diseño para la evolución de LinguaNotes de app personal a herramienta
> de aula multiusuario. **Todavía no está implementado.** Aquí se describe qué construir,
> cómo y qué decisiones quedan pendientes, para arrancar con buen pie cuando montemos el backend.

---

## 1. Por qué esto es una fase aparte

La app actual es 100% estática (HTML + JS en el navegador, servida por GitHub Pages) y
guarda los datos en `localStorage` de cada dispositivo. Eso **no puede** soportar cuentas,
datos compartidos ni tiempo real. Para lo de esta fase hace falta, sí o sí:

- **Autenticación** (registro / inicio de sesión seguro).
- **Base de datos en la nube** (cuentas, grupos, palabras compartidas, resultados).
- **Tiempo real** (para que el quiz del profesor llegue a todos a la vez).
- **Hosting con backend** (GitHub Pages ya no basta por sí solo para la parte de datos).

Esto convierte el proyecto en un producto multiusuario. Es trabajo considerable
(semanas, no una tarde) y con requisitos de seguridad reales (contraseñas, permisos,
datos de terceros, posiblemente menores de edad).

---

## 2. Stack recomendado

**Opción recomendada: Supabase** (gratis para empezar, sin tarjeta).

| Necesidad | Qué da Supabase |
|-----------|-----------------|
| Autenticación | Registro/login con email + contraseña (o enlaces mágicos) ya hecho |
| Base de datos | PostgreSQL gestionado |
| Permisos por rol/fila | Row Level Security (RLS): reglas en la propia base de datos |
| Tiempo real | Suscripciones en vivo a cambios de tablas (para el quiz en directo) |
| Hosting del front | Se mantiene en GitHub Pages / Vercel; Supabase es solo el backend |

Alternativa equivalente: **Firebase** (Auth + Firestore + Realtime). Elegiría Supabase por
usar SQL estándar y por RLS, que encaja muy bien con el modelo de roles y grupos.

> La app seguiría funcionando **offline para las notas personales** (como ahora), y usaría
> la nube solo para lo compartido (cuentas, grupos, quizzes en vivo). Modelo híbrido.

---

## 3. Roles

Tres roles. El principio de seguridad clave: **nadie se auto-asciende**.

| Rol | Permisos | Cómo se obtiene |
|-----|----------|-----------------|
| 👑 **Fundador** | Todo, sin límites. Gestiona roles, ve todo. | Fijo: tu cuenta marcada como fundador en la base de datos (una sola, la tuya). |
| 🎓 **Profesor** | Crear/cerrar grupos, añadir palabras al grupo, lanzar quizzes en vivo. | Ver sección 3.1. |
| 👤 **Genérica** | Unirse a grupos con código, importar palabras a sus notas, responder quizzes. | Por defecto al registrarse. |

### 3.1. Cómo se obtiene el rol de Profesor (opciones)

De más simple/segura a más automática:

1. **Ascenso manual por el Fundador** (recomendado para empezar). Tú ves la lista de
   cuentas y marcas cuáles son profesores. Control total, cero abuso. Ideal mientras
   son pocos profesores conocidos.
2. **Código de invitación de profesor**. Tú (fundador) generas un código de un solo uso
   (o con fecha de caducidad y número de usos) y se lo das a quien confíes. Quien lo
   introduce al registrarse o en su perfil, se convierte en profesor.
3. **Solicitud + aprobación**. La cuenta genérica pide ser profesor; tú apruebas/rechazas
   desde un panel. Más trabajo, útil si crece mucho.

> Recomendación: implementar **(1) y (2)** en la primera versión. La (3) más adelante si hace falta.
> Nunca permitir que alguien se marque profesor sin tu intervención o un código tuyo.

---

## 4. Grupos

Idea central (tal como la planteaste), con un par de refuerzos de seguridad.

### Comportamiento
- Un **profesor** crea un grupo → el sistema genera un **código numérico** (ej. 6 dígitos).
- Las cuentas **genéricas** se unen introduciendo el código.
- Los grupos son **temporales**: el profesor los puede **cerrar/borrar** cuando quiera, y
  crear **cuantos quiera**.
- Dentro del grupo se pueden **añadir palabras nuevas** (igual que en la app normal), y son
  **visibles para todos** los miembros.
- Cada alumno puede **importar** a sus propias notas las palabras del grupo que quiera,
  **eligiendo la categoría o subcategoría** de destino.
- El profesor puede **lanzar un quiz en vivo** para todo el grupo sobre las palabras del
  grupo, eligiendo qué evaluar: **traducción, preposición, conjugación o género**
  (una o varias de estas).

### Refuerzos recomendados (decisiones abiertas)
- **Caducidad del código**: el código deja de funcionar al cerrar el grupo (y opcionalmente
  tras X horas), para que no se reutilice.
- **Quién puede añadir palabras al grupo**: ¿solo el profesor, o también los alumnos?
  (Propuesta: configurable por grupo; por defecto solo el profesor.)
- **Resultados del quiz en vivo**: el profesor ve el marcador en tiempo real
  (quién respondió, aciertos). Decidir si los alumnos ven su posición o solo su resultado.
- **Expulsar/silenciar** a un miembro del grupo (moderación básica).
- **Límite de miembros** por grupo (para controlar coste/abuso).

---

## 5. Modelo de datos (borrador de tablas)

```
profiles            # extiende el usuario de Auth
  id (uuid, = auth user id)
  display_name
  role              # 'founder' | 'teacher' | 'generic'
  created_at

teacher_invites     # códigos de invitación de profesor (opción 3.1.2)
  code
  created_by (-> profiles.id, un fundador)
  max_uses, used_count
  expires_at

groups
  id (uuid)
  name
  join_code         # numérico, único mientras está abierto
  owner_id (-> profiles.id, un teacher)
  is_open (bool)    # cerrar = is_open false
  allow_student_words (bool)
  created_at, closed_at

group_members
  group_id (-> groups.id)
  user_id (-> profiles.id)
  joined_at
  (clave primaria: group_id + user_id)

group_words         # palabras compartidas del grupo
  id (uuid)
  group_id (-> groups.id)
  added_by (-> profiles.id)
  term, en, es, is_verb, is_noun, gender, prepositions(jsonb), notes
  created_at

quiz_sessions       # un quiz en vivo lanzado por el profesor
  id (uuid)
  group_id (-> groups.id)
  modes (jsonb)     # ['translation','preposition','conjugation','gender']
  status            # 'running' | 'finished'
  started_at, ended_at

quiz_answers        # respuestas de los alumnos (para el marcador)
  session_id (-> quiz_sessions.id)
  user_id (-> profiles.id)
  question_ref, is_correct, answered_at
```

> Las **notas personales** del alumno pueden seguir en `localStorage` (como ahora) y/o
> sincronizarse en una tabla `personal_words` si queremos la sincronización multi-dispositivo
> de la Fase 1.5. Importar una palabra del grupo = copiarla a las notas personales con la
> categoría/subcategoría elegida.

### Seguridad con RLS (Row Level Security)
Reglas en la base de datos, no solo en el front (el front es manipulable):
- Un usuario solo lee `group_words` / `quiz_*` de grupos a los que **pertenece**.
- Solo el **owner** (profesor) de un grupo puede cerrarlo, lanzar quizzes o (según config)
  gestionar palabras.
- Solo un **fundador** puede cambiar `role` en `profiles` o crear `teacher_invites`.
- Nadie puede ascenderse a sí mismo (regla explícita sobre `profiles.role`).

---

## 6. Plan de implementación por etapas

1. **Backend base**: proyecto Supabase, tablas, RLS, y Auth (registro/login).
2. **Perfiles y roles**: crear `profiles` al registrarse (rol genérico por defecto),
   marcar tu cuenta como fundador, panel del fundador para ascender profesores + códigos.
3. **Sincronización personal (opcional, Fase 1.5)**: subir las notas del usuario a la nube
   para tenerlas en móvil + PC. Útil hacerlo aquí porque ya tendremos login.
4. **Grupos**: crear/cerrar, código de unión, unirse, lista de miembros.
5. **Palabras del grupo**: añadir, listar, importar a notas personales (eligiendo categoría).
6. **Quiz en vivo**: lanzar con modos elegidos, recibir respuestas en tiempo real, marcador.
7. **Moderación y límites**: expulsar, caducidad de códigos, límites de miembros.

---

## 7. Cosas a tener en cuenta (honestas)

- **Privacidad / menores**: si los alumnos son estudiantes (posibles menores), conviene
  pedir el mínimo de datos (quizá solo un nombre visible, sin email real si se puede) y
  tener claras las reglas de datos. A revisar según dónde se use.
- **Coste**: el plan gratuito de Supabase alcanza para empezar; con mucho uso habría que
  mirar límites. El tiempo real y el almacenamiento son los que más consumen.
- **Hosting del front**: podría seguir en GitHub Pages apuntando a Supabase, o mudarse a
  Vercel/Netlify si queremos funciones de servidor extra.
- **No rompe lo actual**: toda esta fase se añade; la app personal offline sigue funcionando
  igual para quien no use cuentas.

---

## 8. Decisiones pendientes (para cuando retomemos)

1. ¿Rol de profesor por **ascenso manual**, por **código**, o ambos? (recomiendo ambos)
2. En los grupos, ¿pueden los **alumnos añadir palabras** o solo el profesor?
3. ¿Los alumnos ven un **marcador** del quiz en vivo o solo su propio resultado?
4. ¿Queremos la **sincronización de notas personales** en esta fase (etapa 3) o después?
5. ¿Dónde se usará y quiénes serán los alumnos? (afecta a privacidad y a cuántos datos pedir)
