// main.js — interfaz de LinguaNotes en JavaScript puro (sin React, sin CDN).
// Reutiliza toda la lógica ya probada: storage, conjugation, kana, quiz, kanaQuiz.

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
import { h, clear, openModal } from "./dom.js";
import { autoTranslate, isTranslatable } from "./translate.js";

/* ===================== Estado global ===================== */

let data = storage.load();
let currentTab = "notes";
let search = "";
let selectedCategory = null; // null = ver la lista de categorías; id = ver una categoría

// Estado de sesión de quiz (null = no iniciado)
let quizSession = null;
// Estado de kana
let kana = { setKey: "hiragana", mode: "reading", progress: loadKanaProgress(), q: null, picked: null, score: { correct: 0, wrong: 0 }, timer: null };

const root = document.getElementById("root");

function save() {
  storage.save(data);
}
function lang() {
  return data.settings.activeLanguage;
}
function langMeta() {
  return LANGUAGES.find((l) => l.id === lang());
}
function langState() {
  return data.languages[lang()];
}
function isJapanese() {
  return lang() === "japanese";
}

/* ===================== Render principal ===================== */

function render() {
  clear(root);
  root.appendChild(renderTopbar());
  root.appendChild(renderTabs());

  const container = h("div", { class: "app" });
  if (currentTab === "notes") container.appendChild(renderNotes());
  else if (currentTab === "conjugation" && !isJapanese()) container.appendChild(renderConjugation());
  else if (currentTab === "kana" && isJapanese()) container.appendChild(renderKana());
  else if (currentTab === "quiz") container.appendChild(renderQuiz());
  root.appendChild(container);
}

function tabsFor() {
  return isJapanese()
    ? [
        { id: "notes", label: "Notas" },
        { id: "kana", label: "Escritura y lectura" },
        { id: "quiz", label: "Quiz" },
      ]
    : [
        { id: "notes", label: "Notas" },
        { id: "conjugation", label: "Conjugación" },
        { id: "quiz", label: "Quiz" },
      ];
}

function renderTopbar() {
  const m = langMeta();
  const select = h(
    "select",
    {
      onchange: (e) => {
        data.settings.activeLanguage = e.target.value;
        save();
        if (!tabsFor().some((t) => t.id === currentTab)) currentTab = "notes";
        quizSession = null;
        selectedCategory = null;
        render();
      },
    },
    LANGUAGES.map((l) =>
      h("option", { value: l.id, selected: l.id === lang() }, `${l.flag} ${l.label}`)
    )
  );

  return h("div", { class: "topbar" }, [
    h("div", { class: "app", style: { display: "flex", alignItems: "center", gap: "14px", padding: 0 } }, [
      h("div", { class: "brand" }, [
        h("span", { class: "dot" }),
        h("div", {}, [
          document.createTextNode("LinguaNotes"),
          h("br"),
          h("small", {}, `tus notas, organizadas · ${m.flag} ${m.label}`),
        ]),
      ]),
      h("div", { class: "spacer" }),
      h("div", { class: "lang-select" }, [h("label", { style: { margin: 0 } }, "Idioma"), select]),
    ]),
  ]);
}

function renderTabs() {
  const wrap = h("div", { class: "app", style: { paddingTop: "18px", paddingBottom: 0 } });
  const tabs = h(
    "div",
    { class: "tabs" },
    tabsFor().map((t) =>
      h(
        "button",
        {
          class: "tab" + (currentTab === t.id ? " active" : ""),
          onclick: () => {
            currentTab = t.id;
            render();
          },
        },
        t.label
      )
    )
  );
  wrap.appendChild(tabs);
  return wrap;
}

/* ===================== Notas ===================== */

function renderNotes() {
  const wrap = h("div");

  const toolbar = h("div", { class: "toolbar" }, [
    h("input", {
      class: "grow",
      placeholder: "Busca en todas tus notas…",
      value: search,
      oninput: (e) => {
        search = e.target.value;
        const fresh = renderNotesList();
        listHost.replaceWith(fresh);
        listHost = fresh;
      },
    }),
    h("button", { class: "btn", onclick: openCategories }, "Gestionar categorías"),
    h("button", { class: "btn primary", onclick: () => openWordForm(null) }, "+ Añadir palabra"),
  ]);
  wrap.appendChild(toolbar);

  let listHost = renderNotesList();
  wrap.appendChild(listHost);
  return wrap;
}

function filteredWords() {
  const ls = langState();
  const s = search.trim().toLowerCase();
  return ls.words.filter((w) => {
    if (!s) return true;
    return (
      w.term.toLowerCase().includes(s) ||
      (w.en || "").toLowerCase().includes(s) ||
      (w.es || "").toLowerCase().includes(s)
    );
  });
}

function countInCategory(catId) {
  const ls = langState();
  const known = new Set(ls.categories.map((c) => c.id));
  if (catId === "__u") return ls.words.filter((w) => !known.has(w.categoryId)).length;
  return ls.words.filter((w) => w.categoryId === catId).length;
}

function renderNotesList() {
  const ls = langState();
  const m = langMeta();
  const host = h("div");

  // --- Si hay búsqueda activa: resultados globales (todas las categorías) ---
  if (search.trim()) {
    const results = filteredWords();
    if (!results.length) {
      host.appendChild(h("div", { class: "empty" }, `Ninguna nota coincide con “${search}”. Prueba otra búsqueda.`));
      return host;
    }
    host.appendChild(h("p", { class: "muted" }, `${results.length} resultado(s) para “${search}”`));
    results.forEach((w) => host.appendChild(renderWordRow(w)));
    return host;
  }

  // --- Vista de UNA categoría seleccionada: solo sus palabras ---
  if (selectedCategory) {
    const known = new Set(ls.categories.map((c) => c.id));
    const cat = ls.categories.find((c) => c.id === selectedCategory) || { id: "__u", name: "Sin categoría" };
    const items =
      selectedCategory === "__u"
        ? ls.words.filter((w) => !known.has(w.categoryId))
        : ls.words.filter((w) => w.categoryId === selectedCategory);

    host.appendChild(
      h("div", { class: "cat-head", style: { marginBottom: "14px" } }, [
        h("button", {
          class: "btn ghost small",
          onclick: () => {
            selectedCategory = null;
            render();
          },
        }, "← Categorías"),
        h("h3", { style: { margin: 0 } }, cat.name),
        h("span", { class: "badge" }, String(items.length)),
      ])
    );

    if (!items.length) {
      host.appendChild(h("div", { class: "empty", html: `No hay palabras en <b>${esc(cat.name)}</b> todavía. Pulsa “+ Añadir palabra”.` }));
    } else {
      items.forEach((w) => host.appendChild(renderWordRow(w)));
    }
    return host;
  }

  // --- Vista principal: TARJETAS de categorías (entras a una para ver sus palabras) ---
  host.appendChild(h("p", { class: "muted" }, "Elige una categoría para ver sus palabras:"));
  const grid = h("div", { class: "cat-grid" });
  const known = new Set(ls.categories.map((c) => c.id));
  const cats = [...ls.categories];
  const orphanCount = ls.words.filter((w) => !known.has(w.categoryId)).length;
  if (orphanCount) cats.push({ id: "__u", name: "Sin categoría" });

  for (const c of cats) {
    const count = countInCategory(c.id);
    grid.appendChild(
      h("button", {
        class: "cat-card",
        onclick: () => {
          selectedCategory = c.id;
          render();
        },
      }, [
        h("div", { class: "cat-card-name" }, c.name),
        h("div", { class: "cat-card-count" }, `${count} palabra${count === 1 ? "" : "s"}`),
      ])
    );
  }
  host.appendChild(grid);
  return host;
}

function renderWordRow(w) {
  const m = langMeta();
  const ls = langState();
  const canConj = w.isVerb && hasConjugation(m.id) && ls.activeTenses.length > 0;

  const grow = h("div", { class: "grow" }, [
    h("div", { class: "term" }, [
      document.createTextNode(w.term + " "),
      w.isVerb ? h("span", { class: "badge pill-verb" }, "verbo") : null,
    ]),
    h("div", { class: "trans", html: `🇬🇧 <b>${esc(w.en) || "—"}</b> &nbsp;·&nbsp; 🇪🇸 <b>${esc(w.es) || "—"}</b>` }),
    w.notes ? h("div", { class: "trans faint" }, `📝 ${w.notes}`) : null,
  ]);

  if (canConj) {
    let open = false;
    let tableEl = null;
    const toggle = h("button", { class: "btn ghost small", style: { marginTop: "8px" } }, "Mostrar conjugación");
    toggle.addEventListener("click", () => {
      open = !open;
      toggle.textContent = open ? "Ocultar conjugación" : "Mostrar conjugación";
      if (open) {
        tableEl = renderConjTable(w);
        grow.appendChild(tableEl);
      } else if (tableEl) {
        tableEl.remove();
        tableEl = null;
      }
    });
    grow.appendChild(toggle);
  }

  return h("div", { class: "word" }, [
    grow,
    h("div", { class: "actions" }, [
      h("button", { class: "btn small", onclick: () => openWordForm(w) }, "Editar"),
      h("button", {
        class: "btn small danger",
        onclick: () => {
          const ls2 = langState();
          ls2.words = ls2.words.filter((x) => x.id !== w.id);
          save();
          render();
        },
      }, "Borrar"),
    ]),
  ]);
}

function renderConjTable(w) {
  const m = langMeta();
  const ls = langState();
  const conj = CONJUGATORS[m.id];
  const wrap = h("div", { style: { marginTop: "10px" } });
  const tenses = conj.tenses.filter((t) => ls.activeTenses.includes(t.id));
  for (const t of tenses) {
    const table = conj.conjugate(w.term, t.id);
    const overrides = (w.conjOverrides && w.conjOverrides[t.id]) || {};
    const rows = conj.persons.map((p) =>
      h("tr", {}, [
        h("td", { class: "person" }, p.label),
        h("td", {}, [
          h("input", {
            value: overrides[p.id] != null ? overrides[p.id] : table[p.id] || "",
            title: "Generado automáticamente — edítalo para corregirlo",
            oninput: (e) => {
              w.conjOverrides = w.conjOverrides || {};
              w.conjOverrides[t.id] = w.conjOverrides[t.id] || {};
              if (e.target.value.trim()) w.conjOverrides[t.id][p.id] = e.target.value;
              else delete w.conjOverrides[t.id][p.id];
              save();
            },
          }),
        ]),
      ])
    );
    wrap.appendChild(
      h("div", { style: { marginBottom: "14px" } }, [
        h("div", { class: "muted", style: { fontWeight: 700, color: "var(--crimson-soft)" } }, t.label),
        h("table", { class: "conj-table" }, [h("tbody", {}, rows)]),
      ])
    );
  }
  return wrap;
}

/* ---- Formulario de palabra (modal) ---- */

function openWordForm(initial) {
  const m = langMeta();
  const ls = langState();
  // Al añadir desde dentro de una categoría, esa viene preseleccionada.
  const defaultCat =
    initial?.categoryId ||
    (selectedCategory && selectedCategory !== "__u" ? selectedCategory : null) ||
    ls.categories[0]?.id ||
    "vocabulary";
  const state = {
    term: initial?.term || "",
    en: initial?.en || "",
    es: initial?.es || "",
    notes: initial?.notes || "",
    isVerb: initial?.isVerb || false,
    categoryId: defaultCat,
  };

  const termInput = h("input", {
    value: state.term,
    placeholder: m.id === "french" ? "ej. parler" : "la palabra nueva",
    oninput: (e) => (state.term = e.target.value),
    onkeydown: (e) => {
      if (e.key === "Enter") submit();
    },
  });

  // Inputs de traducción (guardamos referencia para poder rellenarlos tras traducir).
  const enInput = h("input", { value: state.en, placeholder: "to speak", oninput: (e) => (state.en = e.target.value) });
  const esInput = h("input", { value: state.es, placeholder: "hablar", oninput: (e) => (state.es = e.target.value) });

  // Botón de traducción automática (online).
  const transStatus = h("span", { class: "muted", style: { fontSize: "12px" } }, "");
  const translateBtn = h("button", { class: "btn small" }, "🌐 Traducir automáticamente");
  translateBtn.addEventListener("click", async () => {
    if (!state.term.trim()) {
      transStatus.textContent = "Escribe primero la palabra.";
      return;
    }
    translateBtn.disabled = true;
    const prev = translateBtn.textContent;
    translateBtn.textContent = "Traduciendo…";
    transStatus.textContent = "";
    const r = await autoTranslate(state.term, m.id);
    if (r.en) { state.en = r.en; enInput.value = r.en; }
    if (r.es) { state.es = r.es; esInput.value = r.es; }
    transStatus.textContent = r.error ? "⚠️ " + r.error : "✓ Traducido (puedes corregirlo).";
    transStatus.style.color = r.error ? "var(--bad)" : "var(--good)";
    translateBtn.disabled = false;
    translateBtn.textContent = prev;
  });

  function submit() {
    if (!state.term.trim()) return;
    const payload = {
      term: state.term.trim(),
      en: state.en.trim(),
      es: state.es.trim(),
      notes: state.notes.trim(),
      isVerb: state.isVerb,
      categoryId: state.categoryId,
    };
    if (initial) {
      Object.assign(initial, payload);
    } else {
      ls.words.push(makeWord(payload));
    }
    save();
    close();
    render();
  }

  const canConj = hasConjugation(m.id);
  const canTranslate = isTranslatable(m.id);

  const content = h("div", { class: "modal card", onclick: (e) => e.stopPropagation() }, [
    h("h2", {}, initial ? "Editar palabra" : "Añadir palabra"),
    h("div", { style: { marginBottom: "10px" } }, [h("label", {}, `Palabra en ${m.label}`), termInput]),
    canTranslate
      ? h("div", { class: "inline", style: { marginBottom: "12px", gap: "10px" } }, [translateBtn, transStatus])
      : null,
    h("div", { class: "row", style: { marginBottom: "12px" } }, [
      h("div", {}, [h("label", {}, "🇬🇧 Inglés"), enInput]),
      h("div", {}, [h("label", {}, "🇪🇸 Español"), esInput]),
    ]),
    h("div", { class: "row", style: { marginBottom: "12px" } }, [
      h("div", {}, [
        h("label", {}, "Categoría"),
        h("select", { onchange: (e) => (state.categoryId = e.target.value) }, ls.categories.map((c) => h("option", { value: c.id, selected: c.id === state.categoryId }, c.name))),
      ]),
      canConj
        ? h("div", {}, [
            h("label", {}, "Tipo"),
            h("div", { class: "checkbox-row", style: { paddingTop: "8px" } }, [
              h("input", { type: "checkbox", checked: state.isVerb, onchange: (e) => (state.isVerb = e.target.checked) }),
              h("label", { style: { margin: 0 } }, "Es un verbo (conjugar automáticamente)"),
            ]),
          ])
        : null,
    ]),
    h("div", { style: { marginBottom: "4px" } }, [
      h("label", {}, "Notas / comentarios (opcional)"),
      h("textarea", { rows: "2", placeholder: "algún recordatorio, frase de ejemplo, comentario…", oninput: (e) => (state.notes = e.target.value) }, state.notes),
    ]),
    h("div", { class: "modal-actions" }, [
      h("button", { class: "btn ghost", onclick: () => close() }, "Cancelar"),
      h("button", { class: "btn primary", onclick: submit }, initial ? "Guardar cambios" : "Añadir palabra"),
    ]),
  ]);

  const close = openModal(content, () => close());
  setTimeout(() => termInput.focus(), 0);
}

/* ---- Gestor de categorías (modal) ---- */

function openCategories() {
  const ls = langState();
  const body = h("div", { class: "modal card", onclick: (e) => e.stopPropagation() });

  function rebuild() {
    clear(body);
    const nameInput = h("input", {
      class: "grow",
      placeholder: "Nombre de categoría nueva",
      onkeydown: (e) => {
        if (e.key === "Enter" && e.target.value.trim()) addCat(e.target.value.trim(), nameInput);
      },
    });
    body.appendChild(h("h2", {}, "Categorías"));
    body.appendChild(h("p", { class: "muted" }, "Organiza tus notas como quieras."));
    body.appendChild(
      h("div", { class: "inline", style: { marginBottom: "16px" } }, [
        nameInput,
        h("button", { class: "btn primary", onclick: () => nameInput.value.trim() && addCat(nameInput.value.trim(), nameInput) }, "Añadir"),
      ])
    );
    for (const c of ls.categories) {
      const count = ls.words.filter((w) => w.categoryId === c.id).length;
      body.appendChild(
        h("div", { class: "word" }, [
          h("div", { class: "grow", html: `<b>${esc(c.name)}</b> <span class="badge">${count} palabras</span>` }),
          h("button", {
            class: "btn small danger",
            title: "Las palabras pasan a la primera categoría",
            onclick: () => {
              ls.categories = ls.categories.filter((x) => x.id !== c.id);
              const fallback = ls.categories[0]?.id || "vocabulary";
              ls.words.forEach((w) => {
                if (w.categoryId === c.id) w.categoryId = fallback;
              });
              save();
              rebuild();
            },
          }, "Borrar"),
        ])
      );
    }
    body.appendChild(h("div", { class: "modal-actions" }, [h("button", { class: "btn primary", onclick: () => close() }, "Listo")]));
  }

  function addCat(name, input) {
    ls.categories.push({ id: genId(), name });
    save();
    input.value = "";
    rebuild();
  }

  rebuild();
  const dismiss = openModal(body, () => close());
  function close() {
    dismiss();
    render(); // refrescar la lista de notas por si cambiaron categorías
  }
}

/* ===================== Conjugación ===================== */

function renderConjugation() {
  const m = langMeta();
  const ls = langState();
  const conj = CONJUGATORS[m.id];
  const wrap = h("div");

  // tarjeta de tiempos activos
  const chips = h(
    "div",
    { class: "chips" },
    conj.tenses.map((t) => {
      const on = ls.activeTenses.includes(t.id);
      return h("button", {
        class: "chip" + (on ? " on" : ""),
        onclick: () => {
          const set = new Set(ls.activeTenses);
          set.has(t.id) ? set.delete(t.id) : set.add(t.id);
          ls.activeTenses = [...set];
          save();
          render();
        },
      }, (on ? "✓ " : "") + t.label);
    })
  );
  wrap.appendChild(
    h("div", { class: "card" }, [
      h("div", { class: "section-title" }, "Tiempos activos"),
      h("p", { class: "muted" }, "Elige solo los tiempos que estás estudiando ahora — la app conjuga tus verbos solo para estos, así no te agobias."),
      chips,
    ])
  );

  // tarjeta de vista previa
  const previewHost = h("div");
  let preview = "";
  const input = h("input", {
    placeholder: `un verbo en ${m.label}, ej. ${sampleVerb(m.id)}`,
    oninput: (e) => {
      preview = e.target.value;
      refreshPreview();
    },
  });
  function refreshPreview() {
    clear(previewHost);
    if (ls.activeTenses.length === 0) {
      previewHost.appendChild(h("div", { class: "empty", style: { marginTop: "14px" } }, "Activa al menos un tiempo arriba para ver conjugaciones."));
      return;
    }
    const verb = preview || ls.words.filter((w) => w.isVerb)[0]?.term || sampleVerb(m.id);
    if (!verb) return;
    const tenses = conj.tenses.filter((t) => ls.activeTenses.includes(t.id));
    const box = h("div", { style: { marginTop: "14px" } });
    for (const t of tenses) {
      const table = conj.conjugate(verb, t.id);
      box.appendChild(
        h("div", { style: { marginBottom: "16px" } }, [
          h("div", { class: "muted", style: { fontWeight: 700, color: "var(--crimson-soft)" } }, t.label),
          h("table", { class: "conj-table" }, [
            h("tbody", {}, conj.persons.map((p) => h("tr", {}, [h("td", { class: "person" }, p.label), h("td", {}, table[p.id])]))),
          ]),
        ])
      );
    }
    previewHost.appendChild(box);
  }
  refreshPreview();

  wrap.appendChild(
    h("div", { class: "card" }, [
      h("div", { class: "section-title" }, "Vista previa de conjugación"),
      h("p", { class: "muted" }, `Escribe cualquier verbo en ${m.label} para verlo conjugado en tus tiempos activos.`),
      input,
      previewHost,
    ])
  );
  return wrap;
}

function sampleVerb(id) {
  return { french: "parler", english: "to speak", portuguese: "falar" }[id] || "";
}

/* ===================== Quiz ===================== */

function renderQuiz() {
  const m = langMeta();
  const ls = langState();
  const words = ls.words.filter((w) => w.en || w.es || w.isVerb);

  if (words.length === 0) {
    return h("div", { class: "empty" }, "Añade algunas palabras primero — luego el quiz te preguntará, dando prioridad a las nuevas y a las que más fallas.");
  }

  if (!quizSession) {
    const canConj = hasConjugation(m.id);
    // Opciones de tipo de quiz (conjugación solo si el idioma la soporta).
    const types = [
      { id: "mixed", label: "🎲 Mixto", desc: "Traducciones y conjugaciones mezcladas" },
      { id: "translation", label: "🌐 Traducción", desc: "Solo palabra ↔ inglés/español" },
    ];
    if (canConj) types.push({ id: "conjugation", label: "📖 Conjugación", desc: "Solo conjugar verbos en tus tiempos activos" });

    let chosenType = "mixed";
    const cards = types.map((t) =>
      h("button", {
        class: "quiz-type" + (t.id === chosenType ? " on" : ""),
        onclick: (e) => {
          chosenType = t.id;
          // marcar visualmente
          e.currentTarget.parentElement.querySelectorAll(".quiz-type").forEach((el) => el.classList.remove("on"));
          e.currentTarget.classList.add("on");
        },
      }, [h("div", { class: "quiz-type-title" }, t.label), h("div", { class: "muted", style: { fontSize: "12px" } }, t.desc)])
    );

    return h("div", { class: "card quiz-card" }, [
      h("div", { class: "section-title" }, "¿Qué quieres practicar?"),
      h("p", { class: "muted" }, "Elige el tipo de quiz. Las palabras nuevas y las que más fallas salen con más frecuencia."),
      h("div", { class: "quiz-type-grid" }, cards),
      h("div", { class: "inline", style: { justifyContent: "center", marginTop: "18px" } }, [
        h("button", {
          class: "btn primary",
          onclick: () => {
            const questions = buildQuiz(words, m.id, ls.activeTenses, Math.min(10, Math.max(5, words.length)), chosenType);
            if (questions.length === 0) {
              const msg =
                chosenType === "conjugation"
                  ? "Para el quiz de conjugación necesitas verbos marcados como tales y al menos un tiempo activo (pestaña Conjugación)."
                  : chosenType === "translation"
                  ? "Necesitas palabras con traducción en inglés o español."
                  : "Estas palabras aún no se pueden preguntar. Añade traducciones o activa un tiempo verbal.";
              alert(msg);
              return;
            }
            quizSession = { questions, idx: 0, correct: 0, wrong: 0, done: false, state: "idle", answer: "", type: chosenType };
            render();
          },
        }, "Empezar quiz"),
      ]),
    ]);
  }

  return renderQuizRunner();
}

function renderQuizRunner() {
  const s = quizSession;
  const q = s.questions[s.idx];

  if (s.done || !q) {
    const total = s.correct + s.wrong;
    const pct = total ? Math.round((s.correct / total) * 100) : 0;
    return h("div", { class: "card quiz-card" }, [
      h("div", { class: "section-title" }, "Sesión completada 🎉"),
      h("div", { class: "stat-grid", style: { marginTop: "16px" } }, [
        statBox(total, "Preguntas", ""),
        statBox(s.correct, "Aciertos", "good"),
        statBox(s.wrong, "Fallos", "bad"),
      ]),
      h("p", { class: "muted", style: { marginTop: "16px" } }, `${pct}% esta ronda. Las que fallaste saldrán más la próxima vez.`),
      h("button", { class: "btn primary", onclick: () => { quizSession = null; render(); } }, "Listo"),
    ]);
  }

  const progress = (s.idx / s.questions.length) * 100;
  const answerInput = h("input", {
    value: s.answer,
    placeholder: "Escribe tu respuesta…",
    disabled: s.state !== "idle",
    style: { marginTop: "16px", textAlign: "center", fontSize: "18px" },
    oninput: (e) => (s.answer = e.target.value),
    onkeydown: (e) => {
      if (e.key === "Enter") submit();
    },
  });

  function submit() {
    if (s.state !== "idle") return next();
    const correct = isCorrect(q, s.answer);
    s.state = correct ? "correct" : "wrong";
    // registrar en stats de la palabra
    const w = langState().words.find((x) => x.id === q.wordId);
    if (w) {
      w.stats.seen += 1;
      if (correct) w.stats.correct += 1;
      else w.stats.wrong += 1;
      w.stats.lastResult = correct ? "correct" : "wrong";
      save();
    }
    if (correct) s.correct += 1;
    else s.wrong += 1;
    render();
  }
  function next() {
    s.idx += 1;
    s.state = "idle";
    s.answer = "";
    if (s.idx >= s.questions.length) s.done = true;
    render();
  }

  const card = h("div", { class: "card quiz-card" }, [
    h("div", { class: "quiz-progress" }, `Pregunta ${s.idx + 1} de ${s.questions.length}`),
    h("div", { class: "quiz-bar" }, [h("div", { style: { width: progress + "%" } })]),
    h("div", { class: "quiz-prompt" }, q.prompt),
    q.hint ? h("div", { class: "muted" }, q.hint) : null,
    answerInput,
    s.state !== "idle"
      ? h("div", { class: "feedback " + (s.state === "correct" ? "good" : "bad") }, [
          document.createTextNode(s.state === "correct" ? "✓ ¡Correcto!" : "✗ Casi."),
          h("div", { class: "answer", html: `Respuesta: <b>${esc(q.answer)}</b>` }),
        ])
      : null,
    h("div", { class: "inline", style: { justifyContent: "center", marginTop: "18px" } }, [
      s.state === "idle"
        ? h("button", { class: "btn primary", onclick: submit }, "Comprobar")
        : h("button", { class: "btn primary", onclick: next }, s.idx + 1 >= s.questions.length ? "Terminar" : "Siguiente →"),
    ]),
  ]);

  if (s.state === "idle") setTimeout(() => answerInput.focus(), 0);
  return card;
}

function statBox(num, label, kind) {
  return h("div", { class: "stat" }, [h("div", { class: "num " + (kind || "") }, String(num)), h("div", { class: "lbl" }, label)]);
}

/* ===================== Kana (japonés) ===================== */

function renderKana() {
  const wrap = h("div");

  const setSelect = h("select", {
    onchange: (e) => {
      kana.setKey = e.target.value;
      newKanaQuestion();
      render();
    },
  }, Object.entries(KANA_SETS).map(([k, v]) => h("option", { value: k, selected: k === kana.setKey }, v.label)));

  const modeSelect = h("select", {
    onchange: (e) => {
      kana.mode = e.target.value;
      newKanaQuestion();
      render();
    },
  }, [
    h("option", { value: "reading", selected: kana.mode === "reading" }, "Lectura (carácter → sonido)"),
    h("option", { value: "writing", selected: kana.mode === "writing" }, "Escritura (sonido → carácter)"),
    h("option", { value: "mixed", selected: kana.mode === "mixed" }, "Mixto"),
  ]);

  const learned = Object.values(kana.progress).filter((s) => s.correct + s.wrong > 0).length;
  const total = KANA_SETS[kana.setKey].chars.length;

  wrap.appendChild(
    h("div", { class: "card" }, [
      h("div", { class: "section-title" }, "Práctica de escritura y lectura"),
      h("p", { class: "muted", html: "Practica los silabarios japoneses. <b>Lectura</b> muestra un carácter y recuerdas su sonido; <b>Escritura</b> muestra el sonido y eliges el carácter. Los difíciles salen más." }),
      h("div", { class: "row", style: { marginTop: "6px" } }, [
        h("div", {}, [h("label", {}, "Silabario"), setSelect]),
        h("div", {}, [h("label", {}, "Modo de práctica"), modeSelect]),
      ]),
      h("p", { class: "muted", style: { marginTop: "10px" } }, `Practicados ${learned} / ${total} caracteres de ${KANA_SETS[kana.setKey].label} · ✓ ${kana.score.correct} · ✗ ${kana.score.wrong}`),
    ])
  );

  if (!kana.q) newKanaQuestion();
  const q = kana.q;
  if (q) {
    const options = h(
      "div",
      { class: "options" },
      q.options.map((opt) => {
        let cls = "option";
        if (kana.picked) {
          if (opt === q.answer) cls += " correct";
          else if (opt === kana.picked) cls += " wrong";
        }
        return h("button", {
          class: cls,
          disabled: !!kana.picked,
          onclick: () => answerKana(opt),
        }, opt);
      })
    );
    wrap.appendChild(
      h("div", { class: "card quiz-card" }, [
        h("div", { class: "muted" }, q.question),
        h("div", { class: q.mode === "reading" ? "kana-prompt" : "quiz-prompt" }, q.prompt),
        options,
      ])
    );
  }
  return wrap;
}

function newKanaQuestion() {
  kana.picked = null;
  kana.q = buildKanaQuestion(kana.setKey, kana.mode, kana.progress);
}

function answerKana(opt) {
  if (kana.picked) return;
  const q = kana.q;
  const correct = opt === q.answer;
  kana.picked = opt;
  kana.progress = recordKana({ ...kana.progress }, q.key, correct);
  saveKanaProgress(kana.progress);
  if (correct) kana.score.correct += 1;
  else kana.score.wrong += 1;
  render();
  if (kana.timer) clearTimeout(kana.timer);
  kana.timer = setTimeout(() => {
    newKanaQuestion();
    if (currentTab === "kana" && isJapanese()) render();
  }, 850);
}

/* ===================== util ===================== */

function esc(s) {
  return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ===================== arranque ===================== */

render();
