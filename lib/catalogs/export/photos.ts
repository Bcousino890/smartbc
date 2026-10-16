import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { isCatalogFixtureMode } from "../fixture-mode";
import { findPropertyPhoto, photoCandidates } from "../photo-resolve";

// ============================================================================
// Fotos del PDF del catálogo (expediente 2026-10-16-bcp-01-pdf). Cada foto se
// resuelve por su CLAVE con el mismo código que el proxy /p (photo-resolve.ts)
// y se comprueba que su versión es la de la instantánea capturada: `u` es el
// md5 de su URL en S1 (K1). Si no coincide, o la foto ya no existe, la
// instantánea ya no vale («changed») y se vuelve a leer todo. Si falla la
// descarga o la conversión, «failed»: el PDF pinta «Foto no disponible» y
// nunca otra foto. Límite documentado (corrección 5 de E3): un archivo
// sustituido en la MISMA URL no cambia `u` y no se detecta.
// Se convierte a JPEG (react-pdf no lee bien WebP), sin ampliar nunca.
// ============================================================================

export interface PhotoNeed {
  slug: string;
  key: string;
  /** md5 de la URL de la foto en la instantánea S1. */
  u: string;
  /** Ancho máximo de la imagen incrustada (px). */
  width: number;
}

export type LoadedPhoto = { ok: true; data: Buffer; width: number; height: number } | { ok: false; reason: "changed" | "failed" };

const PHOTO_TIMEOUT_MS = 10_000;
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

async function toJpeg(input: Buffer | string, width: number, signal: AbortSignal): Promise<LoadedPhoto> {
  if (signal.aborted) return { ok: false, reason: "failed" };
  const { data, info } = await sharp(typeof input === "string" ? Buffer.from(input) : input, { failOn: "none" })
    .rotate()
    .resize({ width, withoutEnlargement: true, fit: "inside" })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 76, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { ok: true, data, width: info.width, height: info.height };
}

export async function loadExportPhoto(need: PhotoNeed, signal: AbortSignal): Promise<LoadedPhoto> {
  try {
    if (isCatalogFixtureMode()) {
      const { fixtureExportBigPx, fixtureExportDelay, fixtureExportPhoto } = await import("../fixture-store");
      const wait = fixtureExportDelay();
      if (wait) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, wait);
          signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
        });
        if (signal.aborted) return { ok: false, reason: "failed" };
      }
      const fx = await fixtureExportPhoto(need.slug, need.key);
      if (!fx || fx.u !== need.u) return { ok: false, reason: "changed" };
      if (fx.fail) return { ok: false, reason: "failed" };
      const big = fixtureExportBigPx();
      if (big) {
        const { fixtureBigJpeg } = await import("./fixture-photo-big");
        return await toJpeg(await fixtureBigJpeg(fx.u, fx.svg, big), need.width, signal);
      }
      return await toJpeg(fx.svg, need.width, signal);
    }
    const photo = await findPropertyPhoto(need.slug, 0, need.key);
    if (!photo || photo === "unavailable" || md5(photo.url) !== need.u) return { ok: false, reason: "changed" };
    for (const url of photoCandidates(photo.url)) {
      if (signal.aborted) return { ok: false, reason: "failed" };
      try {
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(PHOTO_TIMEOUT_MS)]) });
        if (!res.ok) continue;
        return await toJpeg(Buffer.from(await res.arrayBuffer()), need.width, signal);
      } catch {
        // la siguiente candidata, o «failed»
      }
    }
    return { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
