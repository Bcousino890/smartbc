import "server-only";
import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { normalizeAgencyUrl } from "@/lib/particulares/agency-web";
import { rereadAgencyWeb } from "@/lib/particulares/agency-web-runner";

/**
 * «Releer web»: vuelve a leer AHORA la ficha de la web de la agencia de un anuncio (1 petición + robots.txt).
 * La web no se sigue de forma continua; este botón y los cambios del anuncio del portal son los únicos motivos
 * para volver a leerla. La URL sale SIEMPRE del anuncio (nunca de la petición), así que no es un proxy abierto.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIN_GAP_MS = 30_000;

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role ?? "", "particulares", "view")) return Response.json({ error: "Forbidden" }, { status: 403 });
  let body: { particular_id?: string; key?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON no válido" }, { status: 400 });
  }
  if (!body.particular_id || !body.key) return Response.json({ error: "Faltan particular_id y key" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const own = await db.from("particulares").select("id, scraper_extra").eq("id", body.particular_id).maybeSingle();
  const rawUrl: string | undefined = own.data?.scraper_extra?.agency_url;
  const n = normalizeAgencyUrl(rawUrl);
  if (!n || !n.isListing || n.key !== body.key) return Response.json({ error: "El anuncio no enlaza esa web" }, { status: 404 });

  const prev = await db.from("particulares_agency_webs").select("fetched_at").eq("url_key", n.key).maybeSingle();
  if (prev.error) return Response.json({ error: "La caché de webs no está disponible (migración 0203/0204)" }, { status: 503 });
  const at = prev.data?.fetched_at ? Date.parse(prev.data.fetched_at) : 0;
  if (at && Date.now() - at < MIN_GAP_MS) return Response.json({ error: "Acaba de leerse; espera unos segundos" }, { status: 429 });

  // Anuncios que enlazan esa misma URL: fijan la huella con la que se compara el próximo cambio.
  const sib = await db
    .from("particulares")
    .select("price, is_active, reference, scraper_extra")
    .eq("scraper_extra->>agency_url", rawUrl as string)
    .limit(20);
  const rows = ((sib.data ?? []) as Array<{ price: number | null; is_active: boolean | null; reference: string | null; scraper_extra: { agency_reference?: string } | null }>).map((r) => ({
    agency_url: rawUrl,
    price: r.price,
    is_active: r.is_active,
    reference: r.reference,
    agency_reference: r.scraper_extra?.agency_reference ?? null,
  }));
  const res = await rereadAgencyWeb(db, rawUrl as string, rows);
  return Response.json(res, { status: res.ok ? 200 : 500 });
}
