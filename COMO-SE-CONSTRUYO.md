# Cómo se construyó LinguaNotes

Este documento cuenta, paso a paso, **qué es** la app, **cómo está hecha por dentro** y **la
historia de cómo se fue construyendo** iteración por iteración. Está escrito para que
cualquiera (incluido tú dentro de unos meses) entienda el proyecto sin tener que leer el código.

---

## 1. Qué es LinguaNotes

Una app web para estudiar idiomas, pensada a partir de una necesidad real: tener las notas
de francés organizadas en un solo sitio, en vez de repartidas por un cuaderno.

**Idiomas:** Francés, Inglés, Portugués y Japonés. Cada palabra guarda su traducción en
inglés y español.

**Funciones principales:**
- Notas organizadas por **categorías y subcategorías** (entras a una y ves sus palabras).
- **Conjugación automática** de verbos (17 tiempos en francés, varios en inglés/portugués),
  con los tiempos que tú actives.
- **Traducción automática** de palabras (online), editable, con aviso si parece mal escrita.
- **Quiz personal** con 5 modos: mixto, traducción, conjugación, género (le/la) y preposición.
  Prioriza las palabras nuevas y las que más fallas.
- **Reglas/excepciones** (chuletas editables) solo para francés, con 3 ya escritas.
- **Práctica de kana** (hiragana/katakana) para japonés.
- **Cuentas, grupos y quiz en vivo** para usarla en una academia (ver sección 5).

**Características técnicas:**
- Funciona **sin conexión** (PWA instalable) para todo lo personal.
- Tema oscuro suave con acento **carmesí**.
- Interfaz en español.

---

## 2. Decisiones técnicas grandes (y por qué)

### JavaScript puro, sin frameworks
Al principio se intentó usar **React** cargado desde un CDN. Problema real: en algunas
redes el CDN no cargaba y la app mostraba un error de "necesita internet". Se tomó la
decisión de **reescribir todo en JavaScript puro** (sin React, sin Babel, sin dependencias
externas). Resultado: la app no depende de ningún CDN para funcionar y es mucho más robusta.

Para construir la interfaz sin framework se creó un mini-ayudante (`src/dom.js`) con una
función `h(tag, props, hijos)` que crea elementos del DOM. Es el patrón "hyperscript":
toda la interfaz se escribe con llamadas a `h(...)`.

### Guardado local primero, nube después
Los datos personales se guardan en el **localStorage** del navegador (cada dispositivo el
suyo). Todo pasa por una única capa (`src/storage.js`), lo que permitió **añadir la
sincronización en la nube más tarde sin reescribir la app**.

### PWA para funcionar sin internet
Un **Service Worker** (`sw.js`) guarda (cachea) todos los archivos de la app en el
dispositivo. Tras la primera visita con internet, la app abre sin conexión. Cada cambio
importante sube el número de versión del cache (`linguanotes-vN`) para forzar la
actualización en los móviles.

---

## 3. Estructura del proyecto

```
linguanotes/
├── index.html                 Punto de entrada; registra el Service Worker
├── sw.js                      Service Worker (offline / PWA)
├── manifest.webmanifest       Metadatos de la PWA (icono, nombre, colores)
├── icon.svg                   Icono de la app
├── serve.mjs                  Servidor local mínimo para desarrollo
├── src/
│   ├── main.js                TODA la interfaz y el estado de la app
│   ├── dom.js                 Ayudante h() para crear elementos sin framework
│   ├── storage.js             Carga/guardado de datos + modelo de datos
│   ├── conjugation.js         Motor de conjugación (FR/EN/PT)
│   ├── quiz.js                Generación de preguntas y puntuación del quiz
│   ├── kana.js                Datos de hiragana/katakana
│   ├── kanaQuiz.js            Lógica del quiz de kana
│   ├── translate.js           Traducción automática online (MyMemory)
│   ├── supabase.js            Conexión con el backend (cuentas, grupos, quiz en vivo)
│   └── styles.css             Estilos (tema oscuro + carmesí)
├── backend/                   SQL del backend (Supabase): tablas, seguridad, funciones
└── test/
    └── logic.test.mjs         Tests de la lógica pura (conjugación, quiz, kana)
```

---

## 4. Cómo funciona cada parte (resumen)

- **Notas y categorías:** el estado vive en un objeto por idioma `{ categories, words,
  activeTenses }`. Las categorías pueden tener `parentId` (eso crea las subcategorías).
  La navegación es: lista de categorías → subcategorías → palabras.

- **Conjugación:** `conjugation.js` expone, por idioma, sus `tenses`, sus `persons` y una
  función `conjugate(verbo, tiempo)`. Usa reglas para los verbos regulares y una tabla de
  irregulares comunes. Cualquier forma se puede corregir a mano (se guarda como override).

- **Quiz:** `quiz.js` genera preguntas a partir de las palabras, eligiendo el "tipo"
  (traducción/conjugación/género/preposición). Da más peso a las palabras nuevas y a las
  que más se fallan (ver `weightForWord`). Las de género y preposición son de opción
  múltiple; las de traducción y conjugación, de texto (aceptan variantes razonables, p.ej.
  con o sin el pronombre).

- **Traducción:** `translate.js` llama a MyMemory (gratis). Es el único punto que necesita
  internet. Si la "traducción" vuelve igual que la palabra o con baja calidad, avisa de un
  posible error de ortografía, pero deja guardar igual.

---

## 5. El backend (Fase 2): cuentas, roles, grupos y quiz en vivo

Se usó **Supabase** (base de datos PostgreSQL + autenticación + tiempo real). El código SQL
está en la carpeta `backend/`, numerado en el orden en que se ejecutó:

- `01_schema.sql` — todas las tablas (perfiles, grupos, miembros, palabras de grupo,
  notas personales, sesiones y respuestas de quiz, invitaciones de profesor).
- `02_policies.sql` — seguridad por filas (RLS): define quién puede leer/escribir cada cosa.
- `03_functions.sql` — funciones de servidor (crear grupo con código, unirse, ranking…).
- `04_fix_profile_update.sql` — arregló que no se podía editar el propio perfil.
- `05_fix_profile_select.sql` — arregló que la app no leía el rol del perfil.
- `06_fix_permissions.sql` — arregló "permission denied" dando permisos al rol autenticado.
- `07_teacher_requests.sql` — sistema de **solicitudes** de profesor (ver abajo).
- `08_crear_codigo_anual.sql` — para generar/renovar el código anual de profesor.

### Roles
- **Fundador** (tú): sin límites; aprueba profesores.
- **Profesor:** crea grupos y lanza quizzes en vivo.
- **Estudiante** (genérico): se une a grupos, importa palabras, responde quizzes.

### Cómo se hace profesor (opción elegida)
El fundador genera un **código anual de usos ilimitados**. Un estudiante que mete el código
**no se vuelve profesor directamente**: crea una **solicitud pendiente**. El fundador la ve
en su perfil y la **aprueba o rechaza**. Así el código es cómodo pero el fundador tiene la
última palabra (más seguro).

### Grupos
El profesor crea un grupo → se genera un **código numérico de 6 dígitos** → los estudiantes
se unen con ese código. En el grupo se añaden palabras (profesor y, si se permite, alumnos),
visibles para todos. Cada alumno puede **importar** las que quiera a sus notas personales,
eligiendo categoría/subcategoría. Los grupos se pueden **cerrar y reabrir**.

### Quiz en vivo
El profesor lo lanza eligiendo qué evaluar y lo **termina cuando quiere**. Los alumnos
responden **a su ritmo**; las preguntas salen de las palabras del grupo **+ hasta 3
personales de cada alumno** (privadas, solo las ve él). Al terminar, todos ven un **ranking**
por aciertos con los **3 primeros resaltados y en grande**.

### Seguridad
La clave pública ("anon") de Supabase va en el código a propósito; es segura porque la
protección real son las **políticas RLS** en la base de datos. La clave secreta
("service_role") nunca se usa en la app. Los correos de confirmación se envían con un
**SMTP propio (Gmail)** usando una contraseña de aplicación.

---

## 6. Cómo se probó

- **Lógica pura** (conjugación, quiz, kana): tests automáticos en `test/logic.test.mjs`.
- **Interfaz:** cada cambio se renderizó en un navegador real (Playwright) sirviendo los
  archivos locales, comprobando que no hubiera errores de JavaScript y que los flujos
  funcionaran (añadir palabra, conjugar, quiz, grupos, cuenta…).
- **Backend:** como no se podía ejecutar Supabase desde el entorno de desarrollo, el SQL y
  el código de cuentas se probaron en tu propio proyecto de Supabase, corrigiendo sobre la
  marcha según los errores reales (de ahí los archivos `04`–`06` de corrección).

---

## 7. Historia del proyecto (iteración por iteración)

1. **App base** (React + CDN): notas por categoría, traducciones, conjugación básica (5
   tiempos), quiz inteligente, práctica de kana para japonés. Tema oscuro + carmesí.
2. **Reescritura a JavaScript puro:** se quitó la dependencia de React/CDN porque fallaba
   sin buena conexión. La app pasó a ser totalmente autónoma.
3. **PWA / offline:** service worker, manifest e icono. La app se volvió instalable y
   funciona sin internet.
4. **Publicación:** repositorio en GitHub + GitHub Pages (URL pública para el móvil).
5. **Mejoras de estudio:** navegación por categorías, más tiempos verbales, selector de
   tipo de quiz, traducción automática de palabras.
6. **Más idioma:** 21 tiempos de francés (luego recortados a 17 quitando los literarios en
   desuso), fondo menos oscuro, quiz de género (le/la) y de preposiciones.
7. **Pulido:** preposiciones y género como opción múltiple; apartado de Reglas editables
   con 3 chuletas de francés.
8. **Internacionalización y UX:** todo en español, elegir el tiempo en el quiz de
   conjugación, buscador de verbos con autocompletado, aviso de ortografía, preposiciones
   en casillas separadas, editar categorías y crear subcategorías.
9. **Fase 2 — multiusuario (Supabase):**
   - Cuentas con registro/inicio de sesión y **confirmación de email por SMTP propio**.
   - **Roles** (fundador/profesor/estudiante) con **solicitud + aprobación** de profesores.
   - **Sincronización** de las notas personales en la nube (móvil + PC).
   - **Grupos** con código, palabras compartidas e importación a notas propias.
   - **Quiz en vivo** con ranking (top 3 resaltados).
   - Varias rondas de corrección de permisos de base de datos (lo más delicado).

---

## 8. Ideas para el futuro

- Correo con **dominio propio** (en vez de Gmail) para enviar a cualquier alumno sin límites.
- Marcador del quiz en vivo **actualizándose en tiempo real** para el profesor.
- Más verbos irregulares en los tiempos difíciles.
- Estadísticas de progreso por alumno.
