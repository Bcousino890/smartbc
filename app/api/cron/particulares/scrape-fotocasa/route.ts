import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  scrapeFotocasaParticulares,
  readFotocasaZones,
  FOTOCASA_MAX_PAGES,
  FOTOCASA_DEFAULT_LOCATION,
} from "@/lib/sync/particulares/fotocasa-runner";
import { dedupeFotocasaZones } from "@/lib/sync/particulares/fotocasa-zones";
import type { FotocasaOperation } from "@/lib/sync/particulares/fotocasa-scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

// Envoltorio HTTP del scraping de particulares de Fotocasa. Toda la lógica
// (paginación, filtrado de particulares, upsert, bajas) vive en el runner para
// poder ejecutarla también desde `scripts/fotocasa-smoke.mts` sin levantar Next.
//
// Parámetros opcionales:
//   ?fromPage / ?toPage  rango de páginas (backfill por tramos)
//   ?location=…          slug de Fotocasa (por defecto madrid-capital)
//   ?operation=rent|sale una sola operación (por defecto las dos)
//   ?scrapeOnly=true     omite la pasada de bajas (para backfills largos)
export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromPage = Math.max(
    1,
    Number.parseInt(searchParams.get("fromPage") ?? "1", 10) || 1,
  );
  const toPage = Math.max(
    fromPage,
    Number.parseInt(searchParams.get("toPage") ?? String(FOTOCASA_MAX_PAGES), 10) ||
      FOTOCASA_MAX_PAGES,
  );
  const location = searchParams.get("location") ?? FOTOCASA_DEFAULT_LOCATION;
  const scrapeOnly = searchParams.get("scrapeOnly") === "true";
  const opParam = searchParams.get("operation");
  const operations: FotocasaOperation[] =
    opParam === "rent" || opParam === "sale" ? [opParam] : ["rent", "sale"];

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // `?zones=goya,recoletos` fuerza unas zonas concretas (útil para un
    // backfill puntual); sin el parámetro manda lo configurado en el panel.
    const zonesParam = searchParams.get("zones");
    const zones = zonesParam
      ? dedupeFotocasaZones(zonesParam.split(",").map((z) => z.trim()).filter(Boolean))
      : await readFotocasaZones(supabase);

    console.log(
      `[cron-fotocasa] ${location} · ${zones.length} zonas · ${operations.join("+")} · páginas ${fromPage}-${toPage}`,
    );
    const results = await scrapeFotocasaParticulares(supabase, {
      fromPage,
      toPage,
      location,
      zones,
      operations,
      scrapeOnly,
    });
    return Response.json({
      ok: true,
      timestamp: new Date().toISOString(),
      source: "fotocasa",
      location,
      zones,
      operations,
      pages: { fromPage, toPage },
      results,
    });
  } catch (error) {
    console.error("[cron-fotocasa] Error:", error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
