/* SmartBC ← Selección de anuncios en portales
 *
 * Se ejecuta sobre los listados y las fichas de Idealista, Fotocasa,
 * Habitaclia y pisos.com. Pone un botón "＋ Añadir" en cada anuncio y un panel
 * flotante para mandar los marcados a la ficha de un cliente del CRM
 * (sección "Enlaces de portales"), con quién los va a llamar ya elegido.
 *
 * El flujo que resuelve: ver diez pisos con el cliente delante, marcarlos ahí
 * mismo y que lleguen a su ficha listos para repartir y llamar.
 *
 * Desde la 1.10:
 *  · Lo marcado vive en una CESTA guardada en el navegador (chrome.storage),
 *    no en la página: se puede marcar en la página 1, pasar a la 2, abrir un
 *    anuncio, volver, cambiar de pestaña o de portal, y la cesta sigue ahí.
 *    Antes, cambiar de página perdía todo lo marcado.
 *  · Cada anuncio de la cesta lleva su NOTA y su PRIORIDAD (el orden de la
 *    lista, con ▲▼). Las dos viajan al CRM: la nota queda en el anuncio y el
 *    orden es el de la cola de llamadas.
 *  · Lo que YA está en la ficha del cliente elegido sale como "✓ En ficha",
 *    preguntándoselo al servidor (no a la memoria del navegador): vale
 *    también para lo que mandó otro compañero o se pegó a mano en el CRM.
 *  · El panel se pliega a una pastilla y recuerda cómo se dejó.
 *  · En la página de UN anuncio, el ＋ ya no se engancha al enlace
 *    "Siguiente" (que también apunta a un anuncio): el anuncio abierto se
 *    añade desde el propio panel.
 *
 * Toda la extracción va anclada a URLs y a regex de texto, NUNCA a clases CSS
 * (los portales las cambian sin avisar): si un campo no se encuentra va null y
 * el envío sigue — la URL sola ya sirve para llamar. Reenviar la misma página
 * no duplica: el servidor deduplica por la URL normalizada del anuncio.
 *
 * Autenticación (2.0): cada usuario conecta SU extensión desde el CRM
 * (/{país}/admin/extension) y las llamadas las hace el service worker
 * (background.js) con ese token — aquí no se toca ningún token. El servidor
 * aplica lo que ese usuario ve en el CRM (su cartera, sus países).
 */
(function () {
  "use strict";

  const PORTAL_ORIGIN = "https://portal.bcousinoprop.com";
  const LINKS_API = "/api/extension/portal-links";
  const CHECK_API = "/api/extension/portal-links/check";
  const CLIENTS_API = "/api/extension/clients";
  const MAX_SELECTION = 60;

  // Claves de chrome.storage.local. `smartbcLastClient`, `smartbcLastAssignee`
  // y `smartbcLeadsToken` ya existían: no se renombran para no perder lo que
  // cada navegador tiene guardado.
  const K = {
    basket: "smartbcBasket",
    collapsed: "smartbcPanelCollapsed",
    client: "smartbcLastClient",
    assignee: "smartbcLastAssignee",
    token: "smartbcLeadsToken",
  };

  // Mismos textos que LINK_STATUS_LABEL en lib/portal-links/types.ts.
  const STATUS_LABEL = {
    pending: "Por llamar",
    no_answer: "No contesta",
    callback: "Volver a llamar",
    to_visit: "Para visitar",
    discarded: "Descartado",
    converted: "Ficha creada",
  };

  const GOLD = "#c9a96e";
  const GOLD_DARK = "#8a6d1f";
  const INK = "#0a0a0a";
  const GREEN = "#0a7d4f";

  /**
   * Dónde aterriza lo que se envía: la ficha del cliente, pestaña
   * Propiedades, bloque "Enlaces de portales" (ancla #portal-links).
   */
  function fichaUrl(client) {
    const country = client && client.country === "cl" ? "cl" : "es";
    return (
      `${PORTAL_ORIGIN}/${country}/admin/clientes/${encodeURIComponent(client.id)}` +
      "?tab=properties#portal-links"
    );
  }

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

  /** Clave de un anuncio en la cesta: el mismo número en dos portales no es el mismo piso. */
  const keyOf = (portalId, ref) => `${portalId}:${ref}`;

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

  function detailRef() {
    const m = location.pathname.match(portal.detail);
    return m ? m[1] : null;
  }

  /**
   * Enlaces que apuntan a un anuncio pero NO son una tarjeta: "Siguiente" /
   * "Anterior" de la ficha, la barra fija de arriba, la paginación. Antes se
   * les ponía un ＋ encima (tapando el "Siguiente") y, peor, como ya había
   * "algo" en la página, el anuncio que se estaba mirando nunca se registraba.
   * Se reconocen por semántica (header/nav) y por su texto, no por clases.
   */
  const NAV_TEXT = /^\s*(siguiente|anterior|next|previous|prev|volver|«|»|‹|›|<|>)\s*$/i;
  function isNavAnchor(a) {
    if (a.closest("header, nav, [role='navigation']")) return true;
    const label = [
      text(a) || "",
      a.getAttribute("aria-label") || "",
      a.getAttribute("title") || "",
    ];
    return label.some((l) => l && NAV_TEXT.test(l));
  }

  /**
   * Sube desde el enlace hasta el contenedor de la tarjeta: el primer
   * ancestro que sea article/li y que tenga una foto o un precio dentro.
   * Con tope de niveles para no acabar en el <body> en un listado raro.
   *
   * En la página de un anuncio solo vale una tarjeta "de verdad" (los
   * carruseles de similares): el respaldo de "el padre del enlace" era
   * exactamente lo que acababa pegando el ＋ al botón "Siguiente".
   */
  function cardOf(anchor, strict) {
    let el = anchor;
    for (let i = 0; i < 8 && el && el !== document.body; i++) {
      el = el.parentElement;
      if (!el || el === document.body) break;
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
    if (strict) return null;
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

  /** El anuncio de la página de ficha: título del h1 y foto del og:image. */
  function readDetail(ref) {
    const h1 = document.querySelector("h1");
    const scope = (h1 && h1.closest("main, article, section")) || document.body;
    const data = readCard(scope, location.href.split("#")[0], ref);
    data.title = text(h1) || data.title;
    const og = document.querySelector('meta[property="og:image"]');
    const ogUrl = og && og.getAttribute("content");
    if (ogUrl) data.imageUrl = ogUrl;
    return data;
  }

  // ── Almacenamiento ────────────────────────────────────────────────────
  // Si la extensión se recarga, este script sigue vivo en la pestaña pero
  // pierde su contexto y chrome.storage lanza. Se avisa en vez de romperse.
  function contextLost() {
    status("La extensión se ha actualizado: recarga la página", true);
  }

  function load(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (d) => resolve(d || {}));
      } catch {
        contextLost();
        resolve({});
      }
    });
  }

  function store(obj) {
    try {
      chrome.storage.local.set(obj);
    } catch {
      contextLost();
    }
  }

  // ── Estado ────────────────────────────────────────────────────────────
  /** Tarjetas de ESTA página: ref → { container, button, data }. */
  const cards = new Map();
  /** El anuncio de la página de ficha, si la página es una ficha. */
  let pageListing = null;
  /**
   * La cesta: lo marcado en cualquier página de cualquier portal, en orden de
   * prioridad. [{ key, data, note, addedAt }]
   */
  let basket = [];
  /** url → estado en la ficha del cliente elegido (lo dice el servidor). */
  let inFicha = new Map();
  let chosenClient = null;
  let staff = [];
  /** Quién está conectado ({id, name}), según el CRM. */
  let me = null;
  let collapsed = false;
  let changingClient = false;

  const basketIndex = (key) => basket.findIndex((i) => i.key === key);
  const fichaStatusOf = (data) => (data ? inFicha.get(data.url) : undefined);
  const firstName = (c) => (c && c.name ? c.name.split(" ")[0] : "");

  function saveBasket() {
    store({ [K.basket]: basket });
  }

  function addToBasket(key, data) {
    if (basketIndex(key) >= 0) return true;
    if (basket.length >= MAX_SELECTION) {
      status(`Máximo ${MAX_SELECTION} anuncios por envío`, true);
      return false;
    }
    basket.push({ key, data, note: "", addedAt: Date.now() });
    saveBasket();
    return true;
  }

  function removeFromBasket(key) {
    const i = basketIndex(key);
    if (i < 0) return;
    basket.splice(i, 1);
    saveBasket();
  }

  function moveInBasket(key, dir) {
    const i = basketIndex(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= basket.length) return;
    [basket[i], basket[j]] = [basket[j], basket[i]];
    saveBasket();
  }

  let noteTimer = null;
  function setNote(key, note) {
    const i = basketIndex(key);
    if (i < 0) return;
    basket[i].note = note;
    // Se guarda al dejar de teclear: escribir en storage en cada tecla
    // dispara el onChanged de todas las pestañas abiertas.
    clearTimeout(noteTimer);
    noteTimer = setTimeout(saveBasket, 400);
  }

  function toggle(key, data) {
    if (basketIndex(key) >= 0) {
      removeFromBasket(key);
    } else if (chosenClient && fichaStatusOf(data)) {
      status(
        `Ya está en la ficha de ${firstName(chosenClient)} · ${STATUS_LABEL[fichaStatusOf(data)] || ""}`,
      );
      return;
    } else {
      addToBasket(key, data);
    }
    refresh();
  }

  // ── Recolección de tarjetas ───────────────────────────────────────────
  let lastHref = location.href;

  function collect() {
    // Portales que navegan sin recargar (Fotocasa): otra página, otras tarjetas.
    if (location.href !== lastHref) {
      lastHref = location.href;
      for (const entry of cards.values()) entry.button && entry.button.remove();
      cards.clear();
      pageListing = null;
    }

    const ownRef = detailRef();
    if (ownRef && (!pageListing || pageListing.ref !== ownRef)) {
      pageListing = { ref: ownRef, key: keyOf(portal.id, ownRef), data: readDetail(ownRef) };
    }
    const h1 = ownRef ? document.querySelector("h1") : null;

    let added = false;
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      const m = href.match(portal.link);
      if (!m) continue;
      const ref = m[1];
      if (ref === ownRef || cards.has(ref)) continue;
      if (root && root.contains(a)) continue; // los enlaces del propio panel
      if (isNavAnchor(a)) continue;
      let absolute;
      try {
        absolute = new URL(href, location.href).toString();
      } catch {
        continue;
      }
      const container = cardOf(a, Boolean(ownRef));
      if (!container) continue;
      // En una ficha, el bloque que contiene el h1 es el anuncio abierto,
      // no una tarjeta de "similares".
      if (h1 && container.contains(h1)) continue;
      // Un mismo contenedor puede alojar dos referencias en carruseles de
      // "anuncios similares": nos quedamos con la primera.
      if (container.dataset.smartbcRef && container.dataset.smartbcRef !== ref) continue;
      container.dataset.smartbcRef = ref;
      cards.set(ref, { container, button: null, data: readCard(container, absolute, ref) });
      decorate(ref);
      added = true;
    }

    refresh();
    if (added || ownRef) scheduleCheck();
  }

  // ── Botón sobre cada tarjeta ──────────────────────────────────────────
  function decorate(ref) {
    const entry = cards.get(ref);
    if (!entry || !entry.container) return;
    const container = entry.container;
    if (container.querySelector(":scope > .smartbc-pick")) return;

    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "smartbc-pick";
    css(btn, {
      position: "absolute",
      top: "10px",
      left: "10px",
      zIndex: "9998",
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      height: "30px",
      padding: "0 11px",
      borderRadius: "999px",
      border: "1px solid rgba(10,10,10,.12)",
      font: "600 12px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      cursor: "pointer",
      boxShadow: "0 3px 10px rgba(0,0,0,.22)",
      transition: "transform .12s ease",
    });
    btn.addEventListener("mouseenter", () => (btn.style.transform = "scale(1.05)"));
    btn.addEventListener("mouseleave", () => (btn.style.transform = "none"));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle(keyOf(portal.id, ref), entry.data);
    });
    container.appendChild(btn);
    entry.button = btn;
    paint(ref);
  }

  /** Tres estados que se tienen que distinguir de un vistazo. */
  function pickLook(key, data) {
    const idx = basketIndex(key);
    const st = fichaStatusOf(data);
    if (idx >= 0) {
      return {
        label: `✓ ${idx + 1}`,
        title: `Marcado · prioridad ${idx + 1}. Clic para quitarlo de la selección.`,
        bg: GOLD,
        fg: "#fff",
        border: "#a88a52",
      };
    }
    if (st) {
      return {
        label: "✓ En ficha",
        title: `Ya está en la ficha de ${chosenClient ? chosenClient.name : "este cliente"} · ${STATUS_LABEL[st] || st}`,
        bg: "#e7f4ee",
        fg: GREEN,
        border: "rgba(10,125,79,.35)",
      };
    }
    return {
      label: "＋ Añadir",
      title: "Añadir a la selección para mandarlo a la ficha de un cliente",
      bg: "rgba(255,255,255,.97)",
      fg: INK,
      border: "rgba(10,10,10,.12)",
    };
  }

  function paint(ref) {
    const entry = cards.get(ref);
    if (!entry || !entry.button) return;
    const look = pickLook(keyOf(portal.id, ref), entry.data);
    const btn = entry.button;
    // Solo si cambia: cada escritura es una mutación del DOM de la página.
    if (btn.textContent !== look.label) btn.textContent = look.label;
    btn.title = look.title;
    btn.style.background = look.bg;
    btn.style.color = look.fg;
    btn.style.borderColor = look.border;
  }

  // ── API (por el service worker) ───────────────────────────────────────
  // Las llamadas al CRM las hace background.js: así salen con el origen de la
  // extensión (chrome-extension://<id>), que el servidor comprueba, y el token
  // nunca pasa por la página del portal.
  function api(path, options) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: "smartbc:api", path, method: (options && options.method) || "GET", body: options && options.body },
          (res) => {
            if (chrome.runtime.lastError || !res) {
              resolve({ ok: false, status: 0, data: null, error: "No se pudo hablar con la extensión" });
              return;
            }
            resolve(res);
          },
        );
      } catch {
        contextLost();
        resolve({ ok: false, status: 0, data: null, error: "La extensión se ha actualizado" });
      }
    });
  }

  function openConnect() {
    try {
      chrome.runtime.sendMessage({ type: "smartbc:openConnect" });
    } catch {
      contextLost();
    }
  }

  /** Sin conexión, o la sesión se cerró desde el CRM: se ofrece reconectar. */
  function askToConnect(res) {
    const msg =
      (res && res.data && res.data.error) ||
      "La extensión no está conectada con tu usuario del CRM.";
    status(msg, true, { label: "Conectar ↗", onClick: openConnect });
  }

  async function isConnected() {
    const d = await load(K.token);
    return Boolean(d[K.token]);
  }

  // ── "¿Ya está en la ficha?" ───────────────────────────────────────────
  let checkTimer = null;
  function scheduleCheck() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(checkInFicha, 500);
  }

  async function checkInFicha() {
    if (!chosenClient) {
      inFicha = new Map();
      refresh();
      return;
    }
    const urls = new Set();
    for (const entry of cards.values()) urls.add(entry.data.url);
    if (pageListing) urls.add(pageListing.data.url);
    for (const item of basket) urls.add(item.data.url);
    if (urls.size === 0) return;

    if (!(await isConnected())) return;
    const clientId = chosenClient.id;
    const res = await api(CHECK_API, { method: "POST", body: { clientId, urls: [...urls].slice(0, 200) } });
    if (!res.ok) return; // sin marca "en ficha": no es motivo para molestar
    // Si mientras tanto se cambió de cliente, esta respuesta ya no vale.
    if (!chosenClient || chosenClient.id !== clientId) return;
    inFicha = new Map(Object.entries((res.data && res.data.existing) || {}));
    refresh();
  }

  // ── Panel ─────────────────────────────────────────────────────────────
  function css(el, styles) {
    Object.assign(el.style, styles);
    return el;
  }

  /** h("div", {estilos}, {props}, [hijos]) — para no repetir createElement. */
  function h(tag, styles, props, children) {
    const el = document.createElement(tag);
    if (styles) css(el, styles);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
        else if (k === "text") el.textContent = v;
        else el[k] = v;
      }
    }
    for (const c of children || []) {
      if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }

  const FONT = "13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const LABEL = { fontSize: "10px", letterSpacing: ".16em", fontWeight: "700", color: "#8a8378" };
  const BTN = {
    padding: "6px 10px",
    border: "1px solid rgba(10,10,10,.18)",
    borderRadius: "8px",
    background: "#fff",
    fontSize: "12px",
    cursor: "pointer",
    color: INK,
  };
  const LINKISH = {
    border: "0",
    background: "transparent",
    padding: "0",
    color: GOLD_DARK,
    fontWeight: "600",
    fontSize: "11.5px",
    cursor: "pointer",
    textDecoration: "underline",
  };

  let root, pill, panel, statusEl;
  let clientBox, staffSelect, detailBox, basketHead, basketList, sendBtn, pageCountEl, meEl;

  function buildPanel() {
    root = h("div", {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: "2147483000",
      font: FONT,
      color: INK,
    });
    root.id = "smartbc-portal-panel";

    // Plegado: una pastilla que no tapa nada y sigue contando.
    pill = h(
      "button",
      {
        display: "none",
        alignItems: "center",
        gap: "8px",
        padding: "9px 14px",
        borderRadius: "999px",
        border: "1px solid rgba(201,169,110,.55)",
        background: "#fbf8f3",
        boxShadow: "0 10px 28px rgba(20,14,4,.28)",
        font: "600 12px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: INK,
        cursor: "pointer",
      },
      { type: "button", title: "Abrir el panel de SmartBC", on: { click: () => setCollapsed(false) } },
    );

    panel = h("div", {
      width: "320px",
      maxHeight: "calc(100vh - 36px)",
      display: "flex",
      flexDirection: "column",
      borderRadius: "14px",
      background: "#fbf8f3",
      border: "1px solid rgba(201,169,110,.45)",
      boxShadow: "0 18px 45px rgba(20,14,4,.28)",
      overflow: "hidden",
    });

    // Cabecera con el botón de plegar.
    panel.appendChild(
      h(
        "div",
        { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 6px" },
        null,
        [
          h("div", { minWidth: "0" }, null, [
            h("div", { ...LABEL, color: "#a88a52", letterSpacing: ".18em" }, { text: "SMARTBC · ENVIAR A UNA FICHA" }),
            (meEl = h("div", { fontSize: "11px", color: "#8a8378", marginTop: "2px" }, { text: "" })),
          ]),
          h(
            "button",
            { ...BTN, padding: "2px 9px", lineHeight: "1.2", fontSize: "14px" },
            {
              type: "button",
              text: "–",
              title: "Plegar (se recuerda al cambiar de página)",
              on: { click: () => setCollapsed(true) },
            },
          ),
        ],
      ),
    );

    const body = h("div", { padding: "0 14px 12px", overflowY: "auto" });
    panel.appendChild(body);

    pageCountEl = h("div", { fontSize: "11.5px", color: "#6b665e", marginBottom: "8px" });
    body.appendChild(pageCountEl);

    clientBox = h("div", { marginBottom: "8px" });
    body.appendChild(clientBox);

    staffSelect = h(
      "select",
      {
        width: "100%",
        padding: "6px 8px",
        border: "1px solid rgba(10,10,10,.18)",
        borderRadius: "8px",
        fontSize: "12px",
        background: "#fff",
      },
      { on: { change: () => store({ [K.assignee]: staffSelect.value || "" }) } },
    );
    staffSelect.appendChild(h("option", null, { value: "", text: "Sin asignar" }));
    body.appendChild(
      h("div", { marginBottom: "10px" }, null, [
        h("div", { ...LABEL, marginBottom: "4px" }, { text: "QUIÉN LOS LLAMA" }),
        staffSelect,
      ]),
    );

    detailBox = h("div");
    body.appendChild(detailBox);

    basketHead = h("div", {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "6px",
      margin: "4px 0 6px",
    });
    body.appendChild(basketHead);

    basketList = h("div", { maxHeight: "250px", overflowY: "auto", margin: "0 -4px", padding: "0 4px" });
    body.appendChild(basketList);

    sendBtn = h(
      "button",
      {
        width: "100%",
        marginTop: "10px",
        padding: "9px 10px",
        border: "0",
        borderRadius: "8px",
        background: INK,
        color: "#fbf8f3",
        fontSize: "12.5px",
        fontWeight: "600",
        cursor: "pointer",
      },
      { type: "button", on: { click: send } },
    );
    body.appendChild(sendBtn);

    statusEl = h("div", { fontSize: "11.5px", marginTop: "8px", color: GREEN });
    body.appendChild(statusEl);

    root.appendChild(pill);
    root.appendChild(panel);
    document.body.appendChild(root);
  }

  function setCollapsed(next) {
    collapsed = next;
    store({ [K.collapsed]: next });
    refresh();
  }

  /**
   * `link` (opcional): { href, label } o { onClick, label } — se pinta detrás
   * del mensaje.
   */
  function status(msg, isError, link) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#b4232a" : GREEN;
    if (link && link.onClick) {
      statusEl.appendChild(
        h(
          "button",
          {
            marginLeft: "6px",
            padding: "0",
            border: "0",
            background: "transparent",
            color: GOLD_DARK,
            fontWeight: "600",
            textDecoration: "underline",
            cursor: "pointer",
            font: "inherit",
          },
          { type: "button", text: link.label, on: { click: link.onClick } },
        ),
      );
    } else if (link && link.href) {
      statusEl.appendChild(
        h(
          "a",
          { display: "inline-block", marginLeft: "6px", color: GOLD_DARK, fontWeight: "600", textDecoration: "underline" },
          { href: link.href, target: "_blank", rel: "noopener", text: link.label },
        ),
      );
    }
  }

  // ── Cliente ───────────────────────────────────────────────────────────
  let clientInput = null;
  let clientList = null;
  let searchTimer = null;

  function renderClient() {
    clientBox.innerHTML = "";
    clientInput = null;
    clientList = null;
    if (chosenClient && !changingClient) {
      // Elegido: una línea, no un buscador con cinco filas ocupando el panel.
      clientBox.appendChild(
        h(
          "div",
          {
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "7px 9px",
            border: "1px solid rgba(201,169,110,.45)",
            borderRadius: "8px",
            background: "#fff",
          },
          null,
          [
            h(
              "span",
              { flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12.5px" },
              null,
              [h("span", { color: "#8a8378" }, { text: "Ficha: " }), h("strong", null, { text: chosenClient.name })],
            ),
            h(
              "a",
              { ...LINKISH, textDecoration: "none" },
              { href: fichaUrl(chosenClient), target: "_blank", rel: "noopener", text: "abrir ↗", title: "Abrir su ficha en SmartBC" },
            ),
            h("button", LINKISH, {
              type: "button",
              text: "cambiar",
              on: {
                click: () => {
                  changingClient = true;
                  refresh();
                  if (clientInput) clientInput.focus();
                  searchClients("");
                },
              },
            }),
          ],
        ),
      );
      return;
    }

    clientInput = h(
      "input",
      {
        width: "100%",
        boxSizing: "border-box",
        padding: "7px 9px",
        border: "1px solid rgba(10,10,10,.18)",
        borderRadius: "8px",
        fontSize: "12px",
        background: "#fff",
      },
      {
        placeholder: "Buscar cliente por nombre o teléfono…",
        on: {
          input: () => {
            clearTimeout(searchTimer);
            // El texto se lee YA: si se elige un cliente antes de que salte el
            // temporizador, el buscador ya no existe y leerlo después rompía.
            const q = clientInput.value.trim();
            searchTimer = setTimeout(() => searchClients(q), 320);
          },
          keydown: (e) => {
            if (e.key === "Escape" && chosenClient) {
              changingClient = false;
              refresh();
            }
          },
        },
      },
    );
    clientList = h("div", {
      maxHeight: "150px",
      overflowY: "auto",
      marginTop: "6px",
      display: "none",
      border: "1px solid rgba(10,10,10,.08)",
      borderRadius: "8px",
      background: "#fff",
    });
    clientBox.appendChild(clientInput);
    clientBox.appendChild(clientList);
  }

  async function searchClients(q) {
    if (!(await isConnected())) {
      askToConnect(null);
      return;
    }
    const res = await api(`${CLIENTS_API}?q=${encodeURIComponent(q)}`);
    if (res.status === 401 || res.status === 403) {
      askToConnect(res);
      return;
    }
    if (!res.ok) {
      status(res.error || "No se pudo conectar con SmartBC", true);
      return;
    }
    const body = res.data || {};
    staff = body.staff || [];
    me = body.me || null;
    if (me) meEl.textContent = me.name;
    fillStaff();
    showClients(body.clients || []);
  }

  function fillStaff() {
    if (staffSelect.options.length > 1) return;
    for (const s of staff) staffSelect.appendChild(h("option", null, { value: s.id, text: s.name }));
    load(K.assignee).then((d) => {
      // Lo último elegido manda; si nunca se eligió nada, quien está
      // conectado (lo habitual es que llame quien los marca).
      if (d[K.assignee]) staffSelect.value = d[K.assignee];
      else if (me && staff.some((s) => s.id === me.id)) staffSelect.value = me.id;
    });
  }

  function showClients(list) {
    if (!clientList) return; // con un cliente elegido el buscador está plegado
    clientList.innerHTML = "";
    if (list.length === 0) {
      clientList.style.display = "none";
      return;
    }
    for (const c of list) {
      clientList.appendChild(
        h(
          "button",
          {
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "7px 9px",
            border: "0",
            borderBottom: "1px solid rgba(10,10,10,.06)",
            background: "transparent",
            fontSize: "12px",
            cursor: "pointer",
          },
          {
            type: "button",
            text: c.phone ? `${c.name} · ${c.phone}` : c.name,
            on: { click: () => chooseClient(c) },
          },
        ),
      );
    }
    clientList.style.display = "block";
  }

  function chooseClient(c) {
    clearTimeout(searchTimer);
    chosenClient = c;
    changingClient = false;
    store({ [K.client]: c });
    inFicha = new Map();
    status("");
    refresh();
    scheduleCheck();
  }

  // ── Anuncio de la página de ficha ─────────────────────────────────────
  function renderDetail() {
    detailBox.innerHTML = "";
    if (!pageListing) return;
    const { key, data } = pageListing;
    const look = pickLook(key, data);
    detailBox.appendChild(
      h(
        "div",
        {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px",
          marginBottom: "10px",
          border: "1px solid rgba(201,169,110,.45)",
          borderRadius: "10px",
          background: "#fff",
        },
        null,
        [
          thumb(data),
          h("div", { flex: "1", minWidth: "0" }, null, [
            h("div", { ...LABEL, fontSize: "9.5px", marginBottom: "2px" }, { text: "ESTE ANUNCIO" }),
            h(
              "div",
              { fontSize: "12px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
              { text: data.title || "Anuncio", title: data.title || "" },
            ),
            data.priceLabel ? h("div", { fontSize: "11.5px", color: "#6b665e" }, { text: data.priceLabel }) : null,
          ]),
          h(
            "button",
            {
              ...BTN,
              padding: "7px 10px",
              fontWeight: "600",
              background: look.bg,
              color: look.fg,
              borderColor: look.border,
              whiteSpace: "nowrap",
            },
            { type: "button", text: look.label, title: look.title, on: { click: () => toggle(key, data) } },
          ),
        ],
      ),
    );
  }

  function thumb(data) {
    const box = {
      width: "44px",
      height: "34px",
      flex: "0 0 auto",
      borderRadius: "6px",
      background: "#eee8dc",
      objectFit: "cover",
    };
    if (!data.imageUrl) return h("div", box);
    return h("img", box, { src: data.imageUrl, alt: "", referrerPolicy: "no-referrer", loading: "lazy" });
  }

  // ── La cesta ──────────────────────────────────────────────────────────
  function renderBasket() {
    basketHead.innerHTML = "";
    basketList.innerHTML = "";

    const pageKeys = [...cards.keys()].map((ref) => keyOf(portal.id, ref));
    const allPageMarked = pageKeys.length > 0 && pageKeys.every((k) => basketIndex(k) >= 0);

    basketHead.appendChild(h("div", LABEL, { text: `MARCADOS · ${basket.length}` }));
    const actions = h("div", { display: "flex", gap: "10px" });
    if (pageKeys.length > 0) {
      actions.appendChild(
        h("button", LINKISH, {
          type: "button",
          text: allPageMarked ? "Quitar los de esta página" : "Marcar toda la página",
          title: allPageMarked
            ? "Quita de la selección los anuncios de esta página"
            : "Añade los anuncios de esta página que aún no están en la ficha",
          on: { click: () => markPage(!allPageMarked) },
        }),
      );
    }
    if (basket.length > 0) {
      actions.appendChild(
        h("button", { ...LINKISH, color: "#8a8378" }, {
          type: "button",
          text: "Vaciar",
          on: {
            click: () => {
              if (!window.confirm(`¿Quitar los ${basket.length} anuncios marcados?`)) return;
              basket = [];
              saveBasket();
              refresh();
            },
          },
        }),
      );
    }
    basketHead.appendChild(actions);

    if (basket.length === 0) {
      basketList.appendChild(
        h(
          "div",
          {
            padding: "10px",
            border: "1px dashed rgba(201,169,110,.45)",
            borderRadius: "10px",
            fontSize: "11.5px",
            color: "#6b665e",
            textAlign: "center",
          },
          { text: "Pulsa «＋ Añadir» en los anuncios que quieras mandar. Lo marcado se guarda aunque cambies de página." },
        ),
      );
      return;
    }

    basket.forEach((item, i) => basketList.appendChild(basketRow(item, i)));
  }

  function basketRow(item, i) {
    const st = fichaStatusOf(item.data);
    const arrow = (label, dir, disabled) =>
      h(
        "button",
        {
          border: "0",
          background: "transparent",
          padding: "0 3px",
          fontSize: "11px",
          lineHeight: "1",
          color: disabled ? "#d6d1c7" : "#6b665e",
          cursor: disabled ? "default" : "pointer",
        },
        {
          type: "button",
          text: label,
          disabled,
          title: dir < 0 ? "Subir prioridad" : "Bajar prioridad",
          on: {
            click: () => {
              moveInBasket(item.key, dir);
              refresh();
            },
          },
        },
      );

    const note = h(
      "textarea",
      {
        width: "100%",
        boxSizing: "border-box",
        marginTop: "5px",
        padding: "5px 7px",
        border: "1px solid rgba(10,10,10,.12)",
        borderRadius: "6px",
        fontSize: "11.5px",
        lineHeight: "1.35",
        resize: "vertical",
        minHeight: "28px",
        background: "#fffdf9",
        fontFamily: "inherit",
      },
      {
        rows: 1,
        placeholder: "Añadir nota…",
        title: "Lo que hay que saber al llamar (p. ej. «solo WhatsApp», «negociable»). Llega al CRM con el anuncio.",
        value: item.note || "",
        on: { input: (e) => setNote(item.key, e.target.value) },
      },
    );

    const meta = [item.data.priceLabel, portalName(item.key)].filter(Boolean).join(" · ");

    return h(
      "div",
      { display: "flex", gap: "6px", padding: "7px 0", borderBottom: "1px solid rgba(10,10,10,.07)" },
      null,
      [
        h(
          "div",
          { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", width: "18px", paddingTop: "2px" },
          null,
          [
            arrow("▲", -1, i === 0),
            h("div", { fontSize: "11px", fontWeight: "700", color: GOLD_DARK }, { text: String(i + 1) }),
            arrow("▼", 1, i === basket.length - 1),
          ],
        ),
        thumb(item.data),
        h("div", { flex: "1", minWidth: "0" }, null, [
          h("div", { display: "flex", alignItems: "flex-start", gap: "4px" }, null, [
            h(
              "a",
              {
                flex: "1",
                minWidth: "0",
                fontSize: "12px",
                fontWeight: "600",
                color: INK,
                textDecoration: "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
              {
                href: item.data.url,
                target: "_blank",
                rel: "noopener",
                text: item.data.title || item.data.url.replace(/^https?:\/\//, ""),
                title: item.data.title || item.data.url,
              },
            ),
            h(
              "button",
              { border: "0", background: "transparent", padding: "0 2px", color: "#8a8378", cursor: "pointer", fontSize: "13px", lineHeight: "1" },
              {
                type: "button",
                text: "✕",
                title: "Quitar de la selección",
                on: {
                  click: () => {
                    removeFromBasket(item.key);
                    refresh();
                  },
                },
              },
            ),
          ]),
          h("div", { fontSize: "11px", color: "#6b665e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, null, [
            meta,
            st ? h("span", { color: GREEN, fontWeight: "600" }, { text: ` · ya en ficha (${STATUS_LABEL[st] || st})` }) : null,
          ]),
          note,
        ]),
      ],
    );
  }

  function portalName(key) {
    const id = key.split(":")[0];
    return { idealista: "Idealista", fotocasa: "Fotocasa", habitaclia: "Habitaclia", pisos: "pisos.com" }[id] || id;
  }

  function markPage(on) {
    if (on) {
      for (const [ref, entry] of cards) {
        // Lo que ya está en la ficha no se vuelve a marcar: el servidor lo
        // saltaría de todas formas y solo ensucia la cesta.
        if (fichaStatusOf(entry.data)) continue;
        if (!addToBasket(keyOf(portal.id, ref), entry.data)) break;
      }
    } else {
      const pageKeys = new Set([...cards.keys()].map((ref) => keyOf(portal.id, ref)));
      basket = basket.filter((i) => !pageKeys.has(i.key));
      saveBasket();
    }
    refresh();
  }

  // ── Pintado general ───────────────────────────────────────────────────
  function refresh() {
    if (!root) return;
    for (const ref of cards.keys()) paint(ref);

    pill.style.display = collapsed ? "inline-flex" : "none";
    panel.style.display = collapsed ? "none" : "flex";
    pill.textContent = "";
    pill.appendChild(h("span", { color: "#a88a52", letterSpacing: ".12em", fontSize: "10.5px" }, { text: "SMARTBC" }));
    pill.appendChild(
      h("span", null, {
        text: basket.length
          ? `${basket.length} marcado${basket.length > 1 ? "s" : ""}${chosenClient ? ` → ${firstName(chosenClient)}` : ""}`
          : "Enviar a una ficha",
      }),
    );
    pill.appendChild(h("span", { color: "#8a8378" }, { text: "▴" }));
    if (collapsed) return;

    const pageMarked = [...cards.keys()].filter((ref) => basketIndex(keyOf(portal.id, ref)) >= 0).length;
    const pageInFicha = [...cards.values()].filter((e) => fichaStatusOf(e.data)).length;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    pageCountEl.textContent = cards.size
      ? `${plural(cards.size, "anuncio", "anuncios")} en esta página · ${plural(pageMarked, "marcado", "marcados")}` +
        (pageInFicha ? ` · ${pageInFicha} ya en la ficha` : "")
      : pageListing
        ? "Estás en la página de un anuncio"
        : "No se han reconocido anuncios en esta página";

    // El buscador de clientes se rehace solo si cambia de modo: rehacerlo en
    // cada refresco borraría lo que se está escribiendo.
    const mode = chosenClient && !changingClient ? `c:${chosenClient.id}` : "search";
    if (clientBox.dataset.mode !== mode) {
      clientBox.dataset.mode = mode;
      renderClient();
    }

    renderDetail();

    // Igual con la cesta: si se está ESCRIBIENDO una nota no se rehace (se
    // perdería el cursor); la próxima acción la repinta. Solo cuenta un campo
    // de texto: con el foco en un ▲▼ la lista tiene que reordenarse ya.
    const ae = document.activeElement;
    const typing = ae && basketList.contains(ae) && (ae.tagName === "TEXTAREA" || ae.tagName === "INPUT");
    if (!typing) renderBasket();

    const n = basket.length;
    sendBtn.textContent = chosenClient
      ? `Enviar ${n} a ${firstName(chosenClient)}`
      : n
        ? `Elige un cliente para enviar ${n}`
        : "Enviar";
    sendBtn.disabled = n === 0 || !chosenClient;
    sendBtn.style.opacity = sendBtn.disabled ? ".45" : "1";
    sendBtn.style.cursor = sendBtn.disabled ? "default" : "pointer";
  }

  // ── Envío ─────────────────────────────────────────────────────────────
  async function send() {
    if (!chosenClient || basket.length === 0) return;
    if (!(await isConnected())) {
      askToConnect(null);
      return;
    }

    // Lo que se esté escribiendo en una nota entra en este envío.
    clearTimeout(noteTimer);

    // El orden de la cesta ES la prioridad: el servidor los pone en la cola
    // de llamadas en este orden.
    const items = basket.slice(0, MAX_SELECTION);
    const links = items.map((i) => ({ ...i.data, notes: (i.note || "").trim() || null }));

    sendBtn.disabled = true;
    status("Enviando…");
    try {
      const res = await api(LINKS_API, {
        method: "POST",
        body: { clientId: chosenClient.id, assignedTo: staffSelect.value || null, links },
      });
      if (res.status === 401) {
        askToConnect(res);
        return;
      }
      const body = res.data || {};
      if (!res.ok) {
        status(body.error || res.error || `Error ${res.status}`, true);
        return;
      }
      store({ [K.assignee]: staffSelect.value || "" });

      // Lo enviado sale de la cesta; lo que no cupo en este envío se queda.
      const sent = new Set(items.map((i) => i.key));
      basket = basket.filter((i) => !sent.has(i.key));
      saveBasket();

      const parts = [`${body.inserted} enviado${body.inserted === 1 ? "" : "s"}`];
      if (body.skipped) parts.push(`${body.skipped} ya estaban (su nota no se ha cambiado)`);
      status(`✓ ${parts.join(" · ")} → ${chosenClient.name}`, false, {
        href: fichaUrl(chosenClient),
        label: "Ver en su ficha ↗",
      });
      checkInFicha();
    } catch {
      status("No se pudo conectar con SmartBC", true);
    } finally {
      // El foco puede seguir en una nota de una fila que ya no existe.
      if (document.activeElement && basketList.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      refresh();
    }
  }

  // ── Arranque ──────────────────────────────────────────────────────────
  async function boot() {
    buildPanel();
    const saved = await load([K.basket, K.collapsed, K.client]);
    basket = Array.isArray(saved[K.basket]) ? saved[K.basket] : [];
    collapsed = saved[K.collapsed] === true;
    // El cliente elegido la última vez ahorra volver a buscarlo entre página
    // y página del listado.
    chosenClient = saved[K.client] || null;

    collect();
    searchClients("");

    // Otra pestaña (u otro portal) cambió la cesta, el cliente o el plegado:
    // se refleja aquí sin recargar.
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        let dirty = false;
        // Se acaba de conectar (o desconectar) en otra pestaña: se vuelve a
        // preguntar quién es y qué clientes ve, sin recargar el portal.
        if (changes[K.token]) {
          me = null;
          if (meEl) meEl.textContent = "";
          status("");
          searchClients("");
        }
        if (changes[K.basket]) {
          const next = changes[K.basket].newValue || [];
          if (JSON.stringify(next) !== JSON.stringify(basket)) {
            basket = next;
            dirty = true;
          }
        }
        if (changes[K.collapsed] && changes[K.collapsed].newValue !== collapsed) {
          collapsed = changes[K.collapsed].newValue === true;
          dirty = true;
        }
        if (changes[K.client]) {
          const next = changes[K.client].newValue || null;
          if ((next && next.id) !== (chosenClient && chosenClient.id)) {
            chosenClient = next;
            changingClient = false;
            inFicha = new Map();
            scheduleCheck();
            dirty = true;
          }
        }
        if (dirty) refresh();
      });
    } catch {
      /* contexto perdido: el resto sigue funcionando en esta página */
    }

    // Los listados cargan tarjetas al hacer scroll y algunos portales navegan
    // sin recargar: se vuelve a recolectar cuando el DOM cambia, con freno.
    let pending = null;
    // Los cambios del propio panel y de los botones ＋ no cuentan: si contaran,
    // repintar un botón dispararía otra recolección, y así cada 400 ms.
    const ours = (n) =>
      n && n.nodeType === 1 && (n === root || (n.classList && n.classList.contains("smartbc-pick")));
    const insideOurs = (n) => {
      const el = n && (n.nodeType === 1 ? n : n.parentElement);
      return Boolean(el && (root.contains(el) || el.closest(".smartbc-pick")));
    };
    const obs = new MutationObserver((mutations) => {
      const foreign = mutations.some(
        (m) =>
          !insideOurs(m.target) &&
          ([...m.addedNodes].some((n) => !ours(n)) || [...m.removedNodes].some((n) => !ours(n))),
      );
      if (!foreign && location.href === lastHref) return;
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
