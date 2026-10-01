import "server-only";
import { verifyExtensionToken } from "@/lib/services/idealista/extension-token";
import { createAdminClient } from "@/lib/db/admin";
import { extensionCorsHeaders } from "@/lib/portal-links/extension-cors";
import { parsePortalUrl } from "@/lib/portal-links/portals";
import { isLinkStatus, type PortalLinkStatus } from "@/lib/portal-links/types";

// ============================================================================
// ¿Cuáles de estos anuncios ya están en la ficha de este cliente?
//
// Lo usa la extensión para pintar "✓ En ficha" sobre los anuncios que ya se
// mandaron (por quien sea: otro compañero, otra pestaña o pegados a mano en el
// CRM). La respuesta sale de la base, no de lo que recuerde el navegador.
//
// La clave es la MISMA normalización que deduplica al insertar
// (`parsePortalUrl().urlKey`): si aquí se calculara distinto, la extensión
// diría "no está" de un anuncio que el servidor luego rechaza por repetido.
//
// Solo devuelve el estado de las URLs que se preguntan — nunca la lista de
// enlaces del cliente — y exige el mismo token que el resto de rutas.
// ============================================================================

const MAX_URLS = 200;

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: extensionCorsHeaders(request) });
}

export async function POST(request: Request) {
  const cors = extensionCorsHeaders(request);
  const json = (body: unknown, status: number) =>
    Response.json(body, { status, headers: cors });

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !verifyExtensionToken(token)) {
    return json({ error: "Token inválido o caducado" }, 401);
  }

  let body: { clientId?: unknown; urls?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const clientId = typeof body.clientId === "string" ? body.clientId.trim().slice(0, 64) : "";
  if (!clientId) return json({ error: "Falta clientId" }, 400);
  if (!Array.isArray(body.urls)) return json({ error: "Falta urls" }, 400);

  // url que mandó la extensión → su clave normalizada.
  const keyByUrl = new Map<string, string>();
  for (const raw of body.urls.slice(0, MAX_URLS)) {
    if (typeof raw !== "string") continue;
    const parsed = parsePortalUrl(raw.slice(0, 2000));
    if (parsed) keyByUrl.set(raw, parsed.urlKey);
  }
  if (keyByUrl.size === 0) return json({ existing: {} }, 200);

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("client_portal_links")
    .select("url_key, status")
    .eq("client_id", clientId)
    .in("url_key", [...new Set(keyByUrl.values())]);
  if (error) return json({ error: "No se pudo comprobar" }, 500);

  const statusByKey = new Map<string, PortalLinkStatus>();
  for (const row of (data ?? []) as Array<{ url_key: string; status: string }>) {
    if (isLinkStatus(row.status)) statusByKey.set(row.url_key, row.status);
  }

  const existing: Record<string, PortalLinkStatus> = {};
  for (const [url, key] of keyByUrl) {
    const status = statusByKey.get(key);
    if (status) existing[url] = status;
  }
  return json({ existing }, 200);
}
