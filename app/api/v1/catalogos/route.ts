import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { apiErrors } from "@/lib/api/errors";
import { locationKey } from "@/lib/captaciones/write/resolve-location";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

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
        const { data, error } = await db
          .from("chile_regions")
          .select("code, name, full_name")
          .order("name", { ascending: true });
        if (error) throw apiErrors.internal(`No se pudo leer el maestro de regiones: ${error.message}`);
        ctx.counters.total = (data ?? []).length;
        return { data: data ?? [] };
      }

      case "comunas": {
        // Dos consultas y unión en memoria en vez del embed de PostgREST: el
        // embed depende de que detecte la clave ajena y, si no la ve, devuelve
        // un error que antes se tragaba y salía como lista vacía.
        const [{ data: regions, error: regionsError }, { data: communes, error: communesError }] =
          await Promise.all([
            db.from("chile_regions").select("id, code, name"),
            db.from("chile_communes").select("name, code, region_id").order("name", { ascending: true }),
          ]);
        if (regionsError || communesError) {
          throw apiErrors.internal(
            `No se pudo leer el maestro de comunas: ${(regionsError ?? communesError).message}`
          );
        }

        const regionById = new Map<string, { code: string; name: string }>(
          (regions ?? []).map((r: Row) => [r.id as string, { code: r.code, name: r.name }])
        );

        type CommuneRow = { name: string; code: string | null; region: string | null; region_code: string | null };
        let rows: CommuneRow[] = (communes ?? []).map((row: Row) => {
          const region = regionById.get(row.region_id as string);
          return {
            name: row.name as string,
            code: (row.code as string) ?? null,
            region: region?.name ?? null,
            region_code: region?.code ?? null,
          };
        });

        // El filtro acepta el nombre o el código de región, y es insensible a
        // mayúsculas y tildes ("metropolitana", "RM", "Región Metropolitana").
        const region = ctx.searchParams.get("region");
        if (region) {
          const wanted = locationKey(region);
          rows = rows.filter(
            (r) => locationKey(r.region ?? "") === wanted || locationKey(r.region_code ?? "") === wanted
          );
        }

        ctx.counters.total = rows.length;
        return { data: rows };
      }

      case "zonas": {
        const [{ data: communes, error: communesError }, { data: zones, error: zonesError }] =
          await Promise.all([
            db.from("chile_communes").select("id, name"),
            db.from("chile_zones").select("name, commune_id").order("name", { ascending: true }),
          ]);
        if (communesError || zonesError) {
          throw apiErrors.internal(
            `No se pudo leer el maestro de zonas: ${(communesError ?? zonesError).message}`
          );
        }

        const communeById = new Map<string, string>(
          (communes ?? []).map((c: Row) => [c.id as string, c.name as string])
        );

        type ZoneRow = { name: string; commune: string | null };
        let rows: ZoneRow[] = (zones ?? []).map((row: Row) => ({
          name: row.name as string,
          commune: communeById.get(row.commune_id as string) ?? null,
        }));

        const comuna = ctx.searchParams.get("comuna");
        if (comuna) {
          const wanted = locationKey(comuna);
          rows = rows.filter((r) => locationKey(r.commune ?? "") === wanted);
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
