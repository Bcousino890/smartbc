import "server-only";
import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import type { AppliedEnrichment, EnrichmentCandidate, EnrichmentsPayload } from "@/lib/particulares/enrich-types";

/**
 * Lo que el enriquecimiento (migración 0187) añadió a un anuncio y lo que solo sugiere: alimenta el bloque
 * «Dato añadido desde la descripción» de la ficha. Va aparte de `detail` (lo pide el modal al abrirse).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

/** El campo aún vale lo que puso el enriquecimiento (si alguien lo editó después, ya no se enseña ni se puede deshacer). */
function stillCurrent(campo: string, after: Json, row: Json): boolean {
  switch (campo) {
    case "phone":
    case "phone2":
    case "address":
    case "owner_name":
      return row[campo] === after[campo];
    case "location":
      return row.latitude === after.latitude && row.longitude === after.longitude;
    default:
      return false;
  }
}

function readable(campo: string, after: Json): string {
  if (campo === "location") return `${Number(after.latitude).toFixed(5)}, ${Number(after.longitude).toFixed(5)}`;
  return String(after[campo] ?? "");
}

export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role ?? "", "particulares", "view")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Falta el parámetro id" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [rowRes, auditRes, stateRes] = await Promise.all([
    db.from("particulares").select("phone, phone2, address, owner_name, latitude, longitude").eq("id", id).maybeSingle(),
    db
      .from("particulares_enrichments")
      .select("id, campo, valor_despues, regla, confianza, evidencia, applied_at, origen")
      .eq("particular_id", id)
      .is("reverted_at", null)
      .order("applied_at", { ascending: false })
      .limit(20),
    db.from("particulares_enrichment_state").select("candidates").eq("particular_id", id).maybeSingle(),
  ]);
  if (rowRes.error) return Response.json({ error: rowRes.error.message }, { status: 500 });
  // Las tablas pueden no existir aún si la migración 0187 no se aplicó: la ficha simplemente no enseña el bloque.
  const row = (rowRes.data ?? {}) as Json;
  const applied: AppliedEnrichment[] = ((auditRes.data ?? []) as Array<Json>)
    .filter((e) => stillCurrent(String(e.campo), (e.valor_despues ?? {}) as Json, row))
    .map((e) => ({
      id: String(e.id),
      campo: e.campo as AppliedEnrichment["campo"],
      value: readable(String(e.campo), (e.valor_despues ?? {}) as Json),
      regla: String(e.regla),
      confianza: e.confianza as "alta" | "media",
      evidencia: (e.evidencia as string | null) ?? null,
      applied_at: String(e.applied_at),
      origen: e.origen as "auto" | "manual",
    }));
  const candidates: EnrichmentCandidate[] = (((stateRes.data?.candidates ?? []) as Array<Json>) || [])
    .filter((c) => c.status === "pendiente" && c.confidence === "media")
    .map((c) => ({
      key: String(c.key),
      field: c.field as EnrichmentCandidate["field"],
      value: String(c.value),
      confidence: "media",
      rule: String(c.rule),
      evidence: String(c.evidence ?? ""),
      reason: (c.reason as string | null) ?? null,
    }));
  const payload: EnrichmentsPayload = { applied, candidates };
  return Response.json(payload);
}
