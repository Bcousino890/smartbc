import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { requirePermission } from "@/lib/auth/guard";
import {
  EDITABLE_CONFIG_FIELDS,
  getIdealistaScraperConfig,
} from "@/lib/api/v1/idealista/config";

/**
 * /api/admin/idealista/scraper/config
 *
 * Lectura y edición de las frecuencias del scraper desde el panel. Es la misma
 * fila que el proveedor externo lee en `GET /api/v1/idealista/config`: lo que
 * se guarda aquí, él lo aplica en su siguiente sondeo sin desplegar nada.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requirePermission("particulares", "view");
  if (!gate.ok) return gate.response;

  return Response.json({ config: await getIdealistaScraperConfig() });
}

export async function PATCH(req: Request) {
  const gate = await requirePermission("particulares", "edit");
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Allowlist: solo se escriben campos conocidos. `version` y `updated_at` los
  // lleva la base de datos (trigger de 0122), nunca el cliente.
  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE_CONFIG_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];

    if (field === "scraping_enabled") {
      if (typeof value !== "boolean") {
        return Response.json({ error: "scraping_enabled debe ser booleano" }, { status: 400 });
      }
      patch[field] = value;
      continue;
    }
    if (field === "notes") {
      patch[field] = typeof value === "string" ? value.slice(0, 2000) : null;
      continue;
    }

    // El resto son horas, minutos y cuotas: enteros positivos. Un 0 en un
    // intervalo de refresco significaría "reintenta sin parar", así que el
    // mínimo real es 1 salvo en las cuotas, donde 0 sí es legítimo.
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 0) {
      return Response.json(
        { error: `${field} debe ser un entero mayor o igual que 0` },
        { status: 400 },
      );
    }
    const isQuota = field === "monthly_request_budget" || field === "monthly_request_reserve";
    if (!isQuota && numeric < 1) {
      return Response.json({ error: `${field} debe ser al menos 1` }, { status: 400 });
    }
    patch[field] = numeric;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No hay nada que guardar" }, { status: 400 });
  }

  patch.updated_by = gate.profile.id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db
    .from("idealista_scraper_config")
    .update(patch)
    .eq("singleton", true);
  if (error) {
    console.error("[idealista scraper config]", error);
    return Response.json({ error: "No se pudo guardar la configuración" }, { status: 500 });
  }

  return Response.json({ config: await getIdealistaScraperConfig() });
}
