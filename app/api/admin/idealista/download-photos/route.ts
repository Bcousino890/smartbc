import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { createAdminClient } from "@/lib/db/admin";
import { buildZip, type ZipEntry } from "@/lib/services/zip";
import { applyBrandWatermark } from "@/lib/services/idealista/brand-watermark";

// Descarga TODAS las fotos de una ficha en un ZIP, con la marca de agua de la
// agencia superpuesta (protege las fotos si se suben a Idealista u otro
// portal). Al descomprimir queda una carpeta con la referencia BC (ej.
// "BC-1133/01.jpg"). Pensado para que el jefe se baje las fotos de una tacada.

const CONCURRENCY = 8;

function extFromContentType(ct: string | null, url: string): string {
  if (ct?.includes("webp")) return "webp";
  if (ct?.includes("png")) return "png";
  if (ct?.includes("jpeg") || ct?.includes("jpg")) return "jpg";
  // fallback: por la extensión del path (sin query)
  const m = url.split("?")[0].match(/\.(webp|png|jpe?g)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

// Nombre de carpeta/archivo seguro: solo ASCII alfanumérico, guion y guion bajo.
function safeName(raw: string): string {
  return (
    raw
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "fotos"
  );
}

export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "properties", "export")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const listingId = new URL(req.url).searchParams.get("listingId");
  if (!listingId) {
    return Response.json({ error: "listingId es requerido" }, { status: 400 });
  }

  const db = createAdminClient() as any;
  const { data: listing } = await db
    .from("idealista_listings")
    .select("reference_code, inspo_title, photo_ids")
    .eq("id", listingId)
    .single();

  if (!listing) {
    return Response.json({ error: "Ficha no encontrada" }, { status: 404 });
  }

  const urls: string[] = (listing.photo_ids ?? []) as string[];
  if (urls.length === 0) {
    return Response.json({ error: "Esta ficha no tiene fotos" }, { status: 400 });
  }

  const folder = safeName(listing.reference_code || listing.inspo_title || "fotos");

  // Descarga las fotos en lotes. Las que fallen se omiten.
  const entries: (ZipEntry | null)[] = new Array(urls.length).fill(null);
  for (let start = 0; start < urls.length; start += CONCURRENCY) {
    const batch = urls.slice(start, start + CONCURRENCY);
    await Promise.all(
      batch.map(async (url, j) => {
        const i = start + j;
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 20_000);
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
          try {
            buf = Buffer.from(await applyBrandWatermark(rawBuf));
          } catch {
            // si el procesado falla, se incluye la foto original sin marca
          }
          entries[i] = { name: `${folder}/${num}.${ext}`, data: buf };
        } catch {
          // foto que falla: se omite
        }
      }),
    );
  }

  const files = entries.filter((e): e is ZipEntry => e !== null);
  if (files.length === 0) {
    return Response.json({ error: "No se pudo descargar ninguna foto" }, { status: 502 });
  }

  const zip = buildZip(files);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${folder}.zip"`,
      "Content-Length": String(zip.length),
    },
  });
}
