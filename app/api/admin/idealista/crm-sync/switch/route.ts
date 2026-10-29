import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getSwitchStatus, setSwitch } from "@/lib/services/idealista/crm-sync/switch";

// Interruptor de la sincronización Idealista API → CRM (0234). SOLO el dueño.
// GET: estado y comprobaciones. POST {enabled}: encender (solo si todo sale
// bien; lo decide la base) o apagar (siempre). Nunca llama a Idealista.

async function owner() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (profile.role !== "owner") return { error: Response.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  return { profile };
}

export async function GET() {
  const gate = await owner();
  if ("error" in gate) return gate.error;
  return Response.json(await getSwitchStatus());
}

export async function POST(req: Request) {
  const gate = await owner();
  if ("error" in gate) return gate.error;
  let body: { enabled?: unknown };
  try {
    body = (await req.json()) as { enabled?: unknown };
  } catch {
    return Response.json({ ok: false, error: "Cuerpo inválido" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") return Response.json({ ok: false, error: "Falta enabled" }, { status: 400 });
  const result = await setSwitch(body.enabled, gate.profile.id);
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
