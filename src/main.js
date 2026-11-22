// main.js — interfaz de LinguaNotes en JavaScript puro (sin React, sin CDN).
// Reutiliza toda la lógica ya probada: storage, conjugation, kana, quiz, kanaQuiz.

import { storage, LANGUAGES, makeWord, genId } from "./storage.js";
import { CONJUGATORS, hasConjugation } from "./conjugation.js";
import { KANA_SETS } from "./kana.js";
import { buildQuiz, isCorrect, isMultiCorrect, normalize } from "./quiz.js";
import {
  buildKanaQuestion,
  loadKanaProgress,
  saveKanaProgress,
  recordKana,
} from "./kanaQuiz.js";
import { h, clear, openModal } from "./dom.js";
import { autoTranslate, isTranslatable } from "./translate.js";
import * as api from "./supabase.js";

/* ===================== Estado global ===================== */

let data = storage.load();
let currentTab = "notes";
let search = "";
let selectedCategory = null; // null = ver la lista de categorías; id = ver una categoría

// Sesión de cuenta (null = no logueado). { user, profile }
let account = null;

// Estado de la pestaña Grupos
let groupsState = { loaded: false, list: [], openGroupId: null, error: null };

// Estado de sesión de quiz (null = no iniciado)
let quizSession = null;
// Estado de kana
let kana = { setKey: "hiragana", mode: "reading", progress: loadKanaProgress(), q: null, picked: null, score: { correct: 0, wrong: 0 }, timer: null };

const root = document.getElementById("root");

// Guardar: siempre en local; y si hay sesión, subir a la nube (con pequeño "debounce").
let _syncTimer = null;
function save() {
  storage.save(data);
  if (account) {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => {
      api.pushPersonalData(data).catch((e) => console.warn("No se pudo sincronizar:", e.message));
    }, 1500);
  }
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

// Opciones de <select> de categorías, con subcategorías indentadas debajo de su padre.
function categoryOptions(selectedId) {
  const ls = langState();
  const opts = [];
  for (const c of ls.categories.filter((x) => !x.parentId)) {
    opts.push(h("option", { value: c.id, selected: c.id === selectedId }, c.name));
    for (const sub of ls.categories.filter((x) => x.parentId === c.id)) {
      opts.push(h("option", { value: sub.id, selected: sub.id === selectedId }, `\u00A0\u00A0↳ ${sub.name}`));
    }
  }
  return opts;
}

/* ===================== Render principal ===================== */

function render() {
  clear(root);
  root.appendChild(renderTopbar());
  root.appendChild(renderTabs());

  const container = h("div", { class: "app" });
  if (currentTab === "notes") container.appendChild(renderNotes());
  else if (currentTab === "conjugation" && !isJapanese()) container.appendChild(renderConjugation());
  else if (currentTab === "rules" && lang() === "french") container.appendChild(renderRules());
  else if (currentTab === "kana" && isJapanese()) container.appendChild(renderKana());
  else if (currentTab === "quiz") container.appendChild(renderQuiz());
  else if (currentTab === "groups" && account) container.appendChild(renderGroups());
  root.appendChild(container);
}

function tabsFor() {
  if (isJapanese()) {
    const jp = [
      { id: "notes", label: "Notas" },
      { id: "kana", label: "Escritura y lectura" },
      { id: "quiz", label: "Quiz" },
    ];
    if (account) jp.push({ id: "groups", label: "👥 Grupos" });
    return jp;
  }
  const tabs = [
    { id: "notes", label: "Notas" },
    { id: "conjugation", label: "Conjugación" },
  ];
  // Pestaña de Reglas solo para francés.
  if (lang() === "french") tabs.push({ id: "rules", label: "📌 Reglas" });
  tabs.push({ id: "quiz", label: "Quiz" });
  // Pestaña de Grupos solo si has iniciado sesión.
  if (account) tabs.push({ id: "groups", label: "👥 Grupos" });
  return tabs;
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
      // Si hay sesión: un botón con tu nombre. Si no: dos botones visibles.
      ...(account
        ? [h("button", { class: "btn small", style: { marginLeft: "8px" }, onclick: () => openAccount("profile"), title: "Tu cuenta" }, `👤 ${truncate(account.profile?.display_name || "Cuenta", 12)}`)]
        : [
            h("button", { class: "btn small", style: { marginLeft: "8px" }, onclick: () => openAccount("login") }, "Iniciar sesión"),
            h("button", { class: "btn small primary", style: { marginLeft: "6px" }, onclick: () => openAccount("signup") }, "Registrarse"),
          ]),
    ]),
  ]);
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function roleLabel(role) {
  return { founder: "👑 Fundador", teacher: "🎓 Profesor", generic: "👤 Estudiante" }[role] || "👤 Estudiante";
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

  const known = new Set(ls.categories.map((c) => c.id));
  const childrenOf = (id) => ls.categories.filter((c) => c.parentId === id);

  // --- Vista de UNA categoría seleccionada ---
  if (selectedCategory) {
    const cat = ls.categories.find((c) => c.id === selectedCategory) || { id: "__u", name: "Sin categoría" };
    const subs = selectedCategory === "__u" ? [] : childrenOf(selectedCategory);
    const items =
      selectedCategory === "__u"
        ? ls.words.filter((w) => !known.has(w.categoryId))
        : ls.words.filter((w) => w.categoryId === selectedCategory);

    // cabecera con botón volver (al nivel correcto)
    const parent = cat.parentId ? ls.categories.find((c) => c.id === cat.parentId) : null;
    host.appendChild(
      h("div", { class: "cat-head", style: { marginBottom: "14px" } }, [
        h("button", {
          class: "btn ghost small",
          onclick: () => {
            selectedCategory = parent ? parent.id : null;
            render();
          },
        }, parent ? `← ${parent.name}` : "← Categorías"),
        h("h3", { style: { margin: 0 } }, cat.name),
      ])
    );

    // subcategorías (si las hay) como tarjetas
    if (subs.length) {
      host.appendChild(h("p", { class: "muted" }, "Subcategorías:"));
      const subGrid = h("div", { class: "cat-grid" });
      for (const s of subs) {
        subGrid.appendChild(
          h("button", { class: "cat-card", onclick: () => { selectedCategory = s.id; render(); } }, [
            h("div", { class: "cat-card-name" }, s.name),
            h("div", { class: "cat-card-count" }, `${countInCategory(s.id)} palabra${countInCategory(s.id) === 1 ? "" : "s"}`),
          ])
        );
      }
      host.appendChild(subGrid);
    }

    // palabras directas de esta categoría
    if (items.length) {
      if (subs.length) host.appendChild(h("p", { class: "muted", style: { marginTop: "16px" } }, "Palabras aquí:"));
      items.forEach((w) => host.appendChild(renderWordRow(w)));
    } else if (!subs.length) {
      host.appendChild(h("div", { class: "empty", html: `No hay palabras en <b>${esc(cat.name)}</b> todavía. Pulsa “+ Añadir palabra”.` }));
    }
    return host;
  }

  // --- Vista principal: tarjetas de categorías PRINCIPALES (sin parentId) ---
  host.appendChild(h("p", { class: "muted" }, "Elige una categoría:"));
  const grid = h("div", { class: "cat-grid" });
  const cats = ls.categories.filter((c) => !c.parentId);
  const orphanCount = ls.words.filter((w) => !known.has(w.categoryId)).length;
  if (orphanCount) cats.push({ id: "__u", name: "Sin categoría" });

  for (const c of cats) {
    const subCount = c.id === "__u" ? 0 : childrenOf(c.id).length;
    const count = countInCategory(c.id);
    grid.appendChild(
      h("button", {
        class: "cat-card",
        onclick: () => { selectedCategory = c.id; render(); },
      }, [
        h("div", { class: "cat-card-name" }, c.name),
        h("div", { class: "cat-card-count" }, subCount ? `${subCount} subcat. · ${count} palabra${count === 1 ? "" : "s"}` : `${count} palabra${count === 1 ? "" : "s"}`),
      ])
    );
  }
  host.appendChild(grid);
  return host;
}

function renderWordRow(w) {
  const m = langMeta();
  const ls = langState();

  // Las REGLAS se muestran como una tarjeta con título + texto (no como palabra).
  if (w.isRule) {
    return h("div", { class: "rule-card" }, [
      h("div", { class: "rule-head" }, [
        h("div", { class: "rule-title" }, w.term || "Regla"),
        h("div", { class: "actions" }, [
          h("button", { class: "btn small", onclick: () => openRuleForm(w) }, "Editar"),
          h("button", {
            class: "btn small danger",
            onclick: () => {
              langState().words = langState().words.filter((x) => x.id !== w.id);
              save();
              render();
            },
          }, "Borrar"),
        ]),
      ]),
      h("div", { class: "rule-body" }, w.ruleBody || ""),
    ]);
  }

  const canConj = w.isVerb && hasConjugation(m.id) && ls.activeTenses.length > 0;

  const genderArticle = w.gender === "m" ? (m.id === "french" ? "le" : "o") : w.gender === "f" ? (m.id === "french" ? "la" : "a") : "";
  const grow = h("div", { class: "grow" }, [
    h("div", { class: "term" }, [
      document.createTextNode(w.term + " "),
      w.isVerb ? h("span", { class: "badge pill-verb" }, "verbo") : null,
      w.isNoun && genderArticle ? h("span", { class: "badge pill-gender" }, genderArticle) : null,
    ]),
    h("div", { class: "trans", html: `🇬🇧 <b>${esc(w.en) || "—"}</b> &nbsp;·&nbsp; 🇪🇸 <b>${esc(w.es) || "—"}</b>` }),
    w.isVerb && Array.isArray(w.prepositions) && w.prepositions.length
      ? h("div", { class: "trans faint" }, "🔗 " + w.prepositions.map((p) => (p.use ? `${p.prep} (${p.use})` : p.prep)).join(" · "))
      : null,
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
    isNoun: initial?.isNoun || false,
    gender: initial?.gender || "",
    // array de { prep, use }
    prepositions: Array.isArray(initial?.prepositions) ? initial.prepositions.map((p) => ({ ...p })) : [],
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
    if (r.error) {
      transStatus.textContent = "⚠️ " + r.error;
      transStatus.style.color = "var(--bad)";
    } else if (r.warning) {
      // Posible error ortográfico: avisamos, pero el usuario puede guardar igual.
      transStatus.textContent = "⚠️ " + r.warning;
      transStatus.style.color = "var(--crimson-soft)";
    } else {
      transStatus.textContent = "✓ Traducido (puedes corregirlo).";
      transStatus.style.color = "var(--good)";
    }
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
      isNoun: state.isNoun,
      gender: state.isNoun ? state.gender : "",
      // guardar solo las preposiciones con contenido
      prepositions: state.isVerb ? state.prepositions.filter((p) => p.prep && p.prep.trim()).map((p) => ({ prep: p.prep.trim(), use: (p.use || "").trim() })) : [],
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
  const hasGender = m.id === "french" || m.id === "portuguese"; // idiomas con género gramatical

  // --- Controles extra que aparecen/desaparecen según el tipo marcado ---
  const extraHost = h("div");

  const genderSelect = h(
    "select",
    { onchange: (e) => (state.gender = e.target.value) },
    [
      h("option", { value: "", selected: !state.gender }, "— elegir —"),
      h("option", { value: "m", selected: state.gender === "m" }, m.id === "french" ? "Masculino (le)" : "Masculino (o)"),
      h("option", { value: "f", selected: state.gender === "f" }, m.id === "french" ? "Femenino (la)" : "Femenino (a)"),
    ]
  );
  // --- Cuadros dinámicos de preposiciones ---
  // Cada fila: [ preposición ] [ para qué se usa ]. Al escribir en la última fila
  // vacía, aparece otra debajo automáticamente. Botón ✕ para quitar una fila.
  function renderPrepRows(host) {
    clear(host);
    // garantizar siempre una fila vacía al final
    if (state.prepositions.length === 0 || state.prepositions[state.prepositions.length - 1].prep.trim() !== "") {
      state.prepositions.push({ prep: "", use: "" });
    }
    state.prepositions.forEach((row, idx) => {
      const prepField = h("input", {
        value: row.prep,
        placeholder: "prep. (à, de…)",
        style: { flex: "0 0 110px" },
        oninput: (e) => {
          row.prep = e.target.value;
          // si se llenó la última fila, re-renderizar para añadir otra
          if (idx === state.prepositions.length - 1 && e.target.value.trim()) renderPrepRows(host);
        },
      });
      const useField = h("input", {
        value: row.use,
        placeholder: "¿para qué se usa? (opcional)",
        oninput: (e) => (row.use = e.target.value),
      });
      const removeBtn = h("button", {
        class: "btn small ghost",
        title: "Quitar",
        style: { flex: "0 0 auto" },
        onclick: () => {
          state.prepositions.splice(idx, 1);
          renderPrepRows(host);
        },
      }, "✕");
      // la fila vacía final no muestra el botón de quitar
      const isLastEmpty = idx === state.prepositions.length - 1 && !row.prep.trim();
      host.appendChild(
        h("div", { class: "inline", style: { gap: "8px", marginBottom: "8px", alignItems: "center" } }, [
          prepField,
          useField,
          isLastEmpty ? null : removeBtn,
        ])
      );
    });
  }

  function renderExtra() {
    clear(extraHost);
    if (state.isNoun && hasGender) {
      extraHost.appendChild(
        h("div", { style: { marginBottom: "12px" } }, [
          h("label", {}, "Género del sustantivo"),
          genderSelect,
        ])
      );
    }
    if (state.isVerb) {
      const prepHost = h("div");
      renderPrepRows(prepHost);
      extraHost.appendChild(
        h("div", { style: { marginBottom: "12px" } }, [
          h("label", {}, "Preposiciones que rige (opcional)"),
          prepHost,
          h("div", { class: "muted", style: { fontSize: "12px" } }, "Escribe una preposición y aparecerá otra casilla para añadir más."),
        ])
      );
    }
  }
  renderExtra();

  // checkboxes de tipo (verbo / sustantivo)
  const verbCheck = h("input", {
    type: "checkbox",
    checked: state.isVerb,
    onchange: (e) => {
      state.isVerb = e.target.checked;
      if (e.target.checked) { state.isNoun = false; nounCheck.checked = false; }
      renderExtra();
    },
  });
  const nounCheck = h("input", {
    type: "checkbox",
    checked: state.isNoun,
    onchange: (e) => {
      state.isNoun = e.target.checked;
      if (e.target.checked) { state.isVerb = false; verbCheck.checked = false; }
      renderExtra();
    },
  });

  // Envolvemos checkbox + texto en un <label> para que al tocar el texto
  // (importante en móvil) también se marque la casilla.
  const typeControls = [];
  if (canConj) {
    typeControls.push(
      h("label", { class: "checkbox-row", style: { margin: 0, cursor: "pointer" } }, [verbCheck, h("span", {}, "Es un verbo (conjugar)")])
    );
  }
  if (hasGender) {
    typeControls.push(
      h("label", { class: "checkbox-row", style: { marginTop: "6px", cursor: "pointer" } }, [nounCheck, h("span", {}, "Es un sustantivo (género)")])
    );
  }

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
        h("select", { onchange: (e) => (state.categoryId = e.target.value) }, categoryOptions(state.categoryId)),
      ]),
      typeControls.length ? h("div", {}, [h("label", {}, "Tipo"), ...typeControls]) : null,
    ]),
    extraHost,
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

/* ---- Formulario de REGLA / excepción (modal) ---- */

function openRuleForm(initial) {
  const ls = langState();
  const defaultCat =
    initial?.categoryId ||
    (selectedCategory && selectedCategory !== "__u" ? selectedCategory : null) ||
    "rules";
  const state = {
    term: initial?.term || "",
    ruleBody: initial?.ruleBody || "",
    categoryId: defaultCat,
  };

  const titleInput = h("input", {
    value: state.term,
    placeholder: "Título de la regla (ej. Verbos de la maison)",
    oninput: (e) => (state.term = e.target.value),
  });
  const bodyInput = h("textarea", {
    rows: "8",
    placeholder: "Escribe aquí la explicación, ejemplos, etc.",
    oninput: (e) => (state.ruleBody = e.target.value),
  }, state.ruleBody);

  function submit() {
    if (!state.term.trim()) return;
    const payload = {
      term: state.term.trim(),
      ruleBody: state.ruleBody,
      categoryId: state.categoryId,
      isRule: true,
    };
    if (initial) Object.assign(initial, payload);
    else ls.words.push(makeWord(payload));
    save();
    close();
    render();
  }

  const content = h("div", { class: "modal card", onclick: (e) => e.stopPropagation() }, [
    h("h2", {}, initial ? "Editar regla" : "Nueva regla / excepción"),
    h("div", { style: { marginBottom: "12px" } }, [h("label", {}, "Título"), titleInput]),
    h("div", { style: { marginBottom: "12px" } }, [h("label", {}, "Contenido"), bodyInput]),
    h("div", { style: { marginBottom: "4px" } }, [
      h("label", {}, "Categoría"),
      h("select", { onchange: (e) => (state.categoryId = e.target.value) }, categoryOptions(state.categoryId)),
    ]),
    h("div", { class: "modal-actions" }, [
      h("button", { class: "btn ghost", onclick: () => close() }, "Cancelar"),
      h("button", { class: "btn primary", onclick: submit }, initial ? "Guardar cambios" : "Crear regla"),
    ]),
  ]);

  const close = openModal(content, () => close());
  setTimeout(() => titleInput.focus(), 0);
}

/* ---- Gestor de categorías (modal) ---- */

function openCategories() {
  const ls = langState();
  const body = h("div", { class: "modal card", onclick: (e) => e.stopPropagation() });

  const countIn = (id) => ls.words.filter((w) => w.categoryId === id).length;
  const isTop = (c) => !c.parentId;
  const childrenOf = (id) => ls.categories.filter((c) => c.parentId === id);

  function rebuild() {
    clear(body);
    body.appendChild(h("h2", {}, "Categorías"));
    body.appendChild(h("p", { class: "muted" }, "Renombra, crea subcategorías o borra. Toca el nombre para editarlo."));

    // crear categoría principal nueva
    const nameInput = h("input", {
      class: "grow",
      placeholder: "Nueva categoría principal",
      onkeydown: (e) => {
        if (e.key === "Enter" && e.target.value.trim()) addCat(e.target.value.trim(), null, nameInput);
      },
    });
    body.appendChild(
      h("div", { class: "inline", style: { marginBottom: "16px" } }, [
        nameInput,
        h("button", { class: "btn primary", onclick: () => nameInput.value.trim() && addCat(nameInput.value.trim(), null, nameInput) }, "Añadir"),
      ])
    );

    // listar categorías principales con sus subcategorías
    for (const c of ls.categories.filter(isTop)) {
      body.appendChild(renderCatRow(c, false));
      // input inline para crear subcategoría (si se pulsó "+ sub" en esta categoría)
      if (addingSubFor === c.id) {
        const subInput = h("input", {
          placeholder: `Nombre de subcategoría en “${c.name}”`,
          style: { marginLeft: "24px", maxWidth: "260px" },
          onkeydown: (e) => {
            if (e.key === "Enter" && e.target.value.trim()) { const v = e.target.value.trim(); addingSubFor = null; addCat(v, c.id); }
            if (e.key === "Escape") { addingSubFor = null; rebuild(); }
          },
        });
        body.appendChild(
          h("div", { class: "inline", style: { marginLeft: "24px", marginBottom: "8px", gap: "8px" } }, [
            subInput,
            h("button", { class: "btn small primary", onclick: () => { if (subInput.value.trim()) { const v = subInput.value.trim(); addingSubFor = null; addCat(v, c.id); } } }, "Añadir"),
            h("button", { class: "btn small ghost", onclick: () => { addingSubFor = null; rebuild(); } }, "Cancelar"),
          ])
        );
      }
      for (const sub of childrenOf(c.id)) {
        body.appendChild(renderCatRow(sub, true));
      }
    }

    body.appendChild(h("div", { class: "modal-actions" }, [h("button", { class: "btn primary", onclick: () => close() }, "Listo")]));
  }

  function renderCatRow(c, isSub) {
    const nameSpan = h("b", { style: { cursor: "pointer" }, title: "Toca para renombrar" }, c.name);
    nameSpan.addEventListener("click", () => startRename(c, nameSpan));
    const actions = [];
    // solo las principales pueden tener subcategorías
    if (!isSub) {
      actions.push(h("button", { class: "btn small ghost", title: "Añadir subcategoría", onclick: () => addSub(c) }, "+ sub"));
    }
    actions.push(
      h("button", {
        class: "btn small danger",
        title: isSub ? "Borrar subcategoría" : "Borrar (sus palabras y subcategorías pasan a otra categoría)",
        onclick: () => deleteCat(c),
      }, "Borrar")
    );
    return h("div", { class: "word", style: isSub ? { marginLeft: "24px" } : {} }, [
      h("div", { class: "grow" }, [
        isSub ? document.createTextNode("↳ ") : null,
        nameSpan,
        document.createTextNode(" "),
        h("span", { class: "badge" }, `${countIn(c.id)} palabras`),
      ]),
      h("div", { class: "actions" }, actions),
    ]);
  }

  function startRename(c, nameSpan) {
    const input = h("input", { value: c.name, style: { maxWidth: "200px" } });
    const commit = () => {
      const v = input.value.trim();
      if (v) { c.name = v; save(); }
      rebuild();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") rebuild(); });
    input.addEventListener("blur", commit);
    nameSpan.replaceWith(input);
    input.focus();
    input.select();
  }

  function addCat(name, parentId, input) {
    ls.categories.push({ id: genId(), name, parentId: parentId || undefined });
    save();
    if (input) input.value = "";
    rebuild();
  }

  let addingSubFor = null; // id de la categoría a la que estamos añadiendo subcategoría
  function addSub(parent) {
    addingSubFor = parent.id;
    rebuild();
  }

  function deleteCat(c) {
    // reasignar palabras de esta categoría (y de sus subcategorías) a la primera principal
    const fallback = ls.categories.find((x) => isTop(x) && x.id !== c.id)?.id || "vocabulary";
    const toRemove = new Set([c.id, ...childrenOf(c.id).map((s) => s.id)]);
    ls.categories = ls.categories.filter((x) => !toRemove.has(x.id));
    ls.words.forEach((w) => { if (toRemove.has(w.categoryId)) w.categoryId = fallback; });
    save();
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
  const suggestHost = h("div", { class: "suggest-box" });
  let preview = ""; // verbo actualmente mostrado ("" = ninguno)

  // Verbos que el usuario ya tiene guardados (para sugerirlos).
  const myVerbs = [...new Set(ls.words.filter((w) => w.isVerb && w.term).map((w) => w.term))];

  // Un ÚNICO buscador: escribes y aparecen abajo tus verbos que coinciden.
  const searchInput = h("input", {
    placeholder: "busca un verbo nuevo",
    oninput: (e) => {
      preview = e.target.value.trim();
      refreshSuggestions(e.target.value);
      refreshPreview();
    },
  });

  function refreshSuggestions(filter) {
    clear(suggestHost);
    const f = (filter || "").trim().toLowerCase();
    if (!f) return; // sin texto, no mostramos sugerencias
    const matches = myVerbs.filter((v) => v.toLowerCase().includes(f) && v.toLowerCase() !== f).slice(0, 6);
    if (!matches.length) return;
    suggestHost.appendChild(h("div", { class: "muted", style: { fontSize: "12px", marginBottom: "4px" } }, "Tus verbos:"));
    for (const v of matches) {
      suggestHost.appendChild(
        h("button", {
          class: "suggest-item",
          onclick: () => {
            preview = v;
            searchInput.value = v;
            clear(suggestHost);
            refreshPreview();
          },
        }, v)
      );
    }
  }

  function refreshPreview() {
    clear(previewHost);
    // Si no has escrito ningún verbo, NO mostramos nada.
    if (!preview) return;
    if (ls.activeTenses.length === 0) {
      previewHost.appendChild(h("div", { class: "empty", style: { marginTop: "14px" } }, "Activa al menos un tiempo arriba para ver conjugaciones."));
      return;
    }
    const tenses = conj.tenses.filter((t) => ls.activeTenses.includes(t.id));
    const box = h("div", { style: { marginTop: "14px" } });
    for (const t of tenses) {
      const table = conj.conjugate(preview, t.id);
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

  wrap.appendChild(
    h("div", { class: "card" }, [
      h("div", { class: "section-title" }, "Ver conjugación de un verbo"),
      h("p", { class: "muted" }, "Escribe un verbo: te sugiere los tuyos que coincidan, y también conjuga cualquier verbo que escribas aunque no lo tengas guardado."),
      searchInput,
      suggestHost,
      previewHost,
    ])
  );
  return wrap;
}

function sampleVerb(id) {
  return { french: "parler", english: "to speak", portuguese: "falar" }[id] || "";
}

/* ===================== Reglas / excepciones (solo francés) ===================== */

function renderRules() {
  const ls = langState();
  const wrap = h("div");

  wrap.appendChild(
    h("div", { class: "toolbar" }, [
      h("div", { class: "grow" }, [
        h("div", { class: "section-title" }, "Reglas y excepciones"),
        h("p", { class: "muted", style: { margin: 0 } }, "Tus chuletas de francés. Puedes editarlas o crear las tuyas."),
      ]),
      h("button", { class: "btn primary", onclick: () => openRuleForm(null) }, "+ Nueva regla"),
    ])
  );

  const rules = ls.words.filter((w) => w.isRule);
  if (!rules.length) {
    wrap.appendChild(h("div", { class: "empty" }, "No hay reglas todavía. Pulsa “+ Nueva regla” para crear una chuleta."));
    return wrap;
  }
  rules.forEach((r) => wrap.appendChild(renderWordRow(r)));
  return wrap;
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
    const hasGender = m.id === "french" || m.id === "portuguese";
    // Opciones de tipo de quiz (según lo que soporte el idioma).
    const types = [
      { id: "mixed", label: "🎲 Mixto", desc: "Todo mezclado" },
      { id: "translation", label: "🌐 Traducción", desc: "Solo palabra ↔ inglés/español" },
    ];
    if (canConj) types.push({ id: "conjugation", label: "📖 Conjugación", desc: "Solo conjugar verbos en tus tiempos activos" });
    if (hasGender) types.push({ id: "gender", label: "🚺🚹 Género", desc: "¿El sustantivo es masculino o femenino?" });
    if (canConj) types.push({ id: "preposition", label: "🔗 Preposición", desc: "¿Qué preposición rige el verbo?" });

    let chosenType = "mixed";
    // Tiempos elegidos para el quiz de conjugación (por defecto, todos los activos).
    const conj = CONJUGATORS[m.id];
    let chosenTenses = [...ls.activeTenses];

    // Host para el selector de tiempos (solo visible con tipo "conjugación").
    const tenseHost = h("div");
    function renderTensePicker() {
      clear(tenseHost);
      if (chosenType !== "conjugation" || !conj) return;
      const activeTenseObjs = conj.tenses.filter((t) => ls.activeTenses.includes(t.id));
      if (activeTenseObjs.length === 0) {
        tenseHost.appendChild(h("div", { class: "empty", style: { marginTop: "12px" } }, "No tienes tiempos activos. Actívalos en la pestaña Conjugación."));
        return;
      }
      const chips = h("div", { class: "chips", style: { marginTop: "10px" } },
        activeTenseObjs.map((t) => {
          const on = chosenTenses.includes(t.id);
          return h("button", {
            class: "chip" + (on ? " on" : ""),
            onclick: (e) => {
              const i = chosenTenses.indexOf(t.id);
              if (i >= 0) chosenTenses.splice(i, 1);
              else chosenTenses.push(t.id);
              e.currentTarget.classList.toggle("on");
              e.currentTarget.textContent = (chosenTenses.includes(t.id) ? "✓ " : "") + t.label;
            },
          }, (on ? "✓ " : "") + t.label);
        })
      );
      tenseHost.appendChild(
        h("div", { style: { marginTop: "6px", textAlign: "left" } }, [
          h("div", { class: "muted", style: { fontSize: "13px", marginBottom: "4px" } }, "¿Qué tiempo(s) quieres practicar? (toca para elegir)"),
          chips,
        ])
      );
    }

    const cards = types.map((t) =>
      h("button", {
        class: "quiz-type" + (t.id === chosenType ? " on" : ""),
        onclick: (e) => {
          chosenType = t.id;
          e.currentTarget.parentElement.querySelectorAll(".quiz-type").forEach((el) => el.classList.remove("on"));
          e.currentTarget.classList.add("on");
          renderTensePicker();
        },
      }, [h("div", { class: "quiz-type-title" }, t.label), h("div", { class: "muted", style: { fontSize: "12px" } }, t.desc)])
    );

    return h("div", { class: "card quiz-card" }, [
      h("div", { class: "section-title" }, "¿Qué quieres practicar?"),
      h("p", { class: "muted" }, "Elige el tipo de quiz. Las palabras nuevas y las que más fallas salen con más frecuencia."),
      h("div", { class: "quiz-type-grid" }, cards),
      tenseHost,
      h("div", { class: "inline", style: { justifyContent: "center", marginTop: "18px" } }, [
        h("button", {
          class: "btn primary",
          onclick: () => {
            // Para conjugación, usar solo los tiempos elegidos (o todos los activos si no marcó ninguno).
            const tensesForQuiz = chosenType === "conjugation" ? (chosenTenses.length ? chosenTenses : ls.activeTenses) : ls.activeTenses;
            const questions = buildQuiz(words, m.id, tensesForQuiz, Math.min(10, Math.max(5, words.length)), chosenType);
            if (questions.length === 0) {
              const msg =
                chosenType === "conjugation"
                  ? "Para el quiz de conjugación necesitas verbos marcados como tales y al menos un tiempo activo (pestaña Conjugación)."
                  : chosenType === "translation"
                  ? "Necesitas palabras con traducción en inglés o español."
                  : chosenType === "gender"
                  ? "Necesitas sustantivos marcados con su género (le/la). Marca “Es un sustantivo” y elige el género al añadir la palabra."
                  : chosenType === "preposition"
                  ? "Necesitas verbos con una preposición escrita. Al añadir un verbo, rellena el campo “Preposición que rige”."
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

  function recordResult(correct) {
    s.state = correct ? "correct" : "wrong";
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
  }

  function submit() {
    if (s.state !== "idle") return next();
    recordResult(isCorrect(q, s.answer));
    render();
  }
  function submitMulti() {
    if (s.state !== "idle") return next();
    if (!s.selected || s.selected.length === 0) return; // exige marcar al menos una
    recordResult(isMultiCorrect(q, s.selected));
    render();
  }
  function next() {
    s.idx += 1;
    s.state = "idle";
    s.answer = "";
    s.selected = [];
    if (s.idx >= s.questions.length) s.done = true;
    render();
  }

  // --- Cuerpo de la pregunta: opción múltiple (botones) o texto abierto ---
  let answerArea;
  if (q.choice && q.multi && Array.isArray(q.options)) {
    // SELECCIÓN MÚLTIPLE MANUAL (preposiciones): marcar varias + Comprobar.
    s.selected = s.selected || [];
    const optCorrect = (opt) => (q.correctSet || []).includes(normalize(opt));
    const optionButtons = q.options.map((opt) => {
      const isSel = s.selected.includes(opt);
      let cls = "option";
      if (s.state !== "idle") {
        // al corregir: verde las correctas; rojo las que marqué mal
        if (optCorrect(opt)) cls += " correct";
        else if (isSel) cls += " wrong";
      } else if (isSel) {
        cls += " selected";
      }
      return h("button", {
        class: cls,
        disabled: s.state !== "idle",
        onclick: () => {
          if (s.state !== "idle") return;
          const i = s.selected.indexOf(opt);
          if (i >= 0) s.selected.splice(i, 1);
          else s.selected.push(opt);
          render();
        },
      }, opt);
    });
    answerArea = h("div", { class: "options", style: { marginTop: "16px" } }, optionButtons);
  } else if (q.choice && Array.isArray(q.options)) {
    // SELECCIÓN SIMPLE (género): tocar resuelve al instante.
    const optionButtons = q.options.map((opt) => {
      let cls = "option";
      if (s.state !== "idle") {
        if (isCorrect(q, opt)) cls += " correct";
        else if (s.answer === opt) cls += " wrong";
      }
      return h("button", {
        class: cls,
        disabled: s.state !== "idle",
        onclick: () => {
          if (s.state !== "idle") return;
          s.answer = opt;
          recordResult(isCorrect(q, opt));
          render();
        },
      }, opt);
    });
    answerArea = h("div", { class: "options", style: { marginTop: "16px" } }, optionButtons);
  } else {
    // input de texto abierto (traducción, conjugación)
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
    answerArea = answerInput;
    if (s.state === "idle") setTimeout(() => answerInput.focus(), 0);
  }

  const card = h("div", { class: "card quiz-card" }, [
    h("div", { class: "quiz-progress" }, `Pregunta ${s.idx + 1} de ${s.questions.length}`),
    h("div", { class: "quiz-bar" }, [h("div", { style: { width: progress + "%" } })]),
    h("div", { class: "quiz-prompt" }, q.prompt),
    q.hint ? h("div", { class: "muted" }, q.hint) : null,
    answerArea,
    s.state !== "idle"
      ? h("div", { class: "feedback " + (s.state === "correct" ? "good" : "bad") }, [
          document.createTextNode(s.state === "correct" ? "✓ ¡Correcto!" : "✗ Casi."),
          h("div", { class: "answer", html: `Respuesta: <b>${esc(q.answer)}</b>` }),
        ])
      : null,
    h("div", { class: "inline", style: { justifyContent: "center", marginTop: "18px" } }, [
      // - Selección múltiple (multi): botón "Comprobar" tras marcar.
      // - Selección simple de botones (género): tocar ya responde, no hay "Comprobar".
      // - Texto abierto: botón "Comprobar".
      s.state === "idle"
        ? q.multi
          ? h("button", { class: "btn primary", onclick: submitMulti, disabled: !(s.selected && s.selected.length) }, "Comprobar")
          : q.choice
          ? null
          : h("button", { class: "btn primary", onclick: submit }, "Comprobar")
        : h("button", { class: "btn primary", onclick: next }, s.idx + 1 >= s.questions.length ? "Terminar" : "Siguiente →"),
    ]),
  ]);

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

/* ===================== Grupos ===================== */

function renderGroups() {
  const wrap = h("div");
  const role = account.profile?.role || "generic";
  const canCreate = role === "teacher" || role === "founder";

  // Si estamos viendo un grupo concreto
  if (groupsState.openGroupId) {
    return renderGroupDetail(groupsState.openGroupId);
  }

  // Barra de acciones: crear (profes) y unirse (todos)
  const actions = [];
  if (canCreate) actions.push(h("button", { class: "btn primary", onclick: openCreateGroup }, "+ Crear grupo"));
  actions.push(h("button", { class: "btn", onclick: openJoinGroup }, "Unirse con código"));
  wrap.appendChild(
    h("div", { class: "toolbar" }, [
      h("div", { class: "grow" }, [
        h("div", { class: "section-title" }, "Tus grupos"),
        h("p", { class: "muted", style: { margin: 0 } }, canCreate ? "Crea grupos para tu clase o únete con un código." : "Únete a un grupo con el código que te dé tu profesor."),
      ]),
      ...actions,
    ])
  );

  // Cargar la lista (una vez)
  if (!groupsState.loaded) {
    wrap.appendChild(h("div", { class: "empty" }, "Cargando tus grupos…"));
    api.myGroups().then((list) => {
      groupsState.loaded = true;
      groupsState.list = list;
      if (currentTab === "groups") render();
    }).catch((e) => {
      groupsState.loaded = true;
      groupsState.error = e.message;
      if (currentTab === "groups") render();
    });
    return wrap;
  }

  if (groupsState.error) {
    wrap.appendChild(h("div", { class: "empty" }, "No se pudieron cargar los grupos: " + groupsState.error));
    return wrap;
  }
  if (!groupsState.list.length) {
    wrap.appendChild(h("div", { class: "empty" }, canCreate ? "Aún no tienes grupos. Crea uno para empezar." : "No estás en ningún grupo. Pide el código a tu profesor y pulsa “Unirse con código”."));
    return wrap;
  }

  const grid = h("div", { class: "cat-grid" });
  for (const g of groupsState.list) {
    const mine = g.owner_id === account.user.id;
    grid.appendChild(
      h("button", { class: "cat-card", onclick: () => { groupsState.openGroupId = g.id; render(); } }, [
        h("div", { class: "cat-card-name" }, g.name),
        h("div", { class: "cat-card-count" }, [
          document.createTextNode((mine ? "🎓 Tu grupo · " : "") + "código " + g.join_code),
          g.is_open ? null : document.createTextNode(" · cerrado"),
        ]),
      ])
    );
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderGroupDetail(groupId) {
  const wrap = h("div");
  const g = groupsState.list.find((x) => x.id === groupId);
  if (!g) { groupsState.openGroupId = null; return renderGroups(); }
  const mine = g.owner_id === account.user.id;

  wrap.appendChild(
    h("div", { class: "cat-head", style: { marginBottom: "12px" } }, [
      h("button", { class: "btn ghost small", onclick: () => { groupsState.openGroupId = null; render(); } }, "← Grupos"),
      h("h3", { style: { margin: 0 } }, g.name),
    ])
  );

  // Tarjeta de info: código grande + acciones del profesor
  const info = h("div", { class: "card" }, [
    h("div", { class: "muted" }, "Código para unirse:"),
    h("div", { style: { fontSize: "30px", fontWeight: "800", letterSpacing: "4px", color: "var(--crimson-soft)", margin: "4px 0 10px" } }, g.join_code),
    g.is_open ? h("span", { class: "badge" }, "abierto") : h("span", { class: "badge" }, "cerrado"),
  ]);
  if (mine) {
    const ownerActions = h("div", { class: "inline", style: { marginTop: "12px", gap: "8px" } }, [
      g.is_open ? h("button", { class: "btn small", onclick: async () => {
        try { await api.closeGroup(g.id); g.is_open = false; render(); } catch (e) { alert("Error: " + e.message); }
      } }, "Cerrar grupo") : null,
      h("button", { class: "btn small primary", onclick: () => openLiveQuizHost(g) }, "▶ Iniciar quiz en vivo"),
      h("button", { class: "btn small danger", onclick: async () => {
        if (!confirm("¿Borrar el grupo? Se perderán sus palabras.")) return;
        try { await api.deleteGroup(g.id); groupsState.openGroupId = null; groupsState.loaded = false; render(); } catch (e) { alert("Error: " + e.message); }
      } }, "Borrar grupo"),
    ]);
    info.appendChild(ownerActions);
  } else {
    info.appendChild(h("button", { class: "btn small", style: { marginTop: "12px" }, onclick: () => joinLiveQuiz(g) }, "Entrar al quiz en vivo (si hay)"));
  }
  wrap.appendChild(info);

  // Palabras del grupo
  const wordsCard = h("div", { class: "card" }, [
    h("div", { class: "inline", style: { justifyContent: "space-between" } }, [
      h("div", { class: "section-title", style: { margin: 0 } }, "Palabras del grupo"),
      (mine || g.allow_student_words) ? h("button", { class: "btn small primary", onclick: () => openAddGroupWord(g) }, "+ Añadir") : null,
    ]),
  ]);
  const wordsHost = h("div", {}, [h("p", { class: "muted" }, "Cargando palabras…")]);
  wordsCard.appendChild(wordsHost);
  wrap.appendChild(wordsCard);

  api.groupWords(g.id).then((words) => {
    clear(wordsHost);
    if (!words.length) { wordsHost.appendChild(h("p", { class: "muted" }, "Todavía no hay palabras. Pulsa “+ Añadir”.")); return; }
    words.forEach((w) => wordsHost.appendChild(renderGroupWordRow(w, g)));
  }).catch((e) => { clear(wordsHost); wordsHost.appendChild(h("p", { class: "muted" }, "Error: " + e.message)); });

  return wrap;
}

function renderGroupWordRow(w, g) {
  const prepText = Array.isArray(w.prepositions) && w.prepositions.length
    ? " · 🔗 " + w.prepositions.map((p) => (p.use ? `${p.prep} (${p.use})` : p.prep)).join(", ")
    : "";
  const genderText = w.gender ? ` · ${w.gender === "m" ? "le" : "la"}` : "";
  return h("div", { class: "word" }, [
    h("div", { class: "grow" }, [
      h("div", { class: "term" }, w.term + (w.is_verb ? " (verbo)" : "") + genderText),
      h("div", { class: "trans", html: `🇬🇧 <b>${esc(w.en) || "—"}</b> · 🇪🇸 <b>${esc(w.es) || "—"}</b>${esc(prepText)}` }),
    ]),
    h("button", { class: "btn small", title: "Guardar en mis notas", onclick: () => openImportWord(w) }, "⬇ Importar"),
  ]);
}

/* ---- Crear grupo ---- */
function openCreateGroup() {
  const body = h("div", { class: "modal card", onclick: (e) => e.stopPropagation() });
  const dismiss = openModal(body, () => dismiss());
  const nameInput = h("input", { placeholder: "Nombre del grupo (ej. Francés A1 - Martes)" });
  let allowStudents = true;
  const status = h("div", { class: "muted", style: { minHeight: "16px" } }, "");
  body.appendChild(h("h2", {}, "Crear grupo"));
  body.appendChild(h("div", { style: { marginBottom: "10px" } }, [h("label", {}, "Nombre"), nameInput]));
  body.appendChild(h("label", { class: "checkbox-row", style: { cursor: "pointer", marginBottom: "10px" } }, [
    h("input", { type: "checkbox", checked: true, onchange: (e) => (allowStudents = e.target.checked) }),
    h("span", {}, "Permitir que los alumnos añadan palabras"),
  ]));
  body.appendChild(status);
  body.appendChild(h("div", { class: "modal-actions" }, [
    h("button", { class: "btn ghost", onclick: () => dismiss() }, "Cancelar"),
    h("button", { class: "btn primary", onclick: async () => {
      if (!nameInput.value.trim()) { status.textContent = "Escribe un nombre."; return; }
      status.textContent = "Creando…";
      try {
        await api.createGroup(nameInput.value.trim(), allowStudents);
        groupsState.loaded = false; // recargar lista
        dismiss(); render();
      } catch (e) { status.style.color = "var(--bad)"; status.textContent = "Error: " + e.message; }
    } }, "Crear"),
  ]));
  setTimeout(() => nameInput.focus(), 0);
}

/* ---- Unirse a grupo ---- */
function openJoinGroup() {
  const body = h("div", { class: "modal card", onclick: (e) => e.stopPropagation() });
  const dismiss = openModal(body, () => dismiss());
  const codeInput = h("input", { placeholder: "código de 6 dígitos", inputmode: "numeric" });
  const status = h("div", { class: "muted", style: { minHeight: "16px" } }, "");
  body.appendChild(h("h2", {}, "Unirse a un grupo"));
  body.appendChild(h("div", { style: { marginBottom: "10px" } }, [h("label", {}, "Código"), codeInput]));
  body.appendChild(status);
  body.appendChild(h("div", { class: "modal-actions" }, [
    h("button", { class: "btn ghost", onclick: () => dismiss() }, "Cancelar"),
    h("button", { class: "btn primary", onclick: async () => {
      const code = codeInput.value.trim();
      if (!code) { status.textContent = "Escribe el código."; return; }
      status.textContent = "Uniéndote…";
      try {
        await api.joinGroup(code);
        groupsState.loaded = false;
        dismiss(); render();
      } catch (e) { status.style.color = "var(--bad)"; status.textContent = e.message; }
    } }, "Unirme"),
  ]));
  setTimeout(() => codeInput.focus(), 0);
}

/* ---- Añadir palabra al grupo (reusa un formulario simple) ---- */
function openAddGroupWord(g) {
  const body = h("div", { class: "modal card", onclick: (e) => e.stopPropagation() });
  const dismiss = openModal(body, () => dismiss());
  const term = h("input", { placeholder: "la palabra" });
  const en = h("input", { placeholder: "inglés" });
  const es = h("input", { placeholder: "español" });
  const status = h("div", { class: "muted", style: { minHeight: "16px" } }, "");
  body.appendChild(h("h2", {}, "Añadir palabra al grupo"));
  body.appendChild(h("div", { style: { marginBottom: "10px" } }, [h("label", {}, "Palabra"), term]));
  body.appendChild(h("div", { class: "row", style: { marginBottom: "10px" } }, [
    h("div", {}, [h("label", {}, "🇬🇧 Inglés"), en]),
    h("div", {}, [h("label", {}, "🇪🇸 Español"), es]),
  ]));
  body.appendChild(status);
  body.appendChild(h("div", { class: "modal-actions" }, [
    h("button", { class: "btn ghost", onclick: () => dismiss() }, "Cancelar"),
    h("button", { class: "btn primary", onclick: async () => {
      if (!term.value.trim()) { status.textContent = "Escribe la palabra."; return; }
      status.textContent = "Guardando…";
      try {
        await api.addGroupWord(g.id, { term: term.value.trim(), en: en.value.trim(), es: es.value.trim() });
        dismiss(); render();
      } catch (e) { status.style.color = "var(--bad)"; status.textContent = "Error: " + e.message; }
    } }, "Añadir"),
  ]));
  setTimeout(() => term.focus(), 0);
}

/* ---- Importar palabra del grupo a mis notas (eligiendo categoría) ---- */
function openImportWord(w) {
  const body = h("div", { class: "modal card", onclick: (e) => e.stopPropagation() });
  const dismiss = openModal(body, () => dismiss());
  // Importamos al idioma activo actual
  let categoryId = langState().categories[0]?.id || "vocabulary";
  body.appendChild(h("h2", {}, "Importar a mis notas"));
  body.appendChild(h("p", { class: "muted" }, `“${w.term}” se guardará en tu idioma activo (${langMeta().label}).`));
  body.appendChild(h("div", { style: { marginBottom: "10px" } }, [
    h("label", {}, "¿En qué categoría?"),
    h("select", { onchange: (e) => (categoryId = e.target.value) }, categoryOptions(categoryId)),
  ]));
  body.appendChild(h("div", { class: "modal-actions" }, [
    h("button", { class: "btn ghost", onclick: () => dismiss() }, "Cancelar"),
    h("button", { class: "btn primary", onclick: () => {
      langState().words.push(makeWord({
        term: w.term, en: w.en || "", es: w.es || "",
        isVerb: !!w.is_verb, isNoun: !!w.is_noun, gender: w.gender || "",
        prepositions: Array.isArray(w.prepositions) ? w.prepositions : [],
        notes: w.notes || "", categoryId,
      }));
      save();
      dismiss();
      alert("✓ Guardada en tus notas.");
    } }, "Importar"),
  ]));
}

// Placeholders del quiz en vivo (se implementan en la siguiente etapa).
function openLiveQuizHost(g) { alert("El quiz en vivo llega en la próxima actualización 🙂"); }
function joinLiveQuiz(g) { alert("El quiz en vivo llega en la próxima actualización 🙂"); }

/* ===================== Cuenta (login / registro / perfil) ===================== */

function openAccount(initialMode) {
  const body = h("div", { class: "modal card", onclick: (e) => e.stopPropagation() });
  const dismiss = openModal(body, () => dismiss());

  if (account) {
    renderAccountProfile(body, dismiss);
  } else {
    renderAuthForm(body, dismiss, initialMode === "signup" ? "signup" : "login");
  }
}

function renderAuthForm(body, dismiss, startMode) {
  clear(body);
  let mode = startMode || "login"; // 'login' | 'signup'
  const status = h("div", { class: "muted", style: { minHeight: "18px", marginTop: "8px" } }, "");

  const emailInput = h("input", { type: "email", placeholder: "tu correo", autocomplete: "email" });
  const passInput = h("input", { type: "password", placeholder: "contraseña (mín. 6)", autocomplete: "current-password" });
  const nameInput = h("input", { placeholder: "nombre visible (ej. Juan Pablo)" });
  const nameRow = h("div", { style: { marginBottom: "10px" } }, [h("label", {}, "Nombre"), nameInput]);

  // Botón "ojo" para ver/ocultar la contraseña.
  const togglePass = h("button", { class: "btn small ghost", type: "button", title: "Mostrar/ocultar", style: { flex: "0 0 auto" } }, "👁");
  togglePass.addEventListener("click", () => {
    passInput.type = passInput.type === "password" ? "text" : "password";
    togglePass.textContent = passInput.type === "password" ? "👁" : "🙈";
  });

  // Botón único para reenviar el correo de confirmación (se crea una sola vez).
  let resendBtn = null;
  function showResend(email) {
    if (resendBtn) return; // ya existe, no duplicar
    resendBtn = h("button", { class: "btn small ghost", style: { marginTop: "8px" } }, "Reenviar correo de confirmación");
    resendBtn.addEventListener("click", async () => {
      resendBtn.disabled = true;
      try {
        await api.resendConfirmation(email);
        status.style.color = "var(--good)";
        status.textContent = "✓ Correo reenviado. Revisa tu bandeja (y spam).";
      } catch (e) {
        status.style.color = "var(--bad)";
        status.textContent = "No se pudo reenviar: " + friendlyAuthError(e);
      }
      resendBtn.disabled = false;
    });
    status.after(resendBtn);
  }

  async function submit() {
    const email = emailInput.value.trim();
    const pass = passInput.value;
    if (!email || !pass) { status.textContent = "Escribe correo y contraseña."; status.style.color = "var(--bad)"; return; }
    // En el registro, el nombre es obligatorio (para que nunca quede vacío).
    if (mode === "signup" && !nameInput.value.trim()) {
      status.style.color = "var(--bad)";
      status.textContent = "Escribe tu nombre visible.";
      nameInput.focus();
      return;
    }
    status.style.color = "var(--text-dim)";
    status.textContent = "Conectando…";
    try {
      if (mode === "signup") {
        // Con confirmación de email activada, NO entramos directo: avisamos de revisar el correo.
        await api.signUp(email, pass, nameInput.value.trim());
        status.style.color = "var(--good)";
        status.textContent = "✓ Cuenta creada. Te enviamos un correo de confirmación: ábrelo, haz clic en el enlace y luego inicia sesión.";
        mode = "login"; // dejamos el formulario listo para iniciar sesión
        return;
      }
      await api.signIn(email, pass);
      await refreshAccount();
      await syncOnLogin();
      dismiss();
      render();
    } catch (e) {
      status.style.color = "var(--bad)";
      status.textContent = "⚠️ " + friendlyAuthError(e);
      // Si el problema es que el correo no está confirmado, ofrecer reenviar.
      if (/email not confirmed/i.test((e && e.message) || "")) showResend(email);
    }
  }

  function rebuild() {
    clear(body);
    resendBtn = null; // el body se limpia, así que olvidamos el botón anterior
    body.appendChild(h("h2", {}, mode === "login" ? "Iniciar sesión" : "Crear cuenta"));
    body.appendChild(h("p", { class: "muted" }, "Tus notas se guardarán en la nube y podrás usarlas en el móvil y el PC. También podrás unirte a grupos."));
    if (mode === "signup") body.appendChild(nameRow);
    body.appendChild(h("div", { style: { marginBottom: "10px" } }, [h("label", {}, "Correo"), emailInput]));
    body.appendChild(h("div", { style: { marginBottom: "6px" } }, [
      h("label", {}, "Contraseña"),
      h("div", { class: "inline", style: { gap: "8px" } }, [passInput, togglePass]),
    ]));
    body.appendChild(status);
    body.appendChild(
      h("div", { class: "modal-actions" }, [
        h("button", { class: "btn ghost", onclick: () => { mode = mode === "login" ? "signup" : "login"; rebuild(); } },
          mode === "login" ? "Crear cuenta" : "Ya tengo cuenta"),
        h("button", { class: "btn primary", onclick: submit }, mode === "login" ? "Entrar" : "Registrarme"),
      ])
    );
    passInput.onkeydown = (e) => { if (e.key === "Enter") submit(); };
  }
  rebuild();
}

function renderAccountProfile(body, dismiss) {
  clear(body);
  const p = account.profile || {};
  body.appendChild(h("h2", {}, "Tu cuenta"));
  body.appendChild(h("p", { class: "muted" }, `${account.user.email}`));
  body.appendChild(
    h("div", { class: "word", style: { marginBottom: "12px" } }, [
      h("div", { class: "grow" }, [
        h("div", {}, [document.createTextNode("Rol: "), h("b", {}, roleLabel(p.role))]),
      ]),
    ])
  );

  // Cambiar nombre visible
  const nameInput = h("input", { value: p.display_name || "", placeholder: "escribe tu nombre (ej. Juan Pablo)" });
  const nameStatus = h("span", { class: "muted", style: { fontSize: "12px" } }, "");
  body.appendChild(h("div", { style: { marginBottom: "10px" } }, [
    h("label", {}, "Nombre visible"),
    h("div", { class: "inline", style: { gap: "8px" } }, [
      nameInput,
      h("button", { class: "btn small", onclick: async () => {
        const v = nameInput.value.trim();
        if (!v) { nameStatus.textContent = "Escribe un nombre."; nameStatus.style.color = "var(--bad)"; return; }
        nameStatus.textContent = "Guardando…"; nameStatus.style.color = "var(--text-dim)";
        try {
          await api.updateDisplayName(v);
          await refreshAccount();
          nameStatus.textContent = "✓ Guardado";
          nameStatus.style.color = "var(--good)";
          // actualizar el botón del topbar sin cerrar el modal
          const topBtn = document.querySelector(".topbar button[title='Tu cuenta']");
          if (topBtn) topBtn.textContent = `👤 ${truncate(v, 12)}`;
        } catch (e) {
          nameStatus.textContent = "No se pudo guardar: " + e.message;
          nameStatus.style.color = "var(--bad)";
        }
      } }, "Guardar"),
    ]),
    nameStatus,
  ]));

  // Canjear código de profesor (solo si eres genérico)
  if (p.role === "generic") {
    const codeInput = h("input", { placeholder: "código de profesor" });
    const codeStatus = h("div", { class: "muted", style: { fontSize: "12px", minHeight: "16px" } }, "");
    body.appendChild(h("div", { style: { marginBottom: "10px" } }, [
      h("label", {}, "¿Tienes un código de profesor?"),
      h("div", { class: "inline", style: { gap: "8px" } }, [
        codeInput,
        h("button", { class: "btn small", onclick: async () => {
          try {
            const r = await api.redeemTeacherInvite(codeInput.value.trim());
            const msgs = { ok: "✓ ¡Ahora eres profesor!", invalid: "Código no válido.", expired: "Código caducado.", used_up: "Código agotado." };
            codeStatus.textContent = msgs[r] || r;
            codeStatus.style.color = r === "ok" ? "var(--good)" : "var(--bad)";
            if (r === "ok") { await refreshAccount(); render(); }
          } catch (e) { codeStatus.textContent = "Error: " + e.message; codeStatus.style.color = "var(--bad)"; }
        } }, "Canjear"),
      ]),
      codeStatus,
    ]));
  }

  body.appendChild(
    h("div", { class: "modal-actions" }, [
      h("button", { class: "btn danger", onclick: async () => { await api.signOut(); account = null; groupsState = { loaded: false, list: [], openGroupId: null, error: null }; if (currentTab === "groups") currentTab = "notes"; dismiss(); render(); } }, "Cerrar sesión"),
      h("button", { class: "btn primary", onclick: () => dismiss() }, "Listo"),
    ])
  );
}

function friendlyAuthError(e) {
  const m = (e && e.message) || "";
  if (/email not confirmed/i.test(m)) return "Aún no has confirmado tu correo. Abre el enlace que te enviamos (revisa también spam).";
  if (/Invalid login/i.test(m)) return "Correo o contraseña incorrectos.";
  if (/already registered|User already/i.test(m)) return "Ese correo ya está registrado. Inicia sesión.";
  if (/cargar Supabase/i.test(m)) return "Sin conexión. Necesitas internet para tu cuenta.";
  if (/Password should be/i.test(m)) return "La contraseña es muy corta (mínimo 6).";
  return m || "No se pudo completar.";
}

async function refreshAccount() {
  try { account = await api.getSession(); } catch { account = null; }
}

// Al iniciar sesión: traer las notas de la nube. Si la nube tiene datos, usarlos;
// si no, subir las locales actuales. (Estrategia simple: la nube manda si existe.)
async function syncOnLogin() {
  try {
    const remote = await api.pullPersonalData();
    if (remote && remote.data && remote.data.languages) {
      data = storage.import(JSON.stringify(remote.data));
    } else {
      await api.pushPersonalData(data);
    }
  } catch (e) {
    console.warn("Sync inicial falló:", e.message);
  }
}

/* ===================== arranque ===================== */

// Intentar recuperar sesión guardada al abrir (si hay internet). No bloquea la app.
(async function initAccount() {
  try {
    await refreshAccount();
    if (account) {
      await syncOnLogin();
      render();
    }
  } catch (e) {
    // sin conexión: la app sigue en modo local, sin problema
  }
})();

render();
