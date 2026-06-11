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
  const cleaned = raw.replace(/[\s\-().]/g, "");

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

  // HIGH CONFIDENCE: data-phone or data-contact-phone attributes
  pm = html.match(/data-(?:contact-)?phone\s*=\s*["']([+\d][\d\s\-]{6,})["']/);
  if (pm?.[1]) {
    const phone = acceptPhoneCandidate(pm[1], excludeReference);
    if (phone) {
      return { phone, confidence: "high" };
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

  // MEDIUM CONFIDENCE: href="tel:" links or telLink/callLink elements
  pm = html.match(/href="tel:([+\d][\d\s\-]{6,})"/);
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
};

/**
 * Intenta obtener el teléfono de un anuncio de Idealista llamando a los
 * endpoints AJAX de contacto (los del botón "Ver teléfono"), vía curl con
 * UA de WhatsApp + proxy. Devuelve el teléfono normalizado a +34XXXXXXXXX
 * (confianza high: viene de la API oficial) o null si no hay/no se pudo.
 */
export async function fetchIdealistaPhoneViaAjax(
  adId: string,
  options?: { proxyUrl?: string },
): Promise<AjaxPhoneResult> {
  // Import dinámico para no arrastrar child_process a contextos que solo
  // usan normalizeSpanishPhone/detectAdvertiserFromHtml.
  const { fetchViaCurl } = await import(
    "@/lib/sync/import-by-link/fetch-via-curl"
  );

  for (const endpoint of idealistaPhoneEndpoints(adId)) {
    const res = await fetchViaCurl(endpoint, WHATSAPP_UA_FOR_AJAX, {
      proxyUrl: options?.proxyUrl,
      allowSmallBody: true,
      timeoutSec: 12,
      headers: [
        "X-Requested-With: XMLHttpRequest",
        "Accept: application/json, text/javascript, */*; q=0.01",
        `Referer: https://www.idealista.com/inmueble/${adId}/`,
      ],
    });
    if (!res.ok) continue;

    const body = res.html;
    // Campos de teléfono conocidos en las respuestas de estos endpoints
    // (la estructura varía: phone1.number, formattedPhone, phone…).
    const patterns = [
      /"phoneNumberForMobileDialing"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
      /"formattedPhone(?:Number)?"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
      /"number"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
      /"phone"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
      /"phoneNumber"\s*:\s*"([+\d][\d\s\-]{6,18})"/,
    ];
    let phone: string | null = null;
    for (const pattern of patterns) {
      const m = body.match(pattern);
      if (m?.[1]) {
        // Descartar la referencia del anuncio si se cuela como candidato.
        phone = acceptPhoneCandidate(m[1], adId.slice(-9));
        if (phone) break;
      }
    }

    const cn = body.match(/"contactName"\s*:\s*"([^"]{2,60})"/);
    const contact_name = cn?.[1]?.trim() ?? null;

    if (phone) {
      return { phone, phone_confidence: "high", contact_name };
    }
  }

  return { phone: null, phone_confidence: null, contact_name: null };
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
