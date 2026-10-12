// ============================================================================
// Núcleo de los filtros extra de SmartBC para listados de portales (2026-10-12).
//
// Código PURO (sin DOM): lo usan idealista-filters.js y fotocasa-filters.js y
// lo prueba `npm run test:extension-filters`. Cada portal le pasa lo que lee
// de una tarjeta ("raw") y él devuelve qué datos extrae (`extract`) y si la
// tarjeta cumple lo marcado (`passes`).
//
// ⚠️ Lo que viene del TEXTO de la tarjeta (situación de la vivienda, mascotas,
// lujo, accesible, ayuda pública, estancia) es una DEDUCCIÓN: se busca en el
// título y en el trozo de descripción que enseña el listado, no en un dato
// del portal. Que no salga no quiere decir que no lo tenga. Lo que viene de
// iconos o etiquetas de la tarjeta (plano, vídeo, 3D, precio rebajado) y de sus
// números (habitaciones, baños) es fiable.
// ============================================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SmartbcFiltersCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** Minúsculas y sin tildes: "Nuda propiedad" → "nuda propiedad". */
  const plain = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const has = (t, re) => re.test(t);
  /** Cierto si el patrón aparece y NO va precedido de una negación cercana. */
  function affirmed(t, re, neg) {
    const m = re.exec(t);
    if (!m) return false;
    if (!neg) return true;
    const before = t.slice(Math.max(0, m.index - 24), m.index + m[0].length);
    return !neg.test(before);
  }

  // ── Qué se saca de una tarjeta ──────────────────────────────────────────
  /**
   * raw = { title, details, description, text, operation?, badges? }
   *   details:  "3 hab. | 90 m² | 2ª planta exterior con ascensor" (lo del listado)
   *   badges:   { plan, video, tour3d, priceDrop, luxury } booleanos que el
   *             adaptador lee de iconos/etiquetas (no del texto libre).
   */
  function extract(raw) {
    const title = plain(raw.title);
    const details = plain(raw.details);
    const desc = plain(raw.description);
    const all = plain([raw.title, raw.details, raw.description, raw.text].filter(Boolean).join(" | "));
    const badges = raw.badges || {};
    const op = raw.operation === "rent" || raw.operation === "sale" ? raw.operation : null;

    // Habitaciones: 0 = estudio. null = el listado no lo dice.
    let rooms = null;
    const rm = (details + " | " + title).match(/(\d+)\s*(?:hab\b|habs?\b|habitacion|dorm|bed\b|bedroom)/);
    if (rm) rooms = Number(rm[1]);
    else if (/\bestudio\b|\bstudio\b|sin habitacion|0 hab/.test(title + " | " + details)) rooms = 0;
    if (/\bestudio\b|\bstudio\b/.test(title) && rooms === null) rooms = 0;

    const bm = (details + " | " + all).match(/(\d+)\s*(?:banos?|bath)/);
    const baths = bm ? Number(bm[1]) : null;

    // Situación de la vivienda (solo tiene sentido en venta).
    const situation = [];
    if (affirmed(all, /nuda propiedad|bare ownership/, /\b(?:sin|no)\s/)) situation.push("nuda");
    if (affirmed(all, /inquilin|alquilad[ao]|arrendad[ao]|tenanted/, /\b(?:sin|libre de|no hay|no tiene|no)\s/)) situation.push("inquilino");
    if (affirmed(all, /ocupad[ao]|okupa|ocupacion ilegal|illegally occupied/, /\b(?:no esta|sin|no)\s|desocupad/)) situation.push("ocupada");
    if (affirmed(all, /subasta/, /\b(?:sin|no)\s/)) situation.push("subasta");
    if (situation.length === 0) situation.push("libre");

    // Estancia en alquiler: corta (temporada) o larga.
    let stay = null;
    if (op !== "sale") {
      if (/temporada|corta estancia|estancia corta|temporal\b|vacacional|short.?term/.test(all)) stay = "corta";
      else stay = "larga";
    }

    const perks = [];
    if (affirmed(all, /admite(?:n)? mascotas|se admiten mascotas|mascotas (?:permitidas|bienvenidas|admitidas)|pet.?friendly|pets? allowed/, /\bno\s+(?:se\s+)?admite|\bsin\s/)) perks.push("mascotas");
    if (badges.luxury || /vivienda de lujo|de lujo|luxury|lujosa/.test(all)) perks.push("lujo");
    if (/accesible|movilidad reducida|sin barreras|apta? para pmr|adaptad[ao] a pmr/.test(all)) perks.push("accesible");

    const media = [];
    if (badges.plan || (badges.plan === undefined && /\bplano\b|floor ?plan/.test(plain(raw.text)))) media.push("plan");
    if (badges.video) media.push("video");
    if (badges.tour3d) media.push("tour3d");

    const priceDrop = !!badges.priceDrop || /precio rebajado|bajada de precio|rebajad[ao]|price drop|reduced price/.test(all);
    const aid = /ayuda publica|ayudas? publicas?|bono joven|aval ico|aval del ico|public aid/.test(all);

    return { rooms, baths, situation, stay, perks, media, priceDrop, aid, operation: op };
  }

  // ── Qué está marcado ────────────────────────────────────────────────────
  const emptyState = () => ({
    rooms: [], // "0" (estudio), "1", "2", "3", "4" (= 4 o más)
    baths: [], // "1", "2", "3" (= 3 o más)
    situation: [], // nuda | inquilino | ocupada | subasta | libre
    stay: [], // corta | larga
    perks: [], // mascotas | lujo | accesible  (deben cumplirse TODAS)
    media: [], // plan | video | tour3d        (deben cumplirse TODAS)
    priceDrop: false,
    aid: false,
    only: [], // agencias: SOLO estas (se escribe parte del nombre)
  });

  const strList = (v, allowed) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && (!allowed || allowed.includes(x))) : []);

  function sanitize(s) {
    const e = emptyState();
    if (!s || typeof s !== "object") return e;
    e.rooms = strList(s.rooms, ["0", "1", "2", "3", "4"]);
    e.baths = strList(s.baths, ["1", "2", "3"]);
    e.situation = strList(s.situation, ["nuda", "inquilino", "ocupada", "subasta", "libre"]);
    e.stay = strList(s.stay, ["corta", "larga"]);
    e.perks = strList(s.perks, ["mascotas", "lujo", "accesible"]);
    e.media = strList(s.media, ["plan", "video", "tour3d"]);
    e.priceDrop = s.priceDrop === true;
    e.aid = s.aid === true;
    e.only = strList(s.only);
    return e;
  }

  /** ¿Hay algún filtro de este módulo marcado? */
  function isActive(st) {
    return !!(st.rooms.length || st.baths.length || st.situation.length || st.stay.length || st.perks.length || st.media.length || st.priceDrop || st.aid);
  }

  /**
   * ¿La tarjeta cumple lo marcado? `scope` limita a los filtros que este
   * portal NO trae de serie (los demás se dejan al propio portal).
   * Un dato desconocido no descarta: "no lo dice" ≠ "no lo tiene" (salvo en
   * las casillas de iconos/etiquetas, que sí son fiables).
   */
  function passes(f, st) {
    if (st.rooms.length) {
      if (f.rooms === null) return false;
      const ok = st.rooms.some((r) => (r === "4" ? f.rooms >= 4 : f.rooms === Number(r)));
      if (!ok) return false;
    }
    if (st.baths.length) {
      if (f.baths === null) return false;
      const ok = st.baths.some((b) => (b === "3" ? f.baths >= 3 : f.baths === Number(b)));
      if (!ok) return false;
    }
    if (st.situation.length && f.operation !== "rent") {
      if (!st.situation.some((x) => f.situation.includes(x))) return false;
    }
    if (st.stay.length && f.stay !== null) {
      if (!st.stay.includes(f.stay)) return false;
    }
    if (st.perks.length && !st.perks.every((p) => f.perks.includes(p))) return false;
    if (st.media.length && !st.media.every((m) => f.media.includes(m))) return false;
    if (st.priceDrop && !f.priceDrop) return false;
    if (st.aid && !f.aid) return false;
    return true;
  }

  /** Agencias: ¿pasa por las listas de ocultar (`hide`) y de "solo estas" (`only`)? */
  function agencyPasses(agencyKey, hide, only) {
    if (!agencyKey) return only.length === 0; // sin agencia = particular: no entra si piden "solo estas agencias"
    if (hide.some((t) => t && agencyKey.includes(t))) return false;
    if (only.length && !only.some((t) => t && agencyKey.includes(t))) return false;
    return true;
  }

  return { plain, extract, emptyState, sanitize, isActive, passes, agencyPasses };
});
