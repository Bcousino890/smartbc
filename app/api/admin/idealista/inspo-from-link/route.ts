import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { extractFromUrl } from "@/lib/sync/import-by-link";
import { downloadAndWatermark } from "@/lib/sync/watermark";
import { previewToInspo } from "@/lib/services/idealista/inspo-mapper";

// Siembra una inspo desde un link externo: extrae los datos de la ficha pública
// (mismo motor que "crear propiedad por link"), re-aloja las fotos en NUESTRO
// storage (quita marcas de perfil conocido + redimensiona/webp) y devuelve un
// Partial<IdealistaListing> listo para precargar en el formulario.
//
// El re-alojado es SÍNCRONO a propósito: el formulario necesita las URLs propias
// (sin marca, servibles por la extensión) antes de que el usuario revise/guarde.

const MAX_PHOTOS = 40;
const CONCURRENCY = 8;

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { url } = await req.json().catch(() => ({ url: null }));
  if (!url || typeof url !== "string") {
    return Response.json({ error: "url es requerido" }, { status: 400 });
  }

  const result = await extractFromUrl(url);
  if (!result.ok) {
    return Response.json(
      { error: `No se pudo leer el anuncio: ${result.error.reason}` },
      { status: 422 },
    );
  }

  const preview = result.preview;
  const sources = preview.photos.slice(0, MAX_PHOTOS).map((p) => p.url);

  // Re-aloja las fotos en lotes. Cada foto que falle conserva su URL de origen
  // (la extensión la puede descargar igual; solo se pierde la limpieza/webp).
  const rehosted: string[] = new Array(sources.length);
  for (let start = 0; start < sources.length; start += CONCURRENCY) {
    const batch = sources.slice(start, start + CONCURRENCY);
    await Promise.all(
      batch.map(async (sourceUrl, j) => {
        const i = start + j;
        try {
          const res = await downloadAndWatermark({
            sourceUrl,
            agencySlug: "inspo",
            externalId: preview.externalReference,
            position: i,
          });
          rehosted[i] = res.ok ? res.photo.url : sourceUrl;
        } catch {
          rehosted[i] = sourceUrl;
        }
      }),
    );
  }

  const data = previewToInspo(preview, rehosted);
  const photosRehosted = rehosted.filter((u, i) => u !== sources[i]).length;

  return Response.json({
    data,
    meta: {
      portal: preview.portal,
      photosTotal: preview.photos.length,
      photosUsed: sources.length,
      photosRehosted, // cuántas quedaron limpias en nuestro storage
      warnings: preview.warnings,
    },
  });
}
