import { ProxyAgent } from "undici";

export type AdvertiserType = "particular" | "professional" | "unknown";

export type AdvertiserCheckResult = {
  advertiser_type: AdvertiserType;
  is_ad_professional: boolean | null;
  phone?: string | null;
  error?: string;
};

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

  // Extraer teléfono de los patrones que Idealista usa en el HTML.
  // Prioridad: appcallback_target_phone (más confiable) → href="tel:" → otros patrones.
  let phone: string | null = null;

  // Patrón 1: appcallback_target_phone="609808765" (sin +34, solo dígitos)
  let pm = html.match(/appcallback_target_phone="(\d{9,})"/);
  if (pm?.[1]) {
    phone = `+34${pm[1]}`;
  }

  // Patrón 2: href="tel:+34609808765" (completo con +34)
  if (!phone) {
    pm = html.match(/href="tel:([+\d][\d\s\-]{6,})"/);
    if (pm?.[1]) {
      phone = pm[1].trim();
    }
  }

  // Patrón 3: Otros patrones en scripts inline
  if (!phone) {
    const phonePatterns = [
      /"phone"\s*:\s*"([+\d][\d\s\-]{6,15})"/,
      /phoneNumber\s*:\s*['"]([+\d][\d\s\-]{6,15})['"]/,
      /telefono\s*:\s*['"]([+\d][\d\s\-]{6,15})['"]/i,
      /contactPhone\s*:\s*['"]([+\d][\d\s\-]{6,15})['"]/,
    ];
    for (const pattern of phonePatterns) {
      pm = html.match(pattern);
      if (pm?.[1]) {
        phone = pm[1].trim();
        break;
      }
    }
  }

  if (!m) {
    return { advertiser_type: "unknown", is_ad_professional: null, phone };
  }
  const name = m[2].trim();
  if (name.length === 0) {
    return { advertiser_type: "particular", is_ad_professional: false, phone };
  }
  return { advertiser_type: "professional", is_ad_professional: true, phone };
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
        error: `HTTP ${res.status}`,
      };
    }

    const json = (await res.json()) as Record<string, unknown>;
    const data = json?.data as Record<string, unknown>;
    const value = data?.isAdProfessional;
    const phone = (data?.phone as string) || null;

    // Validar que sea boolean
    if (typeof value === "boolean") {
      return {
        advertiser_type: value ? "professional" : "particular",
        is_ad_professional: value,
        phone,
      };
    }

    return {
      advertiser_type: "unknown",
      is_ad_professional: null,
      phone,
      error: "isAdProfessional no es boolean",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[idealista-detector] Error para adId=${adId}: ${errorMsg}`);
    return {
      advertiser_type: "unknown",
      is_ad_professional: null,
      error: errorMsg,
    };
  }
}
