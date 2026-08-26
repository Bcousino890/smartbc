import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { getIdealistaScraperStatus } from "@/lib/api/v1/idealista/status";

/**
 * GET /api/admin/idealista/scraper/status
 *
 * Alimenta el mini panel técnico. Lo consulta el cliente cada pocos segundos,
 * así que no hace escrituras ni cálculos caros: son contadores y una lectura
 * del último heartbeat.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requirePermission("particulares", "view");
  if (!gate.ok) return gate.response;

  try {
    return Response.json(await getIdealistaScraperStatus());
  } catch (err) {
    console.error("[idealista scraper status]", err);
    return Response.json({ error: "No se pudo leer el estado del scraper" }, { status: 500 });
  }
}
