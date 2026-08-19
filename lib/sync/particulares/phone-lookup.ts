import "server-only";
import { fetchViaCurl } from "@/lib/sync/import-by-link/fetch-via-curl";
import {
  detectAdvertiserFromHtml,
  fetchIdealistaPhoneViaAjax,
  normalizeSpanishPhone,
} from "@/lib/sync/particulares/idealista-advertiser-detector";
import { extractPhoneFromHtmlDescription } from "@/lib/sync/particulares/phone-from-text";

// UA de WhatsApp: DataDome lo deja pasar (whitelist por los previews de
// links compartidos por WhatsApp).
const WHATSAPP_UA = "WhatsApp/2.23.20.0";

export type PhoneLookupSource = "html_attribute" | "html_description" | "ajax" | null;

export type PhoneLookupResult = {
  /** false = ni siquiera se pudo cargar la ficha (red/bloqueo duro). */
  httpOk: boolean;
  httpStatus?: number;
  phone: string | null;
  phone_confidence: "high" | "medium" | null;
  contact_name: string | null;
  advertiserType: "particular" | "professional" | "unknown" | null;
  isAdProfessional: boolean | null;
  source: PhoneLookupSource;
  /** Solo si options.debug: qué devolvió cada endpoint AJAX intentado. */
  ajaxDebug?: Array<{ endpoint: string; status: number; bodySnippet: string }>;
};

export type PhoneLookupOptions = {
  proxyUrl?: string;
  /** Saltar la carga de HTML y llamar directo al AJAX (cuando el caller ya tiene el HTML/advertiserInfo de otra fuente). */
  ajaxOnly?: boolean;
  /** No intentar el fallback AJAX (proxy+Playwright) — solo HTML/descripción, barato. */
  skipAjax?: boolean;
  debug?: boolean;
};

/**
 * Único punto de entrada "dado un anuncio de Idealista, buscale el
 * teléfono". Compone en cascada las 3 fuentes que antes reimplementaban por
 * separado 5 endpoints distintos del módulo (cron, refresh-phones,
 * verify-phones, rescrape-missing-phones, backfill):
 *
 *   1. Atributo/JSON embebido en el HTML (detectAdvertiserFromHtml) — gratis.
 *   2. Teléfono escrito a mano en la descripción (extractPhoneFromHtmlDescription) — gratis,
 *      reutiliza el mismo HTML ya descargado en el paso 1.
 *   3. Endpoint AJAX "Ver teléfono" (fetchIdealistaPhoneViaAjax) — caro
 *      (proxy + fallback Playwright). Se trata como
 *      caja negra: acá NO se reimplementa su lógica de t=bv/t=fe ni de
 *      reintentos — eso vive intacto en idealista-advertiser-detector.ts.
 *
 * Si la carga inicial del HTML falla (bloqueo duro, timeout, red), igual se
 * intenta el AJAX — es una fuente independiente que puede dar un veredicto
 * distinto de DataDome. Antes esto solo lo hacía el backfill del cron;
 * refresh-phones/verify-phones se rendían directamente. Se unifica hacia el
 * comportamiento más completo (más intentos, no más gasto: el AJAX ya trae
 * su propio corte t=bv).
 */
export async function lookupIdealistaPhone(
  sourceUrl: string,
  opts: PhoneLookupOptions = {},
): Promise<PhoneLookupResult> {
  const adId = sourceUrl.match(/\/inmueble\/(\d+)/)?.[1] ?? null;

  let httpOk = false;
  let httpStatus: number | undefined;
  let advertiserType: PhoneLookupResult["advertiserType"] = null;
  let isAdProfessional: boolean | null = null;
  let contactName: string | null = null;

  if (!opts.ajaxOnly) {
    const res = await fetchViaCurl(sourceUrl, WHATSAPP_UA, { proxyUrl: opts.proxyUrl });
    httpOk = res.ok;
    if (!res.ok) {
      httpStatus = res.status;
    } else {
      const info = detectAdvertiserFromHtml(res.html);
      advertiserType = info.advertiser_type;
      isAdProfessional = info.is_ad_professional;
      contactName = info.contact_name ?? null;

      if (info.phone) {
        return {
          httpOk,
          phone: info.phone,
          phone_confidence: (info.phone_confidence as "high" | "medium" | null) ?? null,
          contact_name: contactName,
          advertiserType,
          isAdProfessional,
          source: "html_attribute",
        };
      }

      const textPhone = extractPhoneFromHtmlDescription(res.html, adId?.slice(-9));
      if (textPhone.phone) {
        return {
          httpOk,
          phone: textPhone.phone,
          phone_confidence: textPhone.confidence,
          contact_name: contactName,
          advertiserType,
          isAdProfessional,
          source: "html_description",
        };
      }
    }
  }

  if (opts.skipAjax || !adId) {
    return {
      httpOk,
      httpStatus,
      phone: null,
      phone_confidence: null,
      contact_name: contactName,
      advertiserType,
      isAdProfessional,
      source: null,
    };
  }

  const ajax = await fetchIdealistaPhoneViaAjax(adId, { proxyUrl: opts.proxyUrl, debug: opts.debug });
  const phone = normalizeSpanishPhone(ajax.phone);
  return {
    httpOk,
    httpStatus,
    phone,
    phone_confidence: phone ? ajax.phone_confidence : null,
    contact_name: ajax.contact_name ?? contactName,
    advertiserType,
    isAdProfessional,
    source: phone ? "ajax" : null,
    ajaxDebug: ajax.debug,
  };
}
