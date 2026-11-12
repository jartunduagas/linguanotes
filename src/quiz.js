// quiz.js
// Builds quiz questions and prioritizes NEW words and the ones you STRUGGLE with most.
//
// Scoring idea (higher weight = more likely to be asked):
//   - brand-new words (never seen) get a big boost
//   - words with a bad accuracy get boosted
//   - words you just got wrong get boosted
//   - words you consistently get right sink to the bottom
//
// Question kinds produced:
//   - term -> translation (show learning-language word, recall EN or ES)
//   - translation -> term (show EN/ES, recall the word)
//   - conjugation (show verb + tense + person, recall the form) [verbs only, if conj lang]

import { CONJUGATORS } from "./conjugation.js";

export function weightForWord(w) {
  const s = w.stats || {};
  const total = (s.correct || 0) + (s.wrong || 0);
  let weight = 1;

  if (total === 0) {
    weight += 6; // brand new: prioritize strongly
  } else {
    const accuracy = (s.correct || 0) / total;
    weight += (1 - accuracy) * 5; // worse accuracy -> higher weight
  }
  if (s.lastResult === "wrong") weight += 3; // recently missed
  if (s.lastResult === "correct") weight -= 0.5;

  // Recently created words also get a small freshness boost (last 3 days).
  const ageDays = (Date.now() - (s.createdAt || 0)) / 86400000;
  if (ageDays < 3) weight += 1.5;

  return Math.max(0.1, weight);
}

// Weighted random pick without replacement.
export function weightedSample(words, count) {
  const pool = words.map((w) => ({ w, weight: weightForWord(w) }));
  const chosen = [];
  while (chosen.length < count && pool.length) {
    const totalWeight = pool.reduce((a, b) => a + b.weight, 0);
    let r = Math.random() * totalWeight;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    chosen.push(pool[idx].w);
    pool.splice(idx, 1);
  }
  return chosen;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const LANG_NAME_ES = { french: "francés", english: "inglés", portuguese: "portugués", japanese: "japonés" };

// Build a single question object from a word.
// mode: "mixed" | "translation" | "conjugation" | "gender" | "preposition"
export function buildQuestion(word, languageId, activeTenses, mode = "mixed") {
  const conj = CONJUGATORS[languageId];
  const canConjugate = word.isVerb && conj && activeTenses && activeTenses.length > 0;
  const hasGender = word.isNoun && (word.gender === "m" || word.gender === "f");
  const hasPrep = word.isVerb && word.preposition && word.preposition.trim();

  const transKinds = [];
  if (word.en) transKinds.push("term_to_en", "en_to_term");
  if (word.es) transKinds.push("term_to_es", "es_to_term");

  let kinds = [];
  if (mode === "conjugation") {
    if (canConjugate) kinds = ["conjugation"];
  } else if (mode === "translation") {
    kinds = transKinds;
  } else if (mode === "gender") {
    if (hasGender) kinds = ["gender"];
  } else if (mode === "preposition") {
    if (hasPrep) kinds = ["preposition"];
  } else {
    // mixto: traducciones + conjugación + género + preposición (con pesos)
    kinds = [...transKinds];
    if (canConjugate) kinds.push("conjugation", "conjugation");
    if (hasGender) kinds.push("gender");
    if (hasPrep) kinds.push("preposition");
  }

  if (kinds.length === 0) return null;
  const kind = pick(kinds);
  const langEs = LANG_NAME_ES[languageId] || languageId;

  if (kind === "gender") {
    const art = languageId === "french" ? { m: "le", f: "la" } : { m: "o", f: "a" };
    const answer = word.gender === "m" ? "masculino" : "femenino";
    return {
      wordId: word.id,
      kind,
      prompt: `¿“${word.term}” es masculino o femenino?`,
      hint: "Responde: masculino / femenino (o el artículo)",
      answer: `${answer} (${art[word.gender]} ${word.term})`,
      // aceptamos varias formas: masculino/femenino, m/f, le/la/o/a
      accept: word.gender === "m"
        ? [normalize("masculino"), "m", normalize(art.m)]
        : [normalize("femenino"), "f", normalize(art.f)],
    };
  }

  if (kind === "preposition") {
    return {
      wordId: word.id,
      kind,
      prompt: `¿Qué preposición rige “${word.term}”?`,
      hint: "Escribe la preposición (ej. à, de…)",
      answer: word.preposition,
      accept: splitAnswers(word.preposition).map(normalize),
    };
  }

  if (kind === "conjugation") {
    const tenseId = pick(activeTenses);
    const tense = conj.tenses.find((t) => t.id === tenseId) || conj.tenses[0];
    const person = pick(conj.persons);
    const table = { ...conj.conjugate(word.term, tense.id), ...(word.conjOverrides?.[tense.id] || {}) };
    const answer = table[person.id] || "";
    return {
      wordId: word.id,
      kind,
      prompt: `Conjuga “${word.term}” — ${tense.label}, ${person.label}`,
      hint: "Escribe la forma conjugada completa",
      answer,
      accept: [normalize(answer)],
    };
  }

  const map = {
    term_to_en: { prompt: `“${word.term}” → ¿Inglés?`, answer: word.en },
    term_to_es: { prompt: `“${word.term}” → ¿Español?`, answer: word.es },
    en_to_term: { prompt: `Inglés “${word.en}” → ¿${capitalize(langEs)}?`, answer: word.term },
    es_to_term: { prompt: `Español “${word.es}” → ¿${capitalize(langEs)}?`, answer: word.term },
  };
  const q = map[kind];
  return {
    wordId: word.id,
    kind,
    prompt: q.prompt,
    hint: "",
    answer: q.answer,
    accept: splitAnswers(q.answer).map(normalize),
  };
}

// Build a quiz session of N questions from the given words.
// mode: "mixed" | "translation" | "conjugation"
export function buildQuiz(words, languageId, activeTenses, count = 10, mode = "mixed") {
  if (!words.length) return [];
  // Filtrar el conjunto de palabras según el tipo de quiz.
  let pool = words;
  if (mode === "conjugation") {
    pool = words.filter((w) => w.isVerb);
    if (!pool.length || !activeTenses || activeTenses.length === 0) return [];
  } else if (mode === "translation") {
    pool = words.filter((w) => w.en || w.es);
    if (!pool.length) return [];
  } else if (mode === "gender") {
    pool = words.filter((w) => w.isNoun && (w.gender === "m" || w.gender === "f"));
    if (!pool.length) return [];
  } else if (mode === "preposition") {
    pool = words.filter((w) => w.isVerb && w.preposition && w.preposition.trim());
    if (!pool.length) return [];
  }

  const sampled = weightedSample(pool, Math.min(count, pool.length));
  const questions = [];
  let i = 0;
  while (questions.length < Math.min(count, Math.max(pool.length, count))) {
    const w = sampled[i % sampled.length] || pick(pool);
    const q = buildQuestion(w, languageId, activeTenses, mode);
    if (q) questions.push(q);
    i++;
    if (i > count * 4) break; // safety
  }
  return questions.slice(0, count);
}

export function normalize(str) {
  return (str || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents for forgiving matching
    .replace(/\s+/g, " ")
    .replace(/[.,;!?]/g, "");
}

function splitAnswers(answer) {
  // Accept answers separated by "/", "," or ";" as alternatives.
  return (answer || "").split(/[\/,;]/).map((s) => s.trim()).filter(Boolean);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function isCorrect(question, userAnswer) {
  return question.accept.includes(normalize(userAnswer));
}
