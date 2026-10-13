import "server-only";
import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";

/**
 * Una fila del listado de /admin/particulares por id, con la misma forma que
 * las filas que trae la página (anuncio + asignación + último contacto) y el
 * mismo permiso (`particulares:view`). Sirve para abrir una ficha por enlace
 * directo (`?ficha=<id>`) cuando ese anuncio no está en la página actual.
 *
 * A diferencia del listado, incluye la galería completa y la ficha técnica
 * (lo que luego pediría /detail), así que la ficha abre con todo puesto.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role ?? "", "particulares", "view")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Anuncio no encontrado" }, { status: 404 });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data, error } = await admin.from("particulares").select("*").eq("id", id).maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Anuncio no encontrado" }, { status: 404 });

    // Enriquecimiento igual que el del listado (finishEnrichment): último
    // contacto, nº de contactos y nombres de asesor.
    const { data: contacts } = await admin
      .from("particulares_contacts")
      .select("advisor_id, contact_type, contacted_at")
      .eq("particular_id", id)
      .order("contacted_at", { ascending: false });
    const last = contacts?.[0] ?? null;
    const advisorIds = [...new Set([data.assigned_to, last?.advisor_id].filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (advisorIds.length > 0) {
      const { data: profs } = await admin.from("profiles").select("id, full_name, email").in("id", advisorIds);
      for (const p of profs ?? []) names.set(p.id, (p.full_name as string) || (p.email as string));
    }

    const { scraper_extra: extra, ...rest } = data;
    return Response.json({
      ...rest,
      photos: data.photos ?? [],
      district: extra && typeof extra === "object" ? ((extra as Record<string, unknown>).district ?? null) : null,
      assigned_to: data.assigned_to ?? null,
      assigned_name: data.assigned_to ? (names.get(data.assigned_to) ?? null) : null,
      last_contact_at: last?.contacted_at ?? null,
      last_contact_by: last ? (names.get(last.advisor_id) ?? null) : null,
      last_contact_type: last?.contact_type ?? null,
      contact_count: contacts?.length ?? 0,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "query_failed" }, { status: 500 });
  }
}
