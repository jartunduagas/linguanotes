// dom.js — mini ayudante para crear elementos del DOM sin librerías.
// h("div", { class: "card", onclick: fn }, [hijos...]) -> HTMLElement

export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "value") {
      el.value = v;
    } else if (k === "checked" || k === "disabled" || k === "selected") {
      el[k] = !!v;
    } else {
      el.setAttribute(k, v);
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// Monta/desmonta un overlay modal sencillo.
export function openModal(contentEl, onBackdrop) {
  const backdrop = h("div", {
    class: "modal-backdrop",
    onclick: (e) => {
      if (e.target === backdrop && onBackdrop) onBackdrop();
    },
  }, [contentEl]);
  document.body.appendChild(backdrop);
  return () => backdrop.remove();
}
