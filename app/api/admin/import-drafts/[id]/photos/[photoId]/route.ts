import { NextRequest } from "next/server";
import { checkPermission } from "@/lib/auth/guard";
import type { Country } from "@/lib/country-config";
import { readDraftPhoto } from "@/lib/imports/drafts";

export const dynamic = "force-dynamic";

/**
 * Ver una foto SUBIDA de un borrador de PDF (BCP-01 P8). Vive en el bucket
 * privado: solo la ve quien creó el borrador y puede crear propiedades. Nunca
 * es pública ni se sirve por URL directa del almacenamiento.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const { id, photoId } = await params;
  const country = (req.nextUrl.searchParams.get("country") ?? "es") as Country;
  if (country !== "es" && country !== "cl") return new Response("bad_request", { status: 400 });
  const g = await checkPermission("properties", "create", { country });
  if (!g.ok) return new Response("forbidden", { status: 403 });
  const r = await readDraftPhoto(g.profile.id, id, photoId);
  if (!r.ok) return new Response("not_found", { status: 404 });
  return new Response(new Uint8Array(r.data), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
