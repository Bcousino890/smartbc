import "server-only";
import sharp from "sharp";
import { createAdminClient } from "@/lib/db/admin";

const BUCKET = "properties-photos";
const MAX_WIDTH = 1920;
const WEBP_QUALITY = 82;

function watermarkSvg(width: number, height: number): Buffer {
  // Marca diagonal sutil + bloque visible abajo derecha.
  const fontSize = Math.max(18, Math.round(width / 38));
  const padding = Math.round(width / 50);
  const blockHeight = Math.round(fontSize * 2.6);
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(0,0,0,0)" />
          <stop offset="1" stop-color="rgba(0,0,0,0.55)" />
        </linearGradient>
      </defs>
      <rect x="0" y="${height - blockHeight}" width="${width}" height="${blockHeight}" fill="url(#g)" />
      <text x="${width - padding}" y="${height - padding - Math.round(fontSize * 0.4)}"
            font-family="Georgia, 'Times New Roman', serif"
            font-size="${fontSize}" fill="#d4af7f" text-anchor="end"
            font-weight="600" letter-spacing="2">BENJAMÍN COUSIÑO</text>
      <text x="${width - padding}" y="${height - padding + Math.round(fontSize * 0.45)}"
            font-family="Helvetica, Arial, sans-serif"
            font-size="${Math.round(fontSize * 0.45)}" fill="#f7f1e6" text-anchor="end"
            letter-spacing="4" opacity="0.85">PROPIEDADES · MADRID</text>
    </svg>`,
  );
}

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
    const res = await fetch(params.sourceUrl, {
      headers: {
        "User-Agent": "smartbc-bot/1.0 (contacto@bencousinopropiedades.com)",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `fetch_${res.status}` };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const image = sharp(buf, { failOn: "none" }).rotate();
    const meta = await image.metadata();
    const targetWidth = Math.min(meta.width ?? MAX_WIDTH, MAX_WIDTH);

    const resized = image.resize({
      width: targetWidth,
      withoutEnlargement: true,
    });
    const resizedMeta = await resized.clone().metadata();
    const finalWidth = resizedMeta.width ?? targetWidth;
    const finalHeight = resizedMeta.height ?? Math.round(finalWidth * 0.66);

    const output = await resized
      .composite([
        {
          input: watermarkSvg(finalWidth, finalHeight),
          top: 0,
          left: 0,
        },
      ])
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
