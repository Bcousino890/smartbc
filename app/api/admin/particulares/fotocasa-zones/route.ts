import "server-only";
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import {
  readFotocasaZones,
  FOTOCASA_ZONES_SETTING_KEY,
} from "@/lib/sync/particulares/fotocasa-runner";
import {
  dedupeFotocasaZones,
  isKnownFotocasaZone,
  FOTOCASA_MADRID_DISTRICTS,
} from "@/lib/sync/particulares/fotocasa-zones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Zonas de Madrid que el scraper de Fotocasa recorre entero.
//
// GET  → catálogo completo (distritos con sus barrios) + selección actual.
// PUT  → guarda la selección { zones: string[] }.
//
// La selección vive en `app_settings` (misma casa que `scraping.proxyUrl`), no
// en una tabla propia: es un único ajuste global, sin histórico.

export async function GET() {
  const profile = await getCurrentProfile().catch(() => null);
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const selected = await readFotocasaZones(supabase);

  return NextResponse.json(
    { districts: FOTOCASA_MADRID_DISTRICTS, selected },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(req: Request) {
  const profile = await getCurrentProfile().catch(() => null);
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo no válido" }, { status: 400 });
  }

  const raw = (body as { zones?: unknown })?.zones;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "Falta la lista de zonas" }, { status: 400 });
  }

  // Sólo slugs del catálogo: un slug inventado daría 404 en cada pasada del
  // cron y el fallo no se vería hasta revisar los logs.
  const desconocidas = raw.filter(
    (z): z is string => typeof z === "string" && !isKnownFotocasaZone(z),
  );
  if (desconocidas.length > 0) {
    return NextResponse.json(
      { error: `Zonas desconocidas: ${desconocidas.join(", ")}` },
      { status: 400 },
    );
  }

  const zones = dedupeFotocasaZones(
    raw.filter((z): z is string => typeof z === "string"),
  );

  // Cast laxo como el resto de escrituras a `app_settings` (los genéricos del
  // SDK no modelan bien la tabla clave/valor).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: FOTOCASA_ZONES_SETTING_KEY,
      value: zones,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    console.error("[fotocasa-zones] error guardando:", error);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, zones },
    { headers: { "Cache-Control": "no-store" } },
  );
}
