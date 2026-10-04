import "server-only";
import { NextRequest } from "next/server";
import { defaultMailboxEmail, requireStaff } from "@/lib/mailbox/session";
import type { SignatureMode } from "@/lib/mailbox/signature";
import { saveSignature } from "@/lib/mailbox/store";

export const dynamic = "force-dynamic";

const MODES: SignatureMode[] = ["auto", "custom", "none"];
const MAX_SIGNATURE_HTML = 20_000;

export async function PUT(req: NextRequest) {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;
  const { profile } = gate;

  let body: { mode?: unknown; html?: unknown; title?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }

  const mode = MODES.includes(body.mode as SignatureMode) ? (body.mode as SignatureMode) : null;
  if (!mode) return Response.json({ error: "Modo de firma inválido" }, { status: 400 });

  const html = typeof body.html === "string" ? body.html.trim() : "";
  if (html.length > MAX_SIGNATURE_HTML) {
    return Response.json({ error: "La firma es demasiado larga." }, { status: 400 });
  }
  if (mode === "custom" && !html) {
    return Response.json({ error: "Escribe tu firma o elige la automática." }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) || null : null;

  try {
    await saveSignature(profile.id, defaultMailboxEmail(profile) ?? profile.email, {
      mode,
      html: html || null,
      title,
    });
  } catch (err) {
    return Response.json({ error: "No se pudo guardar la firma.", detail: String(err) }, { status: 500 });
  }
  return Response.json({ ok: true });
}
