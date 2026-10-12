// ============================================================================
// Filtros extra en los listados de Fotocasa (2026-10-12).
//
// Fotocasa ya filtra de serie: situación de la vivienda (incluida subasta),
// extras (ascensor, piscina, terraza…), estado, precio rebajado, vídeo/3D, ayuda
// pública y fecha. Lo que NO tiene y añade este panel (botón "Filtros SmartBC",
// abajo a la izquierda):
//
//   · HABITACIONES exactas (con "Estudio") y BAÑOS exactos.
//   · ESTANCIA en alquiler: corta (temporada) o larga.
//   · MASCOTAS, VIVIENDA DE LUJO y ACCESIBLE.
//   · CON PLANO.
//   · ANUNCIANTE: solo particulares, ocultar agencias por nombre y "Solo estas".
//
// Se filtra en el navegador sobre los anuncios que hay cargados en la página
// (Fotocasa no admite estos filtros en su búsqueda). Lo elegido se recuerda
// entre páginas (chrome.storage.local). Los anuncios ocultos llevan la clase
// `smartbc-hide`, que portal-links.js respeta ("Marcar toda la página" no los
// manda) y se avisa con el evento `smartbc:filters-changed`.
//
// ⚠️ La lectura de cada anuncio va anclada a TEXTOS ("3 habs", "2 baños",
// "Anunciante particular") y a URLs (`/es/pro/<agencia>/`, `/<id>/d`), nunca a
// clases CSS: Fotocasa usa clases de utilidad que cambian con cada despliegue.
// Si un dato no se encuentra, ese anuncio no se descarta por él. Mascotas,
// lujo, accesible y estancia salen del texto de la descripción: son una
// deducción, no un dato del portal (ver filters-core.js).
// ============================================================================
(function () {
  "use strict";

  if (window.__smartbcFotocasaFilters) return;
  window.__smartbcFotocasaFilters = true;

  const core = window.SmartbcFiltersCore;
  if (!core) return;

  const KEY = "smartbcFotocasaFilters";
  const HIDE = "smartbc-hide";
  const AD_LINK = 'a[href*="/d"]';
  const AD_HREF = /\/(\d{6,})\/d(?:[/?#]|$)/;

  const freshState = () => ({ owners: false, terms: [], ...core.emptyState() });
  let state = freshState();
  let ui = null;
  const seen = {}; // slug → nombre de agencia vista

  const norm = (s) =>
    String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

  // ── Lectura de cada anuncio ───────────────────────────────────────────
  /** Los <article> de Fotocasa incluyen huecos de publicidad: solo cuentan los que enlazan a una ficha. */
  const cards = () =>
    [...document.querySelectorAll("article")].filter((a) => {
      const l = a.querySelector(AD_LINK);
      return l && AD_HREF.test(l.getAttribute("href") || "");
    });

  // Texto propio de cada elemento (sin el de sus hijos): "3 habs" puede venir con un icono al lado.
  const ownText = (el) =>
    [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  const leafTexts = (card) => {
    const out = [];
    for (const el of card.querySelectorAll("span, li, p, div, a, button")) {
      const t = ownText(el);
      if (t && t.length < 400) out.push(t);
    }
    return out;
  };

  function agencyOf(card) {
    const a = card.querySelector('a[href*="/es/pro/"]');
    if (!a) return null;
    const slug = ((a.getAttribute("href") || "").match(/\/es\/pro\/([^/?#]+)/) || [])[1] || "?";
    const img = a.querySelector("img") || card.querySelector('img[alt^="Inmuebles"]');
    const name = ((img && img.getAttribute("alt")) || "").replace(/^Inmuebles\s+/i, "").trim() || slug.replace(/-/g, " ");
    return { slug, name, key: norm(name) + " " + norm(slug) };
  }

  function rawOf(card) {
    const leaves = leafTexts(card);
    const pick = (re) => leaves.find((t) => re.test(t));
    const feat = [pick(/^\d+\s*habs?\.?$/i), pick(/^\d+\s*ba[ñn]os?$/i), pick(/^\d[\d.,]*\s*m²$/i)].filter(Boolean);
    const link = card.querySelector(AD_LINK);
    const title = (link && (link.getAttribute("title") || link.getAttribute("aria-label"))) || "";
    const path = location.pathname;
    const text = card.textContent || "";
    const full = text.replace(/\s+/g, " ");
    return {
      title,
      details: feat.length ? feat.join(" | ") : full,
      // Lo largo del anuncio: la descripción que enseña el listado.
      description: leaves.filter((t) => t.length > 40).join(" "),
      text: full,
      operation: /\/alquiler\b/.test(path) ? "rent" : /\/comprar\b/.test(path) ? "sale" : null,
      badges: {
        plan: leaves.some((t) => /^plano$/i.test(t)) || !!card.querySelector('[aria-label*="lano" i], [title*="lano" i]'),
      },
    };
  }

  // ── Aplicar filtros ───────────────────────────────────────────────────
  function apply() {
    const all = cards();
    const terms = state.terms.map(norm).filter(Boolean);
    const onlyTerms = state.only.map(norm).filter(Boolean);
    let hiddenN = 0;
    const counts = { plan: 0, mascotas: 0, lujo: 0, accesible: 0, corta: 0, larga: 0 };
    const rooms = {};
    const baths = {};

    for (const card of all) {
      const raw = rawOf(card);
      const f = core.extract(raw);
      const agency = agencyOf(card);
      if (agency && agency.slug !== "?") seen[agency.slug] = agency.name;

      if (f.media.includes("plan")) counts.plan++;
      for (const p of f.perks) counts[p]++;
      if (f.stay) counts[f.stay]++;
      if (f.rooms !== null) rooms[f.rooms >= 4 ? "4" : String(f.rooms)] = (rooms[f.rooms >= 4 ? "4" : String(f.rooms)] || 0) + 1;
      if (f.baths !== null) baths[f.baths >= 3 ? "3" : String(f.baths)] = (baths[f.baths >= 3 ? "3" : String(f.baths)] || 0) + 1;

      let hide = !core.passes(f, state);
      if (agency && state.owners) hide = true;
      if (!core.agencyPasses(agency ? agency.key : null, terms, onlyTerms)) hide = true;
      card.classList.toggle(HIDE, hide);
      if (hide) hiddenN++;
    }
    render(all.length, hiddenN, { counts, rooms, baths });
    window.dispatchEvent(new CustomEvent("smartbc:filters-changed"));
  }

  // ── Interfaz: botón + panel flotante ──────────────────────────────────
  const CSS =
    `.${HIDE}{display:none !important}` +
    ".sbc-fc-btn{position:fixed;left:14px;bottom:14px;z-index:2147483000;padding:10px 14px;border:0;border-radius:999px;background:#0b1f3a;color:#fff;font:600 13px -apple-system,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.28)}" +
    ".sbc-fc-panel{position:fixed;left:14px;bottom:62px;z-index:2147483000;width:292px;max-height:78vh;overflow:auto;background:#fff;color:#1b1b1b;border:1px solid #ddd;border-radius:14px;padding:12px 14px;box-shadow:0 12px 32px rgba(0,0,0,.25);font:13px/1.4 -apple-system,sans-serif}" +
    ".sbc-fc-panel h4{margin:14px 0 4px;font:700 12px -apple-system,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:#8a6d1f}" +
    ".sbc-fc-panel h4:first-child{margin-top:0}" +
    ".sbc-fc-panel label{display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer}" +
    ".sbc-fc-note{font-size:11.5px;color:#777;margin-top:2px}" +
    ".sbc-fc-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:999px;font:600 11.5px/1.2 -apple-system,sans-serif}" +
    ".sbc-fc-chip button{border:0;background:none;cursor:pointer;color:inherit;font:inherit;padding:0}";

  function box(group, value, label, checked, onChange) {
    const l = document.createElement("label");
    const i = document.createElement("input");
    i.type = "checkbox";
    i.checked = checked;
    i.addEventListener("change", () => onChange(i.checked));
    const s = document.createElement("span");
    s.textContent = label;
    l.append(i, s);
    return l;
  }

  function toggleIn(list, v, on) {
    return on ? [...list.filter((x) => x !== v), v] : list.filter((x) => x !== v);
  }

  function ensureUi() {
    if (ui && document.contains(ui.btn)) return ui;
    if (!document.getElementById("smartbc-fc-css")) {
      const st = document.createElement("style");
      st.id = "smartbc-fc-css";
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sbc-fc-btn";
    const panel = document.createElement("div");
    panel.className = "sbc-fc-panel";
    panel.hidden = true;
    for (const type of ["click", "input", "keydown", "keyup", "keypress", "change"]) {
      panel.addEventListener(type, (e) => e.stopPropagation());
    }
    btn.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
    });
    document.body.append(panel, btn);
    ui = { btn, panel };
    return ui;
  }

  function section(panel, title) {
    const h = document.createElement("h4");
    h.textContent = title;
    panel.appendChild(h);
  }

  function chips(parent, list, style, title) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:6px";
    list.forEach((t, i) => {
      const c = document.createElement("span");
      c.className = "sbc-fc-chip";
      c.style.cssText = style;
      c.title = title;
      const lab = document.createElement("span");
      lab.textContent = t;
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "✕";
      x.setAttribute("aria-label", `Quitar ${t}`);
      x.addEventListener("click", () => {
        list.splice(i, 1);
        save();
        apply();
      });
      c.append(lab, x);
      wrap.appendChild(c);
    });
    parent.appendChild(wrap);
  }

  function addTerms(list, kind) {
    const target = kind === "only" ? state.only : state.terms;
    const have = new Set(target.map(norm));
    for (const raw of list) {
      const t = String(raw || "").trim();
      if (t.length < 2 || have.has(norm(t))) continue;
      have.add(norm(t));
      target.push(t);
    }
    save();
    apply();
  }

  let lastFocus = null;
  function render(total, hiddenN, c) {
    const { btn, panel } = ensureUi();
    const active = core.isActive(state) || state.owners || state.terms.length || state.only.length;
    btn.textContent = hiddenN > 0 ? `Filtros SmartBC · ocultos ${hiddenN}/${total}` : active ? "Filtros SmartBC · activos" : "Filtros SmartBC";
    if (panel.hidden) return; // el panel se redibuja al abrirlo y al cambiar algo con él abierto
    const focused = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.dataset.sbc : null;
    panel.innerHTML = "";

    section(panel, "Habitaciones");
    for (const [v, lab] of [["0", "Estudio"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4 o más"]]) {
      panel.appendChild(box("rooms", v, `${lab} (${c.rooms[v] || 0})`, state.rooms.includes(v), (on) => {
        state.rooms = toggleIn(state.rooms, v, on);
        save();
        apply();
      }));
    }
    section(panel, "Baños");
    for (const [v, lab] of [["1", "1"], ["2", "2"], ["3", "3 o más"]]) {
      panel.appendChild(box("baths", v, `${lab} (${c.baths[v] || 0})`, state.baths.includes(v), (on) => {
        state.baths = toggleIn(state.baths, v, on);
        save();
        apply();
      }));
    }
    if (/\/alquiler\b/.test(location.pathname)) {
      section(panel, "Tipo de alquiler");
      for (const [v, lab] of [["larga", "Larga estancia"], ["corta", "De temporada"]]) {
        panel.appendChild(box("stay", v, `${lab} (${c.counts[v] || 0})`, state.stay.includes(v), (on) => {
          state.stay = toggleIn(state.stay, v, on);
          save();
          apply();
        }));
      }
    }
    section(panel, "Características · por el texto");
    for (const [v, lab] of [["mascotas", "Admite mascotas"], ["accesible", "Vivienda accesible"], ["lujo", "Vivienda de lujo"]]) {
      panel.appendChild(box("perks", v, `${lab} (${c.counts[v] || 0})`, state.perks.includes(v), (on) => {
        state.perks = toggleIn(state.perks, v, on);
        save();
        apply();
      }));
    }
    section(panel, "Multimedia");
    panel.appendChild(box("media", "plan", `Con plano (${c.counts.plan || 0})`, state.media.includes("plan"), (on) => {
      state.media = toggleIn(state.media, "plan", on);
      save();
      apply();
    }));

    section(panel, "Anunciante");
    panel.appendChild(box("owners", "", "Solo particulares (sin agencias)", state.owners, (on) => {
      state.owners = on;
      save();
      apply();
    }));
    const note = document.createElement("div");
    note.className = "sbc-fc-note";
    note.textContent = "Buscar agencia (escribe el nombre; varias separadas por comas):";
    panel.appendChild(note);
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("list", "smartbc-fc-agencias");
    input.dataset.sbc = "agency";
    input.placeholder = "p. ej. gilmar, engel";
    input.style.cssText = "width:100%;box-sizing:border-box;margin-top:4px;padding:7px 9px;border:1px solid #bbb;border-radius:6px;font:13px -apple-system,sans-serif";
    const dl = document.createElement("datalist");
    dl.id = "smartbc-fc-agencias";
    for (const n of Object.values(seen)) {
      const o = document.createElement("option");
      o.value = n;
      dl.appendChild(o);
    }
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;margin-top:6px";
    const mk = (label, color, kind) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = `flex:1;padding:6px 0;border:1px solid ${color};border-radius:6px;background:#fff;color:${color};font:600 12px -apple-system,sans-serif;cursor:pointer`;
      b.addEventListener("click", () => {
        const parts = input.value.split(/[,;\n]+/);
        input.value = "";
        addTerms(parts, kind);
      });
      return b;
    };
    row.append(mk("Ocultar", "#8a6d1f", "hide"), mk("Solo estas", "#2f6b3f", "only"));
    panel.append(input, dl, row);
    chips(panel, state.terms, "background:#f3ecdc;color:#5b4a1c", "Agencias ocultas: su nombre contiene esto");
    chips(panel, state.only, "background:#e3f1e7;color:#245c35", "Solo se ven estas agencias");

    const foot = document.createElement("div");
    foot.className = "sbc-fc-note";
    foot.style.marginTop = "12px";
    foot.textContent = "Situación de la vivienda, extras, precio rebajado, vídeo/3D y ayuda pública ya los filtra Fotocasa de serie.";
    panel.appendChild(foot);
    if (hiddenN > 0 || active) {
      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = "Quitar todos los filtros";
      reset.style.cssText = "margin-top:8px;border:0;background:none;color:#8a6d1f;text-decoration:underline;cursor:pointer;font:inherit;padding:0";
      reset.addEventListener("click", () => {
        state = freshState();
        save();
        apply();
      });
      panel.appendChild(reset);
    }
    if (focused === "agency") input.focus();
    lastFocus = focused;
  }

  // ── Memoria ───────────────────────────────────────────────────────────
  function save() {
    try {
      chrome.storage.local.set({ [KEY]: state });
    } catch {
      /* extensión recargada: se sigue sin recordar */
    }
  }
  const load = () =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY], (d) => resolve(d || {}));
      } catch {
        resolve({});
      }
    });

  async function boot() {
    const saved = (await load())[KEY];
    if (saved && typeof saved === "object") {
      state = {
        owners: saved.owners === true,
        terms: Array.isArray(saved.terms) ? saved.terms.filter((x) => typeof x === "string") : [],
        ...core.sanitize(saved),
      };
    }
    // Fotocasa es una SPA: el listado se rehace al paginar o cambiar la búsqueda.
    let timer = null;
    const run = () => {
      if (cards().length === 0) return;
      apply();
    };
    new MutationObserver((muts) => {
      const mine = (n) => n.nodeType === 1 && (n.classList?.contains("sbc-fc-panel") || n.classList?.contains("sbc-fc-btn") || n.closest?.(".sbc-fc-panel"));
      const relevant = muts.some((m) => !mine(m.target) && [...m.addedNodes].some((n) => !mine(n)));
      if (!relevant) return;
      clearTimeout(timer);
      timer = setTimeout(run, 400);
    }).observe(document.body, { childList: true, subtree: true });
    run();
    // Abrir el panel redibuja con los números del momento.
    document.addEventListener("click", (e) => {
      if (e.target.closest?.(".sbc-fc-btn")) setTimeout(() => !ui.panel.hidden && apply(), 0);
    });
  }

  boot();
})();
