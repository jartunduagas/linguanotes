// sw.js — Service Worker de LinguaNotes.
// Guarda (cachea) todos los archivos de la app para que funcione SIN INTERNET
// una vez que la has abierto al menos una vez con conexión.
//
// Estrategia: "cache first con actualización en segundo plano".
//   - Sirve los archivos desde la caché (rápido y offline).
//   - Si hay internet, descarga la versión nueva por detrás para la próxima vez.

const CACHE = "linguanotes-v1";

// Rutas relativas para que funcione tanto en https://usuario.github.io/linguanotes/
// como en la raíz de cualquier servidor.
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./src/styles.css",
  "./src/main.js",
  "./src/dom.js",
  "./src/storage.js",
  "./src/conjugation.js",
  "./src/kana.js",
  "./src/quiz.js",
  "./src/kanaQuiz.js",
];

// Instalar: precargar todos los archivos en la caché.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activar: limpiar versiones antiguas de la caché.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Interceptar peticiones: responder desde caché; actualizar en segundo plano.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          // Guardar una copia fresca para la próxima vez (solo respuestas válidas).
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached); // sin red: usar lo cacheado
      return cached || network;
    })
  );
});
