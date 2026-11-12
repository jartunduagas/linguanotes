// conjugation.js
// Auto-conjugation engine for French, English, and Portuguese.
//
// Each language exposes:
//   tenses: [{ id, label }]              -> selectable tenses the user can activate
//   persons: [{ id, label }]             -> subject pronouns (rows of the table)
//   conjugate(verb, tenseId) -> { [personId]: "form", ... }
//
// The goal is "good enough to study": regular rules cover most verbs, and the most
// common irregular verbs are handled explicitly. Users can always edit any cell
// (overrides are stored on the word itself, see storage.js).

/* -------------------------------------------------------------------------- */
/*  FRENCH                                                                     */
/* -------------------------------------------------------------------------- */

const FR_PERSONS = [
  { id: "je", label: "je" },
  { id: "tu", label: "tu" },
  { id: "il", label: "il/elle" },
  { id: "nous", label: "nous" },
  { id: "vous", label: "vous" },
  { id: "ils", label: "ils/elles" },
];

const FR_TENSES = [
  { id: "present", label: "Présent" },
  { id: "imparfait", label: "Imparfait" },
  { id: "futur", label: "Futur simple" },
  { id: "conditionnel", label: "Conditionnel" },
  { id: "passe_compose", label: "Passé composé" },
];

// A small table of common irregular French verbs (présent + key stems).
const FR_IRREGULAR = {
  être: {
    present: { je: "suis", tu: "es", il: "est", nous: "sommes", vous: "êtes", ils: "sont" },
    imparfait: { je: "étais", tu: "étais", il: "était", nous: "étions", vous: "étiez", ils: "étaient" },
    futurStem: "ser",
    participle: "été",
    aux: "avoir",
  },
  avoir: {
    present: { je: "ai", tu: "as", il: "a", nous: "avons", vous: "avez", ils: "ont" },
    imparfait: { je: "avais", tu: "avais", il: "avait", nous: "avions", vous: "aviez", ils: "avaient" },
    futurStem: "aur",
    participle: "eu",
    aux: "avoir",
  },
  aller: {
    present: { je: "vais", tu: "vas", il: "va", nous: "allons", vous: "allez", ils: "vont" },
    futurStem: "ir",
    participle: "allé",
    aux: "être",
  },
  faire: {
    present: { je: "fais", tu: "fais", il: "fait", nous: "faisons", vous: "faites", ils: "font" },
    futurStem: "fer",
    participle: "fait",
    aux: "avoir",
  },
  dire: {
    present: { je: "dis", tu: "dis", il: "dit", nous: "disons", vous: "dites", ils: "disent" },
    futurStem: "dir",
    participle: "dit",
    aux: "avoir",
  },
  pouvoir: {
    present: { je: "peux", tu: "peux", il: "peut", nous: "pouvons", vous: "pouvez", ils: "peuvent" },
    futurStem: "pourr",
    participle: "pu",
    aux: "avoir",
  },
  vouloir: {
    present: { je: "veux", tu: "veux", il: "veut", nous: "voulons", vous: "voulez", ils: "veulent" },
    futurStem: "voudr",
    participle: "voulu",
    aux: "avoir",
  },
  venir: {
    present: { je: "viens", tu: "viens", il: "vient", nous: "venons", vous: "venez", ils: "viennent" },
    futurStem: "viendr",
    participle: "venu",
    aux: "être",
  },
  prendre: {
    present: { je: "prends", tu: "prends", il: "prend", nous: "prenons", vous: "prenez", ils: "prennent" },
    futurStem: "prendr",
    participle: "pris",
    aux: "avoir",
  },
  savoir: {
    present: { je: "sais", tu: "sais", il: "sait", nous: "savons", vous: "savez", ils: "savent" },
    futurStem: "saur",
    participle: "su",
    aux: "avoir",
  },
};

const FR_FUTUR_ENDINGS = { je: "ai", tu: "as", il: "a", nous: "ons", vous: "ez", ils: "ont" };
const FR_COND_ENDINGS = { je: "ais", tu: "ais", il: "ait", nous: "ions", vous: "iez", ils: "aient" };

function frElides(form) {
  // je -> j' before a vowel or mute h
  return /^[aeiouâêîôûéèh]/i.test(form);
}

function frConjugate(verbRaw, tenseId) {
  const verb = (verbRaw || "").trim().toLowerCase();
  const irr = FR_IRREGULAR[verb];
  const out = {};

  // Determine regular group + stem
  const group = verb.endsWith("er") ? "er" : verb.endsWith("ir") ? "ir" : verb.endsWith("re") ? "re" : null;
  const stem = group ? verb.slice(0, -2) : verb;

  const futurBase =
    (irr && irr.futurStem) ||
    (group === "re" ? verb.slice(0, -1) : verb); // -re drops final e for futur/cond

  const applyJe = (form) => (frElides(form) ? `j'${form}` : `je ${form}`);

  switch (tenseId) {
    case "present": {
      if (irr && irr.present) return { ...irr.present, je: applyJe(irr.present.je) };
      for (const p of FR_PERSONS) {
        let form;
        if (group === "er") {
          const e = { je: "e", tu: "es", il: "e", nous: "ons", vous: "ez", ils: "ent" }[p.id];
          form = stem + e;
        } else if (group === "ir") {
          const e = { je: "is", tu: "is", il: "it", nous: "issons", vous: "issez", ils: "issent" }[p.id];
          form = stem + e;
        } else if (group === "re") {
          const e = { je: "s", tu: "s", il: "", nous: "ons", vous: "ez", ils: "ent" }[p.id];
          form = stem + e;
        } else {
          form = verb;
        }
        out[p.id] = p.id === "je" ? applyJe(form) : form;
      }
      return out;
    }
    case "imparfait": {
      if (irr && irr.imparfait) return { ...irr.imparfait, je: applyJe(irr.imparfait.je) };
      // imparfait stem = nous-present minus -ons; approximate from group
      let impStem;
      if (group === "er") impStem = stem;
      else if (group === "ir") impStem = stem + "iss";
      else if (group === "re") impStem = stem;
      else impStem = verb;
      const end = { je: "ais", tu: "ais", il: "ait", nous: "ions", vous: "iez", ils: "aient" };
      for (const p of FR_PERSONS) {
        const form = impStem + end[p.id];
        out[p.id] = p.id === "je" ? applyJe(form) : form;
      }
      return out;
    }
    case "futur": {
      for (const p of FR_PERSONS) {
        const form = futurBase + FR_FUTUR_ENDINGS[p.id];
        out[p.id] = p.id === "je" ? applyJe(form) : form;
      }
      return out;
    }
    case "conditionnel": {
      for (const p of FR_PERSONS) {
        const form = futurBase + FR_COND_ENDINGS[p.id];
        out[p.id] = p.id === "je" ? applyJe(form) : form;
      }
      return out;
    }
    case "passe_compose": {
      const aux = irr ? irr.aux : group === "er" ? "avoir" : "avoir";
      let participle = irr && irr.participle;
      if (!participle) {
        if (group === "er") participle = stem + "é";
        else if (group === "ir") participle = stem + "i";
        else if (group === "re") participle = stem + "u";
        else participle = verb;
      }
      const avoir = { je: "ai", tu: "as", il: "a", nous: "avons", vous: "avez", ils: "ont" };
      const etre = { je: "suis", tu: "es", il: "est", nous: "sommes", vous: "êtes", ils: "sont" };
      const auxTable = aux === "être" ? etre : avoir;
      for (const p of FR_PERSONS) {
        const a = auxTable[p.id];
        // "je" elides before a vowel (j'ai); every other person uses "pronoun aux participle".
        const head = p.id === "je" ? applyJe(a) : `${pronounFr(p.id)} ${a}`;
        out[p.id] = `${head} ${participle}`.trim();
      }
      return out;
    }
    default:
      return out;
  }
}

function pronounFr(id) {
  return { je: "je", tu: "tu", il: "il", nous: "nous", vous: "vous", ils: "ils" }[id];
}

/* -------------------------------------------------------------------------- */
/*  ENGLISH                                                                    */
/* -------------------------------------------------------------------------- */

const EN_PERSONS = [
  { id: "i", label: "I" },
  { id: "you", label: "you" },
  { id: "he", label: "he/she/it" },
  { id: "we", label: "we" },
  { id: "youpl", label: "you (pl)" },
  { id: "they", label: "they" },
];

const EN_TENSES = [
  { id: "present", label: "Present simple" },
  { id: "present_cont", label: "Present continuous" },
  { id: "past", label: "Past simple" },
  { id: "future", label: "Future (will)" },
  { id: "present_perfect", label: "Present perfect" },
];

const EN_IRREGULAR = {
  be: { present: { i: "am", you: "are", he: "is", we: "are", youpl: "are", they: "are" }, past: { i: "was", you: "were", he: "was", we: "were", youpl: "were", they: "were" }, pp: "been", ing: "being" },
  have: { he3: "has", past: "had", pp: "had", ing: "having" },
  do: { he3: "does", past: "did", pp: "done", ing: "doing" },
  go: { he3: "goes", past: "went", pp: "gone", ing: "going" },
  make: { past: "made", pp: "made", ing: "making" },
  take: { past: "took", pp: "taken", ing: "taking" },
  come: { past: "came", pp: "come", ing: "coming" },
  see: { past: "saw", pp: "seen", ing: "seeing" },
  get: { past: "got", pp: "gotten", ing: "getting" },
  know: { past: "knew", pp: "known", ing: "knowing" },
  eat: { past: "ate", pp: "eaten", ing: "eating" },
  write: { past: "wrote", pp: "written", ing: "writing" },
};

function enThirdPerson(verb) {
  const irr = EN_IRREGULAR[verb];
  if (irr && irr.he3) return irr.he3;
  if (/(s|sh|ch|x|z|o)$/.test(verb)) return verb + "es";
  if (/[^aeiou]y$/.test(verb)) return verb.slice(0, -1) + "ies";
  return verb + "s";
}
function enIng(verb) {
  const irr = EN_IRREGULAR[verb];
  if (irr && irr.ing) return irr.ing;
  if (/[^aeiou]e$/.test(verb) && verb !== "be") return verb.slice(0, -1) + "ing";
  if (/[^aeiouwxy][aeiou][^aeiou]$/.test(verb)) return verb + verb.slice(-1) + "ing";
  return verb + "ing";
}
function enPast(verb) {
  const irr = EN_IRREGULAR[verb];
  if (irr && irr.past && typeof irr.past === "string") return irr.past;
  if (/e$/.test(verb)) return verb + "d";
  if (/[^aeiou]y$/.test(verb)) return verb.slice(0, -1) + "ied";
  if (/[^aeiouwxy][aeiou][^aeiou]$/.test(verb)) return verb + verb.slice(-1) + "ed";
  return verb + "ed";
}
function enPP(verb) {
  const irr = EN_IRREGULAR[verb];
  if (irr && irr.pp) return irr.pp;
  return enPast(verb);
}

function enConjugate(verbRaw, tenseId) {
  const verb = (verbRaw || "").trim().toLowerCase().replace(/^to\s+/, "");
  const out = {};
  switch (tenseId) {
    case "present": {
      const irr = EN_IRREGULAR[verb];
      for (const p of EN_PERSONS) {
        let v = verb;
        if (irr && irr.present) v = irr.present[p.id];
        else if (p.id === "he") v = enThirdPerson(verb);
        out[p.id] = `${p.label} ${v}`;
      }
      return out;
    }
    case "present_cont": {
      const beT = { i: "am", you: "are", he: "is", we: "are", youpl: "are", they: "are" };
      for (const p of EN_PERSONS) out[p.id] = `${p.label} ${beT[p.id]} ${enIng(verb)}`;
      return out;
    }
    case "past": {
      const irr = EN_IRREGULAR[verb];
      for (const p of EN_PERSONS) {
        const v = irr && irr.past && typeof irr.past === "object" ? irr.past[p.id] : enPast(verb);
        out[p.id] = `${p.label} ${v}`;
      }
      return out;
    }
    case "future": {
      for (const p of EN_PERSONS) out[p.id] = `${p.label} will ${verb}`;
      return out;
    }
    case "present_perfect": {
      const haveT = { i: "have", you: "have", he: "has", we: "have", youpl: "have", they: "have" };
      for (const p of EN_PERSONS) out[p.id] = `${p.label} ${haveT[p.id]} ${enPP(verb)}`;
      return out;
    }
    default:
      return out;
  }
}

/* -------------------------------------------------------------------------- */
/*  PORTUGUESE                                                                 */
/* -------------------------------------------------------------------------- */

const PT_PERSONS = [
  { id: "eu", label: "eu" },
  { id: "tu", label: "tu" },
  { id: "ele", label: "ele/ela/você" },
  { id: "nos", label: "nós" },
  { id: "vos", label: "vós" },
  { id: "eles", label: "eles/elas/vocês" },
];

const PT_TENSES = [
  { id: "presente", label: "Presente" },
  { id: "preterito", label: "Pretérito perfeito" },
  { id: "imperfeito", label: "Pretérito imperfeito" },
  { id: "futuro", label: "Futuro" },
];

const PT_IRREGULAR = {
  ser: { presente: { eu: "sou", tu: "és", ele: "é", nos: "somos", vos: "sois", eles: "são" } },
  estar: { presente: { eu: "estou", tu: "estás", ele: "está", nos: "estamos", vos: "estais", eles: "estão" } },
  ter: { presente: { eu: "tenho", tu: "tens", ele: "tem", nos: "temos", vos: "tendes", eles: "têm" } },
  ir: { presente: { eu: "vou", tu: "vais", ele: "vai", nos: "vamos", vos: "ides", eles: "vão" } },
  fazer: { presente: { eu: "faço", tu: "fazes", ele: "faz", nos: "fazemos", vos: "fazeis", eles: "fazem" } },
};

const PT_ENDINGS = {
  ar: {
    presente: { eu: "o", tu: "as", ele: "a", nos: "amos", vos: "ais", eles: "am" },
    preterito: { eu: "ei", tu: "aste", ele: "ou", nos: "amos", vos: "astes", eles: "aram" },
    imperfeito: { eu: "ava", tu: "avas", ele: "ava", nos: "ávamos", vos: "áveis", eles: "avam" },
  },
  er: {
    presente: { eu: "o", tu: "es", ele: "e", nos: "emos", vos: "eis", eles: "em" },
    preterito: { eu: "i", tu: "este", ele: "eu", nos: "emos", vos: "estes", eles: "eram" },
    imperfeito: { eu: "ia", tu: "ias", ele: "ia", nos: "íamos", vos: "íeis", eles: "iam" },
  },
  ir: {
    presente: { eu: "o", tu: "es", ele: "e", nos: "imos", vos: "is", eles: "em" },
    preterito: { eu: "i", tu: "iste", ele: "iu", nos: "imos", vos: "istes", eles: "iram" },
    imperfeito: { eu: "ia", tu: "ias", ele: "ia", nos: "íamos", vos: "íeis", eles: "iam" },
  },
};

function ptConjugate(verbRaw, tenseId) {
  const verb = (verbRaw || "").trim().toLowerCase();
  const out = {};
  const irr = PT_IRREGULAR[verb];
  if (irr && irr[tenseId]) return { ...irr[tenseId] };

  const group = verb.endsWith("ar") ? "ar" : verb.endsWith("er") ? "er" : verb.endsWith("ir") ? "ir" : null;
  const stem = group ? verb.slice(0, -2) : verb;
  if (!group) {
    for (const p of PT_PERSONS) out[p.id] = verb;
    return out;
  }
  if (tenseId === "futuro") {
    const end = { eu: "ei", tu: "ás", ele: "á", nos: "emos", vos: "eis", eles: "ão" };
    for (const p of PT_PERSONS) out[p.id] = verb + end[p.id];
    return out;
  }
  const table = PT_ENDINGS[group][tenseId];
  if (!table) {
    for (const p of PT_PERSONS) out[p.id] = verb;
    return out;
  }
  for (const p of PT_PERSONS) out[p.id] = stem + table[p.id];
  return out;
}

/* -------------------------------------------------------------------------- */
/*  REGISTRY                                                                   */
/* -------------------------------------------------------------------------- */

export const CONJUGATORS = {
  french: { persons: FR_PERSONS, tenses: FR_TENSES, conjugate: frConjugate },
  english: { persons: EN_PERSONS, tenses: EN_TENSES, conjugate: enConjugate },
  portuguese: { persons: PT_PERSONS, tenses: PT_TENSES, conjugate: ptConjugate },
  // japanese: handled separately (no subject-based conjugation) — see kana.js
};

export function hasConjugation(languageId) {
  return Boolean(CONJUGATORS[languageId]);
}
