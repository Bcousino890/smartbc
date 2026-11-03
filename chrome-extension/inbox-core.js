// ============================================================================
// Núcleo del inbox de Idealista (2026-11-03).
//
// Código PURO (sin DOM): lo usa inbox-leads.js y lo prueba
// `npm run test:extension-inbox`. Resuelve dos cosas que se hacían mal:
//
//  · Teléfonos. Un contacto puede tener uno en la ficha del panel y otro
//    escrito en su mensaje (Idealista convierte ese en enlace con
//    appcallback_target_phone). Antes se guardaba el primero que se
//    encontraba —el del mensaje— y el de la ficha se perdía. Ahora el de la
//    ficha va primero y los demás se guardan como extras.
//  · Consultas. Un hilo puede traer varios anuncios (uno por consulta, en
//    orden cronológico). El principal tiene que ser el de la consulta MÁS
//    RECIENTE (la última tarjeta del hilo), no el primero.
// ============================================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SmartbcInboxCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MAX_EXTRA_PHONES = 4;

  const digitsOf = (s) => String(s || "").replace(/\D/g, "");

  /** Dos teléfonos son el mismo si coinciden sus últimos 9 dígitos. */
  function samePhone(a, b) {
    const da = digitsOf(a);
    const db = digitsOf(b);
    if (!da || !db) return false;
    if (da.length >= 9 && db.length >= 9) return da.slice(-9) === db.slice(-9);
    return da === db;
  }

  // Internacional con prefijo (+33 6 80…, 0033…) o nacional de 9 cifras que
  // empieza por 6-9 (685 27 86 59). No casa con precios ("3.500 €"), códigos
  // de anuncio (empiezan por 1) ni fechas.
  const PHONE_IN_TEXT_RE =
    /(?<![\d.,])((?:\+|00)\s?\d{1,3}(?:[\s.-]?\d){8,11}|[6-9]\d{2}(?:[\s.-]?\d{2,3}){2,3})(?![\d])(?!\s?€)/g;

  /** Teléfonos escritos en un texto libre (el mensaje del contacto). */
  function phonesFromText(text) {
    const out = [];
    const src = String(text || "");
    for (const m of src.matchAll(PHONE_IN_TEXT_RE)) {
      const phone = m[1].replace(/\s+/g, " ").trim();
      const len = digitsOf(phone).length;
      if (len < 9 || len > 15) continue;
      out.push(phone);
    }
    return out;
  }

  /**
   * Junta los teléfonos de un contacto. `panel` (la ficha), `attr` (los
   * enlaces appcallback_target_phone) y `text` (el mensaje), por ese orden de
   * fiabilidad. Devuelve el principal y los extras, sin repetidos.
   */
  function collectPhones({ panel = [], attr = [], text = "" } = {}) {
    const all = [];
    for (const p of [...panel, ...attr, ...phonesFromText(text)]) {
      const clean = String(p || "").replace(/\s+/g, " ").trim();
      if (digitsOf(clean).length < 8) continue;
      if (all.some((q) => samePhone(q, clean))) continue;
      all.push(clean);
    }
    return { phone: all[0] || null, extraPhones: all.slice(1, 1 + MAX_EXTRA_PHONES) };
  }

  /**
   * Quita tarjetas repetidas (misma propiedad preguntada varias veces),
   * quedándose con la primera aparición —su fecha es la de la primera
   * consulta—, y señala cuál es la consulta más reciente: la de la ÚLTIMA
   * tarjeta del hilo, aunque su propiedad ya hubiera salido antes.
   */
  function dedupeCards(cards) {
    const seen = new Map();
    const unique = [];
    let latestKey = null;
    for (const c of cards) {
      const key = c.title || c.imageUrl;
      if (!key) continue;
      latestKey = key;
      if (seen.has(key)) continue;
      seen.set(key, unique.length);
      unique.push(c);
    }
    return { unique, latestIndex: latestKey === null ? -1 : seen.get(latestKey) };
  }

  /** Código del anuncio dentro de un enlace «/inmueble/<id>/». */
  function codeFromHref(href) {
    const m = String(href || "").match(/\/inmueble\/(\d{6,})/);
    return m ? m[1] : null;
  }

  return { digitsOf, samePhone, phonesFromText, collectPhones, dedupeCards, codeFromHref };
});
