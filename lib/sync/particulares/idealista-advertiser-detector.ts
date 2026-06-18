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
  return phone;
}

// Extract phone with confidence scoring
// Priority: data attributes (high) > tel: links (medium) > text patterns (low)
// Only returns HIGH or MEDIUM confidence results that pass Spanish format validation.
// LOW confidence results are discarded entirely (too many false positives).
// El teléfono devuelto viene SIEMPRE normalizado a +34XXXXXXXXX.
// `excludeReference`: referencia del anuncio (propertyCode/adId) para descartar
// candidatos que en realidad son la referencia y no un teléfono.
function extractPhoneWithConfidence(
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
  // Patrón A: clase hidden-contact-phones-formatted-phone con href tel:
  // <a class="icon-phone-outline hidden-contact-phones-formatted-phone _mobilePhone" href="tel:+34696165042">
  pm = html.match(/hidden-contact-phones-formatted-phone[^>]*href=["']tel:([+\d][\d\s\-]{6,})["']/);
  if (!pm) {
    pm = html.match(/href=["']tel:([+\d][\d\s\-]{6,})["'][^>]*hidden-contact-phones-formatted-phone/);
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
        "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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

  console.log(`[idealista-phone-ajax] Iniciando búsqueda de teléfono para adId=${adId} (${endpoints.length} endpoints)`);

  // Load the page once, then try all AJAX endpoints reusing the same cookie jar.
  const { results: responses, pageHtml } = await fetchMultipleAjaxWithCookieJar(
    pageUrl,
    endpoints,
    WHATSAPP_UA_FOR_AJAX,
    {
      proxyUrl: options?.proxyUrl,
      timeoutSec: 30,
      ajaxHeaders: [
        "X-Requested-With: XMLHttpRequest",
        "Accept: application/json, text/javascript, */*; q=0.01",
        `Referer: ${pageUrl}`,
      ],
    },
  );

  const phonePatterns = [
    /"phoneNumberForMobileDialing"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    /"formattedPhone(?:Number)?"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
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
      debug.push({ endpoint, status: res.status, bodySnippet: (res.body ?? "").slice(0, 300) });
    }

    console.log(`[idealista-phone-ajax] ${endpoint.split("/").slice(-2).join("/")} → HTTP ${res.status}`);

    if (!res.ok || !res.body) continue;

    const body = res.body;
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
      console.log(`[idealista-phone-ajax] ✓ ÉXITO vía curl: adId=${adId}, phone=${phone}`);
      return { phone, phone_confidence: "high", contact_name, debug };
    }
  }

  console.log(`[idealista-phone-ajax] ✗ Curl cookie-jar fallido (${endpoints.length} endpoints)`);

  // ─── Step 2: DataDome pre-auth ───────────────────────────────────────────────
  // The browser flow: page loads → DataDome JS POSTs to https://dd.idealista.com/is/
  // → DataDome responds with {"status":200,"cookie":"datadome=VALUE;..."}
  // → Browser uses this cookie for the /contact-phones AJAX call.
  // We replicate this: extract the DataDome auth code from the page HTML, then
  // POST to dd.idealista.com/is/ ourselves. With a clean residential proxy IP,
  // DataDome often issues a valid cookie even with a minimal payload.
  if (pageHtml) {
    const authMatch = pageHtml.match(/dd\.idealista\.com\/tags\.js\?[^"']*auth=([A-Za-z0-9_-]{10,})/);
    const ddAuth = authMatch?.[1];
    console.log(`[idealista-phone-ajax] DataDome auth: ${ddAuth ? ddAuth.slice(0, 8) + "..." : "no encontrado en HTML"}`);

    if (ddAuth) {
      const ddCookie = await fetchDataDomeCookie(ddAuth, adId, options?.proxyUrl);
      if (ddCookie) {
        // Retry the primary phone endpoint with the validated DataDome cookie.
        const primaryEndpoint = `https://www.idealista.com/es/ajax/ads/${adId}/contact-phones`;
        console.log(`[idealista-phone-ajax] Reintentando con cookie DataDome: ${primaryEndpoint}`);
        try {
          const ddRes = await fetchViaCurl(primaryEndpoint, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", {
            proxyUrl: options?.proxyUrl,
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

          if (debug) {
            debug.push({
              endpoint: `datadome-auth:${primaryEndpoint}`,
              status: ddRes.ok ? 200 : ("status" in ddRes ? ddRes.status : 0),
              bodySnippet: ddRes.ok ? ddRes.html.slice(0, 300) : `${("reason" in ddRes ? ddRes.reason : "failed")}`,
            });
          }

          if (ddRes.ok && ddRes.html) {
            const body = ddRes.html;
            console.log(`[idealista-phone-ajax] DataDome AJAX response: ${body.slice(0, 150)}`);
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
              console.log(`[idealista-phone-ajax] ✓ ÉXITO vía DataDome pre-auth: ${phone}`);
              return { phone, phone_confidence: "high", contact_name: cn?.[1]?.trim() ?? null, debug };
            }
          }
        } catch (ddErr) {
          console.log(`[idealista-phone-ajax] DataDome retry error: ${ddErr instanceof Error ? ddErr.message : String(ddErr)}`);
        }
      }
    }
  }

  console.log(`[idealista-phone-ajax] DataDome pre-auth fallido. Intentando Playwright...`);

  try {
    const { fetchIdealistaPhoneViaPlaywright } = await import(
      "@/lib/sync/particulares/fetch-phone-with-playwright"
    );
    const pwResult = await fetchIdealistaPhoneViaPlaywright(adId, {
      proxyUrl: options?.proxyUrl,
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
