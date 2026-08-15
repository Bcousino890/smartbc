import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { getPropertyShareOptions } from "@/lib/db/queries/viewing-collections";

export const dynamic = "force-dynamic";

/**
 * SmartLinks existentes de una propiedad, para el selector "reutilizar uno
 * existente" del editor de parada.
 *
 * Vive aquí y no bajo /properties/[id]/... porque ese segmento dinámico ya
 * está tomado por [slug] y Next.js no admite dos nombres distintos para el
 * mismo nivel.
 *
 * Devuelve el `label` porque el agente necesita reconocerlo — es una
 * superficie de STAFF. En la colección pública el label nunca se selecciona.
 */
export async function GET(req: Request) {
  const gate = await requirePermission("properties", "view");
  if (!gate.ok) return gate.response;

  const propertyId = new URL(req.url).searchParams.get("propertyId");
  if (!propertyId) {
    return Response.json({ error: "propertyId requerido" }, { status: 400 });
  }

  const data = await getPropertyShareOptions(propertyId);
  return Response.json({ data });
}
