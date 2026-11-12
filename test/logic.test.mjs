// Quick sanity tests for the pure logic modules (no browser needed).
// Run: node test/logic.test.mjs
import { CONJUGATORS } from "../src/conjugation.js";
import { normalize, isCorrect, buildQuestion, weightForWord } from "../src/quiz.js";
import { buildKanaQuestion } from "../src/kanaQuiz.js";

let pass = 0,
  fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass++;
    console.log("  ✓ " + label);
  } else {
    fail++;
    console.log("  ✗ " + label + "\n      got:  " + g + "\n      want: " + w);
  }
}
function ok(label, cond) {
  if (cond) {
    pass++;
    console.log("  ✓ " + label);
  } else {
    fail++;
    console.log("  ✗ " + label);
  }
}

console.log("French conjugation:");
const fr = CONJUGATORS.french;
eq("parler présent", fr.conjugate("parler", "present"), {
  je: "je parle",
  tu: "parles",
  il: "parle",
  nous: "parlons",
  vous: "parlez",
  ils: "parlent",
});
eq("finir présent", fr.conjugate("finir", "present"), {
  je: "je finis",
  tu: "finis",
  il: "finit",
  nous: "finissons",
  vous: "finissez",
  ils: "finissent",
});
const etre = fr.conjugate("être", "present");
ok("être présent je = je suis", etre.je === "je suis");
ok("être présent ils = sont", etre.ils === "sont");
const parlerFut = fr.conjugate("parler", "futur");
ok("parler futur je = je parlerai", parlerFut.je === "je parlerai");
ok("parler futur ils = parleront", parlerFut.ils === "parleront");
const avoirPC = fr.conjugate("manger", "passe_compose");
ok("manger passé composé je starts with j'ai", avoirPC.je.startsWith("j'ai"));
ok("manger passé composé has participle mangé", avoirPC.je.includes("mangé"));

console.log("\nEnglish conjugation:");
const en = CONJUGATORS.english;
const enPres = en.conjugate("to go", "present");
ok("go present he = he goes", enPres.he === "he/she/it goes");
const enPast = en.conjugate("go", "past");
ok("go past = went", enPast.i === "I went");
const enPP = en.conjugate("eat", "present_perfect");
ok("eat present perfect he = has eaten", enPP.he === "he/she/it has eaten");

console.log("\nPortuguese conjugation:");
const pt = CONJUGATORS.portuguese;
eq("falar presente", pt.conjugate("falar", "presente"), {
  eu: "falo",
  tu: "falas",
  ele: "fala",
  nos: "falamos",
  vos: "falais",
  eles: "falam",
});
ok("ser presente eu = sou", pt.conjugate("ser", "presente").eu === "sou");

console.log("\nQuiz helpers:");
eq("normalize strips accents/case", normalize("  Parlé! "), "parle");
ok("isCorrect accepts accent-insensitive", isCorrect({ accept: ["hablar"] }, "Hablar"));
ok(
  "isCorrect accepts alternatives via question build",
  (() => {
    const q = buildQuestion(
      { id: "x", term: "parler", en: "to speak", es: "hablar", isVerb: false, stats: {} },
      "french",
      []
    );
    return q && q.accept.length >= 1;
  })()
);
ok("weight: brand-new word > seen-correct word", (() => {
  const fresh = weightForWord({ stats: { correct: 0, wrong: 0, createdAt: Date.now() } });
  const known = weightForWord({ stats: { correct: 10, wrong: 0, lastResult: "correct", createdAt: 0 } });
  return fresh > known;
})());
ok("weight: struggled word > easy word", (() => {
  const bad = weightForWord({ stats: { correct: 1, wrong: 9, lastResult: "wrong", createdAt: 0 } });
  const good = weightForWord({ stats: { correct: 9, wrong: 1, lastResult: "correct", createdAt: 0 } });
  return bad > good;
})());

console.log("\nKana practice:");
const kq = buildKanaQuestion("hiragana", "reading", {});
ok("kana reading question has 4 options", kq.options.length === 4);
ok("kana reading answer is among options", kq.options.includes(kq.answer));
const kw = buildKanaQuestion("katakana", "writing", {});
ok("kana writing answer is a kana char among options", kw.options.includes(kw.answer));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
