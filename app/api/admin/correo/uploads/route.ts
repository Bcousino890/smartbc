import "server-only";
import { NextRequest } from "next/server";
import { requireStaff } from "@/lib/mailbox/session";
import { createUpload, UploadError } from "@/lib/mailbox/uploads";

export const dynamic = "force-dynamic";

/**
 * Empieza la subida de un adjunto: { filename, size, contentType } → { id }.
 * Los bytes llegan después por trozos (PUT /uploads/{id}?offset=N): ver por
 * qué en lib/mailbox/attachments.ts.
 */
export async function POST(req: NextRequest) {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;

  let body: { filename?: unknown; size?: unknown; contentType?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }
  try {
    const meta = await createUpload(gate.profile.id, {
      filename: typeof body.filename === "string" ? body.filename : "archivo",
      size: typeof body.size === "number" ? body.size : 0,
      contentType: typeof body.contentType === "string" ? body.contentType : "",
    });
    return Response.json({ id: meta.id });
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: "No se pudo preparar la subida.", detail: String(err) }, { status: 500 });
  }
}
