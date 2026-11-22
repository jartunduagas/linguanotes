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
  // match: calidad (0..1). Lo usamos para detectar palabras dudosas.
  const match = data.responseData.match;
  return { text: t, match: typeof match === "number" ? match : null };
}

// quita acentos y pasa a minúsculas (para comparar palabra original vs traducción)
function simplify(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Traduce una palabra del idioma de aprendizaje a inglés y español.
// Devuelve { en, es, error, warning }:
//   - error: algo falló (sin red / límite)
//   - warning: la palabra parece mal escrita o no reconocida (el usuario decide)
export async function autoTranslate(term, learningLangId) {
  const from = LANG_CODE[learningLangId] || "en";
  const result = { en: "", es: "", error: null, warning: null };
  if (!term || !term.trim()) {
    result.error = "Escribe primero la palabra.";
    return result;
  }
  const clean = term.trim();
  try {
    // Pedimos inglés y español en paralelo. Si una falla, intentamos conservar la otra.
    const [enRes, esRes] = await Promise.allSettled([
      from === "en" ? Promise.resolve({ text: clean, match: 1 }) : translateOne(clean, from, "en"),
      from === "es" ? Promise.resolve({ text: clean, match: 1 }) : translateOne(clean, from, "es"),
    ]);
    const enOk = enRes.status === "fulfilled" ? enRes.value : null;
    const esOk = esRes.status === "fulfilled" ? esRes.value : null;
    if (enOk) result.en = enOk.text;
    if (esOk) result.es = esOk.text;
    if (!enOk && !esOk) {
      result.error = "No se pudo traducir ahora. Revisa tu conexión o escríbelo a mano.";
      return result;
    }

    // --- Detección de posible error ortográfico ---
    // Señales: (1) la "traducción" es idéntica a la palabra original (no la tradujo),
    //          (2) la calidad (match) es baja.
    const sameAsInput = (r) => r && simplify(r.text) === simplify(clean);
    const lowMatch = (r) => r && typeof r.match === "number" && r.match < 0.5;
    const notTranslated = sameAsInput(enOk) && sameAsInput(esOk);
    const poorQuality = lowMatch(enOk) && lowMatch(esOk);
    if (notTranslated || poorQuality) {
      result.warning =
        `No encontré una traducción fiable de “${clean}”. ¿Está bien escrita? ` +
        `Puedes corregirla, o guardarla tal cual si estás seguro.`;
    }
  } catch (e) {
    result.error = "No se pudo traducir: " + e.message;
  }
  return result;
}

export function isTranslatable(learningLangId) {
  return Boolean(LANG_CODE[learningLangId]);
}
