import { NextRequest } from "next/server";
import { addUploadedPhoto } from "@/lib/imports/drafts";
import { importErrorMessage } from "@/lib/imports/errors";
import { checkPermission } from "@/lib/auth/guard";
import { MAX_UPLOAD_BYTES } from "@/lib/imports/photos";
import type { Country } from "@/lib/country-config";

export const dynamic = "force-dynamic";

/**
 * Foto de un borrador de PDF (BCP-01 P5). El navegador ya la recorta y la
 * reduce (≤ 2560 px), así que pesa poco: la ruta SÍ pasa por el middleware
 * (barrera de sesión de /api/admin) y el cuerpo queda muy por debajo de su
 * corte de 10 MB. El servidor no se fía de nada: comprueba permiso, que el
 * borrador es del usuario, la firma de la imagen, bytes y píxeles, y la
 * recodifica antes de guardarla en el bucket PRIVADO.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const country = (req.nextUrl.searchParams.get("country") ?? "es") as Country;
  if (country !== "es" && country !== "cl") return Response.json({ ok: false, error: "País no válido." }, { status: 400 });
  const g = await checkPermission("properties", "create", { country });
  if (!g.ok) return Response.json({ ok: false, error: g.error }, { status: 403 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return Response.json({ ok: false, code: "file_too_large", error: "La foto pesa demasiado (máximo 8 MB)." }, { status: 413 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "Se cortó la subida. Inténtalo de nuevo." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ ok: false, error: "Falta la foto." }, { status: 400 });
  const pageRaw = Number(form.get("page") ?? "");
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : null;
  const res = await addUploadedPhoto(g.profile.id, id, Buffer.from(await file.arrayBuffer()), page);
  if (!res.ok) return Response.json({ ok: false, code: res.error, error: importErrorMessage(res.error) }, { status: 400 });
  return Response.json(res);
}
