import "server-only";
import sharp from "sharp";
import { createAdminClient } from "@/lib/db/admin";
import { removeKnownWatermark } from "./watermark-removal";
import { isMobiliaImageUrl, toMobiliaOriginal } from "./scrapers/mobilia";
import { idealistaSourceCandidates, isIdealistaImageUrl } from "./scrapers/idealista";

const BUCKET = "properties-photos";
// Techo del máster que guardamos. Estaba en 1920, que para un hero a ancho
// completo en pantalla retina (1440 CSS px × 2 = 2880) se queda corto y era
// parte de por qué la foto principal se veía blanda aun con buen original.
// 2560 cubre el caso real sin irse a ficheros de 15MB; la variante que ve el
// cliente la sirve el proxy por `?w=`.
const MAX_WIDTH = 2560;
// La foto principal es la imagen más importante de la página: 86 en vez de 82
// cuesta unas decenas de KB y se nota en las superficies planas.
const WEBP_QUALITY = 86;

export type WatermarkedPhoto = {
  url: string;
  storagePath: string;
};

export type WatermarkResult =
  | { ok: true; photo: WatermarkedPhoto }
  | { ok: false; error: string };

export async function downloadAndWatermark(params: {
  sourceUrl: string;
  agencySlug: string;
  externalId: string;
  position: number;
}): Promise<WatermarkResult> {
  try {
    // Timeout por foto: si el servidor de origen se cuelga, no queremos que el
    // import entero se quede esperando indefinidamente (era una causa de que
    // "crear propiedad" tardase muchísimo y acabara reventando el cliente).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    // Mobilia (media.mobiliagestion.es — backend de Level y de otras agencias)
    // sirve la foto CON marca de agua en la variante por defecto; `-original.jpg`
    // es la MISMA foto SIN marca. El scraper antiguo normalizaba la URL antes de
    // llegar aquí, pero el import por link (extractGeneric) pasa la `.jpg` cruda,
    // así que la normalizamos también en este punto — el ÚNICO por el que pasan
    // todas las descargas. Sin esto, la marca queda horneada en nuestro storage.
    const fetchUrl = isMobiliaImageUrl(params.sourceUrl)
      ? toMobiliaOriginal(params.sourceUrl)
      : params.sourceUrl;
    // Candidatos de MAYOR a menor resolución para la misma foto. En Idealista
    // el perfil "seguro" del CDN da 850px; se prueba antes el grande y se cae
    // al seguro si no existe, en vez de fiarse de que un perfil concreto siga
    // ahí. Para el resto de orígenes hay un único candidato y esto es un no-op.
    const sourceCandidates = isIdealistaImageUrl(fetchUrl)
      ? idealistaSourceCandidates(fetchUrl)
      : [fetchUrl];

    let rawBuf: Buffer | null = null;
    let usedUrl = fetchUrl;
    try {
      for (const candidate of sourceCandidates) {
        try {
          const res = await fetch(candidate, {
            headers: {
              "User-Agent": "smartbc-bot/1.0 (contacto@bcousinoprop.com)",
            },
            cache: "no-store",
            signal: ctrl.signal,
          });
          if (!res.ok) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          // Un cuerpo diminuto no es una foto: el CDN devuelve páginas de
          // error con 200 más veces de las que uno esperaría.
          if (buf.length < 2048) continue;
          rawBuf = buf;
          usedUrl = candidate;
          break;
        } catch {
          // siguiente candidato
        }
      }
    } finally {
      clearTimeout(timer);
    }
    if (!rawBuf) {
      return { ok: false, error: "fetch_failed" };
    }
    // Si la fuente tiene marca de agua constante (ej. Clikalia), la quitamos
    // antes de procesar. Si no, devuelve el buffer igual.
    const buf = await removeKnownWatermark(usedUrl, rawBuf);
    const image = sharp(buf, { failOn: "none" }).rotate();
    const meta = await image.metadata();
    const targetWidth = Math.min(meta.width ?? MAX_WIDTH, MAX_WIDTH);

    // Sin marca de agua propia: las imágenes vienen ya limpias del CDN de
    // Mobilia (sufijo `-original.jpg`) y queremos mostrarlas tal cual. Sharp
    // solo redimensiona a 1920px máx y convierte a webp para optimizar peso.
    const output = await image
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const storagePath = `synced/${params.agencySlug}/${params.externalId}/${params.position}.webp`;
    const supabase = createAdminClient();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, output, {
        contentType: "image/webp",
        upsert: true,
      });
    if (uploadError) {
      return { ok: false, error: uploadError.message };
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    return {
      ok: true,
      photo: { url: data.publicUrl, storagePath },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "watermark_unknown_error",
    };
  }
}
