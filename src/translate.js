// translate.js — traducción automática ONLINE usando MyMemory (gratis, sin clave).
//
// IMPORTANTE (honestidad): este es el único punto de la app que necesita internet.
// Es un servicio gratuito, así que:
//   - Puede fallar o limitar si traduces muchísimo seguido.
//   - La traducción no siempre es perfecta → el usuario SIEMPRE puede corregirla.
//
// La función devuelve { en, es } con las traducciones que consiga. Si algo falla,
// devuelve lo que haya podido y no rompe la app.

// Código de idioma de MyMemory para cada idioma de aprendizaje.
const LANG_CODE = {
  french: "fr",
  english: "en",
  portuguese: "pt",
  japanese: "ja",
};

async function translateOne(text, from, to) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  const t = data && data.responseData && data.responseData.translatedText;
  if (!t) throw new Error("sin traducción");
  // MyMemory a veces devuelve avisos en MAYÚSCULAS cuando excede el límite.
  if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(t)) throw new Error("límite del servicio");
  return t;
}

// Traduce una palabra del idioma de aprendizaje a inglés y español.
// Devuelve { en, es, error } — error es un texto si algo falló (para avisar al usuario).
export async function autoTranslate(term, learningLangId) {
  const from = LANG_CODE[learningLangId] || "en";
  const result = { en: "", es: "", error: null };
  if (!term || !term.trim()) {
    result.error = "Escribe primero la palabra.";
    return result;
  }
  const clean = term.trim();
  try {
    // Pedimos inglés y español en paralelo. Si una falla, intentamos conservar la otra.
    const [enRes, esRes] = await Promise.allSettled([
      from === "en" ? Promise.resolve(clean) : translateOne(clean, from, "en"),
      from === "es" ? Promise.resolve(clean) : translateOne(clean, from, "es"),
    ]);
    if (enRes.status === "fulfilled") result.en = enRes.value;
    if (esRes.status === "fulfilled") result.es = esRes.value;
    if (enRes.status === "rejected" && esRes.status === "rejected") {
      result.error = "No se pudo traducir ahora. Revisa tu conexión o escríbelo a mano.";
    }
  } catch (e) {
    result.error = "No se pudo traducir: " + e.message;
  }
  return result;
}

export function isTranslatable(learningLangId) {
  return Boolean(LANG_CODE[learningLangId]);
}
