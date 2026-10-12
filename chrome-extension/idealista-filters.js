// ============================================================================
// Filtros extra en los listados de Idealista (2026-10-09).
//
// Idealista solo filtra la planta como "Última / Intermedias / Bajos". Al
// buscar para un cliente hace falta más: "solo segundas", "sin bajos", "solo
// exteriores". Y hay búsquedas que se llenan de anuncios de agencias que no
// interesan. Este script añade, en la barra de filtros de la izquierda:
//
//   · PLANTA EXACTA — Bajo, Entreplanta, 1ª a 10ª (y las más altas que haya en
//     la página), Sótano, Ático, Dúplex y Sin dato. Se pueden marcar varias: un
//     anuncio entra si cumple CUALQUIERA de las marcadas. Cada opción dice
//     cuántos anuncios de la página hay.
//   · EXTERIOR / INTERIOR.
//   · ANUNCIANTE — "Solo particulares" y ocultar agencias por NOMBRE: se
//     escribe una o varias (separadas por comas) y se ocultan todos sus
//     anuncios. Basta un trozo del nombre ("gilmar" oculta las cuatro Gilmar).
//     También sale "ocultar agencia ✕" en cada anuncio.
//
//   · VÍDEO, PRECIO REBAJADO y SUBASTA — lo que Idealista no filtra de serie
//     (lo demás —habitaciones, baños, situación, estancia, mascotas, plano,
//     visita virtual— ya está en su barra; ver filters-core.js).
//   · AGENCIAS: además de ocultarlas, "Solo estas" deja ver únicamente las
//     que se busquen por nombre.
//
// Se filtra en el navegador, sobre los anuncios de la PÁGINA que se está
// viendo (30 por página): Idealista no admite estos filtros en su búsqueda.
// Lo elegido se recuerda entre páginas y sesiones (chrome.storage.local).
//
// Los anuncios ocultos llevan la clase `smartbc-hide`: portal-links.js (el
// panel "Enviar a una ficha") no los cuenta ni los marca con "Marcar toda la
// página", así que nada de lo filtrado se manda por descuido. Avisa a ese
// script con el evento `smartbc:filters-changed`.
//
// Si Idealista cambia la maqueta y no se encuentra el bloque "Planta", el
// panel de filtros aparece flotando abajo a la izquierda en vez de romperse.
// ============================================================================
(function () {
  "use strict";

  if (window.__smartbcIdealistaFilters) return;
  window.__smartbcIdealistaFilters = true;

  const KEY = "smartbcIdealistaFilters";
  const SEEN_KEY = "smartbcAgenciasVistas";
  const HIDE = "smartbc-hide";
  const CARD_SEL = "article.item[data-element-id]";

  // Núcleo común con Fotocasa (filters-core.js, se carga antes en el manifest).
  const core = window.SmartbcFiltersCore;
  const freshState = () => ({ floors: [], sides: [], owners: false, terms: [], ...core.emptyState() });
  let state = freshState();
  let seenAgencies = {}; // slug → nombre: para sugerir al escribir
  let ui = null;

  // Minúsculas, sin tildes ni signos: "Engel & Völkers" → "engel volkers".
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  // ── Lectura de cada anuncio ───────────────────────────────────────────
  function detailsOf(card) {
    return [...card.querySelectorAll(".item-detail, .item-detail-char span")]
      .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" | ");
  }

  function titleOf(card) {
    const a = card.querySelector("a.item-link");
    return ((a && (a.getAttribute("title") || a.textContent)) || "").replace(/\s+/g, " ").trim();
  }

  /** Planta: "bajo", "entre", "sotano", "1".."40" o "?" si el anuncio no la dice. */
  function floorOf(joined) {
    const m = joined.match(/(\d+)\s*ª\s*planta/i);
    if (m) return String(Number(m[1]));
    if (/entreplanta/i.test(joined)) return "entre";
    if (/semis[oó]tano|s[oó]tano/i.test(joined)) return "sotano";
    if (/(^|\|\s*)bajo\b/i.test(joined) || /planta\s+baja/i.test(joined)) return "bajo";
    return "?";
  }

  function sideOf(joined) {
    if (/\bexterior\b/i.test(joined)) return "exterior";
    if (/\binterior\b/i.test(joined)) return "interior";
    return "?";
  }

  function agencyOf(card) {
    if (card.getAttribute("data-is-professional-ad") !== "true") return null;
    const a = card.querySelector('a[data-markup="listado::logo-agencia"], .logo-branding a');
    if (!a) return { slug: "?", name: "Agencia", key: "agencia" };
    const slug =
      ((a.getAttribute("href") || "").match(/\/pro\/([^/?#]+)/) || [])[1] ||
      a.getAttribute("title") ||
      "?";
    const name = a.getAttribute("title") || (a.querySelector("img") || {}).alt || slug;
    // Se busca en el nombre Y en el identificador de su página ("gilmarchamberi").
    return { slug, name, key: norm(name) + " " + norm(slug) };
  }

  const cards = () => [...document.querySelectorAll(CARD_SEL)];

  /** Lo que se lee de una tarjeta para el núcleo: números y textos, e iconos/etiquetas fiables. */
  function rawOf(card, joined, title) {
    const q = (sel) => card.querySelector(sel);
    const d = q(".item-description");
    const path = location.pathname;
    return {
      title,
      details: joined,
      description: (d && d.textContent) || "",
      operation: /alquiler|rent/.test(path) ? "rent" : /venta|sale/.test(path) ? "sale" : null,
      badges: {
        plan: !!q('.multimedia-shortcut[data-button-type="PLAN"]'),
        video: !!q('.multimedia-shortcut[data-button-type="VIDEO"]'),
        tour3d: !!q('.multimedia-shortcut[data-button-type="VIRTUAL_TOUR_3D"]'),
        priceDrop: !!q(".pricedown, .icon-pricedown"),
      },
    };
  }

  // Orden de las opciones de planta.
  const FLOOR_ORDER = (id) => {
    if (id === "bajo") return -2;
    if (id === "entre") return -1;
    if (/^\d+$/.test(id)) return Number(id);
    if (id === "sotano") return 900;
    if (id === "atico") return 1000;
    if (id === "duplex") return 1001;
    return 2000; // "?"
  };
  const floorLabel = (id) =>
    ({ bajo: "Bajo", entre: "Entreplanta", sotano: "Sótano / semisótano", atico: "Ático", duplex: "Dúplex", "?": "Sin dato de planta" })[id] ||
    `${id}ª planta`;

  // ── Aplicar filtros ───────────────────────────────────────────────────
  function apply() {
    const all = cards();
    const floorCounts = {};
    const sideCounts = {};
    let hiddenN = 0;
    const pageAgencies = {};
    const terms = state.terms.map(norm).filter(Boolean);
    const onlyTerms = state.only.map(norm).filter(Boolean);
    const extraCounts = { video: 0, priceDrop: 0, subasta: 0 };

    for (const card of all) {
      const joined = detailsOf(card);
      const title = titleOf(card);
      const floor = floorOf(joined);
      const atico = /^\s*[áa]tico\b/i.test(title);
      const duplex = /^\s*d[úu]plex\b/i.test(title);
      const side = sideOf(joined);
      card.dataset.smartbcFloor = floor;
      card.dataset.smartbcSide = side;

      floorCounts[floor] = (floorCounts[floor] || 0) + 1;
      if (atico) floorCounts.atico = (floorCounts.atico || 0) + 1;
      if (duplex) floorCounts.duplex = (floorCounts.duplex || 0) + 1;
      sideCounts[side] = (sideCounts[side] || 0) + 1;

      const agency = agencyOf(card);
      if (agency && agency.slug !== "?") pageAgencies[agency.slug] = agency.name;

      let hide = false;
      // Planta: cumple CUALQUIERA de las marcadas.
      if (state.floors.length > 0) {
        const ok =
          state.floors.includes(floor) ||
          (atico && state.floors.includes("atico")) ||
          (duplex && state.floors.includes("duplex"));
        if (!ok) hide = true;
      }
      if (state.sides.length > 0 && !state.sides.includes(side)) hide = true;
      if (agency && state.owners) hide = true;
      if (!core.agencyPasses(agency ? agency.key : null, terms, onlyTerms)) hide = true;

      // Lo que Idealista no filtra de serie (vídeo, precio rebajado, subasta).
      const feats = core.extract(rawOf(card, joined, title));
      if (feats.media.includes("video")) extraCounts.video++;
      if (feats.priceDrop) extraCounts.priceDrop++;
      if (feats.situation.includes("subasta")) extraCounts.subasta++;
      if (!core.passes(feats, state)) hide = true;
      card.classList.toggle(HIDE, hide);
      if (hide) hiddenN++;
      decorateAgency(card, agency);
    }

    rememberAgencies(pageAgencies);
    renderUi(floorCounts, sideCounts, all.length, hiddenN, extraCounts);
    window.dispatchEvent(new CustomEvent("smartbc:filters-changed"));
  }

  // "ocultar agencia ✕" pegado al logo de cada anuncio de agencia.
  function decorateAgency(card, agency) {
    if (!agency) return;
    // Los anuncios destacados traen un bloque con el nombre de la agencia; el
    // resto solo el logo (picture.logo-branding) suelto en la columna de
    // información. En ambos casos el botón va pegado al logo.
    const hightop = card.querySelector(".featured-hightop-block-agent-container");
    const logo = card.querySelector("picture.logo-branding");
    if (!hightop && !logo) return;
    if (card.querySelector(".smartbc-hide-agency")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "smartbc-hide-agency";
    b.textContent = "ocultar agencia ✕";
    b.title = `No volver a ver anuncios de ${agency.name} en estas búsquedas`;
    b.style.cssText =
      "margin:4px 0 0 10px;border:0;background:none;color:#8a6d1f;font:600 11px/1 -apple-system,sans-serif;cursor:pointer;text-decoration:underline;display:inline-block;white-space:nowrap;flex:none;";
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      addTerms([agency.name]);
    });
    if (hightop) hightop.appendChild(b);
    else logo.insertAdjacentElement("afterend", b);
  }

  /** Una o varias agencias a ocultar (`hide`) o a ver en exclusiva (`only`). Sin duplicados. */
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

  // ── Interfaz en la barra de la izquierda ──────────────────────────────
  function findPlantaBlock() {
    for (const t of document.querySelectorAll(".item-form > .title-label")) {
      if (/^\s*planta\s*$/i.test(t.textContent || "")) return t.parentElement;
    }
    return null;
  }

  function checkbox(id, label, checked, onChange) {
    const li = document.createElement("li");
    // Mismo marcado que los filtros de Idealista para heredar su estilo. Sin
    // `name`: así no se envía con el formulario de búsqueda de Idealista.
    li.innerHTML =
      "<label class='input-checkbox'>" +
      `<input type="checkbox" data-smartbc="${id}" aria-label="${label}"/>` +
      "<span><span></span></span></label>";
    li.querySelector("input").checked = checked;
    li.querySelector("span span").textContent = label;
    li.querySelector("input").addEventListener("change", (e) => onChange(e.target.checked));
    return li;
  }

  const LINK_BTN =
    "border:0;background:none;color:#8a6d1f;text-decoration:underline;cursor:pointer;font:inherit;padding:0";

  function ensureUi() {
    if (ui && document.contains(ui.root)) return ui;

    const root = document.createElement("div");
    root.className = "item-form smartbc-filters";
    root.innerHTML =
      '<span class="title-label">Planta exacta · SmartBC</span><ul class="smartbc-floors"></ul>' +
      '<span class="title-label" style="margin-top:14px;display:block">Exterior / interior · SmartBC</span><ul class="smartbc-sides"></ul>' +
      '<span class="title-label" style="margin-top:14px;display:block">Vídeo, precio y subasta · SmartBC</span><ul class="smartbc-extra"></ul>' +
      '<div style="font:11.5px/1.4 -apple-system,sans-serif;color:#777;margin:2px 0 0">Habitaciones, baños, situación, estancia, mascotas, plano y visita virtual ya los trae Idealista en esta barra.</div>' +
      '<span class="title-label" style="margin-top:14px;display:block">Anunciante · SmartBC</span><ul class="smartbc-owners"></ul>' +
      '<div class="smartbc-agency-box" style="margin-top:6px">' +
      '<div style="font:12px/1.4 -apple-system,sans-serif;color:#555;margin-bottom:4px">Buscar agencia (escribe el nombre; varias separadas por comas) y elegir si ocultarla o ver solo esas:</div>' +
      '<input class="smartbc-agency-input" type="text" list="smartbc-agencias-list" autocomplete="off" placeholder="p. ej. gilmar, engel" ' +
      'style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #bbb;border-radius:6px;font:13px -apple-system,sans-serif"/>' +
      '<div style="display:flex;gap:6px;margin-top:6px">' +
      '<button type="button" class="smartbc-agency-add" style="flex:1;padding:6px 0;border:1px solid #8a6d1f;border-radius:6px;background:#fff;color:#8a6d1f;font:600 12px -apple-system,sans-serif;cursor:pointer">Ocultar</button>' +
      '<button type="button" class="smartbc-agency-only" style="flex:1;padding:6px 0;border:1px solid #2f6b3f;border-radius:6px;background:#fff;color:#2f6b3f;font:600 12px -apple-system,sans-serif;cursor:pointer">Solo estas</button>' +
      "</div>" +
      '<datalist id="smartbc-agencias-list"></datalist>' +
      '<div class="smartbc-terms" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px"></div>' +
      '<div class="smartbc-only" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px"></div>' +
      "</div>" +
      '<div class="smartbc-status" style="margin-top:10px;font:600 12px/1.4 -apple-system,sans-serif;color:#8a6d1f"></div>';

    // Lo que se marca o escribe aquí no debe disparar la búsqueda de Idealista
    // ni sus atajos: sus manejadores escuchan la barra entera.
    for (const type of ["change", "click", "input", "keydown", "keyup", "keypress"]) {
      root.addEventListener(type, (e) => e.stopPropagation());
    }

    const input = root.querySelector(".smartbc-agency-input");
    input.addEventListener("focus", () => refreshSuggestions(true));
    const submit = (kind) => {
      const parts = input.value.split(/[,;\n]+/);
      input.value = "";
      addTerms(parts, kind);
    };
    root.querySelector(".smartbc-agency-add").addEventListener("click", () => submit("hide"));
    root.querySelector(".smartbc-agency-only").addEventListener("click", () => submit("only"));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit("hide");
      }
    });

    const planta = findPlantaBlock();
    if (planta) {
      planta.insertAdjacentElement("afterend", root);
    } else {
      root.style.cssText =
        "position:fixed;left:12px;bottom:12px;z-index:9997;max-height:80vh;overflow:auto;width:260px;background:#fff;border:1px solid #ddd;border-radius:12px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.18)";
      document.body.appendChild(root);
    }

    if (!document.getElementById("smartbc-filters-css")) {
      const st = document.createElement("style");
      st.id = "smartbc-filters-css";
      st.textContent = `.${HIDE}{display:none !important}`;
      document.head.appendChild(st);
    }

    ui = { root };
    return ui;
  }

  function renderUi(floorCounts, sideCounts, total, hiddenN, extraCounts) {
    const { root } = ensureUi();

    // ── Plantas ──
    // Siempre: Bajo, Entreplanta, 1ª–10ª, Ático y Dúplex. Solo si hay (o están
    // marcadas): Sótano, plantas más altas y Sin dato.
    const ids = new Set(["bajo", "entre", "atico", "duplex"]);
    for (let n = 1; n <= 10; n++) ids.add(String(n));
    for (const id of Object.keys(floorCounts)) ids.add(id);
    for (const id of state.floors) ids.add(id);
    const always = (id) => ["bajo", "entre", "atico", "duplex"].includes(id) || (/^\d+$/.test(id) && Number(id) <= 10);
    const floors = root.querySelector(".smartbc-floors");
    floors.innerHTML = "";
    for (const id of [...ids].sort((a, b) => FLOOR_ORDER(a) - FLOOR_ORDER(b))) {
      const n = floorCounts[id] || 0;
      if (!always(id) && n === 0 && !state.floors.includes(id)) continue;
      floors.appendChild(
        checkbox(`floor-${id}`, `${floorLabel(id)} (${n})`, state.floors.includes(id), (on) => {
          state.floors = on ? [...state.floors, id] : state.floors.filter((f) => f !== id);
          save();
          apply();
        }),
      );
    }

    // ── Exterior / interior ──
    const sides = root.querySelector(".smartbc-sides");
    sides.innerHTML = "";
    for (const [id, label] of [["exterior", "Exterior"], ["interior", "Interior"], ["?", "Sin dato"]]) {
      const n = sideCounts[id] || 0;
      if (id === "?" && n === 0 && !state.sides.includes("?")) continue;
      sides.appendChild(
        checkbox(`side-${id}`, `${label} (${n})`, state.sides.includes(id), (on) => {
          state.sides = on ? [...state.sides, id] : state.sides.filter((s) => s !== id);
          save();
          apply();
        }),
      );
    }

    // ── Vídeo, precio rebajado y subasta (lo que Idealista no filtra) ──
    const extra = root.querySelector(".smartbc-extra");
    extra.innerHTML = "";
    const ec = extraCounts || {};
    extra.appendChild(
      checkbox("media-video", `Con vídeo (${ec.video || 0})`, state.media.includes("video"), (on) => {
        state.media = on ? [...state.media, "video"] : state.media.filter((m) => m !== "video");
        save();
        apply();
      }),
    );
    extra.appendChild(
      checkbox("price-drop", `Precio rebajado (${ec.priceDrop || 0})`, state.priceDrop, (on) => {
        state.priceDrop = on;
        save();
        apply();
      }),
    );
    if (/venta|sale/.test(location.pathname)) {
      extra.appendChild(
        checkbox("sit-subasta", `Subasta judicial (${ec.subasta || 0}) · por el texto`, state.situation.includes("subasta"), (on) => {
          state.situation = on ? [...state.situation, "subasta"] : state.situation.filter((x) => x !== "subasta");
          save();
          apply();
        }),
      );
    }

    // ── Anunciante ──
    const owners = root.querySelector(".smartbc-owners");
    owners.innerHTML = "";
    owners.appendChild(
      checkbox("owners", "Solo particulares (sin agencias)", state.owners, (on) => {
        state.owners = on;
        save();
        apply();
      }),
    );

    // Sugerencias al escribir: se construyen la primera vez que se enfoca la
    // casilla (son miles de nombres) y después solo se añaden las vistas nuevas.
    refreshSuggestions(false);

    // Agencias ocultas y agencias "solo estas", una a una.
    const drawChips = (el, list, style, title, ariaPrefix) => {
      el.innerHTML = "";
      list.forEach((t, i) => {
        const chip = document.createElement("span");
        chip.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:999px;font:600 11.5px/1.2 -apple-system,sans-serif;${style}`;
        chip.title = title;
        const label = document.createElement("span");
        label.textContent = t;
        const x = document.createElement("button");
        x.type = "button";
        x.textContent = "✕";
        x.setAttribute("aria-label", `${ariaPrefix} ${t}`);
        x.style.cssText = "border:0;background:none;cursor:pointer;color:inherit;font:inherit;padding:0";
        x.addEventListener("click", () => {
          list.splice(i, 1);
          save();
          apply();
        });
        chip.append(label, x);
        el.appendChild(chip);
      });
    };
    drawChips(root.querySelector(".smartbc-terms"), state.terms, "background:#f3ecdc;color:#5b4a1c", "Agencias ocultas: su nombre contiene esto", "Volver a mostrar");
    drawChips(root.querySelector(".smartbc-only"), state.only, "background:#e3f1e7;color:#245c35", "Solo se ven estas agencias", "Dejar de ver solo");

    // ── Estado ──
    const status = root.querySelector(".smartbc-status");
    status.innerHTML = "";
    if (hiddenN > 0) {
      status.append(`Ocultos ${hiddenN} de ${total} en esta página · `);
      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = "quitar filtros";
      reset.style.cssText = LINK_BTN;
      reset.addEventListener("click", () => {
        state = freshState();
        save();
        apply();
      });
      status.appendChild(reset);
    }
  }

  // ── Sugerencias de agencias ───────────────────────────────────────────
  // La lista conocida (idealista-agencias.js) tiene miles de nombres: crear sus
  // <option> en cada cambio de filtro sería lento, así que se hace una vez, al
  // enfocar la casilla, y luego solo se añaden las agencias vistas navegando.
  let suggestionsBuilt = false;
  const suggested = new Set();
  function refreshSuggestions(force) {
    const { root } = ensureUi();
    const input = root.querySelector(".smartbc-agency-input");
    if (!suggestionsBuilt && !force && document.activeElement !== input) return;
    suggestionsBuilt = true;
    const dl = root.querySelector("#smartbc-agencias-list");
    const frag = document.createDocumentFragment();
    const add = (n) => {
      const k = norm(n);
      if (!k || suggested.has(k)) return;
      suggested.add(k);
      const o = document.createElement("option");
      o.value = n;
      frag.appendChild(o);
    };
    for (const n of Object.values(seenAgencies)) add(n); // las vistas, primero
    for (const n of window.__smartbcAgencias || []) add(n);
    dl.appendChild(frag);
  }

  // ── Memoria entre páginas ─────────────────────────────────────────────
  function save() {
    try {
      chrome.storage.local.set({ [KEY]: state });
    } catch {
      /* contexto de la extensión perdido (se recargó): se sigue sin recordar */
    }
  }

  // Las agencias que se van viendo se recuerdan para sugerirlas al escribir.
  function rememberAgencies(page) {
    let changed = false;
    for (const [slug, name] of Object.entries(page)) {
      if (seenAgencies[slug] !== name) {
        seenAgencies[slug] = name;
        changed = true;
      }
    }
    if (!changed) return;
    const slugs = Object.keys(seenAgencies);
    if (slugs.length > 600) for (const s of slugs.slice(0, slugs.length - 600)) delete seenAgencies[s];
    try {
      chrome.storage.local.set({ [SEEN_KEY]: seenAgencies });
    } catch {
      /* igual que arriba */
    }
  }

  function load() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY, SEEN_KEY], (d) => resolve(d || {}));
      } catch {
        resolve({});
      }
    });
  }

  // ── Arranque ──────────────────────────────────────────────────────────
  async function boot() {
    // Solo en listados: sin anuncios ni barra de filtros no hay nada que hacer
    // (fichas de anuncio, inbox, herramientas…).
    if (cards().length === 0) return;

    const saved = await load();
    const s = saved[KEY];
    if (s && typeof s === "object") {
      state = {
        floors: Array.isArray(s.floors) ? s.floors : [],
        sides: Array.isArray(s.sides) ? s.sides : [],
        owners: s.owners === true,
        terms: Array.isArray(s.terms) ? s.terms : [],
        ...core.sanitize(s),
      };
      // Versión 1.11: las agencias ocultas eran un mapa identificador → nombre.
      if (s.hidden && typeof s.hidden === "object") {
        for (const n of Object.values(s.hidden)) {
          if (typeof n === "string" && !state.terms.map(norm).includes(norm(n))) state.terms.push(n);
        }
      }
    }
    if (saved[SEEN_KEY] && typeof saved[SEEN_KEY] === "object") seenAgencies = saved[SEEN_KEY];
    apply();

    // Anuncios que Idealista añade o rehace después de cargar la página.
    let timer = null;
    const root = document.querySelector("main, #main-content, .items-container") || document.body;
    new MutationObserver((muts) => {
      // Lo que cambia por nuestra culpa (clases, nuestro bloque) no cuenta.
      const relevant = muts.some((m) =>
        [...m.addedNodes].some(
          (n) => n.nodeType === 1 && (n.matches?.(CARD_SEL) || n.querySelector?.(CARD_SEL)),
        ),
      );
      if (!relevant) return;
      clearTimeout(timer);
      timer = setTimeout(apply, 300);
    }).observe(root, { childList: true, subtree: true });
  }

  boot();
})();
