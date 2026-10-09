// ============================================================================
// Filtros extra en los listados de Idealista (2026-10-09).
//
// Idealista solo filtra la planta como "Última / Intermedias / Bajos". Al
// buscar para un cliente hace falta más: "solo segundas", "sin bajos". Y hay
// búsquedas que se llenan de anuncios de agencias que no interesan. Este
// script añade, en la barra de filtros de la izquierda:
//
//   · PLANTA EXACTA — Bajo, Entreplanta, 1ª … 7ª o más, Sin dato. Cada opción
//     dice cuántos anuncios de la página hay de esa planta.
//   · ANUNCIANTE — "Solo particulares" y una lista de agencias ocultadas (en
//     cada anuncio de agencia aparece "ocultar agencia").
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
  const HIDE = "smartbc-hide";
  const CARD_SEL = "article.item[data-element-id]";

  // Opciones de planta, en el orden en que se muestran.
  const FLOORS = [
    ["bajo", "Bajo"],
    ["entre", "Entreplanta"],
    ["1", "1ª planta"],
    ["2", "2ª planta"],
    ["3", "3ª planta"],
    ["4", "4ª planta"],
    ["5", "5ª planta"],
    ["6", "6ª planta"],
    ["7+", "7ª o más"],
    ["sotano", "Sótano"],
    ["?", "Sin dato de planta"],
  ];

  let state = { floors: [], owners: false, hidden: {} };
  let ui = null;

  // ── Lectura de cada anuncio ───────────────────────────────────────────
  function floorOf(card) {
    const details = [...card.querySelectorAll(".item-detail, .item-detail-char span")]
      .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const joined = details.join(" | ");
    let m = joined.match(/(\d+)\s*ª\s*planta/i);
    if (m) return Number(m[1]) >= 7 ? "7+" : String(Number(m[1]));
    if (/entreplanta/i.test(joined)) return "entre";
    if (/semis[oó]tano|s[oó]tano/i.test(joined)) return "sotano";
    if (/(^|\|\s*)bajo\b/i.test(joined) || /planta\s+baja/i.test(joined)) return "bajo";
    return "?";
  }

  function agencyOf(card) {
    if (card.getAttribute("data-is-professional-ad") !== "true") return null;
    const a = card.querySelector('a[data-markup="listado::logo-agencia"], .logo-branding a');
    if (!a) return { slug: "?", name: "Agencia" };
    const slug = ((a.getAttribute("href") || "").match(/\/pro\/([^/?#]+)/) || [])[1] || a.getAttribute("title") || "?";
    const name = a.getAttribute("title") || (a.querySelector("img") || {}).alt || slug;
    return { slug, name };
  }

  const cards = () => [...document.querySelectorAll(CARD_SEL)];

  // ── Aplicar filtros ───────────────────────────────────────────────────
  function apply() {
    const all = cards();
    const counts = {};
    let hiddenN = 0;

    for (const card of all) {
      const floor = floorOf(card);
      card.dataset.smartbcFloor = floor;
      counts[floor] = (counts[floor] || 0) + 1;

      const agency = agencyOf(card);
      let hide = false;
      if (state.floors.length > 0 && !state.floors.includes(floor)) hide = true;
      if (agency) {
        if (state.owners) hide = true;
        if (state.hidden[agency.slug]) hide = true;
      }
      card.classList.toggle(HIDE, hide);
      if (hide) hiddenN++;
      decorateAgency(card, agency);
    }

    renderUi(counts, all.length, hiddenN);
    window.dispatchEvent(new CustomEvent("smartbc:filters-changed"));
  }

  // "ocultar agencia" junto al nombre de la agencia de cada anuncio.
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
      state.hidden[agency.slug] = agency.name;
      save();
      apply();
    });
    if (hightop) hightop.appendChild(b);
    else logo.insertAdjacentElement("afterend", b);
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

  function ensureUi() {
    if (ui && document.contains(ui.root)) return ui;

    const root = document.createElement("div");
    root.className = "item-form smartbc-filters";
    root.innerHTML =
      '<span class="title-label">Planta exacta · SmartBC</span><ul class="smartbc-floors"></ul>' +
      '<span class="title-label" style="margin-top:14px;display:block">Anunciante · SmartBC</span><ul class="smartbc-owners"></ul>' +
      '<div class="smartbc-hidden-agencies" style="font:12px/1.5 -apple-system,sans-serif;color:#555"></div>' +
      '<div class="smartbc-status" style="margin-top:10px;font:600 12px/1.4 -apple-system,sans-serif;color:#8a6d1f"></div>';

    // Lo que se marca aquí no debe disparar la búsqueda de Idealista: sus
    // manejadores escuchan cambios y clics en la barra entera.
    for (const type of ["change", "click", "input"]) {
      root.addEventListener(type, (e) => e.stopPropagation());
    }

    const planta = findPlantaBlock();
    if (planta) {
      planta.insertAdjacentElement("afterend", root);
    } else {
      root.style.cssText =
        "position:fixed;left:12px;bottom:12px;z-index:9997;max-height:70vh;overflow:auto;width:230px;background:#fff;border:1px solid #ddd;border-radius:12px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.18)";
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

  function renderUi(counts, total, hiddenN) {
    const { root } = ensureUi();

    const floors = root.querySelector(".smartbc-floors");
    floors.innerHTML = "";
    for (const [id, label] of FLOORS) {
      const n = counts[id] || 0;
      // Una planta sin anuncios en esta página solo se muestra si está elegida.
      if (n === 0 && !state.floors.includes(id)) continue;
      floors.appendChild(
        checkbox(`floor-${id}`, `${label} (${n})`, state.floors.includes(id), (on) => {
          state.floors = on ? [...state.floors, id] : state.floors.filter((f) => f !== id);
          save();
          apply();
        }),
      );
    }

    const owners = root.querySelector(".smartbc-owners");
    owners.innerHTML = "";
    owners.appendChild(
      checkbox("owners", "Solo particulares (sin agencias)", state.owners, (on) => {
        state.owners = on;
        save();
        apply();
      }),
    );

    const hid = root.querySelector(".smartbc-hidden-agencies");
    hid.innerHTML = "";
    const slugs = Object.keys(state.hidden);
    if (slugs.length > 0) {
      const t = document.createElement("div");
      t.textContent = "Agencias ocultas:";
      t.style.cssText = "margin-top:6px;font-weight:600";
      hid.appendChild(t);
      for (const slug of slugs) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;justify-content:space-between;gap:8px";
        const name = document.createElement("span");
        name.textContent = state.hidden[slug];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "mostrar";
        btn.style.cssText = "border:0;background:none;color:#8a6d1f;text-decoration:underline;cursor:pointer;font:inherit";
        btn.addEventListener("click", () => {
          delete state.hidden[slug];
          save();
          apply();
        });
        row.append(name, btn);
        hid.appendChild(row);
      }
    }

    const status = root.querySelector(".smartbc-status");
    status.innerHTML = "";
    if (hiddenN > 0) {
      status.append(`Ocultos ${hiddenN} de ${total} en esta página · `);
      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = "quitar filtros";
      reset.style.cssText = "border:0;background:none;color:inherit;text-decoration:underline;cursor:pointer;font:inherit";
      reset.addEventListener("click", () => {
        state = { floors: [], owners: false, hidden: {} };
        save();
        apply();
      });
      status.appendChild(reset);
    }
  }

  // ── Memoria entre páginas ─────────────────────────────────────────────
  function save() {
    try {
      chrome.storage.local.set({ [KEY]: state });
    } catch {
      /* contexto de la extensión perdido (se recargó): se sigue sin recordar */
    }
  }

  function load() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY], (d) => resolve((d && d[KEY]) || null));
      } catch {
        resolve(null);
      }
    });
  }

  // ── Arranque ──────────────────────────────────────────────────────────
  async function boot() {
    // Solo en listados: sin anuncios ni barra de filtros no hay nada que hacer
    // (fichas de anuncio, inbox, herramientas…).
    if (cards().length === 0) return;

    const saved = await load();
    if (saved) {
      state = {
        floors: Array.isArray(saved.floors) ? saved.floors : [],
        owners: saved.owners === true,
        hidden: saved.hidden && typeof saved.hidden === "object" ? saved.hidden : {},
      };
    }
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
