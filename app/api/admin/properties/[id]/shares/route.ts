import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { getPropertyShareOptions } from "@/lib/db/queries/viewing-collections";

export const dynamic = "force-dynamic";

/**
 * SmartLinks existentes de una propiedad, para el selector "reutilizar uno
 * existente" del editor de parada.
 *
 * Devuelve el `label` porque el agente necesita reconocerlo — es una superficie
 * de STAFF, no pública. En la colección pública el label nunca se selecciona.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("properties", "view");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const data = await getPropertyShareOptions(id);
  return Response.json({ data });
}
