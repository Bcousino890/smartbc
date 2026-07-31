import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { CATALOG_ENUMS } from "@/lib/api/v1/captaciones/schema";
import { getPipelinesForCountry, getStagesForPipeline } from "@/lib/captaciones/pipeline";
import { isStaffRole } from "@/lib/permissions";

/**
 * GET /api/v1/catalogos?tipo=…
 *
 * Valores válidos que el proveedor debe usar, para que no mande texto libre y
 * la ficha quede consistente. Un solo endpoint con `tipo`:
 *
 *   enums     · listas cerradas del contrato (tipo de propiedad, moneda, …)
 *   pipelines · pipelines con sus etapas y `key` (lo que espera /etapa)
 *   regiones  · maestro de regiones de Chile
 *   comunas   · maestro de comunas (filtrable con ?region=)
 *   zonas     · zonas de una comuna (?comuna=)
 *   usuarios  · staff al que se puede asignar una captación
 *
 * Sin `tipo` se devuelve el índice con lo que hay disponible.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS = ["enums", "pipelines", "regiones", "comunas", "zonas", "usuarios"] as const;

export const GET = withApiRoute({
  scope: "catalogos:read",
  handler: async (_input, ctx) => {
    const tipo = ctx.searchParams.get("tipo");

    if (!tipo) {
      return {
        data: {
          tipos: TIPOS,
          ejemplo: "/api/v1/catalogos?tipo=pipelines",
        },
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const country = ctx.client.country;

    switch (tipo) {
      case "enums":
        return { data: CATALOG_ENUMS };

      case "pipelines": {
        const pipelines = await getPipelinesForCountry(country);
        const withStages = await Promise.all(
          pipelines.map(async (pipeline) => ({
            name: pipeline.name,
            is_default: pipeline.is_default,
            stages: (await getStagesForPipeline(pipeline.id)).map((stage) => ({
              key: stage.key,
              label: stage.label,
              stage_type: stage.stage_type,
              position: stage.position,
              requires_notes: stage.requires_notes,
            })),
          }))
        );
        ctx.counters.total = withStages.length;
        return { data: withStages };
      }

      case "regiones": {
        const { data } = await db
          .from("chile_regions")
          .select("code, name, full_name")
          .order("name", { ascending: true });
        ctx.counters.total = (data ?? []).length;
        return { data: data ?? [] };
      }

      case "comunas": {
        const region = ctx.searchParams.get("region");
        let query = db
          .from("chile_communes")
          .select("name, code, region_id, chile_regions(name, code)")
          .order("name", { ascending: true });
        const { data } = await query;
        let rows = (data ?? []).map((row: Record<string, unknown>) => ({
          name: row.name,
          code: row.code,
          region: (row.chile_regions as { name?: string } | null)?.name ?? null,
        }));
        if (region) {
          const wanted = region.toLowerCase();
          rows = rows.filter(
            (r: { region: string | null }) => (r.region ?? "").toLowerCase() === wanted
          );
        }
        ctx.counters.total = rows.length;
        return { data: rows };
      }

      case "zonas": {
        const comuna = ctx.searchParams.get("comuna");
        const { data } = await db
          .from("chile_zones")
          .select("name, chile_communes(name)")
          .order("name", { ascending: true });
        let rows = (data ?? []).map((row: Record<string, unknown>) => ({
          name: row.name,
          commune: (row.chile_communes as { name?: string } | null)?.name ?? null,
        }));
        if (comuna) {
          const wanted = comuna.toLowerCase();
          rows = rows.filter(
            (r: { commune: string | null }) => (r.commune ?? "").toLowerCase() === wanted
          );
        }
        ctx.counters.total = rows.length;
        return { data: rows };
      }

      case "usuarios": {
        // Solo email, nombre y rol: la API no expone ids internos de usuarios.
        const { data } = await db
          .from("profiles")
          .select("email, full_name, role")
          .order("full_name", { ascending: true });
        const rows = (data ?? []).filter((p: { role: string }) => isStaffRole(p.role));
        ctx.counters.total = rows.length;
        return { data: rows };
      }

      default:
        return {
          data: { error: `tipo "${tipo}" no reconocido`, tipos: TIPOS },
          status: 400,
        };
    }
  },
});
