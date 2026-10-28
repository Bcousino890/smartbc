import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { environmentOf, MEDIA_BUDGET_IN_RETRY_MS } from "@/lib/services/idealista/crm-sync/core";
import { applyLatest, recoverApiPropertyId, releaseContainment, resolveReview } from "@/lib/services/idealista/crm-sync/sync";

// Sincronización Idealista API → CRM, SIN Idealista (D6, I1): reintenta solo
// la parte local, resuelve una revisión o recupera el id de un alta ya
// confirmada. No importa partner-api/client ni partner-api/endpoints (lo
// vigila scripts/test-idealista-crm-sync.mts).

export const maxDuration = 300;

type Body = {
  listingId?: string;
  action?: "retry" | "resolve_review" | "recover_api_id" | "release_containment";
  choice?: "use_existing" | "generate";
  propertyId?: string;
};

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "Cuerpo inválido" }, { status: 400 });
  }
  const listingId = (body.listingId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) return Response.json({ ok: false, error: "Falta listingId" }, { status: 400 });

  // Solo el modo (sandbox/producción) de la configuración: sin descifrar nada.
  const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: cfg } = await db.from("idealista_config").select("sandbox_mode").order("created_at", { ascending: true }).limit(1).maybeSingle();
  const environment = environmentOf(cfg?.sandbox_mode !== false);

  if (body.action === "retry") {
    const r = await applyLatest(listingId, environment, { budgetMs: MEDIA_BUDGET_IN_RETRY_MS, actorId: profile.id });
    return Response.json(r);
  }
  if (body.action === "resolve_review") {
    if (body.choice !== "use_existing" && body.choice !== "generate") {
      return Response.json({ ok: false, error: "Elección no válida" }, { status: 400 });
    }
    const r = await resolveReview(listingId, environment, body.choice, body.choice === "use_existing" ? body.propertyId ?? null : null, profile.id);
    if (!r.ok) return Response.json({ ok: false, message: `No se pudo resolver: ${r.error ?? "desconocido"}` });
    const applied = await applyLatest(listingId, environment, { budgetMs: MEDIA_BUDGET_IN_RETRY_MS, actorId: profile.id });
    return Response.json(applied);
  }
  if (body.action === "release_containment") {
    const r = await releaseContainment(listingId, environment, profile.id, { budgetMs: MEDIA_BUDGET_IN_RETRY_MS });
    return Response.json(r);
  }
  if (body.action === "recover_api_id") {
    const r = await recoverApiPropertyId(listingId, environment);
    return Response.json({
      ok: r.ok,
      message: r.ok ? `Id recuperado: ${r.apiPropertyId}` : r.error === "no_confirmed_create" ? "No hay un alta confirmada con id que recuperar." : `No se pudo: ${r.error}`,
    });
  }
  return Response.json({ ok: false, error: "Acción desconocida" }, { status: 400 });
}
