// kanaQuiz.js
// Builds the Japanese Writing & Reading practice.
//   - "reading": show the kana character -> recall romaji (multiple choice or typed)
//   - "writing": show the romaji -> pick the correct kana character
//
// Progress is tracked per-character in localStorage so the practice can prioritize
// the characters you miss most (same spirit as the word quiz).

import { KANA_SETS } from "./kana.js";
import { normalize } from "./quiz.js";

const KANA_PROGRESS_KEY = "linguanotes.kana.v1";

export function loadKanaProgress() {
  try {
    return JSON.parse(localStorage.getItem(KANA_PROGRESS_KEY)) || {};
  } catch {
    return {};
  }
}
export function saveKanaProgress(p) {
  try {
    localStorage.setItem(KANA_PROGRESS_KEY, JSON.stringify(p));
  } catch (e) {
    console.error(e);
  }
}

function kanaWeight(stat) {
  if (!stat) return 7; // never practiced -> prioritize
  const total = stat.correct + stat.wrong;
  if (total === 0) return 7;
  const acc = stat.correct / total;
  let w = 1 + (1 - acc) * 5;
  if (stat.last === "wrong") w += 3;
  return Math.max(0.2, w);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build one kana question.
// setKey: "hiragana" | "katakana" ; mode: "reading" | "writing" | "mixed"
export function buildKanaQuestion(setKey, mode, progress) {
  const chars = KANA_SETS[setKey].chars;
  // weighted pick of target char
  const weighted = chars.map((c) => ({ c, w: kanaWeight(progress[c.kana]) }));
  const totalW = weighted.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * totalW;
  let target = weighted[0].c;
  for (const item of weighted) {
    r -= item.w;
    if (r <= 0) {
      target = item.c;
      break;
    }
  }

  const realMode = mode === "mixed" ? pick(["reading", "writing"]) : mode;

  if (realMode === "reading") {
    // show kana, choose romaji
    const distractors = shuffle(chars.filter((c) => c.romaji !== target.romaji))
      .slice(0, 3)
      .map((c) => c.romaji);
    const options = shuffle([target.romaji, ...distractors]);
    return {
      key: target.kana,
      mode: "reading",
      prompt: target.kana,
      question: "Which romaji is this?",
      answer: target.romaji,
      options,
      accept: [normalize(target.romaji)],
    };
  } else {
    // show romaji, choose kana
    const distractors = shuffle(chars.filter((c) => c.kana !== target.kana))
      .slice(0, 3)
      .map((c) => c.kana);
    const options = shuffle([target.kana, ...distractors]);
    return {
      key: target.kana,
      mode: "writing",
      prompt: target.romaji,
      question: "Which character is this?",
      answer: target.kana,
      options,
      accept: [target.kana],
    };
  }
}

export function recordKana(progress, key, correct) {
  const cur = progress[key] || { correct: 0, wrong: 0, last: null };
  if (correct) cur.correct += 1;
  else cur.wrong += 1;
  cur.last = correct ? "correct" : "wrong";
  progress[key] = cur;
  return progress;
}
