import { ProxyAgent } from "undici";

export type AdvertiserType = "particular" | "professional" | "unknown";

export type AdvertiserCheckResult = {
  advertiser_type: AdvertiserType;
  is_ad_professional: boolean | null;
  phone?: string | null;
  phone_confidence?: "high" | "medium" | "low";
  contact_name?: string | null;
  error?: string;
};

// Normalization helper: convert phone strings with spaces/dashes to clean format
function normalizePhoneNumber(phoneStr: string): string {
  // Remove spaces and dashes, keep only digits and +
  return phoneStr.replace(/[\s\-()]/g, "");
}

// Extract phone with confidence scoring
// Priority: data attributes (high) > tel: links (medium) > text patterns (low)
function extractPhoneWithConfidence(
  html: string
): { phone: string | null; confidence: "high" | "medium" | "low" | null } {
  let phone: string | null = null;
  let confidence: "high" | "medium" | "low" | null = null;

  // HIGH CONFIDENCE: data attributes
  // Patrón 1: appcallback_target_phone="609808765" (sin +34, solo dígitos)
  let pm = html.match(/appcallback_target_phone="(\d{9,})"/);
  if (pm?.[1]) {
    phone = `+34${pm[1]}`;
    confidence = "high";
    return { phone, confidence };
  }

  // HIGH CONFIDENCE: data-phone or data-contact-phone attributes
  pm = html.match(/data-(?:contact-)?phone\s*=\s*["']([+\d][\d\s\-]{6,})["']/);
  if (pm?.[1]) {
    phone = normalizePhoneNumber(pm[1]);
    confidence = "high";
    return { phone, confidence };
  }

  // HIGH CONFIDENCE: JSON data attributes with phone
  pm = html.match(/"phone"\s*:\s*"([+\d][\d\s\-]{6,15})"/);
  if (pm?.[1]) {
    phone = normalizePhoneNumber(pm[1]);
    confidence = "high";
    return { phone, confidence };
  }

  // MEDIUM CONFIDENCE: href="tel:" links or telLink/callLink elements
  pm = html.match(/href="tel:([+\d][\d\s\-]{6,})"/);
  if (pm?.[1]) {
    phone = normalizePhoneNumber(pm[1]);
    confidence = "medium";
    return { phone, confidence };
  }

  // MEDIUM CONFIDENCE: telLink or callLink data
  pm = html.match(/(?:telLink|callLink)\s*[=:]\s*["']([+\d][\d\s\-]{6,})["']/i);
  if (pm?.[1]) {
    phone = normalizePhoneNumber(pm[1]);
    confidence = "medium";
    return { phone, confidence };
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
      phone = normalizePhoneNumber(pm[1]);
      confidence = "medium";
      return { phone, confidence };
    }
  }

  // LOW CONFIDENCE: Visible text patterns like "Llamar: 607 80 46 54"
  // Look for Spanish patterns like "Llamar:", "Teléfono:", "Tel:"
  const lowPatterns = [
    /(?:Llamar|Teléfono|Tel|Contacto|Móvil)[:\s]+([+\d][\d\s\-()]{8,})/i,
    /\b(\d{3}[\s\-]?\d{2}[\s\-]?\d{2}[\s\-]?\d{2})\b/, // Spanish format: XXX-XX-XX-XX
    /\b(\+34[\s\-]?\d{1,3}[\s\-]?\d{2,3}[\s\-]?\d{2,3})\b/, // +34 Spanish variants
  ];
  for (const pattern of lowPatterns) {
    pm = html.match(pattern);
    if (pm?.[1]) {
      const candidatePhone = normalizePhoneNumber(pm[1]);
      // Validate it's a reasonable phone number (at least 9 digits for Spain)
      const digitsOnly = candidatePhone.replace(/\D/g, "");
      if (digitsOnly.length >= 9) {
        phone = candidatePhone;
        confidence = "low";
        return { phone, confidence };
      }
    }
  }

  return { phone: null, confidence: null };
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

  // Extraer teléfono con puntuación de confianza
  const { phone, confidence } = extractPhoneWithConfidence(html);

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
    return { advertiser_type: "unknown", is_ad_professional: null, phone, phone_confidence: confidence, contact_name };
  }
  const name = m[2].trim();
  if (name.length === 0) {
    return { advertiser_type: "particular", is_ad_professional: false, phone, phone_confidence: confidence, contact_name };
  }
  return { advertiser_type: "professional", is_ad_professional: true, phone, phone_confidence: confidence, contact_name };
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

    // API responses are considered high confidence
    const phone = rawPhone ? normalizePhoneNumber(rawPhone) : null;
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
