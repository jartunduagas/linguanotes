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
  // Tiempos simples
  // INDICATIF (8)
  { id: "present", label: "Indicatif · Présent" },
  { id: "imparfait", label: "Indicatif · Imparfait" },
  { id: "passe_simple", label: "Indicatif · Passé simple" },
  { id: "futur", label: "Indicatif · Futur simple" },
  { id: "passe_compose", label: "Indicatif · Passé composé" },
  { id: "plus_que_parfait", label: "Indicatif · Plus-que-parfait" },
  { id: "passe_anterieur", label: "Indicatif · Passé antérieur" },
  { id: "futur_anterieur", label: "Indicatif · Futur antérieur" },
  // SUBJONCTIF (4)
  { id: "subjonctif", label: "Subjonctif · Présent" },
  { id: "subjonctif_passe", label: "Subjonctif · Passé" },
  { id: "subjonctif_imparfait", label: "Subjonctif · Imparfait (littéraire)" },
  { id: "subjonctif_pqp", label: "Subjonctif · Plus-que-parfait (littéraire)" },
  // CONDITIONNEL (2)
  { id: "conditionnel", label: "Conditionnel · Présent" },
  { id: "conditionnel_passe", label: "Conditionnel · Passé" },
  // IMPÉRATIF (2)
  { id: "imperatif", label: "Impératif · Présent" },
  { id: "imperatif_passe", label: "Impératif · Passé" },
  // INFINITIF (2)
  { id: "infinitif", label: "Infinitif · Présent" },
  { id: "infinitif_passe", label: "Infinitif · Passé" },
  // PARTICIPE (3)
  { id: "participe_present", label: "Participe · Présent" },
  { id: "gerondif", label: "Gérondif" },
  { id: "participe_passe", label: "Participe · Passé" },
];

// A small table of common irregular French verbs (présent + key stems).
const FR_IRREGULAR = {
  être: {
    present: { je: "suis", tu: "es", il: "est", nous: "sommes", vous: "êtes", ils: "sont" },
    imparfait: { je: "étais", tu: "étais", il: "était", nous: "étions", vous: "étiez", ils: "étaient" },
    subjonctif: { je: "sois", tu: "sois", il: "soit", nous: "soyons", vous: "soyez", ils: "soient" },
    passe_simple: { je: "fus", tu: "fus", il: "fut", nous: "fûmes", vous: "fûtes", ils: "furent" },
    futurStem: "ser",
    participle: "été",
    aux: "avoir",
  },
  avoir: {
    present: { je: "ai", tu: "as", il: "a", nous: "avons", vous: "avez", ils: "ont" },
    imparfait: { je: "avais", tu: "avais", il: "avait", nous: "avions", vous: "aviez", ils: "avaient" },
    subjonctif: { je: "aie", tu: "aies", il: "ait", nous: "ayons", vous: "ayez", ils: "aient" },
    passe_simple: { je: "eus", tu: "eus", il: "eut", nous: "eûmes", vous: "eûtes", ils: "eurent" },
    futurStem: "aur",
    participle: "eu",
    aux: "avoir",
  },
  aller: {
    present: { je: "vais", tu: "vas", il: "va", nous: "allons", vous: "allez", ils: "vont" },
    subjonctif: { je: "aille", tu: "ailles", il: "aille", nous: "allions", vous: "alliez", ils: "aillent" },
    passe_simple: { je: "allai", tu: "allas", il: "alla", nous: "allâmes", vous: "allâtes", ils: "allèrent" },
    futurStem: "ir",
    participle: "allé",
    aux: "être",
  },
  faire: {
    present: { je: "fais", tu: "fais", il: "fait", nous: "faisons", vous: "faites", ils: "font" },
    subjonctif: { je: "fasse", tu: "fasses", il: "fasse", nous: "fassions", vous: "fassiez", ils: "fassent" },
    passe_simple: { je: "fis", tu: "fis", il: "fit", nous: "fîmes", vous: "fîtes", ils: "firent" },
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
const frApplyJe = (form) => (frElides(form) ? `j'${form}` : `je ${form}`);

// Tablas de los auxiliares (se reutilizan en todos los tiempos compuestos).
const FR_AUX = {
  avoir: {
    present: { je: "ai", tu: "as", il: "a", nous: "avons", vous: "avez", ils: "ont" },
    imparfait: { je: "avais", tu: "avais", il: "avait", nous: "avions", vous: "aviez", ils: "avaient" },
    futur: { je: "aurai", tu: "auras", il: "aura", nous: "aurons", vous: "aurez", ils: "auront" },
    conditionnel: { je: "aurais", tu: "aurais", il: "aurait", nous: "aurions", vous: "auriez", ils: "auraient" },
    subjonctif: { je: "aie", tu: "aies", il: "ait", nous: "ayons", vous: "ayez", ils: "aient" },
    passe_simple: { je: "eus", tu: "eus", il: "eut", nous: "eûmes", vous: "eûtes", ils: "eurent" },
    subjonctif_imparfait: { je: "eusse", tu: "eusses", il: "eût", nous: "eussions", vous: "eussiez", ils: "eussent" },
    infinitif: "avoir",
    imperatif: { tu: "aie", nous: "ayons", vous: "ayez" },
  },
  être: {
    present: { je: "suis", tu: "es", il: "est", nous: "sommes", vous: "êtes", ils: "sont" },
    imparfait: { je: "étais", tu: "étais", il: "était", nous: "étions", vous: "étiez", ils: "étaient" },
    futur: { je: "serai", tu: "seras", il: "sera", nous: "serons", vous: "serez", ils: "seront" },
    conditionnel: { je: "serais", tu: "serais", il: "serait", nous: "serions", vous: "seriez", ils: "seraient" },
    subjonctif: { je: "sois", tu: "sois", il: "soit", nous: "soyons", vous: "soyez", ils: "soient" },
    passe_simple: { je: "fus", tu: "fus", il: "fut", nous: "fûmes", vous: "fûtes", ils: "furent" },
    subjonctif_imparfait: { je: "fusse", tu: "fusses", il: "fût", nous: "fussions", vous: "fussiez", ils: "fussent" },
    infinitif: "être",
    imperatif: { tu: "sois", nous: "soyons", vous: "soyez" },
  },
};

function frParticiple(verb, irr, group, stem) {
  if (irr && irr.participle) return irr.participle;
  if (group === "er") return stem + "é";
  if (group === "ir") return stem + "i";
  if (group === "re") return stem + "u";
  return verb;
}

function frAuxName(irr, group) {
  return irr && irr.aux ? irr.aux : "avoir";
}

// Construye un tiempo compuesto: auxiliar (en el tiempo indicado) + participio.
function frCompound(auxTenseId, auxName, participle) {
  const table = FR_AUX[auxName][auxTenseId];
  const out = {};
  for (const p of FR_PERSONS) {
    const a = table[p.id];
    const head = p.id === "je" ? frApplyJe(a) : `${pronounFr(p.id)} ${a}`;
    out[p.id] = `${head} ${participle}`.trim();
  }
  return out;
}

function frConjugate(verbRaw, tenseId) {
  const verb = (verbRaw || "").trim().toLowerCase();
  const irr = FR_IRREGULAR[verb];
  const out = {};

  // Grupo regular + raíz
  const group = verb.endsWith("er") ? "er" : verb.endsWith("ir") ? "ir" : verb.endsWith("re") ? "re" : null;
  const stem = group ? verb.slice(0, -2) : verb;

  const futurBase =
    (irr && irr.futurStem) ||
    (group === "re" ? verb.slice(0, -1) : verb); // -re pierde la 'e' final en futur/cond

  const applyJe = frApplyJe;
  const auxName = frAuxName(irr, group);
  const participle = frParticiple(verb, irr, group, stem);

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
    case "subjonctif": {
      if (irr && irr.subjonctif) {
        const t = irr.subjonctif;
        const r = {};
        for (const p of FR_PERSONS) r[p.id] = frQue(p.id, t[p.id]);
        return r;
      }
      let subStem;
      if (group === "er") subStem = stem;
      else if (group === "ir") subStem = stem + "iss";
      else if (group === "re") subStem = stem;
      else subStem = verb;
      const end = { je: "e", tu: "es", il: "e", nous: "ions", vous: "iez", ils: "ent" };
      for (const p of FR_PERSONS) {
        out[p.id] = frQue(p.id, subStem + end[p.id]);
      }
      return out;
    }
    case "passe_simple": {
      if (irr && irr.passe_simple) return { ...irr.passe_simple, je: applyJe(irr.passe_simple.je) };
      let end;
      if (group === "er") end = { je: "ai", tu: "as", il: "a", nous: "âmes", vous: "âtes", ils: "èrent" };
      else end = { je: "is", tu: "is", il: "it", nous: "îmes", vous: "îtes", ils: "irent" }; // -ir/-re regulares
      for (const p of FR_PERSONS) {
        const form = stem + end[p.id];
        out[p.id] = p.id === "je" ? applyJe(form) : form;
      }
      return out;
    }
    case "imperatif": {
      // Solo tu / nous / vous
      const pres = frConjugate(verb, "present");
      // quitar el pronombre que añadimos en 'present'
      const bare = (id) => (pres[id] || "").replace(/^(j'|je |tu |il |nous |vous |ils )/, "");
      let tuForm = bare("tu");
      if (group === "er" && tuForm.endsWith("es")) tuForm = tuForm.slice(0, -1); // parle (no parles)
      return {
        je: "—",
        tu: tuForm,
        il: "—",
        nous: bare("nous"),
        vous: bare("vous"),
        ils: "—",
      };
    }
    case "participe_present": {
      // participe présent (sin "en"); el gérondif es un tiempo aparte
      let base;
      if (group === "er") base = stem;
      else if (group === "ir") base = stem + "iss";
      else if (group === "re") base = stem;
      else base = verb;
      const pp = base + "ant";
      for (const p of FR_PERSONS) out[p.id] = pp;
      return out;
    }
    case "passe_compose":
      return frCompound("present", auxName, participle);
    case "plus_que_parfait":
      return frCompound("imparfait", auxName, participle);
    case "futur_anterieur":
      return frCompound("futur", auxName, participle);
    case "conditionnel_passe":
      return frCompound("conditionnel", auxName, participle);
    case "subjonctif_passe": {
      // auxiliar en subjonctif + participio, con "que/qu'" delante.
      const auxTable = FR_AUX[auxName].subjonctif;
      const r = {};
      for (const p of FR_PERSONS) {
        r[p.id] = frQue(p.id, `${auxTable[p.id]} ${participle}`);
      }
      return r;
    }
    case "passe_anterieur":
      // auxiliar en passé simple + participio
      return frCompound("passe_simple", auxName, participle);
    case "subjonctif_imparfait": {
      // littéraire: raíz del passé simple + terminaciones -sse, -sses, -^t...
      if (irr && irr.subjonctif_imparfait) {
        const t = irr.subjonctif_imparfait;
        const r = {};
        for (const p of FR_PERSONS) r[p.id] = frQue(p.id, t[p.id]);
        return r;
      }
      // obtener la raíz a partir del passé simple (il + quitar terminación)
      const ps = frConjugate(verb, "passe_simple");
      // il parla -> parl ; il finit -> fin ; usamos la 1ª pers sing sin pronombre
      let base = (ps.je || "").replace(/^(j'|je )/, "");
      base = base.replace(/(ai|is|us|ins)$/, ""); // quitar vocal temática final aprox.
      const end =
        group === "er"
          ? { je: "asse", tu: "asses", il: "ât", nous: "assions", vous: "assiez", ils: "assent" }
          : { je: "isse", tu: "isses", il: "ît", nous: "issions", vous: "issiez", ils: "issent" };
      for (const p of FR_PERSONS) out[p.id] = frQue(p.id, base + end[p.id]);
      return out;
    }
    case "subjonctif_pqp":
      // littéraire: auxiliar en subjonctif imparfait + participio
      return (() => {
        const auxTable = FR_AUX[auxName].subjonctif_imparfait;
        const r = {};
        for (const p of FR_PERSONS) r[p.id] = frQue(p.id, `${auxTable[p.id]} ${participle}`);
        return r;
      })();
    case "imperatif_passe": {
      // auxiliar en impératif + participio (solo tu/nous/vous)
      const auxImp = FR_AUX[auxName].imperatif;
      return {
        je: "—",
        tu: `${auxImp.tu} ${participle}`,
        il: "—",
        nous: `${auxImp.nous} ${participle}`,
        vous: `${auxImp.vous} ${participle}`,
        ils: "—",
      };
    }
    case "infinitif": {
      // forma única (no personal): mostramos el infinitivo en todas las filas
      for (const p of FR_PERSONS) out[p.id] = verb;
      return out;
    }
    case "infinitif_passe": {
      // avoir/être + participio
      const auxInf = FR_AUX[auxName].infinitif;
      const form = `${auxInf} ${participle}`;
      for (const p of FR_PERSONS) out[p.id] = form;
      return out;
    }
    case "gerondif": {
      let base;
      if (group === "er") base = stem;
      else if (group === "ir") base = stem + "iss";
      else if (group === "re") base = stem;
      else base = verb;
      const g = `en ${base}ant`;
      for (const p of FR_PERSONS) out[p.id] = g;
      return out;
    }
    case "participe_passe": {
      for (const p of FR_PERSONS) out[p.id] = participle;
      return out;
    }
    default:
      return out;
  }
}

function pronounFr(id) {
  return { je: "je", tu: "tu", il: "il", nous: "nous", vous: "vous", ils: "ils" }[id];
}

// Construye "que je parle" / "qu'il aille" con las contracciones correctas.
function frQue(personId, form) {
  const pron = pronounFr(personId);
  if (personId === "je") {
    return frElides(form) ? `que j'${form}` : `que je ${form}`;
  }
  // que + il/ils -> qu'il ; que + elle no aplica aquí (usamos il/ils)
  if (personId === "il" || personId === "ils") return `qu'${pron} ${form}`;
  return `que ${pron} ${form}`;
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
  { id: "past_cont", label: "Past continuous" },
  { id: "future", label: "Future (will)" },
  { id: "future_going", label: "Future (going to)" },
  { id: "present_perfect", label: "Present perfect" },
  { id: "present_perfect_cont", label: "Present perfect continuous" },
  { id: "past_perfect", label: "Past perfect" },
  { id: "future_perfect", label: "Future perfect" },
  { id: "conditional", label: "Conditional (would)" },
  { id: "conditional_perfect", label: "Conditional perfect" },
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
  speak: { past: "spoke", pp: "spoken", ing: "speaking" },
  say: { he3: "says", past: "said", pp: "said", ing: "saying" },
  give: { past: "gave", pp: "given", ing: "giving" },
  find: { past: "found", pp: "found", ing: "finding" },
  think: { past: "thought", pp: "thought", ing: "thinking" },
  tell: { past: "told", pp: "told", ing: "telling" },
  become: { past: "became", pp: "become", ing: "becoming" },
  leave: { past: "left", pp: "left", ing: "leaving" },
  feel: { past: "felt", pp: "felt", ing: "feeling" },
  bring: { past: "brought", pp: "brought", ing: "bringing" },
  begin: { past: "began", pp: "begun", ing: "beginning" },
  run: { past: "ran", pp: "run", ing: "running" },
  read: { past: "read", pp: "read", ing: "reading" },
  put: { past: "put", pp: "put", ing: "putting" },
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
    case "past_cont": {
      const wasT = { i: "was", you: "were", he: "was", we: "were", youpl: "were", they: "were" };
      for (const p of EN_PERSONS) out[p.id] = `${p.label} ${wasT[p.id]} ${enIng(verb)}`;
      return out;
    }
    case "future": {
      for (const p of EN_PERSONS) out[p.id] = `${p.label} will ${verb}`;
      return out;
    }
    case "future_going": {
      const beT = { i: "am", you: "are", he: "is", we: "are", youpl: "are", they: "are" };
      for (const p of EN_PERSONS) out[p.id] = `${p.label} ${beT[p.id]} going to ${verb}`;
      return out;
    }
    case "present_perfect": {
      const haveT = { i: "have", you: "have", he: "has", we: "have", youpl: "have", they: "have" };
      for (const p of EN_PERSONS) out[p.id] = `${p.label} ${haveT[p.id]} ${enPP(verb)}`;
      return out;
    }
    case "present_perfect_cont": {
      const haveT = { i: "have", you: "have", he: "has", we: "have", youpl: "have", they: "have" };
      for (const p of EN_PERSONS) out[p.id] = `${p.label} ${haveT[p.id]} been ${enIng(verb)}`;
      return out;
    }
    case "past_perfect": {
      for (const p of EN_PERSONS) out[p.id] = `${p.label} had ${enPP(verb)}`;
      return out;
    }
    case "future_perfect": {
      for (const p of EN_PERSONS) out[p.id] = `${p.label} will have ${enPP(verb)}`;
      return out;
    }
    case "conditional": {
      for (const p of EN_PERSONS) out[p.id] = `${p.label} would ${verb}`;
      return out;
    }
    case "conditional_perfect": {
      for (const p of EN_PERSONS) out[p.id] = `${p.label} would have ${enPP(verb)}`;
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
  { id: "mais_que_perfeito", label: "Pretérito mais-que-perfeito" },
  { id: "futuro", label: "Futuro do presente" },
  { id: "futuro_preterito", label: "Futuro do pretérito (condicional)" },
  { id: "presente_subjuntivo", label: "Presente do subjuntivo" },
  { id: "imperfeito_subjuntivo", label: "Imperfeito do subjuntivo" },
  { id: "imperativo", label: "Imperativo" },
  { id: "gerundio", label: "Gerúndio" },
  { id: "participio", label: "Particípio" },
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

  // Formas no personales
  if (tenseId === "gerundio") {
    const g = stem + (group === "ar" ? "ando" : group === "er" ? "endo" : "indo");
    for (const p of PT_PERSONS) out[p.id] = g;
    return out;
  }
  if (tenseId === "participio") {
    const pp = stem + (group === "ar" ? "ado" : "ido");
    for (const p of PT_PERSONS) out[p.id] = pp;
    return out;
  }

  // Futuros (sobre el infinitivo completo)
  if (tenseId === "futuro") {
    const end = { eu: "ei", tu: "ás", ele: "á", nos: "emos", vos: "eis", eles: "ão" };
    for (const p of PT_PERSONS) out[p.id] = verb + end[p.id];
    return out;
  }
  if (tenseId === "futuro_preterito") {
    const end = { eu: "ia", tu: "ias", ele: "ia", nos: "íamos", vos: "íeis", eles: "iam" };
    for (const p of PT_PERSONS) out[p.id] = verb + end[p.id];
    return out;
  }

  // Tiempos sobre la raíz
  const extra = {
    ar: {
      mais_que_perfeito: { eu: "ara", tu: "aras", ele: "ara", nos: "áramos", vos: "áreis", eles: "aram" },
      presente_subjuntivo: { eu: "e", tu: "es", ele: "e", nos: "emos", vos: "eis", eles: "em" },
      imperfeito_subjuntivo: { eu: "asse", tu: "asses", ele: "asse", nos: "ássemos", vos: "ásseis", eles: "assem" },
      imperativo: { eu: "—", tu: "a", ele: "e", nos: "emos", vos: "ai", eles: "em" },
    },
    er: {
      mais_que_perfeito: { eu: "era", tu: "eras", ele: "era", nos: "êramos", vos: "êreis", eles: "eram" },
      presente_subjuntivo: { eu: "a", tu: "as", ele: "a", nos: "amos", vos: "ais", eles: "am" },
      imperfeito_subjuntivo: { eu: "esse", tu: "esses", ele: "esse", nos: "êssemos", vos: "êsseis", eles: "essem" },
      imperativo: { eu: "—", tu: "e", ele: "a", nos: "amos", vos: "ei", eles: "am" },
    },
    ir: {
      mais_que_perfeito: { eu: "ira", tu: "iras", ele: "ira", nos: "íramos", vos: "íreis", eles: "iram" },
      presente_subjuntivo: { eu: "a", tu: "as", ele: "a", nos: "amos", vos: "ais", eles: "am" },
      imperfeito_subjuntivo: { eu: "isse", tu: "isses", ele: "isse", nos: "íssemos", vos: "ísseis", eles: "issem" },
      imperativo: { eu: "—", tu: "e", ele: "a", nos: "amos", vos: "i", eles: "am" },
    },
  };

  let table = (PT_ENDINGS[group] && PT_ENDINGS[group][tenseId]) || (extra[group] && extra[group][tenseId]);
  if (!table) {
    for (const p of PT_PERSONS) out[p.id] = verb;
    return out;
  }
  for (const p of PT_PERSONS) out[p.id] = table[p.id] === "—" ? "—" : stem + table[p.id];
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
