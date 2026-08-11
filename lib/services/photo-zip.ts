import "server-only";
import { buildZip, type ZipEntry } from "@/lib/services/zip";
import { applyBrandWatermark } from "@/lib/services/idealista/brand-watermark";

// Descarga fotos + les superpone el logo de la agencia + las empaqueta en un
// ZIP. Compartido por los endpoints "descargar fotos" de Idealista
// (idealista_listings) y de Propiedades (properties/property_photos): misma
// lógica, distinta fuente de URLs.

const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 20_000;

function extFromContentType(ct: string | null, url: string): string {
  if (ct?.includes("webp")) return "webp";
  if (ct?.includes("png")) return "png";
  if (ct?.includes("jpeg") || ct?.includes("jpg")) return "jpg";
  // fallback: por la extensión del path (sin query)
  const m = url.split("?")[0].match(/\.(webp|png|jpe?g)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

// Nombre de carpeta/archivo seguro: solo ASCII alfanumérico, guion y guion bajo.
export function safeZipName(raw: string): string {
  return (
    raw
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "fotos"
  );
}

// Descarga las fotos dadas y las empaqueta en un ZIP (carpeta `folder`,
// archivos numerados 01.ext, 02.ext…), con el logo de la agencia superpuesto
// salvo que se pida `watermark: false` (uso interno, admin: los originales
// limpios). Las fotos que fallen al descargar/procesar se omiten sin tumbar
// el resto. Devuelve null si ninguna foto pudo incluirse.
export async function buildWatermarkedPhotoZip(
  urls: string[],
  folder: string,
  options: { watermark?: boolean } = {},
): Promise<Buffer | null> {
  const watermark = options.watermark ?? true;
  const entries: (ZipEntry | null)[] = new Array(urls.length).fill(null);
  for (let start = 0; start < urls.length; start += CONCURRENCY) {
    const batch = urls.slice(start, start + CONCURRENCY);
    await Promise.all(
      batch.map(async (url, j) => {
        const i = start + j;
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
          let r: Response;
          try {
            r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
          } finally {
            clearTimeout(timer);
          }
          if (!r.ok) return;
          const rawBuf = Buffer.from(await r.arrayBuffer());
          const ext = extFromContentType(r.headers.get("content-type"), url);
          const num = String(i + 1).padStart(2, "0");
          let buf = rawBuf;
          if (watermark) {
            try {
              buf = Buffer.from(await applyBrandWatermark(rawBuf));
            } catch {
              // si el procesado falla, se incluye la foto original sin marca
            }
          }
          entries[i] = { name: `${folder}/${num}.${ext}`, data: buf };
        } catch {
          // foto que falla: se omite
        }
      }),
    );
  }

  const files = entries.filter((e): e is ZipEntry => e !== null);
  return files.length ? buildZip(files) : null;
}
