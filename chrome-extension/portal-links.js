/* SmartBC ← Selección de anuncios en portales
 *
 * Se ejecuta sobre los listados y las fichas de Idealista, Fotocasa,
 * Habitaclia y pisos.com. Pone una casilla en cada anuncio y una barra
 * flotante para mandar los marcados a la ficha de un cliente del CRM
 * (sección "Enlaces de portales"), con quién los va a llamar ya elegido.
 *
 * El flujo que resuelve: ver diez pisos con el cliente delante, marcarlos ahí
 * mismo y que lleguen a su ficha listos para repartir y llamar.
 *
 * Toda la extracción va anclada a URLs y a regex de texto, NUNCA a clases CSS
 * (los portales las cambian sin avisar): si un campo no se encuentra va null y
 * el envío sigue — la URL sola ya sirve para llamar. Reenviar la misma página
 * no duplica: el servidor deduplica por la URL normalizada del anuncio.
 *
 * Autenticación: el mismo token de larga duración de los leads del inbox
 * (Opciones de la extensión).
 */
(function () {
  "use strict";

  const PORTAL_ORIGIN = "https://portal.bcousinoprop.com";
  const LINKS_API = PORTAL_ORIGIN + "/api/extension/portal-links";
  const CLIENTS_API = PORTAL_ORIGIN + "/api/extension/clients";
  const MAX_SELECTION = 60;

  // ── Adaptadores por portal ────────────────────────────────────────────
  // `link` reconoce el enlace a un anuncio dentro del listado y captura su
  // referencia; `detail` reconoce que la página ES un anuncio.
  const PORTALS = [
    {
      id: "idealista",
      host: /(^|\.)idealista\.(com|it|pt)$/i,
      link: /\/inmueble\/(\d+)/,
      detail: /\/inmueble\/(\d+)/,
      // El script de autopublicar y el de leads ya viven en estas rutas.
      skip: /^\/(tools|inbox)/,
    },
    {
      id: "fotocasa",
      host: /(^|\.)fotocasa\.es$/i,
      link: /\/(\d{7,})\/d(?:$|[?#])/,
      detail: /\/(\d{7,})\/d(?:$|[?#])/,
    },
    {
      id: "habitaclia",
      host: /(^|\.)habitaclia\.com$/i,
      link: /\/i(\d{5,})\b/,
      detail: /\/i(\d{5,})\b/,
    },
    {
      id: "pisos",
      host: /(^|\.)pisos\.com$/i,
      link: /-(\d{6,})\/?$/,
      detail: /-(\d{6,})\/?$/,
    },
  ];

  const portal = PORTALS.find((p) => p.host.test(location.hostname));
  if (!portal) return;
  if (portal.skip && portal.skip.test(location.pathname)) return;

  // ── Utilidades ────────────────────────────────────────────────────────
  function text(el) {
    if (!el) return null;
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    return t || null;
  }

  function firstMatch(str, re, group) {
    if (!str) return null;
    const m = str.match(re);
    return m ? m[group == null ? 0 : group] : null;
  }

  /** "1.500 €/mes" → 1500. Los portales españoles usan el punto de millar. */
  function priceNumber(label) {
    if (!label) return null;
    const digits = label.replace(/[^\d.,]/g, "").replace(/[.,](?=\d{3}\b)/g, "");
    const n = parseInt(digits.replace(/[.,]/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** El listado dice si es alquiler o venta en su propia URL. */
  function operationFromUrl(url) {
    if (/alquiler|arriendo|rent/i.test(url)) return "rent";
    if (/venta|comprar|obra-nueva|sale/i.test(url)) return "sale";
    return null;
  }

  /**
   * ⚠️ Bug real corregido aquí (no una corazonada): un listado con carga
   * perezosa deja en `src` un placeholder base64 hasta que la imagen entra en
   * viewport, y la URL de verdad va en `data-src` u otro atributo. La versión
   * anterior probaba `src || data-src || …` con OR: si `src` traía ALGO (el
   * base64, que no está vacío), el resto de la cadena nunca se llegaba a
   * mirar, y como el base64 se rechaza después, la foto quedaba en null
   * aunque `data-src` tuviera la URL real ahí mismo. Ahora se recorren TODOS
   * los candidatos y se descarta cada base64 en vez de rendirse en el primero.
   */
  function imageFrom(container) {
    const img = container.querySelector("img");
    if (!img) return null;
    const firstOfSrcset = (v) => (v || "").split(",")[0]?.trim().split(" ")[0] || null;
    const candidates = [
      img.getAttribute("src"),
      img.getAttribute("data-src"),
      img.getAttribute("data-ondemand-img"),
      img.getAttribute("data-lazy"),
      img.getAttribute("data-lazy-src"),
      img.getAttribute("data-original"),
      firstOfSrcset(img.getAttribute("srcset")),
      firstOfSrcset(img.getAttribute("data-srcset")),
    ];
    for (const candidate of candidates) {
      // Los placeholders en base64 pesan y no sirven de nada en la ficha:
      // se descartan y se sigue probando, no se abandona la búsqueda.
      if (!candidate || /^data:/i.test(candidate)) continue;
      try {
        return new URL(candidate, location.href).toString();
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Sube desde el enlace hasta el contenedor de la tarjeta: el primer
   * ancestro que sea article/li y que tenga una foto o un precio dentro.
   * Con tope de niveles para no acabar en el <body> en un listado raro.
   */
  function cardOf(anchor) {
    let el = anchor;
    for (let i = 0; i < 8 && el && el !== document.body; i++) {
      el = el.parentElement;
      if (!el) break;
      const tag = el.tagName;
      const isCandidate =
        tag === "ARTICLE" ||
        tag === "LI" ||
        el.hasAttribute("data-adid") ||
        el.hasAttribute("data-element-id");
      if (isCandidate && (el.querySelector("img") || /€/.test(el.textContent || ""))) {
        return el;
      }
    }
    return anchor.closest("article, li") || anchor.parentElement;
  }

  /** Datos de un anuncio a partir de su tarjeta en el listado. */
  function readCard(container, url, ref) {
    const body = (container.textContent || "").replace(/\s+/g, " ");
    const titleAnchor =
      [...container.querySelectorAll("a")].find(
        (a) => portal.link.test(a.getAttribute("href") || "") && text(a),
      ) || null;

    const priceLabel = firstMatch(body, /(\d[\d.,]*\s*€(?:\s*\/\s*mes)?)/i);

    return {
      url,
      externalRef: ref,
      title: text(titleAnchor) || text(container.querySelector("h2, h3")),
      priceLabel: priceLabel,
      price: priceNumber(priceLabel),
      operation: operationFromUrl(url) || operationFromUrl(location.href),
      bedrooms: parseInt(firstMatch(body, /(\d+)\s*hab/i, 1) || "", 10) || null,
      bathrooms: parseInt(firstMatch(body, /(\d+)\s*ba[ñn]/i, 1) || "", 10) || null,
      squareMeters: parseInt(firstMatch(body, /(\d+)\s*m[²2]/i, 1) || "", 10) || null,
      imageUrl: imageFrom(container),
      zone: null,
    };
  }

  // ── Recolección de tarjetas ───────────────────────────────────────────
  const cards = new Map(); // ref → { container, data }

  function collect() {
    const anchors = [...document.querySelectorAll("a[href]")];
    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      const m = href.match(portal.link);
      if (!m) continue;
      let absolute;
      try {
        absolute = new URL(href, location.href).toString();
      } catch {
        continue;
      }
      const ref = m[1];
      if (cards.has(ref)) continue;
      const container = cardOf(a);
      if (!container) continue;
      // Un mismo contenedor puede alojar dos referencias en carruseles de
      // "anuncios similares": nos quedamos con la primera.
      if (container.dataset.smartbcRef && container.dataset.smartbcRef !== ref) continue;
      container.dataset.smartbcRef = ref;
      cards.set(ref, { container, data: readCard(container, absolute, ref) });
      decorate(ref);
    }

    // Página de ficha: no hay tarjetas, hay un anuncio.
    if (cards.size === 0 && portal.detail.test(location.pathname)) {
      const ref = location.pathname.match(portal.detail)[1];
      const data = readCard(document.body, location.href, ref);
      data.title = text(document.querySelector("h1")) || data.title;
      cards.set(ref, { container: null, data });
    }
    render();
  }

  // ── Casilla sobre cada tarjeta ────────────────────────────────────────
  const selected = new Set();

  function decorate(ref) {
    const entry = cards.get(ref);
    if (!entry || !entry.container) return;
    const container = entry.container;
    if (container.querySelector(":scope > .smartbc-pick")) return;

    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    const box = document.createElement("button");
    box.type = "button";
    box.className = "smartbc-pick";
    box.title = "Marcar para enviar a SmartBC";
    box.textContent = "＋";
    Object.assign(box.style, {
      position: "absolute",
      top: "8px",
      left: "8px",
      zIndex: "9998",
      width: "28px",
      height: "28px",
      lineHeight: "1",
      borderRadius: "8px",
      border: "1px solid rgba(10,10,10,.15)",
      background: "rgba(255,255,255,.95)",
      color: "#0a0a0a",
      fontSize: "15px",
      fontWeight: "700",
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(0,0,0,.18)",
    });
    box.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle(ref);
    });
    container.appendChild(box);
    paint(ref);
  }

  function paint(ref) {
    const entry = cards.get(ref);
    if (!entry || !entry.container) return;
    const box = entry.container.querySelector(":scope > .smartbc-pick");
    if (!box) return;
    const on = selected.has(ref);
    box.textContent = on ? "✓" : "＋";
    box.style.background = on ? "#c9a96e" : "rgba(255,255,255,.95)";
    box.style.color = on ? "#fff" : "#0a0a0a";
    box.style.borderColor = on ? "#a88a52" : "rgba(10,10,10,.15)";
  }

  function toggle(ref) {
    if (selected.has(ref)) selected.delete(ref);
    else if (selected.size >= MAX_SELECTION) {
      status(`Máximo ${MAX_SELECTION} anuncios por envío`, true);
      return;
    } else selected.add(ref);
    paint(ref);
    render();
  }

  // ── Token ─────────────────────────────────────────────────────────────
  function getToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get("smartbcLeadsToken", (d) =>
        resolve(d.smartbcLeadsToken || null),
      );
    });
  }

  async function requireToken() {
    let token = await getToken();
    if (!token) {
      token = window.prompt(
        "SmartBC: pega el token de la extensión (se genera en el portal, Idealista → Configuración):",
      );
      if (token) {
        token = token.trim();
        chrome.storage.local.set({ smartbcLeadsToken: token });
      }
    }
    return token || null;
  }

  // ── Panel flotante ────────────────────────────────────────────────────
  let panel, countEl, statusEl, clientInput, clientList, staffSelect, sendBtn;
  let chosenClient = null;
  let staff = [];
  let searchTimer = null;

  function css(el, styles) {
    Object.assign(el.style, styles);
    return el;
  }

  function buildPanel() {
    panel = document.createElement("div");
    css(panel, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: "2147483000",
      width: "312px",
      padding: "14px",
      borderRadius: "14px",
      background: "#fbf8f3",
      border: "1px solid rgba(201,169,110,.45)",
      boxShadow: "0 18px 45px rgba(20,14,4,.28)",
      font: "13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: "#0a0a0a",
    });

    const title = document.createElement("div");
    title.textContent = "SMARTBC · ENVIAR A UNA FICHA";
    css(title, {
      fontSize: "10px",
      letterSpacing: ".18em",
      fontWeight: "700",
      color: "#a88a52",
      marginBottom: "8px",
    });
    panel.appendChild(title);

    countEl = document.createElement("div");
    css(countEl, { fontSize: "12px", color: "#555", marginBottom: "8px" });
    panel.appendChild(countEl);

    clientInput = document.createElement("input");
    clientInput.placeholder = "Buscar cliente por nombre o teléfono…";
    css(clientInput, {
      width: "100%",
      boxSizing: "border-box",
      padding: "7px 9px",
      border: "1px solid rgba(10,10,10,.18)",
      borderRadius: "8px",
      fontSize: "12px",
      background: "#fff",
    });
    clientInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => searchClients(clientInput.value.trim()), 320);
    });
    panel.appendChild(clientInput);

    clientList = document.createElement("div");
    css(clientList, {
      maxHeight: "142px",
      overflowY: "auto",
      marginTop: "6px",
      display: "none",
      border: "1px solid rgba(10,10,10,.10)",
      borderRadius: "8px",
      background: "#fff",
    });
    panel.appendChild(clientList);

    const staffWrap = document.createElement("div");
    css(staffWrap, { marginTop: "8px" });
    const staffLabel = document.createElement("div");
    staffLabel.textContent = "QUIÉN LOS LLAMA";
    css(staffLabel, {
      fontSize: "9.5px",
      letterSpacing: ".16em",
      fontWeight: "700",
      color: "#8a8378",
      marginBottom: "4px",
    });
    staffSelect = document.createElement("select");
    css(staffSelect, {
      width: "100%",
      padding: "6px 8px",
      border: "1px solid rgba(10,10,10,.18)",
      borderRadius: "8px",
      fontSize: "12px",
      background: "#fff",
    });
    staffWrap.appendChild(staffLabel);
    staffWrap.appendChild(staffSelect);
    panel.appendChild(staffWrap);

    const actions = document.createElement("div");
    css(actions, { display: "flex", gap: "6px", marginTop: "10px" });

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.textContent = "Todos";
    css(allBtn, {
      flex: "0 0 auto",
      padding: "8px 10px",
      border: "1px solid rgba(10,10,10,.18)",
      borderRadius: "8px",
      background: "#fff",
      fontSize: "12px",
      cursor: "pointer",
    });
    allBtn.addEventListener("click", () => {
      const everySelected = cards.size > 0 && selected.size === cards.size;
      selected.clear();
      if (!everySelected) {
        for (const ref of [...cards.keys()].slice(0, MAX_SELECTION)) {
          selected.add(ref);
        }
      }
      for (const ref of cards.keys()) paint(ref);
      render();
    });
    actions.appendChild(allBtn);

    sendBtn = document.createElement("button");
    sendBtn.type = "button";
    css(sendBtn, {
      flex: "1",
      padding: "8px 10px",
      border: "0",
      borderRadius: "8px",
      background: "#0a0a0a",
      color: "#fbf8f3",
      fontSize: "12px",
      fontWeight: "600",
      cursor: "pointer",
    });
    sendBtn.addEventListener("click", send);
    actions.appendChild(sendBtn);
    panel.appendChild(actions);

    statusEl = document.createElement("div");
    css(statusEl, { fontSize: "11.5px", marginTop: "8px", color: "#0a7d4f" });
    panel.appendChild(statusEl);

    document.body.appendChild(panel);
  }

  function status(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#b4232a" : "#0a7d4f";
  }

  function render() {
    if (!panel) return;
    countEl.textContent = cards.size
      ? `${selected.size} de ${cards.size} anuncios marcados`
      : "No se han reconocido anuncios en esta página";
    sendBtn.textContent = chosenClient
      ? `Enviar ${selected.size} a ${chosenClient.name.split(" ")[0]}`
      : `Enviar ${selected.size}`;
    sendBtn.disabled = selected.size === 0 || !chosenClient;
    sendBtn.style.opacity = sendBtn.disabled ? ".45" : "1";
  }

  async function searchClients(q) {
    const token = await getToken();
    if (!token) {
      status("Falta el token: ábrelo en Opciones de la extensión", true);
      return;
    }
    try {
      const res = await fetch(`${CLIENTS_API}?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: "Bearer " + token },
      });
      if (res.status === 401) {
        status("Token caducado: genera uno nuevo en SmartBC", true);
        return;
      }
      const body = await res.json();
      staff = body.staff || [];
      fillStaff();
      showClients(body.clients || []);
    } catch (e) {
      status("No se pudo conectar con SmartBC", true);
    }
  }

  function fillStaff() {
    if (staffSelect.options.length > 1) return;
    staffSelect.innerHTML = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "Sin asignar";
    staffSelect.appendChild(none);
    for (const s of staff) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      staffSelect.appendChild(opt);
    }
    chrome.storage.local.get("smartbcLastAssignee", (d) => {
      if (d.smartbcLastAssignee) staffSelect.value = d.smartbcLastAssignee;
    });
  }

  function showClients(list) {
    clientList.innerHTML = "";
    if (list.length === 0) {
      clientList.style.display = "none";
      return;
    }
    for (const c of list) {
      const row = document.createElement("button");
      row.type = "button";
      row.textContent = c.phone ? `${c.name} · ${c.phone}` : c.name;
      css(row, {
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "7px 9px",
        border: "0",
        borderBottom: "1px solid rgba(10,10,10,.06)",
        background: "transparent",
        fontSize: "12px",
        cursor: "pointer",
      });
      row.addEventListener("click", () => {
        chosenClient = c;
        chrome.storage.local.set({ smartbcLastClient: c });
        clientInput.value = c.name;
        clientList.style.display = "none";
        status(`Ficha: ${c.name}`);
        render();
      });
      clientList.appendChild(row);
    }
    clientList.style.display = "block";
  }

  async function send() {
    if (!chosenClient || selected.size === 0) return;
    const token = await requireToken();
    if (!token) return;

    const links = [...selected]
      .map((ref) => cards.get(ref))
      .filter(Boolean)
      .map((entry) => entry.data);

    sendBtn.disabled = true;
    status("Enviando…");
    try {
      const res = await fetch(LINKS_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          clientId: chosenClient.id,
          assignedTo: staffSelect.value || null,
          links,
        }),
      });
      if (res.status === 401) {
        status("Token caducado: genera uno nuevo en SmartBC", true);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        status(body.error || `Error ${res.status}`, true);
        return;
      }
      chrome.storage.local.set({ smartbcLastAssignee: staffSelect.value || "" });
      const parts = [`${body.inserted} enviados`];
      if (body.skipped) parts.push(`${body.skipped} ya estaban`);
      status(`✓ ${parts.join(" · ")} → ${chosenClient.name}`);
      selected.clear();
      for (const ref of cards.keys()) paint(ref);
    } catch (e) {
      status("No se pudo conectar con SmartBC", true);
    } finally {
      render();
    }
  }

  // ── Arranque ──────────────────────────────────────────────────────────
  function boot() {
    buildPanel();
    collect();
    // El cliente elegido la última vez ahorra volver a buscarlo entre página
    // y página del listado.
    chrome.storage.local.get("smartbcLastClient", (d) => {
      if (d.smartbcLastClient) {
        chosenClient = d.smartbcLastClient;
        clientInput.value = chosenClient.name;
        status(`Ficha: ${chosenClient.name}`);
        render();
      }
    });
    searchClients("");

    // Los listados cargan tarjetas al hacer scroll y algunos portales navegan
    // sin recargar: se vuelve a recolectar cuando el DOM cambia, con freno.
    let pending = null;
    const obs = new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(collect, 400);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
