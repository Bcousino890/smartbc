import "server-only";
import { withApiRoute } from "@/lib/api/handler";

/**
 * GET /api/v1/ping
 *
 * Comprobación de credenciales. Es lo primero que se le pide a un proveedor
 * nuevo: si esto responde 200, su clave, sus scopes y su conectividad están
 * bien, y cualquier fallo posterior es del payload.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiRoute({
  scope: "catalogos:read",
  handler: async (_input, ctx) => ({
    data: {
      ok: true,
      client: {
        name: ctx.client.name,
        slug: ctx.client.slug,
        country: ctx.client.country,
      },
      scopes: ctx.key.scopes,
      rate_limit_per_minute: ctx.key.rate_limit_per_minute,
      server_time: new Date().toISOString(),
      api_version: "v1",
    },
  }),
});
