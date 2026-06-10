import "server-only";
import * as cheerio from "cheerio";
import { detectPortal } from "./detect-portal";
import { fetchHtml } from "./fetch-html";
import { extractClikalia, normalizeClikaliaUrl } from "./extractors/clikalia";
import { extractUrbantechome } from "./extractors/urbantechome";
import { extractFotocasa } from "./extractors/fotocasa";
import { extractGeneric } from "./extractors/generic";
import { extractIdealista } from "./extractors/idealista";
import { extractInmoweb } from "./extractors/inmoweb";
import type { ImportExtractResult } from "./types";

export type { ImportPreview, ImportPortal, ImportPhoto } from "./types";

/**
 * Punto de entrada: dado un URL público, descarga el HTML y devuelve una
 * preview completa. NO inserta nada en BD. NO descarga fotos. La preview
 * lleva URLs originales del portal; el watermarking se hace después al
 * confirmar.
 */
export async function extractFromUrl(
  rawUrl: string,
): Promise<ImportExtractResult> {
  const detected = detectPortal(rawUrl);
  if (!detected) {
    return {
      ok: false,
      error: {
        kind: "unsupported_url",
        reason: "URL inválida o esquema no soportado (solo http/https)",
      },
    };
  }

  // UrbantecHome es una SPA: los datos NO están en el HTML, vienen de su API
  // pública. No descargamos HTML; el extractor consulta la API directamente.
  if (detected.portal === "urbantechome") {
    try {
      return {
        ok: true,
        preview: await extractUrbantechome(detected.url.toString()),
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          kind: "parse_failed",
          reason:
            err instanceof Error ? err.message : "urbantechome_extract_failed",
        },
      };
    }
  }

  // Clikalia: forzamos la ficha en español para parsear los datos en el idioma
  // correcto, sea cual sea el idioma del link pegado.
  if (detected.portal === "clikalia") {
    detected.url = normalizeClikaliaUrl(detected.url);
  }

  const fetched = await fetchHtml(detected.url.toString());
  if (!fetched.ok) return { ok: false, error: fetched.error };

  const $ = cheerio.load(fetched.html);
  const finalUrl = fetched.finalUrl;

  switch (detected.portal) {
    case "idealista":
      return { ok: true, preview: await extractIdealista($, finalUrl, { proxyUrl: process.env.SMARTPROXY_URL }) };
    case "fotocasa":
      return { ok: true, preview: extractFotocasa($, finalUrl) };
    case "inmoweb":
      return { ok: true, preview: extractInmoweb($, finalUrl) };
    case "clikalia":
      return { ok: true, preview: extractClikalia($, finalUrl) };
    case "mobilia":
    case "generic":
    default:
      return {
        ok: true,
        preview: extractGeneric($, finalUrl, detected.portal),
      };
  }
}
