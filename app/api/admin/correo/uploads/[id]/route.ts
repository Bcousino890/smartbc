import "server-only";
import { NextRequest } from "next/server";
import { UPLOAD_CHUNK_BYTES } from "@/lib/mailbox/attachments";
import { requireStaff } from "@/lib/mailbox/session";
import { appendChunk, deleteUpload, UploadError } from "@/lib/mailbox/uploads";

export const dynamic = "force-dynamic";

/** Un trozo (cuerpo binario crudo) en la posición `offset`. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const offset = Number.parseInt(req.nextUrl.searchParams.get("offset") || "", 10);
  if (!Number.isInteger(offset) || offset < 0) return Response.json({ error: "offset inválido" }, { status: 400 });

  let chunk: Buffer;
  try {
    chunk = Buffer.from(await req.arrayBuffer());
  } catch {
    return Response.json({ error: "Se cortó la subida del trozo." }, { status: 400 });
  }
  if (chunk.length === 0) return Response.json({ error: "Trozo vacío" }, { status: 400 });
  if (chunk.length > UPLOAD_CHUNK_BYTES) return Response.json({ error: "Trozo demasiado grande" }, { status: 413 });

  try {
    return Response.json(await appendChunk(gate.profile.id, id, offset, chunk));
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: "No se pudo guardar el trozo.", detail: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  try {
    await deleteUpload(gate.profile.id, id);
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: err.status });
  }
  return Response.json({ ok: true });
}
