import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyBrandWatermark } from "@/lib/services/idealista/brand-watermark";

const BUCKET = "properties-photos";

/**
 * Aplica el logo de la agencia (Benjamín Cousiño Propiedades) a las fotos que se
 * publican en PortalInmobiliario/MercadoLibre.
 *
 * MercadoLibre descarga las imágenes DESDE su URL pública, así que para que
 * lleven logo hay que servirle URLs de fotos ya marcadas. Este helper: descarga
 * cada foto → aplica la marca → re-sube a una ruta pública dedicada
 * (`portalinmobiliario/<propertyId>/wm-<i>.jpg`) → devuelve esas URLs en el
 * mismo orden.
 *
 * Es tolerante a fallos: si una foto no se puede procesar, se devuelve la URL
 * original (sin marca) para no bloquear la publicación completa.
 */
export async function watermarkPhotosForPortal(
  admin: SupabaseClient,
  propertyId: string,
  urls: string[],
): Promise<string[]> {
  const out: string[] = [];

  for (let i = 0; i < urls.length; i++) {
    const original = urls[i];
    try {
      const res = await fetch(original);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const input = Buffer.from(await res.arrayBuffer());

      const marked = await applyBrandWatermark(input);
      // Re-encode to JPEG so the stored file/content-type are consistent
      // regardless of the source format.
      const jpeg = await sharp(marked).jpeg({ quality: 82 }).toBuffer();

      const path = `portalinmobiliario/${propertyId}/wm-${i}.jpg`;
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;

      const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
      out.push(data.publicUrl);
    } catch {
      out.push(original);
    }
  }

  return out;
}
