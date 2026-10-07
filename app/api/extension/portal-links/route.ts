import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { canUseClient, hasCollectionsPermission, requireExtension } from "@/lib/extension/guard";
import { insertPortalLinks } from "@/lib/portal-links/insert";
import { extensionCorsHeaders } from "@/lib/portal-links/extension-cors";
import type { PortalLinkInput } from "@/lib/portal-links/types";

// ============================================================================
// Ingesta de anuncios seleccionados en un portal por la extensión de Chrome.
//
// Es el atajo del flujo real: se ven diez pisos con el cliente en Idealista, se
// marcan ahí mismo y llegan a su ficha listos para repartir y llamar. Público a
// propósito (lo llama la extensión desde idealista.com); la seguridad la da el
// token Bearer de larga duración, el mismo de los leads del inbox.
//
// Reenviar la misma página NO duplica: `insertPortalLinks` deduplica por
// `url_key` (la URL normalizada, o host+referencia del anuncio).
//
// El ORDEN del array es la prioridad: la extensión manda su cesta ya ordenada
// y `insertPortalLinks` asigna las posiciones en ese orden, al final de la cola.
// ============================================================================

const MAX_LINKS = 60;

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: extensionCorsHeaders(request) });
}

type IncomingLink = {
  url?: unknown;
  title?: unknown;
  price?: unknown;
  priceLabel?: unknown;
  operation?: unknown;
  zone?: unknown;
  bedrooms?: unknown;
  bathrooms?: unknown;
  squareMeters?: unknown;
  imageUrl?: unknown;
  contactName?: unknown;
  contactPhone?: unknown;
  /** Lo que se apuntó en la extensión al marcarlo ("dueño solo por WhatsApp"…). */
  notes?: unknown;
};

function str(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(request: Request) {
  const cors = extensionCorsHeaders(request);
  const json = (body: unknown, status: number) =>
    Response.json(body, { status, headers: cors });

  const gate = await requireExtension(request, cors);
  if (!gate.ok) return gate.response;
  const user = gate.auth.kind === "user" ? gate.auth.user : null;
  if (user && !(await hasCollectionsPermission(user, "create"))) {
    return json({ error: "Tu usuario no puede añadir anuncios a fichas de clientes." }, 403);
  }

  let body: { clientId?: unknown; assignedTo?: unknown; links?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const clientId = str(body.clientId, 64);
  if (!clientId) return json({ error: "Falta clientId" }, 400);

  if (!Array.isArray(body.links) || body.links.length === 0) {
    return json({ error: "No llega ningún enlace" }, 400);
  }
  if (body.links.length > MAX_LINKS) {
    return json({ error: `Máximo ${MAX_LINKS} anuncios por envío` }, 400);
  }

  // El cliente tiene que existir y ser un cliente: sin esto, un token filtrado
  // podría sembrar filas colgando de cualquier perfil.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const admin = createAdminClient() as any;
  const { data: client } = await admin
    .from("profiles")
    .select("id, full_name, country, assigned_advisor_id")
    .eq("id", clientId)
    .eq("role", "client")
    .maybeSingle();
  if (!client) return json({ error: "Ese cliente no existe" }, 404);
  // Mismo criterio que la ficha: un agente no manda anuncios a un cliente
  // que no es de su cartera ni de sus países.
  if (user && !canUseClient(user, client)) {
    return json({ error: "Ese cliente no es de tu cartera." }, 403);
  }

  const assignedTo = str(body.assignedTo, 64);
  if (assignedTo) {
    const { data: staff } = await admin
      .from("profiles")
      .select("id")
      .eq("id", assignedTo)
      .neq("role", "client")
      .maybeSingle();
    if (!staff) return json({ error: "Ese compañero no existe" }, 404);
  }

  const links: PortalLinkInput[] = (body.links as IncomingLink[])
    .filter((l) => l && typeof l === "object")
    .map((l) => ({
      url: str(l.url, 2000) ?? "",
      title: str(l.title, 300),
      price: num(l.price),
      priceLabel: str(l.priceLabel, 100),
      operation:
        l.operation === "rent" || l.operation === "sale"
          ? (l.operation as "rent" | "sale")
          : null,
      zone: str(l.zone, 200),
      bedrooms: num(l.bedrooms),
      bathrooms: num(l.bathrooms),
      squareMeters: num(l.squareMeters),
      imageUrl: str(l.imageUrl, 1000),
      contactName: str(l.contactName, 200),
      contactPhone: str(l.contactPhone, 60),
      notes: str(l.notes, 2000),
    }))
    .filter((l) => l.url);

  if (links.length === 0) return json({ error: "Ningún enlace utilizable" }, 400);

  // Con la extensión conectada por usuario, queda registrado quién los mandó.
  // Con el token compartido antiguo no se sabe (identifica a un navegador, no
  // a una persona) y `added_by` queda vacío, como antes.
  const result = await insertPortalLinks({
    clientId,
    userId: user?.id ?? null,
    assignedTo,
    links,
  });

  if (result.error) return json({ error: result.error }, 500);

  return json(
    {
      ok: true,
      clientName: (client as { full_name: string | null }).full_name ?? null,
      inserted: result.inserted,
      skipped: result.skipped,
      invalid: result.invalid,
    },
    200,
  );
}
