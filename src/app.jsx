// app.jsx — main UI for LinguaNotes
// Loaded in the browser via Babel (see index.html). Uses React from the CDN.

import { storage, LANGUAGES, makeWord, genId } from "./storage.js";
import { CONJUGATORS, hasConjugation } from "./conjugation.js";
import { KANA_SETS } from "./kana.js";
import { buildQuiz, isCorrect } from "./quiz.js";
import {
  buildKanaQuestion,
  loadKanaProgress,
  saveKanaProgress,
  recordKana,
} from "./kanaQuiz.js";

const { useState, useEffect, useRef } = React;

/* ============================ Root ============================ */

function App() {
  const [data, setData] = useState(() => storage.load());
  const [tab, setTab] = useState("notes");

  // Persist on every change.
  useEffect(() => {
    storage.save(data);
  }, [data]);

  const activeLang = data.settings.activeLanguage;
  const langMeta = LANGUAGES.find((l) => l.id === activeLang);
  const langState = data.languages[activeLang];

  // ---- data mutators (all go through setData so storage stays in sync) ----
  const update = (fn) => setData((d) => {
    const copy = structuredClone(d);
    fn(copy);
    return copy;
  });

  const setActiveLanguage = (id) =>
    update((d) => {
      d.settings.activeLanguage = id;
    });

  const addWord = (word) =>
    update((d) => {
      d.languages[d.settings.activeLanguage].words.push(word);
    });

  const updateWord = (id, patch) =>
    update((d) => {
      const list = d.languages[d.settings.activeLanguage].words;
      const i = list.findIndex((w) => w.id === id);
      if (i >= 0) list[i] = { ...list[i], ...patch };
    });

  const deleteWord = (id) =>
    update((d) => {
      const ls = d.languages[d.settings.activeLanguage];
      ls.words = ls.words.filter((w) => w.id !== id);
    });

  const setConjOverride = (id, tenseId, personId, value) =>
    update((d) => {
      const list = d.languages[d.settings.activeLanguage].words;
      const w = list.find((x) => x.id === id);
      if (!w) return;
      w.conjOverrides = w.conjOverrides || {};
      w.conjOverrides[tenseId] = w.conjOverrides[tenseId] || {};
      if (value && value.trim()) w.conjOverrides[tenseId][personId] = value;
      else delete w.conjOverrides[tenseId][personId];
    });

  const toggleTense = (tenseId) =>
    update((d) => {
      const ls = d.languages[d.settings.activeLanguage];
      const set = new Set(ls.activeTenses);
      set.has(tenseId) ? set.delete(tenseId) : set.add(tenseId);
      ls.activeTenses = [...set];
    });

  const addCategory = (name) =>
    update((d) => {
      const ls = d.languages[d.settings.activeLanguage];
      ls.categories.push({ id: genId(), name });
    });

  const deleteCategory = (catId) =>
    update((d) => {
      const ls = d.languages[d.settings.activeLanguage];
      ls.categories = ls.categories.filter((c) => c.id !== catId);
      ls.words.forEach((w) => {
        if (w.categoryId === catId) w.categoryId = "vocabulary";
      });
    });

  const recordAnswer = (wordId, correct) =>
    update((d) => {
      const list = d.languages[d.settings.activeLanguage].words;
      const w = list.find((x) => x.id === wordId);
      if (!w) return;
      w.stats.seen += 1;
      if (correct) w.stats.correct += 1;
      else w.stats.wrong += 1;
      w.stats.lastResult = correct ? "correct" : "wrong";
    });

  const isJapanese = activeLang === "japanese";
  const tabs = isJapanese
    ? [
        { id: "notes", label: "Notes" },
        { id: "kana", label: "Writing & Reading" },
        { id: "quiz", label: "Quiz" },
      ]
    : [
        { id: "notes", label: "Notes" },
        { id: "conjugation", label: "Conjugation" },
        { id: "quiz", label: "Quiz" },
      ];

  // If the current tab doesn't exist for this language (e.g. "kana" only exists for
  // Japanese, "conjugation" only for the others), fall back to Notes.
  const tabExists = tabs.some((t) => t.id === tab);
  useEffect(() => {
    if (!tabExists) setTab("notes");
  }, [tabExists]);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot" />
          <div>
            LinguaNotes
            <br />
            <small>your notes, organized · {langMeta.flag} {langMeta.label}</small>
          </div>
        </div>
        <div className="spacer" />
        <div className="lang-select">
          <label style={{ margin: 0 }}>Learning</label>
          <select value={activeLang} onChange={(e) => setActiveLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.flag} {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={"tab" + (tab === t.id ? " active" : "")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "notes" && (
        <NotesTab
          langMeta={langMeta}
          langState={langState}
          onAddWord={addWord}
          onUpdateWord={updateWord}
          onDeleteWord={deleteWord}
          onAddCategory={addCategory}
          onDeleteCategory={deleteCategory}
          onSetConjOverride={setConjOverride}
        />
      )}

      {tab === "conjugation" && !isJapanese && (
        <ConjugationTab langMeta={langMeta} langState={langState} onToggleTense={toggleTense} />
      )}

      {tab === "kana" && isJapanese && <KanaTab />}

      {tab === "quiz" && (
        <QuizTab
          langMeta={langMeta}
          langState={langState}
          onRecordAnswer={recordAnswer}
          isJapanese={isJapanese}
        />
      )}
    </div>
  );
}

/* ============================ Notes ============================ */

function NotesTab({
  langMeta,
  langState,
  onAddWord,
  onUpdateWord,
  onDeleteWord,
  onAddCategory,
  onDeleteCategory,
  onSetConjOverride,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [showCats, setShowCats] = useState(false);

  const words = langState.words;
  const filtered = words.filter((w) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      w.term.toLowerCase().includes(s) ||
      w.en.toLowerCase().includes(s) ||
      w.es.toLowerCase().includes(s)
    );
  });

  const byCat = langState.categories.map((c) => ({
    cat: c,
    items: filtered.filter((w) => w.categoryId === c.id),
  }));

  // Safety net: any word whose category no longer exists still shows up here,
  // so notes can never silently disappear from view.
  const knownCatIds = new Set(langState.categories.map((c) => c.id));
  const orphanItems = filtered.filter((w) => !knownCatIds.has(w.categoryId));
  if (orphanItems.length) {
    byCat.push({ cat: { id: "__uncategorized", name: "Uncategorized" }, items: orphanItems });
  }

  const hasVisibleResults = byCat.some(({ items }) => items.length > 0);

  return (
    <div>
      <div className="toolbar">
        <input
          className="grow"
          placeholder="Search your notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn" onClick={() => setShowCats(true)}>
          Categories
        </button>
        <button
          className="btn primary"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          + Add word
        </button>
      </div>

      {words.length === 0 && (
        <div className="empty">
          No notes yet for {langMeta.label}. Click <b>“+ Add word”</b> to save your first word
          with its English &amp; Spanish translations.
        </div>
      )}

      {words.length > 0 && !hasVisibleResults && (
        <div className="empty">
          No notes match “{search}”. Try a different search.
        </div>
      )}

      {byCat.map(
        ({ cat, items }) =>
          items.length > 0 && (
            <div className="cat-group" key={cat.id}>
              <div className="cat-head">
                <h3>{cat.name}</h3>
                <span className="badge">{items.length}</span>
              </div>
              {items.map((w) => (
                <WordRow
                  key={w.id}
                  word={w}
                  langMeta={langMeta}
                  activeTenses={langState.activeTenses}
                  onEdit={() => {
                    setEditing(w);
                    setShowForm(true);
                  }}
                  onDelete={() => onDeleteWord(w.id)}
                  onSetConjOverride={onSetConjOverride}
                />
              ))}
            </div>
          )
      )}

      {showForm && (
        <WordForm
          langMeta={langMeta}
          categories={langState.categories}
          initial={editing}
          onCancel={() => setShowForm(false)}
          onSave={(word) => {
            if (editing) onUpdateWord(editing.id, word);
            else onAddWord(makeWord(word));
            setShowForm(false);
          }}
        />
      )}

      {showCats && (
        <CategoryManager
          categories={langState.categories}
          words={words}
          onAdd={onAddCategory}
          onDelete={onDeleteCategory}
          onClose={() => setShowCats(false)}
        />
      )}
    </div>
  );
}

function WordRow({ word, langMeta, activeTenses, onEdit, onDelete, onSetConjOverride }) {
  const [open, setOpen] = useState(false);
  const canConjugate =
    word.isVerb && hasConjugation(langMeta.id) && activeTenses.length > 0;

  return (
    <div className="word">
      <div className="grow">
        <div className="term">
          {word.term}{" "}
          {word.isVerb && <span className="badge pill-verb">verb</span>}
        </div>
        <div className="trans">
          🇬🇧 <b>{word.en || "—"}</b> &nbsp;·&nbsp; 🇪🇸 <b>{word.es || "—"}</b>
        </div>
        {word.notes && <div className="trans faint">📝 {word.notes}</div>}
        {canConjugate && (
          <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Show"} conjugation
          </button>
        )}
        {open && canConjugate && (
          <ConjugationTable
            word={word}
            langMeta={langMeta}
            activeTenses={activeTenses}
            onSetConjOverride={onSetConjOverride}
          />
        )}
      </div>
      <div className="actions">
        <button className="btn small" onClick={onEdit}>
          Edit
        </button>
        <button className="btn small danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function ConjugationTable({ word, langMeta, activeTenses, onSetConjOverride }) {
  const conj = CONJUGATORS[langMeta.id];
  if (!conj) return null;
  const tenses = conj.tenses.filter((t) => activeTenses.includes(t.id));

  return (
    <div style={{ marginTop: 10 }}>
      {tenses.map((t) => {
        const table = conj.conjugate(word.term, t.id);
        const overrides = (word.conjOverrides && word.conjOverrides[t.id]) || {};
        return (
          <div key={t.id} style={{ marginBottom: 14 }}>
            <div className="muted" style={{ fontWeight: 700, color: "var(--crimson-soft)" }}>
              {t.label}
            </div>
            <table className="conj-table">
              <tbody>
                {conj.persons.map((p) => (
                  <tr key={p.id}>
                    <td className="person">{p.label}</td>
                    <td>
                      <input
                        value={overrides[p.id] ?? table[p.id] ?? ""}
                        onChange={(e) => onSetConjOverride(word.id, t.id, p.id, e.target.value)}
                        title="Auto-generated — edit to correct it"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function WordForm({ langMeta, categories, initial, onCancel, onSave }) {
  const [term, setTerm] = useState(initial?.term || "");
  const [en, setEn] = useState(initial?.en || "");
  const [es, setEs] = useState(initial?.es || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [isVerb, setIsVerb] = useState(initial?.isVerb || false);
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId || categories[0]?.id || "vocabulary"
  );
  const termRef = useRef(null);
  useEffect(() => termRef.current?.focus(), []);

  const canConjugate = hasConjugation(langMeta.id);

  const submit = () => {
    if (!term.trim()) return;
    onSave({ term: term.trim(), en: en.trim(), es: es.trim(), notes: notes.trim(), isVerb, categoryId });
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? "Edit word" : "Add word"}</h2>
        <div style={{ marginBottom: 12 }}>
          <label>Word in {langMeta.label}</label>
          <input
            ref={termRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={langMeta.id === "french" ? "e.g. parler" : "the new word"}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <div>
            <label>🇬🇧 English</label>
            <input value={en} onChange={(e) => setEn(e.target.value)} placeholder="to speak" />
          </div>
          <div>
            <label>🇪🇸 Spanish</label>
            <input value={es} onChange={(e) => setEs(e.target.value)} placeholder="hablar" />
          </div>
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <div>
            <label>Category</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {canConjugate && (
            <div>
              <label>Type</label>
              <div className="checkbox-row" style={{ paddingTop: 8 }}>
                <input
                  id="isVerb"
                  type="checkbox"
                  checked={isVerb}
                  onChange={(e) => setIsVerb(e.target.checked)}
                />
                <label htmlFor="isVerb" style={{ margin: 0 }}>
                  This is a verb (auto-conjugate it)
                </label>
              </div>
            </div>
          )}
        </div>
        <div style={{ marginBottom: 4 }}>
          <label>Notes (optional)</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="any reminder, example sentence…" />
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={!term.trim()}>
            {initial ? "Save changes" : "Add word"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryManager({ categories, words, onAdd, onDelete, onClose }) {
  const [name, setName] = useState("");
  const count = (id) => words.filter((w) => w.categoryId === id).length;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h2>Categories</h2>
        <p className="muted">Organize your notes however you like.</p>
        <div className="inline" style={{ marginBottom: 16 }}>
          <input
            className="grow"
            placeholder="New category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                onAdd(name.trim());
                setName("");
              }
            }}
          />
          <button
            className="btn primary"
            onClick={() => {
              if (name.trim()) {
                onAdd(name.trim());
                setName("");
              }
            }}
          >
            Add
          </button>
        </div>
        {categories.map((c) => (
          <div className="word" key={c.id}>
            <div className="grow">
              <b>{c.name}</b> <span className="badge">{count(c.id)} words</span>
            </div>
            <button
              className="btn small danger"
              onClick={() => onDelete(c.id)}
              title="Words move to Vocabulary"
            >
              Delete
            </button>
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Conjugation (tenses) ======================= */

function ConjugationTab({ langMeta, langState, onToggleTense }) {
  const conj = CONJUGATORS[langMeta.id];
  const verbs = langState.words.filter((w) => w.isVerb);
  const [preview, setPreview] = useState("");
  const previewVerb = preview || verbs[0]?.term || sampleVerb(langMeta.id);

  return (
    <div>
      <div className="card">
        <div className="section-title">Active tenses</div>
        <p className="muted">
          Choose only the tenses you’re studying right now — the app auto-conjugates your verbs
          for just these, so you’re not overwhelmed.
        </p>
        <div className="chips">
          {conj.tenses.map((t) => {
            const on = langState.activeTenses.includes(t.id);
            return (
              <button
                key={t.id}
                className={"chip" + (on ? " on" : "")}
                onClick={() => onToggleTense(t.id)}
              >
                {on ? "✓ " : ""}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="section-title">Preview conjugation</div>
        <p className="muted">Type any {langMeta.label} verb to see it conjugated in your active tenses.</p>
        <input
          placeholder={`a ${langMeta.label} verb, e.g. ${sampleVerb(langMeta.id)}`}
          value={preview}
          onChange={(e) => setPreview(e.target.value)}
        />
        {langState.activeTenses.length === 0 ? (
          <div className="empty" style={{ marginTop: 14 }}>
            Activate at least one tense above to see conjugations.
          </div>
        ) : (
          <PreviewTable verb={previewVerb} conj={conj} activeTenses={langState.activeTenses} />
        )}
      </div>
    </div>
  );
}

function PreviewTable({ verb, conj, activeTenses }) {
  const tenses = conj.tenses.filter((t) => activeTenses.includes(t.id));
  if (!verb) return null;
  return (
    <div style={{ marginTop: 14 }}>
      {tenses.map((t) => {
        const table = conj.conjugate(verb, t.id);
        return (
          <div key={t.id} style={{ marginBottom: 16 }}>
            <div className="muted" style={{ fontWeight: 700, color: "var(--crimson-soft)" }}>
              {t.label}
            </div>
            <table className="conj-table">
              <tbody>
                {conj.persons.map((p) => (
                  <tr key={p.id}>
                    <td className="person">{p.label}</td>
                    <td>{table[p.id]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function sampleVerb(langId) {
  return { french: "parler", english: "to speak", portuguese: "falar" }[langId] || "";
}

/* ============================ Quiz ============================ */

function QuizTab({ langMeta, langState, onRecordAnswer, isJapanese }) {
  const [session, setSession] = useState(null);
  const words = langState.words.filter((w) => w.en || w.es || w.isVerb);

  if (words.length === 0) {
    return (
      <div className="empty">
        Add some words first — then the quiz will drill you on them, focusing on the new ones and
        the ones you miss most.
      </div>
    );
  }

  if (!session) {
    return (
      <div className="card quiz-card">
        <div className="section-title">Ready to practice?</div>
        <p className="muted">
          Questions appear in random directions (word ↔ translations
          {hasConjugation(langMeta.id) ? ", plus verb conjugations" : ""}). New and tricky words
          come up more often.
        </p>
        <div className="inline" style={{ justifyContent: "center", marginTop: 10 }}>
          <button
            className="btn primary"
            onClick={() => {
              const questions = buildQuiz(
                words,
                langMeta.id,
                langState.activeTenses,
                Math.min(10, Math.max(5, words.length))
              );
              if (questions.length === 0) {
                alert(
                  "These words can't be quizzed yet. Add an English or Spanish translation " +
                    "(or, for verbs, activate a tense in the Conjugation tab)."
                );
                return;
              }
              setSession({ questions, idx: 0, correct: 0, wrong: 0, done: false });
            }}
          >
            Start quiz
          </button>
        </div>
      </div>
    );
  }

  return (
    <QuizRunner
      session={session}
      setSession={setSession}
      onRecordAnswer={onRecordAnswer}
    />
  );
}

function QuizRunner({ session, setSession, onRecordAnswer }) {
  const q = session.questions[session.idx];
  const [answer, setAnswer] = useState("");
  const [state, setState] = useState("idle"); // idle | correct | wrong
  const inputRef = useRef(null);

  useEffect(() => {
    setAnswer("");
    setState("idle");
    inputRef.current?.focus();
  }, [session.idx]);

  if (session.done || !q) {
    const total = session.correct + session.wrong;
    const pct = total ? Math.round((session.correct / total) * 100) : 0;
    return (
      <div className="card quiz-card">
        <div className="section-title">Session complete 🎉</div>
        <div className="stat-grid" style={{ marginTop: 16 }}>
          <div className="stat">
            <div className="num">{total}</div>
            <div className="lbl">Questions</div>
          </div>
          <div className="stat">
            <div className="num good">{session.correct}</div>
            <div className="lbl">Correct</div>
          </div>
          <div className="stat">
            <div className="num bad">{session.wrong}</div>
            <div className="lbl">Missed</div>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 16 }}>
          {pct}% this round. The words you missed will show up more next time.
        </p>
        <button className="btn primary" onClick={() => setSession(null)}>
          Done
        </button>
      </div>
    );
  }

  const submit = () => {
    if (state !== "idle") {
      next();
      return;
    }
    const correct = isCorrect(q, answer);
    setState(correct ? "correct" : "wrong");
    onRecordAnswer(q.wordId, correct);
    setSession((s) => ({ ...s, correct: s.correct + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) }));
  };

  const next = () => {
    setSession((s) => {
      const nextIdx = s.idx + 1;
      return { ...s, idx: nextIdx, done: nextIdx >= s.questions.length };
    });
  };

  const progress = ((session.idx) / session.questions.length) * 100;

  return (
    <div className="card quiz-card">
      <div className="quiz-progress">
        Question {session.idx + 1} of {session.questions.length}
      </div>
      <div className="quiz-bar">
        <div style={{ width: progress + "%" }} />
      </div>
      <div className="quiz-prompt">{q.prompt}</div>
      {q.hint && <div className="muted">{q.hint}</div>}

      <input
        ref={inputRef}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Type your answer…"
        disabled={state !== "idle"}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={{ marginTop: 16, textAlign: "center", fontSize: 18 }}
      />

      {state !== "idle" && (
        <div className={"feedback " + (state === "correct" ? "good" : "bad")}>
          {state === "correct" ? "✓ Correct!" : "✗ Not quite."}
          <div className="answer">
            Answer: <b>{q.answer}</b>
          </div>
        </div>
      )}

      <div className="inline" style={{ justifyContent: "center", marginTop: 18 }}>
        {state === "idle" ? (
          <button className="btn primary" onClick={submit}>
            Check
          </button>
        ) : (
          <button className="btn primary" onClick={next}>
            {session.idx + 1 >= session.questions.length ? "Finish" : "Next →"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ====================== Japanese kana practice ====================== */

function KanaTab() {
  const [setKey, setSetKey] = useState("hiragana");
  const [mode, setMode] = useState("reading");
  const [progress, setProgress] = useState(() => loadKanaProgress());
  const [q, setQ] = useState(null);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const timerRef = useRef(null);
  // Keep the latest progress in a ref so the delayed next-question uses up-to-date weights.
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const newQuestion = () => {
    setPicked(null);
    setQ(buildKanaQuestion(setKey, mode, progressRef.current));
  };

  // Start a fresh question when the alphabet/mode changes, and clean up any pending
  // timer if the component unmounts (e.g. switching tabs) to avoid setting state late.
  useEffect(() => {
    newQuestion();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [setKey, mode]);

  const answer = (opt) => {
    if (picked) return;
    const correct = opt === q.answer;
    setPicked(opt);
    const p = recordKana({ ...progress }, q.key, correct);
    setProgress(p);
    saveKanaProgress(p);
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) }));
    timerRef.current = setTimeout(newQuestion, 850);
  };

  const learned = Object.values(progress).filter((s) => s.correct + s.wrong > 0).length;
  const total = KANA_SETS[setKey].chars.length;

  return (
    <div>
      <div className="card">
        <div className="section-title">Writing &amp; Reading practice</div>
        <p className="muted">
          Drill the Japanese alphabets. <b>Reading</b> shows a character and you recall its sound;
          <b> Writing</b> shows the sound and you pick the character. Tricky characters come up more.
        </p>
        <div className="row" style={{ marginTop: 6 }}>
          <div>
            <label>Alphabet</label>
            <select value={setKey} onChange={(e) => setSetKey(e.target.value)}>
              {Object.entries(KANA_SETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Practice mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="reading">Reading (character → sound)</option>
              <option value="writing">Writing (sound → character)</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Practiced {learned} / {total} {KANA_SETS[setKey].label} characters · ✓ {score.correct} · ✗{" "}
          {score.wrong}
        </p>
      </div>

      {q && (
        <div className="card quiz-card">
          <div className="muted">{q.question}</div>
          <div className={q.mode === "reading" ? "kana-prompt" : "quiz-prompt"}>{q.prompt}</div>
          <div className="options">
            {q.options.map((opt) => {
              let cls = "option";
              if (picked) {
                if (opt === q.answer) cls += " correct";
                else if (opt === picked) cls += " wrong";
              }
              return (
                <button key={opt} className={cls} onClick={() => answer(opt)} disabled={!!picked}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ Mount ============================ */

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
