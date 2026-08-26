import "server-only";
import { withApiRoute } from "@/lib/api/handler";
import { getIdealistaScraperConfig } from "@/lib/api/v1/idealista/config";

/**
 * GET /api/v1/idealista/config
 *
 * Frecuencias, umbrales y cuotas que el scraper debe respetar. Se editan en
 * /admin/particulares/scraper y se leen aquí: cambiar cada cuánto se refresca
 * un particular, o frenar el gasto a mitad de mes, no requiere un deploy del
 * proveedor externo.
 *
 * `version` sube en cada cambio, así que basta con comparar ese entero para
 * saber si hay que releer. Recomendación al scraper: sondear cada pocos
 * minutos y respetar `scraping_enabled: false` como parada inmediata.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiRoute({
  scope: "idealista:read",
  handler: async () => {
    const config = await getIdealistaScraperConfig();
    return { data: config };
  },
});
