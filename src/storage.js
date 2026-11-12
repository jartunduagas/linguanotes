// storage.js
// The single place that knows HOW data is persisted.
//
// Right now it uses the browser's localStorage, so each device keeps its own copy.
// Everything goes through this small interface (load / save), so later we can swap in
// a cloud backend (fetch to an API, Supabase, Firebase, etc.) WITHOUT touching the app.
//
// Data shape (version 1):
// {
//   version: 1,
//   settings: { activeLanguage: "french" },
//   languages: {
//     french: {
//       activeTenses: ["present", "passe_compose"],
//       categories: [{ id, name }],
//       words: [ Word, ... ]
//     },
//     ...
//   }
// }
//
// Word:
// {
//   id, categoryId, term,            // the word in the learning language
//   en, es,                          // English + Spanish translations
//   isVerb,                          // whether to show conjugation
//   conjOverrides: { tenseId: { personId: "custom form" } },  // user edits
//   notes,
//   stats: { seen, correct, wrong, lastResult, createdAt }     // for smart quiz
// }

const STORAGE_KEY = "linguanotes.v1";

const DEFAULT_CATEGORIES = [
  { id: "verbs", name: "Verbs" },
  { id: "vocabulary", name: "Vocabulary" },
  { id: "phrases", name: "Phrases" },
];

export const LANGUAGES = [
  { id: "french", label: "French", flag: "🇫🇷", hasConjugation: true },
  { id: "english", label: "English", flag: "🇬🇧", hasConjugation: true },
  { id: "portuguese", label: "Portuguese", flag: "🇵🇹", hasConjugation: true },
  { id: "japanese", label: "Japanese", flag: "🇯🇵", hasConjugation: false },
];

function freshLanguageState() {
  return {
    activeTenses: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    words: [],
  };
}

function defaultData() {
  const languages = {};
  for (const l of LANGUAGES) languages[l.id] = freshLanguageState();
  // Sensible starter tenses so conjugation tables aren't empty.
  languages.french.activeTenses = ["present", "passe_compose"];
  languages.english.activeTenses = ["present", "past"];
  languages.portuguese.activeTenses = ["presente", "preterito"];
  return {
    version: 1,
    settings: { activeLanguage: "french" },
    languages,
  };
}

// --- The swappable interface -------------------------------------------------

export const storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch (e) {
      console.warn("Failed to load data, starting fresh:", e);
      return defaultData();
    }
  },
  save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error("Failed to save data:", e);
      return false;
    }
  },
  export() {
    return JSON.stringify(this.load(), null, 2);
  },
  import(jsonString) {
    const parsed = JSON.parse(jsonString);
    const migrated = migrate(parsed);
    this.save(migrated);
    return migrated;
  },
};

// Make sure older/partial data gets all required fields.
function migrate(data) {
  const base = defaultData();
  if (!data || typeof data !== "object") return base;
  const out = { ...base, ...data };
  out.settings = { ...base.settings, ...(data.settings || {}) };
  out.languages = { ...base.languages };
  for (const l of LANGUAGES) {
    const incoming = (data.languages && data.languages[l.id]) || {};
    out.languages[l.id] = {
      ...base.languages[l.id],
      ...incoming,
      categories: incoming.categories && incoming.categories.length ? incoming.categories : base.languages[l.id].categories,
      words: Array.isArray(incoming.words) ? incoming.words.map(normalizeWord) : [],
      activeTenses: Array.isArray(incoming.activeTenses) ? incoming.activeTenses : base.languages[l.id].activeTenses,
    };
  }
  return out;
}

function normalizeWord(w) {
  return {
    id: w.id || genId(),
    categoryId: w.categoryId || "vocabulary",
    term: w.term || "",
    en: w.en || "",
    es: w.es || "",
    isVerb: Boolean(w.isVerb),
    isNoun: Boolean(w.isNoun),       // sustantivo (para el quiz de género)
    gender: w.gender || "",          // "m" | "f" | "" (le / la)
    preposition: w.preposition || "", // preposición que rige el verbo (quiz de preposición)
    conjOverrides: w.conjOverrides || {},
    notes: w.notes || "",
    stats: {
      seen: (w.stats && w.stats.seen) || 0,
      correct: (w.stats && w.stats.correct) || 0,
      wrong: (w.stats && w.stats.wrong) || 0,
      lastResult: (w.stats && w.stats.lastResult) || null,
      createdAt: (w.stats && w.stats.createdAt) || Date.now(),
    },
  };
}

export function genId() {
  return "id_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function makeWord(partial) {
  return normalizeWord({ id: genId(), stats: { createdAt: Date.now() }, ...partial });
}
