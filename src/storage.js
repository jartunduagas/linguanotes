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

// Categoría especial donde viven las reglas/excepciones (solo francés).
export const RULES_CATEGORY = { id: "rules", name: "Reglas y excepciones" };

// Reglas por defecto del francés (chuletas editables). IDs fijos para no duplicar.
function defaultFrenchRules() {
  return [
    {
      id: "rule_maison",
      categoryId: "rules",
      isRule: true,
      term: "🏠 Verbos de la maison (auxiliar être)",
      ruleBody:
        "Estos verbos forman el passé composé con ÊTRE (no avoir), y el participio concuerda con el sujeto " +
        "(il est allé / elle est allée / ils sont allés).\n\n" +
        "Regla mnemotécnica «DR & MRS VANDERTRAMP»:\n" +
        "Devenir, Revenir, Monter, Rester, Sortir, Venir, Aller, Naître, Descendre, Entrer, " +
        "Rentrer, Tomber, Retourner, Arriver, Mourir, Partir.\n\n" +
        "También todos los verbos PRONOMINALES (se laver, se lever…) usan être.\n\n" +
        "Ej.: Je suis allé(e) · Elle est venue · Ils sont partis · Nous nous sommes levé(e)s.",
      en: "",
      es: "",
      notes: "",
    },
    {
      id: "rule_subj",
      categoryId: "rules",
      isRule: true,
      term: "✨ Irregulares del subjuntivo (présent)",
      ruleBody:
        "Verbos con radical irregular en el subjonctif présent (que je…):\n\n" +
        "• être → que je sois, tu sois, il soit, nous soyons, vous soyez, ils soient\n" +
        "• avoir → que j'aie, tu aies, il ait, nous ayons, vous ayez, ils aient\n" +
        "• faire → que je fasse… (fass-)\n" +
        "• aller → que j'aille / nous allions (doble radical)\n" +
        "• pouvoir → que je puisse… (puiss-)\n" +
        "• savoir → que je sache… (sach-)\n" +
        "• vouloir → que je veuille / nous voulions\n" +
        "• falloir → qu'il faille · pleuvoir → qu'il pleuve.",
      en: "",
      es: "",
      notes: "",
    },
    {
      id: "rule_futur",
      categoryId: "rules",
      isRule: true,
      term: "⏩ Irregulares del futuro (radicales)",
      ruleBody:
        "El futur simple y el conditionnel usan el MISMO radical irregular (+ terminaciones -ai, -as, -a…):\n\n" +
        "• être → ser- (je serai)\n" +
        "• avoir → aur- (j'aurai)\n" +
        "• aller → ir- (j'irai)\n" +
        "• faire → fer- (je ferai)\n" +
        "• pouvoir → pourr- (je pourrai)\n" +
        "• vouloir → voudr- (je voudrai)\n" +
        "• venir → viendr- (je viendrai)\n" +
        "• voir → verr- · savoir → saur- · devoir → devr-\n" +
        "• falloir → faudr- (il faudra) · pleuvoir → pleuvr- (il pleuvra).",
      en: "",
      es: "",
      notes: "",
    },
  ];
}

function defaultData() {
  const languages = {};
  for (const l of LANGUAGES) languages[l.id] = freshLanguageState();
  // Sensible starter tenses so conjugation tables aren't empty.
  languages.french.activeTenses = ["present", "passe_compose"];
  languages.english.activeTenses = ["present", "past"];
  languages.portuguese.activeTenses = ["presente", "preterito"];
  // El francés incluye la categoría de Reglas + 3 chuletas por defecto.
  languages.french.categories.push({ ...RULES_CATEGORY });
  languages.french.words.push(...defaultFrenchRules().map(normalizeWord));
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

  // Asegurar que el francés tenga la categoría de Reglas y las 3 chuletas por defecto,
  // sin duplicar ni borrar las que el usuario haya editado/creado.
  const fr = out.languages.french;
  if (fr) {
    if (!fr.categories.some((c) => c.id === RULES_CATEGORY.id)) {
      fr.categories.push({ ...RULES_CATEGORY });
    }
    const existingIds = new Set(fr.words.map((w) => w.id));
    for (const rule of defaultFrenchRules()) {
      if (!existingIds.has(rule.id)) fr.words.push(normalizeWord(rule));
    }
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
    isRule: Boolean(w.isRule),       // es una "chuleta"/regla (apartado de Reglas)
    ruleBody: w.ruleBody || "",      // texto de la regla (cuando isRule)
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
