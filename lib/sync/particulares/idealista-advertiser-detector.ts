import { ProxyAgent } from "undici";

export type AdvertiserType = "particular" | "professional" | "unknown";

export type AdvertiserCheckResult = {
  advertiser_type: AdvertiserType;
  is_ad_professional: boolean | null;
  phone?: string | null;
  phone_confidence?: "high" | "medium" | "low" | null;
  contact_name?: string | null;
  error?: string;
};

// Normaliza un teléfono español a formato canónico +34XXXXXXXXX.
// Limpia espacios, guiones, paréntesis y puntos, y acepta las variantes:
//   +34XXXXXXXXX · 34XXXXXXXXX · 0034XXXXXXXXX · XXXXXXXXX
// donde XXXXXXXXX son 9 dígitos que empiezan por 6/7/8/9 (móvil o fijo).
// Cualquier otra cosa (referencias de anuncio, códigos, etc.) → null.
// SIEMPRE devuelve +34XXXXXXXXX — la BD guarda un único formato.
export function normalizeSpanishPhone(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  // Strip spaces, hyphens, parens, dots, forward slashes, middle-dots (·),
  // en/em dashes, asterisks — all common copy-paste artifacts from web pages.
  const cleaned = raw.replace(/[\s\-()./·–—*]/g, "");

  let national: string | null = null;
  if (/^\+34[6789]\d{8}$/.test(cleaned)) {
    national = cleaned.slice(3);
  } else if (/^0034[6789]\d{8}$/.test(cleaned)) {
    national = cleaned.slice(4);
  } else if (/^34[6789]\d{8}$/.test(cleaned)) {
    national = cleaned.slice(2);
  } else if (/^[6789]\d{8}$/.test(cleaned)) {
    national = cleaned;
  }

  return national ? `+34${national}` : null;
}

// Valida y normaliza un candidato a teléfono extraído del HTML.
// Devuelve el formato canónico +34XXXXXXXXX, o null si:
// - no es un teléfono español válido (normalizeSpanishPhone), o
// - sus 9 dígitos coinciden con la referencia del anuncio (excludeReference):
//   la referencia de Idealista (propertyCode/adId, 7-9 dígitos) aparece en
//   atributos/JSON con pinta de teléfono y NO es un teléfono.
function acceptPhoneCandidate(
  raw: string,
  excludeReference?: string | null,
): string | null {
  const phone = normalizeSpanishPhone(raw);
  if (!phone) return null;
  if (excludeReference && phone.slice(-9) === excludeReference) return null;
  // Descartar números NO geográficos españoles que nunca son de un anunciante
  // particular: 90x/80x (gratuitos 900/800, tarificación especial 901/902/803/
  // 806/807/905…). En las fichas de Idealista aparecen sus propios teléfonos
  // institucionales (p.ej. 900 423 525, atención al cliente) y colarían como
  // falso teléfono del particular. Los móviles (6/7) y fijos geográficos
  // (91, 93, 95, 98…) sí se aceptan.
  const national = phone.slice(-9);
  if (/^(?:90|80)/.test(national)) return null;
  return phone;
}

// Extract phone with confidence scoring
// Priority: data attributes (high) > tel: links (medium) > text patterns (low)
// Only returns HIGH or MEDIUM confidence results that pass Spanish format validation.
// LOW confidence results are discarded entirely (too many false positives).
// El teléfono devuelto viene SIEMPRE normalizado a +34XXXXXXXXX.
// `excludeReference`: referencia del anuncio (propertyCode/adId) para descartar
// candidatos que en realidad son la referencia y no un teléfono.
export function extractPhoneWithConfidence(
  html: string,
  excludeReference?: string | null,
): { phone: string | null; confidence: "high" | "medium" | "low" | null } {

  // HIGH CONFIDENCE: data attributes
  // Patrón 1: appcallback_target_phone="609808765" (sin +34, solo dígitos)
  let pm = html.match(/appcallback_target_phone="(\d{9,})"/);
  if (pm?.[1]) {
    const phone = acceptPhoneCandidate(pm[1], excludeReference);
    if (phone) {
      return { phone, confidence: "high" };
    }
  }

  // HIGH CONFIDENCE: Idealista CSS-hidden phones — el teléfono está en el HTML
  // estático pero oculto visualmente con CSS (clase hidden-contact-phones).
  // El número canónico está en href="tel:+34XXXXXXXXX" de los enlaces de llamada.
  //
  // Patrón A: clase (hidden-contact-phones-formatted-phone | *_formatted-phone)
  // con href tel:. ⚠️ Idealista alterna el separador entre guion y guion bajo:
  //   <a class="… hidden-contact-phones-formatted-phone _mobilePhone" href="tel:…">  (antiguo)
  //   <a class="… hidden-contact-phones_formatted-phone _mobilePhone" href="tel:…">  (actual)
  // Aceptamos AMBOS ([-_]) para no perder el teléfono que ya viene en el HTML.
  pm = html.match(/hidden-contact-phones[-_]formatted-phone[^>]*href=["']tel:([+\d][\d\s\-]{6,})["']/);
  if (!pm) {
    pm = html.match(/href=["']tel:([+\d][\d\s\-]{6,})["'][^>]*hidden-contact-phones[-_]formatted-phone/);
  }
  if (!pm) {
    // Variante genérica: cualquier clase que termine en `formatted-phone` (móvil
    // o fijo) enlazada a un tel:. Cubre futuros renombrados de la clase.
    pm = html.match(/formatted-phone[^>]*href=["']tel:([+\d][\d\s\-]{6,})["']/);
  }
  if (pm?.[1]) {
    const phone = acceptPhoneCandidate(pm[1], excludeReference);
    if (phone) {
      return { phone, confidence: "high" };
    }
  }

  // Patrón B: cualquier href tel: dentro del bloque #contact-phones-container
  {
    const containerMatch = html.match(/id=["']contact-phones-container["'][^]*?(?=<\/div>|<\/section>)/);
    if (containerMatch) {
      const telMatch = containerMatch[0].match(/href=["']tel:([+\d][\d\s\-]{6,})["']/);
      if (telMatch?.[1]) {
        const phone = acceptPhoneCandidate(telMatch[1], excludeReference);
        if (phone) {
          return { phone, confidence: "high" };
        }
      }
    }
  }

  // HIGH CONFIDENCE: data-phone or data-contact-phone attributes
  pm = html.match(/data-(?:contact-)?phone\s*=\s*["']([+\d][\d\s\-]{6,})["']/);
  if (pm?.[1]) {
    const phone = acceptPhoneCandidate(pm[1], excludeReference);
    if (phone) {
      return { phone, confidence: "high" };
    }
  }

  // HIGH CONFIDENCE: Idealista contactMethods JSON array.
  // Aparece en el JSON embebido de la ficha como:
  //   contactMethods: [{"type":"CHAT"},{"type":"PHONE","number":"6XXXXXXXX"}]
  // Incluso en listados marcados como "chat only" el número puede estar aquí
  // si el anunciante también aceptó ser contactado por teléfono en el pasado.
  // Buscamos el número dentro de un objeto con "type":"PHONE".
  {
    const contactMethodsPhoneRe =
      /"type"\s*:\s*"PHONE"[^}]{0,80}"number"\s*:\s*"([+\d][\d\s\-]{6,15})"/s;
    pm = html.match(contactMethodsPhoneRe);
    if (!pm?.[1]) {
      // Orden inverso: "number" puede venir antes de "type"
      const contactMethodsPhoneReAlt =
        /"number"\s*:\s*"([+\d][\d\s\-]{6,15})"[^}]{0,80}"type"\s*:\s*"PHONE"/s;
      pm = html.match(contactMethodsPhoneReAlt);
    }
    if (pm?.[1]) {
      const phone = acceptPhoneCandidate(pm[1], excludeReference);
      if (phone) {
        return { phone, confidence: "high" };
      }
    }
  }

  // HIGH CONFIDENCE: JSON data attributes with phone
  pm = html.match(/"phone"\s*:\s*"([+\d][\d\s\-]{6,15})"/);
  if (pm?.[1]) {
    const phone = acceptPhoneCandidate(pm[1], excludeReference);
    if (phone) {
      return { phone, confidence: "high" };
    }
  }

  // HIGH CONFIDENCE: Fotocasa/generic JSON phone fields (from __NEXT_DATA__ and API responses)
  const jsonPhonePatterns = [
    /"userPhone"\s*:\s*"([+\d][\d\s\-]{6,15})"/,
    /"mobilePhone"\s*:\s*"([+\d][\d\s\-]{6,15})"/,
    /"ownerPhone"\s*:\s*"([+\d][\d\s\-]{6,15})"/,
    /"phone_number"\s*:\s*"([+\d][\d\s\-]{6,15})"/,
    /"telephone"\s*:\s*"([+\d][\d\s\-]{6,15})"/,
    // Idealista-specific inline script fields
    /"phoneFormatted"\s*:\s*"([+\d][\d\s\-]{6,15})"/,
    /"formattedPhone"\s*:\s*"([+\d][\d\s\-]{6,15})"/,
    /"phoneNumberForMobileDialing"\s*:\s*"([+\d][\d\s\-]{6,15})"/,
    /"adPhoneNumber"\s*:\s*"([+\d][\d\s\-]{6,15})"/,
  ];
  for (const pattern of jsonPhonePatterns) {
    pm = html.match(pattern);
    if (pm?.[1]) {
      const phone = acceptPhoneCandidate(pm[1], excludeReference);
      if (phone) {
        return { phone, confidence: "high" };
      }
    }
  }

  // HIGH CONFIDENCE: data-ga-phone attribute (Fotocasa)
  pm = html.match(/data-ga-phone\s*=\s*["']([+\d][\d\s\-]{6,})["']/);
  if (pm?.[1]) {
    const phone = acceptPhoneCandidate(pm[1], excludeReference);
    if (phone) {
      return { phone, confidence: "high" };
    }
  }

  // MEDIUM CONFIDENCE: href="tel:" links (single or double quotes)
  pm = html.match(/href=["']tel:([+\d][\d\s\-]{6,})["']/);
  if (pm?.[1]) {
    const phone = acceptPhoneCandidate(pm[1], excludeReference);
    if (phone) {
      return { phone, confidence: "medium" };
    }
  }

  // MEDIUM CONFIDENCE: WhatsApp deeplinks (wa.me/34XXXXXXXXX or wa.me/XXXXXXXXX)
  // Idealista "chat only" listings expose the phone here instead of href=tel.
  // Variantes conocidas:
  //   https://wa.me/34XXXXXXXXX        (número con prefijo país)
  //   https://wa.me/XXXXXXXXX          (solo número nacional)
  //   https://wa.me/?phone=34XXXXXXXXX (query param, algunas versiones del portal)
  //   Versión URL-encoded: %2F en lugar de /
  pm = html.match(/wa\.me\/(?:34)?([6789]\d{8})/);
  if (pm?.[1]) {
    const phone = acceptPhoneCandidate(pm[1], excludeReference);
    if (phone) {
      return { phone, confidence: "medium" };
    }
  }
  // Variante query-param: wa.me/?phone=34XXXXXXXXX
  pm = html.match(/wa\.me\/\?phone=(?:34)?([6789]\d{8})/);
  if (pm?.[1]) {
    const phone = acceptPhoneCandidate(pm[1], excludeReference);
    if (phone) {
      return { phone, confidence: "medium" };
    }
  }
  // Variante JSON con campo whatsappUrl o whatsappLink que contiene el número
  pm = html.match(/"whatsapp(?:Url|Link|ContactUrl)?"\s*:\s*"[^"]*wa\.me\/(?:34)?([6789]\d{8})/i);
  if (pm?.[1]) {
    const phone = acceptPhoneCandidate(pm[1], excludeReference);
    if (phone) {
      return { phone, confidence: "medium" };
    }
  }

  // MEDIUM CONFIDENCE: telLink or callLink data
  pm = html.match(/(?:telLink|callLink)\s*[=:]\s*["']([+\d][\d\s\-]{6,})["']/i);
  if (pm?.[1]) {
    const phone = acceptPhoneCandidate(pm[1], excludeReference);
    if (phone) {
      return { phone, confidence: "medium" };
    }
  }

  // MEDIUM CONFIDENCE: Other script inline patterns
  const mediumPatterns = [
    /phoneNumber\s*:\s*['"]([+\d][\d\s\-]{6,15})['"]/,
    /telefono\s*:\s*['"]([+\d][\d\s\-]{6,15})['"]/i,
    /contactPhone\s*:\s*['"]([+\d][\d\s\-]{6,15})['"]/,
    // Idealista-specific data structures
    /adPhoneNumberNormalized\s*:\s*['"]([+\d][\d\s\-]{6,15})['"]/,
    /ownerPhone\s*:\s*['"]([+\d][\d\s\-]{6,15})['"]/i,
    /contactPhoneNumber\s*:\s*['"]([+\d][\d\s\-]{6,15})['"]/i,
  ];
  for (const pattern of mediumPatterns) {
    pm = html.match(pattern);
    if (pm?.[1]) {
      const phone = acceptPhoneCandidate(pm[1], excludeReference);
      if (phone) {
        return { phone, confidence: "medium" };
      }
    }
  }

  // MEDIUM CONFIDENCE: Visible text patterns in particulares listings
  // Idealista shows contact info in readable text for many particulares.
  // Patterns like "Llamar: 607-80-46-54" or "Móvil: +34 607 80 46 54" are common.
  // Only accept if it matches Spanish phone format (starts 6/7/8/9).
  const textPatterns = [
    /(?:Llamar|Teléfono|Tel\.|T\.?\s|Contacto|Móvil|Tfno\.?)\s*[:]?\s*([+\d][\d\s\-()]{8,})/i,
    /(?:El número|El teléfono|Su teléfono|Mi teléfono|Numero de contacto)\s*[:]?\s*([+\d][\d\s\-()]{8,})/i,
  ];
  for (const pattern of textPatterns) {
    pm = html.match(pattern);
    if (pm?.[1]) {
      const phone = acceptPhoneCandidate(pm[1], excludeReference);
      if (phone) {
        return { phone, confidence: "medium" };
      }
    }
  }

  // LOW CONFIDENCE patterns are intentionally not used: they produce too many
  // false positives (codes, references, timestamps). Only HIGH/MEDIUM survive.
  return { phone: null, confidence: null };
}

// Extrae la referencia del anuncio (propertyCode/adId de Idealista) del HTML.
// Sirve para que el extractor de teléfonos no confunda la referencia del
// anuncio (7-9 dígitos, p.ej. 108240299) con un teléfono real: ambos pueden
// aparecer en los mismos atributos/JSON del HTML.
function extractAdReference(html: string): string | null {
  const m =
    html.match(/"propertyCode"\s*:\s*"?(\d+)/) ||
    html.match(/adId[=:]\s*['"]?(\d+)/) ||
    html.match(/\/inmueble\/(\d+)/);
  return m?.[1] ?? null;
}

// Detecta si un anuncio de Idealista es de particular o profesional a partir
// del HTML de la ficha (obtenido con el UA de WhatsApp, que pasa DataDome).
// Idealista expone en un <script> inline `adProfessionalName: 'Nombre'`
// cuando el anunciante es una agencia/profesional, y `adProfessionalName: ''`
// (vacío) cuando es un particular. Esto reemplaza al endpoint AJAX
// `adContactInfoForDetail.ajax`, que DataDome bloquea con 403.
export function detectAdvertiserFromHtml(html: string): AdvertiserCheckResult {
  // El valor puede venir con comillas simples o dobles según la variante
  // del HTML que sirva Idealista: `adProfessionalName: 'X'` o
  // `adProfessionalName: "X"`. Capturamos ambas. Ignoramos el placeholder
  // de plantilla `adProfessionalName}}` (sin comillas, no casa).
  const m = html.match(/adProfessionalName\s*:\s*(['"])([^'"]*)\1/);

  // Extraer teléfono con puntuación de confianza, descartando candidatos que
  // coincidan con la referencia del anuncio (propertyCode/adId): Idealista la
  // expone como número de 7-9 dígitos y puede colarse como falso teléfono.
  const adReference = extractAdReference(html);
  const { phone, confidence } = extractPhoneWithConfidence(html, adReference);

  // Log: información del HTML parsing
  const advertiserType = m ? (m[2].trim().length > 0 ? "professional" : "particular") : "unknown";
  console.log(`[idealista-html-parsing] Anunciante: ${advertiserType}${m ? ` (adProfessionalName="${m[2].trim()}")` : ""}`);

  if (phone) {
    console.log(`[idealista-html-parsing] ✓ Teléfono encontrado en HTML: ${phone} (confidence=${confidence})`);
  } else {
    console.log(`[idealista-html-parsing] ✗ Sin teléfono en HTML - necesitará fallback AJAX`);
  }

  // Extraer nombre de contacto del particular. Idealista lo expone en el HTML
  // como `advertiserName: 'Beatriz'` en scripts inline, o como texto en el
  // bloque de contacto. Capturamos ambas variantes.
  let contact_name: string | null = null;
  const cn1 = html.match(/advertiserName\s*:\s*(['"])([^'"]{2,60})\1/);
  if (cn1?.[2]) {
    contact_name = cn1[2].trim();
  }
  if (!contact_name) {
    const cn2 = html.match(/"advertiserName"\s*:\s*"([^"]{2,60})"/);
    if (cn2?.[1]) contact_name = cn2[1].trim();
  }
  if (!contact_name) {
    // Fallback: nombre en el bloque de contacto visible en el HTML
    const cn3 = html.match(/class="[^"]*advertiser-name[^"]*"[^>]*>([^<]{2,60})</);
    if (cn3?.[1]) contact_name = cn3[1].trim();
  }

  if (contact_name) {
    console.log(`[idealista-html-parsing] Nombre de contacto: ${contact_name}`);
  }

  if (!m) {
    // Fotocasa: check for professional indicator in __NEXT_DATA__
    // Fotocasa uses "isProfessional" or "professional" boolean fields
    const fotocasaProfMatch =
      html.match(/"isProfessional"\s*:\s*(true|false)/i) ||
      html.match(/"professional"\s*:\s*(true|false)/i);
    if (fotocasaProfMatch) {
      const isProfessional = fotocasaProfMatch[1].toLowerCase() === "true";
      return {
        advertiser_type: isProfessional ? "professional" : "particular",
        is_ad_professional: isProfessional,
        phone,
        phone_confidence: confidence,
        contact_name,
      };
    }
    return { advertiser_type: "unknown", is_ad_professional: null, phone, phone_confidence: confidence, contact_name };
  }
  const name = m[2].trim();
  if (name.length === 0) {
    return { advertiser_type: "particular", is_ad_professional: false, phone, phone_confidence: confidence, contact_name };
  }
  return { advertiser_type: "professional", is_ad_professional: true, phone, phone_confidence: confidence, contact_name };
}

// ─── Fallback AJAX: teléfonos detrás del botón "Ver teléfono" ────────────────
// Muchos anuncios NO incluyen el teléfono en el HTML inicial: solo se revela
// al pulsar "Ver teléfono", que dispara una llamada AJAX. Este fallback llama
// a esos endpoints VÍA CURL (mismo truco que el HTML: el TLS fingerprint de
// curl + UA de WhatsApp pasa DataDome; el fetch de Node es rechazado con 403).

const WHATSAPP_UA_FOR_AJAX = "WhatsApp/2.23.20.0";
// ⚠️ DEBE coincidir EXACTAMENTE con el DEFAULT_UA de solve-datadome-with-capsolver.
// El reto DataDome (cid) queda ligado al UA con el que se hizo la petición a
// /contact-phones. CapSolver rechaza UAs < Chrome 124 y los fuerza a Chrome 131;
// si las peticiones reales usaran Chrome 120, el cid iría con Chrome 120 pero
// CapSolver resolvería con Chrome 131 → "userAgent does not match" y el slider
// nunca se resuelve. Usamos el MISMO Chrome 131 en todo el flujo.
const BROWSER_UA_FOR_PAGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Lifetime de la IP sticky del flujo de teléfono. Debe cubrir TODO el flujo con
// margen: pasada inicial + regenerar reto + CapSolver (hasta ~60s resolviendo) +
// reintento de contact-phones. Si la IP rota mientras CapSolver resuelve, éste
// carga el captcha desde una IP distinta a la del cid → "proxy ip has been
// blocked". 2 min se quedaba corto; 5 min da margen de sobra.
const PHONE_STICKY_LIFETIME_MIN = 5;

function idealistaPhoneEndpoints(adId: string): string[] {
  return [
    // Variante actual (REST): /es/ajax/ads/{id}/contact-phone-numbers
    `https://www.idealista.com/es/ajax/ads/${adId}/contact-phone-numbers`,
    `https://www.idealista.com/es/ajax/ads/${adId}/contact-phones`,
    // Endpoint de contacto completo (incluye contactMethods con números de
    // listados "chat only" que también tienen teléfono registrado).
    `https://www.idealista.com/es/ajax/ads/${adId}/contact`,
    // Variante móvil: históricamente la más permisiva.
    `https://www.idealista.com/ajax/listingController/adContactInfoForMobileDevices.ajax?adId=${adId}`,
    // Variante desktop (la que dispara "Ver teléfono" en la web).
    `https://www.idealista.com/ajax/listingController/adContactInfoForDetail.ajax?adId=${adId}`,
  ];
}

export type AjaxPhoneResult = {
  phone: string | null;
  phone_confidence: "high" | null;
  contact_name: string | null;
  // Diagnóstico (solo se rellena en modo debug): qué devolvió cada endpoint.
  debug?: Array<{ endpoint: string; status: number; bodySnippet: string }>;
};

// ─── Reto DataDome: extraer la URL del captcha RESOLUBLE (t=fe) ───────────────
// Cuando un endpoint AJAX (p.ej. /contact-phones) está protegido, DataDome
// devuelve HTTP 403 con el reto en el cuerpo. Hay dos formatos:
//   1) JSON: {"url":"https://geo.captcha-delivery.com/captcha/?...&t=fe&..."}
//   2) HTML interstitial con  var dd={'cid':'...','hsh':'...','t':'fe','s':N,
//      'e':'...','host':'geo.captcha-delivery.com','cookie':'...'}
// De ambos reconstruimos la URL del captcha que CapSolver necesita como
// `captchaUrl`. IMPORTANTE: solo t=fe es resoluble (slider). t=bv es bloqueo
// duro (IP baneada) y no tiene solución — lo detectamos para no gastar saldo.
export function extractDatadomeChallengeUrl(
  body: string,
): { url: string | null; type: string | null } {
  if (!body) return { url: null, type: null };

  // Formato 1: JSON {"url":"...geo.captcha-delivery.com..."}
  const jsonUrl = body.match(/"url"\s*:\s*"(https:\/\/geo\.captcha-delivery\.com\/captcha\/[^"]+)"/);
  if (jsonUrl?.[1]) {
    const url = jsonUrl[1].replace(/\\\//g, "/");
    const t = url.match(/[?&]t=([a-z]+)/)?.[1] ?? null;
    return { url, type: t };
  }

  // Formato 2: HTML interstitial con `var dd={...}`.
  const ddBlock = body.match(/var\s+dd\s*=\s*\{([^}]+)\}/);
  if (ddBlock?.[1]) {
    const dd = ddBlock[1];
    const get = (k: string) => dd.match(new RegExp(`'${k}'\\s*:\\s*'([^']*)'`))?.[1]
      ?? dd.match(new RegExp(`'${k}'\\s*:\\s*(\\d+)`))?.[1]
      ?? null;
    const cid = get("cid");
    const hsh = get("hsh");
    const t = get("t");
    const s = get("s");
    const e = get("e");
    const cookie = get("cookie");
    const host = get("host") ?? "geo.captcha-delivery.com";
    if (cid && hsh && t) {
      const url =
        `https://${host}/captcha/?initialCid=${encodeURIComponent(cid)}` +
        `&hash=${encodeURIComponent(hsh)}` +
        (cookie ? `&cid=${encodeURIComponent(cookie)}` : "") +
        `&t=${t}` +
        (s ? `&s=${s}` : "") +
        (e ? `&e=${encodeURIComponent(e)}` : "");
      return { url, type: t };
    }
  }

  return { url: null, type: null };
}

// ─── DataDome pre-auth ───────────────────────────────────────────────────────
// When the browser loads an Idealista listing, DataDome's JS snippet POSTs
// to https://dd.idealista.com/is/ with browser fingerprint data and receives:
//   {"status":200,"cookie":"datadome=VALUE; Max-Age=31536000; ..."}
// We replicate this call using curl + residential proxy. With a clean
// residential IP, DataDome often issues a valid cookie even with a minimal
// payload (no canvas/WebGL fingerprint). The returned cookie is then sent
// alongside the /contact-phones AJAX request, which validates it and returns
// the phone number — exactly what the browser does after clicking "Ver teléfono".
async function fetchDataDomeCookie(
  auth: string,
  adId: string,
  proxyUrl?: string,
): Promise<string | null> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  const proxyArgs = proxyUrl ? ["--proxytunnel", "-x", proxyUrl] : [];

  // Minimal jsData that looks like a real browser. DataDome validates this
  // fingerprint against its ML model; residential IPs score well even with
  // reduced data because they have clean behavioral history.
  const jsData = JSON.stringify({
    ttst: Math.floor(Math.random() * 800) + 200,
    ifr: false,
    cid: `${adId}-${Date.now()}`,
    tst: Date.now(),
  });

  const body = `jsData=${encodeURIComponent(jsData)}&dv=4&eventCounters=%5B%5D&cid=&dd_cid=`;

  console.log(`[datadome] POSTing to dd.idealista.com/is/ with auth=${auth.slice(0, 8)}...`);

  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-sS",
        "-X", "POST",
        "-H", "Content-Type: application/x-www-form-urlencoded",
        "-H", "Origin: https://www.idealista.com",
        "-H", `Referer: https://www.idealista.com/inmueble/${adId}/`,
        "-H", "Accept: */*",
        "-H", "Accept-Language: es-ES,es;q=0.9,en;q=0.8",
        // UA moderno y CONSISTENTE con el reintento de contact-phones y con
        // CapSolver (Chrome 131): DataDome liga la cookie al UA, y un UA viejo
        // (Chrome 120, 2023) sube la probabilidad de bloqueo duro (t=bv).
        "-A", BROWSER_UA_FOR_PAGE,
        "--data", body,
        "--max-time", "12",
        ...proxyArgs,
        `https://dd.idealista.com/is/?auth=${auth}&dv=4&d=.idealista.com&new_sign_in_process=1`,
      ],
      { maxBuffer: 64 * 1024, timeout: 17000 },
    );

    console.log(`[datadome] Response: ${stdout.slice(0, 120)}`);

    const json = JSON.parse(stdout) as { status: number; cookie?: string };
    if (json.status === 200 && json.cookie) {
      const match = json.cookie.match(/^datadome=([^;]+)/);
      if (match?.[1]) {
        const cookie = `datadome=${match[1]}`;
        console.log(`[datadome] ✓ Cookie válida obtenida (${cookie.length} chars)`);
        return cookie;
      }
    }
    console.log(`[datadome] status=${json.status}, sin cookie válida`);
    return null;
  } catch (err) {
    console.log(`[datadome] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Parser ESTRUCTURADO del JSON de los endpoints de contacto de Idealista.
 * El endpoint `adContactInfoForDetail.ajax` devuelve HTTP 200 con una envoltura
 * `{"message":null,"result":"OK","errorCode":null,"data":{...}}`. El teléfono,
 * cuando existe, vive dentro de `data` en formas variadas:
 *   - data.phone1 / data.phone2 → {"number":"...","formatted":"..."}
 *   - data.contactMethods[] → {"type":"PHONE","number":"..."}
 *   - data.phone / data.phoneNumber / data.formattedPhone (planos)
 * Los regex sueltos a veces fallan con estas estructuras anidadas; este parser
 * recorre el objeto de forma robusta. Devuelve teléfono normalizado o null.
 *
 * `excludeReference`: últimos 9 dígitos del adId, para no confundir la
 * referencia del anuncio con un teléfono.
 */
export function parseStructuredAjaxPhone(
  body: string,
  excludeReference?: string | null,
): { phone: string | null; contact_name: string | null } {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { phone: null, contact_name: null };
  }

  // Desenvuelve `data` si la respuesta viene como {result:"OK", data:{...}}.
  const root = (json as Record<string, unknown>) ?? {};
  const data = (root.data as Record<string, unknown> | undefined) ?? root;

  const tryCandidate = (raw: unknown): string | null => {
    if (typeof raw !== "string" && typeof raw !== "number") return null;
    return acceptPhoneCandidate(String(raw), excludeReference);
  };

  // 1) phone1 / phone2 anidados: {"number":"...","formatted":"..."}
  for (const key of ["phone1", "phone2"]) {
    const p = data[key] as Record<string, unknown> | undefined;
    if (p && typeof p === "object") {
      const phone = tryCandidate(p.number) ?? tryCandidate(p.formatted);
      if (phone) {
        const contact_name = extractContactName(data) ?? extractContactName(root);
        return { phone, contact_name };
      }
    }
  }

  // 2) contactMethods / phones: array de {type:"PHONE", number:"..."}
  for (const key of ["contactMethods", "phones", "contactPhones"]) {
    const arr = data[key];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && typeof item === "object") {
          const m = item as Record<string, unknown>;
          const isPhone = !m.type || String(m.type).toUpperCase().includes("PHONE");
          if (isPhone) {
            const phone = tryCandidate(m.number) ?? tryCandidate(m.formatted) ?? tryCandidate(m.value);
            if (phone) {
              const contact_name = extractContactName(data) ?? extractContactName(root);
              return { phone, contact_name };
            }
          }
        }
      }
    }
  }

  // 3) Campos planos en data (o en root como fallback).
  // Incluye los campos específicos que usa adContactInfoForDetail.ajax:
  //   formattedContactPhone1, formattedContactPhoneWithPrefix, contactPhone1
  const flatKeys = [
    "phone", "phoneNumber", "formattedPhone", "phoneNumberForMobileDialing",
    "mobilePhone", "ownerPhone", "contactPhone", "mainPhone", "displayPhone",
    "formattedContactPhone1", "formattedContactPhoneWithPrefix", "contactPhone1",
    "formattedPhone1", "phoneWithPrefix", "contactPhoneWithPrefix",
  ];
  for (const obj of [data, root]) {
    for (const key of flatKeys) {
      const phone = tryCandidate(obj[key]);
      if (phone) {
        const contact_name = extractContactName(data) ?? extractContactName(root);
        return { phone, contact_name };
      }
    }
  }

  return { phone: null, contact_name: null };
}

function extractContactName(obj: Record<string, unknown>): string | null {
  for (const key of ["contactName", "userName", "advertiserName", "name"]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim().length >= 2 && v.trim().length <= 60) {
      return v.trim();
    }
  }
  return null;
}

/**
 * Intenta obtener el teléfono de un anuncio de Idealista llamando a los
 * endpoints AJAX de contacto (los del botón "Ver teléfono").
 * Flujo de tres pasos:
 *  1. Curl + cookie-jar (WhatsApp UA, cargar página una vez para todos los endpoints)
 *  2. DataDome pre-auth: POST a dd.idealista.com → cookie DataDome → retry AJAX
 *  3. Playwright + stealth + proxy (último recurso, lento pero fiable)
 * Devuelve el teléfono normalizado a +34XXXXXXXXX (confianza high) o null.
 */
export async function fetchIdealistaPhoneViaAjax(
  adId: string,
  options?: { proxyUrl?: string; debug?: boolean },
): Promise<AjaxPhoneResult> {
  // Import dinámico para no arrastrar child_process a contextos que solo
  // usan normalizeSpanishPhone/detectAdvertiserFromHtml.
  const { fetchMultipleAjaxWithCookieJar, fetchViaCurl } = await import(
    "@/lib/sync/import-by-link/fetch-via-curl"
  );

  const pageUrl = `https://www.idealista.com/inmueble/${adId}/`;
  const debug: AjaxPhoneResult["debug"] = options?.debug ? [] : undefined;
  const endpoints = idealistaPhoneEndpoints(adId);

  // ⚠️ CRÍTICO: anclar UNA sola IP para TODO el flujo de esta búsqueda.
  // fetchMultipleAjaxWithCookieJar y las llamadas posteriores (pre-auth
  // DataDome, comment.ajax) hacen procesos `curl` SEPARADOS — cada uno es una
  // conexión nueva al proxy. Si cada conexión sale por una IP distinta,
  // DataDome rechaza con bloqueo DURO en cuanto la cookie de la IP-A llega
  // desde la IP-B.
  //
  // Proveedor: Evomi (docs.evomi.com). El ancla de sesión se hace añadiendo
  // `_session-<id>_lifetime-<min>` al PASSWORD de la URL (confirmado en su
  // documentación oficial — ver withStickySession en proxy-config.ts). El
  // sessionId NO puede ser solo el adId: si un mismo anuncio se reintenta
  // varias veces (retries del cron, o el panel de test manual), usar siempre
  // el mismo sessionId ancla SIEMPRE la misma IP — y si esa IP quedó marcada
  // por DataDome en un intento anterior, el anuncio queda "quemado" para
  // siempre. Componente aleatorio por invocación: misma IP dentro de ESTA
  // llamada, IP distinta en cada reintento.
  let phoneProxyUrl = options?.proxyUrl;
  try {
    const { getResidentialProxyUrl, withStickySession } = await import("@/lib/sync/proxy-config");
    const residential = await getResidentialProxyUrl();
    if (residential) {
      const sessionId = `${adId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      phoneProxyUrl = withStickySession(residential, sessionId, PHONE_STICKY_LIFETIME_MIN);
    }
  } catch {
    // Sin proxy residencial disponible → usar el proxy recibido tal cual.
  }

  console.log(`[idealista-phone-ajax] Iniciando búsqueda de teléfono para adId=${adId} (${endpoints.length} endpoints)`);

  // Load the page once, then try all AJAX endpoints reusing the same cookie jar.
  // IMPORTANT: use BROWSER_UA for initial page load (to get DataDome scripts + auth code)
  // but WHATSAPP_UA for AJAX endpoints (more permissive for AJAX even without full DataDome validation).
  const { results: responses, pageHtml } = await fetchMultipleAjaxWithCookieJar(
    pageUrl,
    endpoints,
    WHATSAPP_UA_FOR_AJAX,
    {
      proxyUrl: phoneProxyUrl,
      // ⚠️ La carga de página DEBE usar el UA de WhatsApp: DataDome deja pasar
      // ese UA (whitelist de previews de enlaces) y devuelve el HTML completo
      // (~175KB) con la clave DataDome (window.ddjskey) y las cookies. Con UA de
      // Chrome, DataDome responde una página de bloqueo (~773 chars) sin clave
      // ni cookies, y todo el flujo posterior (pre-auth, contact-phones) muere.
      pageUserAgent: WHATSAPP_UA_FOR_AJAX,
      timeoutSec: 30,
      ajaxHeaders: [
        "X-Requested-With: XMLHttpRequest",
        "Accept: application/json, text/javascript, */*; q=0.01",
        `Referer: ${pageUrl}`,
      ],
    },
  );

  const phonePatterns = [
    // Campos específicos de adContactInfoForDetail.ajax (Idealista actual)
    /"formattedContactPhone(?:WithPrefix)?(?:\d)?"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"contactPhone(?:WithPrefix)?(?:\d)?"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"formattedPhone(?:WithPrefix)?(?:Number)?(?:\d)?"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"phoneWithPrefix"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    // Campos genéricos
    /"phoneNumberForMobileDialing"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"nationalNumber"\s*:\s*"?([+\d][\d\s\-]{6,18})"?/,
    /"number"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"phone"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"phoneNumber"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"contactPhone"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"ownerPhone"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"mobilePhone"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"phone\d?"\s*:\s*\{[^}]{0,80}"number"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"mainPhone"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"displayPhone"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"type"\s*:\s*"PHONE"[^}]{0,80}"number"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"number"\s*:\s*"([+\d][\d\s\-]{6,18})"[^}]{0,80}"type"\s*:\s*"PHONE"/,
    /[\s,:\[]([6789]\d{8})[\s,\]"\n]/,
    /wa\.me\/(?:34)?([6789]\d{8})/,
    /wa\.me\/\?phone=(?:34)?([6789]\d{8})/,
    /phoneNumber\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /phone\s*:\s*"([+\d][\d\s\-]{6,18})"/,
  ];


  for (let i = 0; i < responses.length; i++) {
    const res = responses[i];
    const endpoint = endpoints[i];

    if (debug) {
      // Captura ampliada (2500 chars) para que el panel "Testear extracción" del
      // VPS revele la estructura completa de `data` en las respuestas 200 OK —
      // imprescindible para ver dónde viene el teléfono en adContactInfoForDetail.
      debug.push({ endpoint, status: res.status, bodySnippet: (res.body ?? "").slice(0, 8000) });
    }

    console.log(`[idealista-phone-ajax] ${endpoint.split("/").slice(-2).join("/")} → HTTP ${res.status}`);

    if (!res.ok || !res.body) continue;

    const body = res.body;

    // Paso A: parser ESTRUCTURADO del JSON (maneja la envoltura `data` y
    // estructuras anidadas phone1/phone2/contactMethods que los regex sueltos
    // a veces pierden, aunque el HTTP sea 200).
    const structured = parseStructuredAjaxPhone(body, adId.slice(-9));
    if (structured.phone) {
      console.log(`[idealista-phone-ajax] ✓ ÉXITO vía curl (parser estructurado): adId=${adId}, phone=${structured.phone}`);
      return { phone: structured.phone, phone_confidence: "high", contact_name: structured.contact_name, debug };
    }

    // Paso B: fallback a regex sobre el cuerpo crudo.
    let phone: string | null = null;
    for (const pattern of phonePatterns) {
      const m = body.match(pattern);
      if (m?.[1]) {
        phone = acceptPhoneCandidate(m[1], adId.slice(-9));
        if (phone) break;
      }
    }

    const cn = body.match(/"contactName"\s*:\s*"([^"]{2,60})"/);
    const contact_name = cn?.[1]?.trim() ?? null;

    if (phone) {
      console.log(`[idealista-phone-ajax] ✓ ÉXITO vía curl (regex): adId=${adId}, phone=${phone}`);
      return { phone, phone_confidence: "high", contact_name, debug };
    }
  }

  console.log(`[idealista-phone-ajax] ✗ Curl cookie-jar fallido (${endpoints.length} endpoints)`);

  // ─── Step 1b: extraer teléfono del HTML de la página cargada con Browser UA ──
  // El HTML de la página se cargó con BROWSER_UA_FOR_PAGE (Chrome real) para pasar
  // DataDome. Para muchos anuncios de particulares, el teléfono está en ese HTML
  // aunque no lo esté en la versión WhatsApp UA que usa el scraper principal.
  if (pageHtml) {
    const { phone: htmlPhone, confidence: htmlConf } = extractPhoneWithConfidence(pageHtml, adId.slice(-9));
    if (htmlPhone) {
      console.log(`[idealista-phone-ajax] ✓ ÉXITO vía pageHtml (Browser UA): adId=${adId}, phone=${htmlPhone}, conf=${htmlConf}`);
      const cnMatch = pageHtml.match(/(?:advertiserName|contactName)\s*:\s*['"]([^'"]{2,60})['"]/);
      if (debug) {
        debug.push({ endpoint: "pageHtml-browser-ua", status: 200, bodySnippet: `phone=${htmlPhone} conf=${htmlConf}` });
      }
      return { phone: htmlPhone, phone_confidence: "high", contact_name: cnMatch?.[1]?.trim() ?? null, debug };
    } else {
      console.log(`[idealista-phone-ajax] pageHtml (Browser UA) sin teléfono (${pageHtml.length} chars)`);
      if (debug) {
        debug.push({ endpoint: "pageHtml-browser-ua", status: 0, bodySnippet: `no phone, htmlLen=${pageHtml.length}` });
      }
    }

    // Fuente adicional: teléfono escrito por el particular en la descripción del
    // anuncio (truco habitual para saltarse el "chat only"). Se mina del mismo
    // HTML ya descargado — sin coste de request extra.
    const { extractPhoneFromText, extractPhoneFromHtmlDescription } = await import("./phone-from-text");
    const descPhone = extractPhoneFromHtmlDescription(pageHtml, adId.slice(-9));
    if (descPhone.phone) {
      console.log(`[idealista-phone-ajax] ✓ ÉXITO vía descripción: adId=${adId}, phone=${descPhone.phone}`);
      if (debug) {
        debug.push({ endpoint: "descripcion-texto", status: 200, bodySnippet: `phone=${descPhone.phone}` });
      }
      return { phone: descPhone.phone, phone_confidence: "high", contact_name: null, debug };
    }

    // Fuente adicional: el COMENTARIO del anunciante. Idealista NO lo incrusta en
    // el HTML de la ficha — lo carga aparte vía /ajax/comment.ajax (protegido por
    // DataDome). Lo pedimos con el mismo cookie-jar/proxy que ya pasó DataDome al
    // cargar la página, y minamos el texto: muchos particulares escriben ahí su
    // móvil ("interesados llamar al 6XX…") para saltarse el chat-only.
    try {
      const commentUrl = `https://www.idealista.com/ajax/comment.ajax?adId=${adId}`;
      const commentRes = await fetchViaCurl(commentUrl, BROWSER_UA_FOR_PAGE, {
        proxyUrl: phoneProxyUrl,
        allowSmallBody: true,
        timeoutSec: 15,
        headers: [
          "X-Requested-With: XMLHttpRequest",
          "Accept: application/json, text/javascript, */*; q=0.01",
          `Referer: ${pageUrl}`,
          "Accept-Language: es-ES,es;q=0.9",
        ],
      });
      if (commentRes.ok && commentRes.html) {
        const { htmlToText } = await import("./phone-from-text");
        const commentPhone = extractPhoneFromText(htmlToText(commentRes.html), adId.slice(-9));
        if (commentPhone.phone) {
          console.log(`[idealista-phone-ajax] ✓ ÉXITO vía comentario: adId=${adId}, phone=${commentPhone.phone}`);
          if (debug) {
            debug.push({ endpoint: "comment.ajax-texto", status: 200, bodySnippet: `phone=${commentPhone.phone}` });
          }
          return { phone: commentPhone.phone, phone_confidence: "high", contact_name: null, debug };
        }
        if (debug) {
          debug.push({ endpoint: "comment.ajax-texto", status: 200, bodySnippet: `sin teléfono en comentario (${commentRes.html.length} chars)` });
        }
      } else if (debug) {
        const reason = commentRes.ok ? "vacío" : commentRes.reason;
        debug.push({ endpoint: "comment.ajax-texto", status: commentRes.ok ? 0 : commentRes.status, bodySnippet: reason });
      }
    } catch (commentErr) {
      const msg = commentErr instanceof Error ? commentErr.message : String(commentErr);
      if (debug) debug.push({ endpoint: "comment.ajax-error", status: 0, bodySnippet: msg });
    }
  }

  // ─── Step 1c: resolver el reto DataDome de /contact-phones con CapSolver ─────
  // Este es el camino que DE VERDAD funciona (verificado contra Idealista):
  //   1. /contact-phones responde 403 con el reto en el cuerpo. Para el endpoint
  //      AJAX el reto es t=fe (SLIDER RESOLUBLE), a diferencia de la navegación
  //      de página completa que da t=bv (bloqueo duro irresoluble).
  //   2. Extraemos la URL del captcha (geo.captcha-delivery.com/captcha/?...t=fe)
  //      del cuerpo del 403.
  //   3. CapSolver la resuelve usando el MISMO proxy sticky (misma IP) → devuelve
  //      la cookie datadome válida para esa IP.
  //   4. Reintentamos /contact-phones con esa cookie desde la misma IP → teléfono.
  //
  // El pool de proxy residencial es COMPARTIDO: una fracción de sus IPs puede
  // estar marcada por DataDome (bloqueo duro t=bv) en un momento dado — esto
  // es esperable y confirmado por el propio proveedor (Smartproxy no garantiza
  // IPs "limpias" en un pool residencial rotativo). Por eso NO nos rendimos al
  // primer t=bv: reintentamos con una IP sticky NUEVA (barato: solo llamadas
  // curl, sin gastar CapSolver) hasta CHALLENGE_RETRIES veces antes de caer al
  // fallback de Playwright.
  // El diagnóstico proxy-health probó que solo una fracción de las IPs frescas
  // da el slider resoluble (t=fe); las demás dan bloqueo duro (t=bv). Por eso
  // reintentamos con IPs NUEVAS de verdad hasta encontrar una t=fe, y ADEMÁS
  // rotamos el país en cada intento (el proveedor soporta targeting por país):
  // la reputación ante DataDome varía mucho por pool/país, así que probar
  // varios sube la probabilidad de dar con un pool limpio. El formato del
  // modificador de país lo aplica proxy-config según el proveedor detectado.
  const { withStickySessionForce, COUNTRY_ROTATION } = await import("@/lib/sync/proxy-config");
  const CHALLENGE_RETRIES = Math.max(5, COUNTRY_ROTATION.length);
  for (let attempt = 0; attempt < CHALLENGE_RETRIES; attempt++) {
    // A partir del segundo intento, forzar una sesión NUEVA (IP nueva de
    // verdad) con un país distinto de la rotación — withStickySessionForce
    // reemplaza la sesión/país anclados aunque la URL ya traiga uno del intento
    // anterior.
    let attemptProxyUrl = phoneProxyUrl;
    if (attempt > 0 && phoneProxyUrl) {
      const retrySessionId = `${adId}-retry${attempt}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const country = COUNTRY_ROTATION[attempt % COUNTRY_ROTATION.length];
      attemptProxyUrl = withStickySessionForce(phoneProxyUrl, retrySessionId, PHONE_STICKY_LIFETIME_MIN, country);
    }

    // Reto DataDome de /contact-phones para esta IP. Estrategia GANADORA
    // (verificada en proxy-health): UA Chrome CONSISTENTE en carga de página +
    // contact-phones, compartiendo cookie-jar (la mezcla UA WhatsApp+Chrome da
    // t=bv). Por eso cargamos la ficha con Chrome y llamamos a contact-phones
    // con Chrome reutilizando el mismo jar, todo por la misma IP del intento.
    //
    // ⚠️ SIEMPRE regeneramos el reto con Chrome (BROWSER_UA_FOR_PAGE), incluso
    // en el intento 0. NO reutilizamos el reto de la pasada inicial (que usa UA
    // de WhatsApp): el cid del reto queda ligado al UA que hizo la petición, y
    // CapSolver resuelve con Chrome 131 → si el cid fuera de WhatsApp daría
    // "userAgent does not match" y el slider nunca se resolvería.
    let body403: string | null = null;
    if (!body403) {
      try {
        const cpUrl = `https://www.idealista.com/es/ajax/ads/${adId}/contact-phones`;
        const { results: cpResults } = await fetchMultipleAjaxWithCookieJar(
          pageUrl,
          [cpUrl],
          BROWSER_UA_FOR_PAGE,
          {
            proxyUrl: attemptProxyUrl,
            pageUserAgent: BROWSER_UA_FOR_PAGE, // Chrome consistente (carga + AJAX)
            timeoutSec: 25,
            ajaxHeaders: [
              "X-Requested-With: XMLHttpRequest",
              "Accept: application/json, text/javascript, */*; q=0.01",
              `Referer: ${pageUrl}`,
              "Accept-Language: es-ES,es;q=0.9",
            ],
          },
        );
        body403 = cpResults[0]?.body ?? null;
      } catch { /* seguimos */ }
    }

    const challenge = body403 ? extractDatadomeChallengeUrl(body403) : { url: null, type: null };
    console.log(`[idealista-phone-ajax] Intento ${attempt + 1}/${CHALLENGE_RETRIES} — reto DataDome: type=${challenge.type ?? "?"} url=${challenge.url ? "sí" : "no"}`);
    if (debug) {
      debug.push({ endpoint: `datadome-challenge-attempt${attempt + 1}`, status: 0, bodySnippet: `type=${challenge.type ?? "none"} url=${challenge.url ? challenge.url.slice(0, 60) : "none"}` });
    }

    if (challenge.url && challenge.type === "fe") {
      // t=fe → slider resoluble. Llamar a CapSolver con el MISMO proxy sticky
      // de este intento.
      try {
        const { solveDatadomeWithCapSolver } = await import("./solve-datadome-with-capsolver");
        console.log(`[idealista-phone-ajax] Resolviendo slider DataDome con CapSolver...`);
        const solved = await solveDatadomeWithCapSolver(challenge.url, BROWSER_UA_FOR_PAGE, {
          proxyUrl: attemptProxyUrl,
          websiteURL: pageUrl,
        });
        const ddCookieValue = solved.cookie
          ? (solved.cookie.startsWith("datadome=") ? solved.cookie.split(";")[0] : `datadome=${solved.cookie.split(";")[0]}`)
          : (solved.token ? `datadome=${solved.token}` : null);

        if (ddCookieValue) {
          console.log(`[idealista-phone-ajax] CapSolver resolvió, reintentando contact-phones con cookie...`);
          const cpUrl = `https://www.idealista.com/es/ajax/ads/${adId}/contact-phones`;
          const cpRes = await fetchViaCurl(cpUrl, BROWSER_UA_FOR_PAGE, {
            proxyUrl: attemptProxyUrl,
            allowSmallBody: true,
            returnBodyOnError: true,
            timeoutSec: 15,
            headers: [
              `Cookie: ${ddCookieValue}`,
              "X-Requested-With: XMLHttpRequest",
              "Accept: application/json, text/javascript, */*; q=0.01",
              `Referer: ${pageUrl}`,
              "Accept-Language: es-ES,es;q=0.9",
            ],
          });
          const solvedBody = "html" in cpRes ? cpRes.html : cpRes.body;
          if (solvedBody) {
            const structured = parseStructuredAjaxPhone(solvedBody, adId.slice(-9));
            let phone = structured.phone;
            let contact_name = structured.contact_name;
            if (!phone) {
              for (const pattern of phonePatterns) {
                const m = solvedBody.match(pattern);
                if (m?.[1]) { phone = acceptPhoneCandidate(m[1], adId.slice(-9)); if (phone) break; }
              }
              contact_name = solvedBody.match(/"contactName"\s*:\s*"([^"]{2,60})"/)?.[1]?.trim() ?? null;
            }
            if (phone) {
              console.log(`[idealista-phone-ajax] ✓ ÉXITO vía CapSolver+contact-phones (intento ${attempt + 1}): ${phone}`);
              if (debug) debug.push({ endpoint: "capsolver-contact-phones", status: 200, bodySnippet: `phone=${phone}` });
              return { phone, phone_confidence: "high", contact_name, debug };
            }
            // CapSolver resolvió el slider pero el anuncio de verdad no tiene
            // teléfono (chat-only real) — no reintentar más, no es un problema
            // de IP.
            if (debug) debug.push({ endpoint: "capsolver-contact-phones", status: 200, bodySnippet: `sin teléfono: ${solvedBody.slice(0, 120)}` });
            console.log(`[idealista-phone-ajax] CapSolver OK pero contact-phones sin teléfono: ${solvedBody.slice(0, 120)}`);
            break;
          } else if (debug) {
            debug.push({ endpoint: "capsolver-contact-phones", status: 0, bodySnippet: "reintento sin cuerpo" });
          }
        } else {
          console.log(`[idealista-phone-ajax] CapSolver no devolvió cookie: ${solved.error}`);
          if (debug) debug.push({ endpoint: "capsolver-error", status: 0, bodySnippet: solved.error ?? "sin cookie" });
        }
      } catch (csErr) {
        const msg = csErr instanceof Error ? csErr.message : String(csErr);
        console.log(`[idealista-phone-ajax] Error CapSolver slider: ${msg}`);
        if (debug) debug.push({ endpoint: "capsolver-error", status: 0, bodySnippet: msg });
      }
      // t=fe pero sin cookie/teléfono tras CapSolver: no es un problema de IP
      // baneada, así que no tiene sentido rotar IP — salir del bucle.
      break;
    } else if (challenge.type === "bv") {
      // Bloqueo duro: esta IP concreta está baneada por DataDome. Reintentar
      // con una IP sticky nueva (barato) en la siguiente vuelta del bucle.
      console.log(`[idealista-phone-ajax] ⛔ Intento ${attempt + 1}: bloqueo DURO (t=bv) — IP baneada, rotando a IP nueva`);
      if (debug) debug.push({ endpoint: `datadome-hard-block-attempt${attempt + 1}`, status: 0, bodySnippet: "t=bv — rotando IP" });
      continue;
    } else {
      // Ni t=fe ni t=bv: no hay reto (posible error de red) — no rotar IP,
      // salir para no gastar reintentos en algo que no es un problema de IP.
      break;
    }
  }

  // ─── Step 2: DataDome pre-auth ───────────────────────────────────────────────
  // The browser flow: page loads → DataDome JS POSTs to https://dd.idealista.com/is/
  // → DataDome responds with {"status":200,"cookie":"datadome=VALUE;..."}
  // → Browser uses this cookie for the /contact-phones AJAX call.
  // We replicate this: extract the DataDome auth code from the page HTML, then
  // POST to dd.idealista.com/is/ ourselves. With a clean residential proxy IP,
  // DataDome often issues a valid cookie even with a minimal payload.
  if (pageHtml) {
    console.log(`[idealista-phone-ajax] Paso 2: Buscando DataDome auth code en HTML (${pageHtml.length} chars)...`);
    // Try multiple patterns for the auth code location
    // La clave DataDome del sitio se expone como `window.ddjskey = 'AC81...'`
    // en el HTML de Idealista. Es el `auth` que espera dd.idealista.com/is/.
    let authMatch = pageHtml.match(/ddjskey\s*=\s*['"]([A-Za-z0-9_-]{10,})['"]/);
    if (!authMatch) {
      authMatch = pageHtml.match(/dd\.idealista\.com\/tags\.js\?[^"']*auth=([A-Za-z0-9_-]{10,})/);
    }
    if (!authMatch) {
      authMatch = pageHtml.match(/auth=([A-Za-z0-9_-]{10,})/);
    }
    if (!authMatch) {
      authMatch = pageHtml.match(/"?auth"?\s*:\s*"([A-Za-z0-9_-]{10,})"/);
    }
    const ddAuth = authMatch?.[1];

    if (ddAuth) {
      console.log(`[idealista-phone-ajax] DataDome auth encontrado: ${ddAuth.slice(0, 12)}...`);
      if (debug) {
        debug.push({ endpoint: "datadome-auth", status: 0, bodySnippet: `auth=${ddAuth.slice(0, 20)}...` });
      }

      const ddCookie = await fetchDataDomeCookie(ddAuth, adId, phoneProxyUrl);
      if (ddCookie) {
        console.log(`[idealista-phone-ajax] Cookie DataDome obtenida: ${ddCookie.slice(0, 40)}...`);
        // Retry the primary phone endpoint with the validated DataDome cookie.
        const primaryEndpoint = `https://www.idealista.com/es/ajax/ads/${adId}/contact-phones`;
        console.log(`[idealista-phone-ajax] Reintentando /contact-phones con cookie DataDome...`);
        try {
          // Mismo UA (Chrome 131) con el que se pidió la cookie DataDome arriba:
          // DataDome valida la cookie contra el UA de la petición, así que deben
          // coincidir o rechaza el contact-phones aunque la cookie sea válida.
          const ddRes = await fetchViaCurl(primaryEndpoint, BROWSER_UA_FOR_PAGE, {
            proxyUrl: phoneProxyUrl,
            headers: [
              `Cookie: ${ddCookie}`,
              "X-Requested-With: XMLHttpRequest",
              "Accept: application/json, text/javascript, */*; q=0.01",
              `Referer: ${pageUrl}`,
              "Accept-Language: es-ES,es;q=0.9",
            ],
            allowSmallBody: true,
            timeoutSec: 15,
          });

          const ddStatus = ddRes.ok ? 200 : ("status" in ddRes ? ddRes.status : 0);
          console.log(`[idealista-phone-ajax] DataDome AJAX response: HTTP ${ddStatus}`);
          if (debug) {
            debug.push({
              endpoint: "datadome-cookie-retry",
              status: ddStatus,
              bodySnippet: ddRes.ok ? "ok" : ("reason" in ddRes ? ddRes.reason : "failed"),
            });
          }

          if (ddRes.ok && "html" in ddRes && ddRes.html) {
            const body = ddRes.html;
            console.log(`[idealista-phone-ajax] Response body: ${body.slice(0, 200)}`);

            // Parser estructurado primero, regex como fallback.
            const structured = parseStructuredAjaxPhone(body, adId.slice(-9));
            if (structured.phone) {
              console.log(`[idealista-phone-ajax] ✓ ÉXITO vía DataDome pre-auth (estructurado): ${structured.phone}`);
              return { phone: structured.phone, phone_confidence: "high", contact_name: structured.contact_name, debug };
            }

            let phone: string | null = null;
            for (const pattern of phonePatterns) {
              const m = body.match(pattern);
              if (m?.[1]) {
                phone = acceptPhoneCandidate(m[1], adId.slice(-9));
                if (phone) break;
              }
            }
            const cn = body.match(/"contactName"\s*:\s*"([^"]{2,60})"/);
            if (phone) {
              console.log(`[idealista-phone-ajax] ✓ ÉXITO vía DataDome pre-auth (regex): ${phone}`);
              return { phone, phone_confidence: "high", contact_name: cn?.[1]?.trim() ?? null, debug };
            } else {
              console.log(`[idealista-phone-ajax] DataDome cookie trabajó pero sin teléfono en response`);
            }
          }
        } catch (ddErr) {
          const errMsg = ddErr instanceof Error ? ddErr.message : String(ddErr);
          console.log(`[idealista-phone-ajax] DataDome retry error: ${errMsg}`);
          if (debug) {
            debug.push({ endpoint: "datadome-cookie-retry-error", status: 0, bodySnippet: errMsg });
          }
        }
      } else {
        console.log(`[idealista-phone-ajax] No se pudo obtener cookie DataDome`);
        if (debug) {
          debug.push({ endpoint: "datadome-post-failed", status: 0, bodySnippet: "no cookie" });
        }
      }
    } else {
      console.log(`[idealista-phone-ajax] DataDome auth code no encontrado en HTML`);
      if (debug) {
        debug.push({ endpoint: "datadome-auth-not-found", status: 0, bodySnippet: "auth code missing" });
      }
    }
  } else {
    console.log(`[idealista-phone-ajax] pageHtml es null, saltando DataDome pre-auth`);
    if (debug) {
      debug.push({ endpoint: "datadome-skipped", status: 0, bodySnippet: "no html" });
    }
  }

  // NOTA: antes se saltaba Playwright si `curl` recibía bloqueo duro (t=bv),
  // asumiendo que el veredicto es puramente por reputación de IP y que un
  // browser real en la MISMA IP recibiría el mismo bloqueo. Esa asunción no
  // está verificada: DataDome también fingerprint-ea el cliente TLS/HTTP a
  // nivel de handshake (JA3), y `curl` tiene una huella claramente distinta a
  // la de Chrome real. `fetchIdealistaPhoneViaPlaywright` navega con Chromium
  // real (playwright-extra + stealth), así que puede recibir un veredicto
  // DISTINTO al de curl en la misma IP. Se prueba siempre; el coste (~60s) ya
  // se paga cuando el resto de rutas fallan.
  console.log(`[idealista-phone-ajax] DataDome pre-auth fallido. Intentando Playwright (independiente del veredicto de curl)...`);

  try {
    const { fetchIdealistaPhoneViaPlaywright } = await import(
      "@/lib/sync/particulares/fetch-phone-with-playwright"
    );
    // Use residential proxy URL for Playwright (not dynamic datacenter IPs).
    // Datacenter IPs trigger DataDome CAPTCHA even with perfect browser fingerprint.
    const { getResidentialProxyUrl } = await import("@/lib/sync/proxy-config");
    const residentialProxy = await getResidentialProxyUrl();
    const pwResult = await fetchIdealistaPhoneViaPlaywright(adId, {
      proxyUrl: residentialProxy ?? options?.proxyUrl,
    });

    if (debug) {
      debug.push({
        endpoint: `playwright://inmueble/${adId}/`,
        status: pwResult.phone ? 200 : (pwResult.error?.includes("blocked") ? 403 : 0),
        bodySnippet: pwResult.error
          ? `Error: ${pwResult.error}`
          : pwResult.phone
            ? `phone=${pwResult.phone}`
            : "sin teléfono",
      });
    }

    if (pwResult.phone) {
      console.log(`[idealista-phone-ajax] ✓ ÉXITO vía Playwright: adId=${adId}, phone=${pwResult.phone}`);
      return {
        phone: pwResult.phone,
        phone_confidence: "high",
        contact_name: pwResult.contactName ?? null,
        debug,
      };
    }

    console.log(`[idealista-phone-ajax] Playwright: ${pwResult.error ?? "sin teléfono"}`);
  } catch (pwErr) {
    const msg = pwErr instanceof Error ? pwErr.message : String(pwErr);
    console.error(`[idealista-phone-ajax] Playwright error: ${msg}`);
    if (debug) {
      debug.push({ endpoint: "playwright://error", status: 0, bodySnippet: msg });
    }
  }

  console.log(`[idealista-phone-ajax] ✗ FALLO TOTAL: No se encontró teléfono para adId=${adId}`);
  return { phone: null, phone_confidence: null, contact_name: null, debug };
}

const IDEALISTA_CONTACT_INFO_URL = "https://www.idealista.com/ajax/listingcontroller/adContactInfoForDetail.ajax";

export async function checkIdealistaAdvertiserType(
  adId: string,
  options?: {
    userAgent?: string;
    cookie?: string;
    proxyUrl?: string;
    timeout?: number;
  }
): Promise<AdvertiserCheckResult> {
  const timeout = options?.timeout ?? 10000;
  const userAgent =
    options?.userAgent ??
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  try {
    const url = new URL(IDEALISTA_CONTACT_INFO_URL);
    url.searchParams.set("adId", adId);

    const headers: HeadersInit = {
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": userAgent,
      Accept: "application/json",
      "Cache-Control": "no-cache",
    };

    if (options?.cookie) {
      headers["Cookie"] = options.cookie;
    }

    const fetchOptions: RequestInit = {
      method: "GET",
      headers,
      credentials: "include",
      signal: AbortSignal.timeout(timeout),
    };

    // Usar proxy si está configurado
    if (options?.proxyUrl) {
      const proxyAgent = new ProxyAgent(options.proxyUrl);
      // @ts-expect-error undici dispatcher not in types
      fetchOptions.dispatcher = proxyAgent;
    }

    const res = await fetch(url.toString(), fetchOptions);

    if (!res.ok) {
      console.warn(
        `[idealista-detector] HTTP ${res.status} para adId=${adId}`
      );
      return {
        advertiser_type: "unknown",
        is_ad_professional: null,
        phone: null,
        phone_confidence: undefined,
        error: `HTTP ${res.status}`,
      };
    }

    const json = (await res.json()) as Record<string, unknown>;
    const data = json?.data as Record<string, unknown>;
    const value = data?.isAdProfessional;
    const rawPhone = (data?.phone as string) || null;

    // API responses are considered high confidence — still validate Spanish
    // format y normalizar SIEMPRE a +34XXXXXXXXX antes de devolverlo.
    const phone = normalizeSpanishPhone(rawPhone);
    const phone_confidence = phone ? ("high" as const) : undefined;

    // Validar que sea boolean
    if (typeof value === "boolean") {
      return {
        advertiser_type: value ? "professional" : "particular",
        is_ad_professional: value,
        phone,
        phone_confidence,
      };
    }

    return {
      advertiser_type: "unknown",
      is_ad_professional: null,
      phone,
      phone_confidence,
      error: "isAdProfessional no es boolean",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[idealista-detector] Error para adId=${adId}: ${errorMsg}`);
    return {
      advertiser_type: "unknown",
      is_ad_professional: null,
      phone: null,
      phone_confidence: undefined,
      error: errorMsg,
    };
  }
}
