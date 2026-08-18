import "server-only";
import { verifyExtensionToken } from "@/lib/services/idealista/extension-token";
import { createAdminClient } from "@/lib/db/admin";
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

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !verifyExtensionToken(token)) {
    return json({ error: "Token inválido o caducado" }, 401);
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
    .select("id, full_name")
    .eq("id", clientId)
    .eq("role", "client")
    .maybeSingle();
  if (!client) return json({ error: "Ese cliente no existe" }, 404);

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
    }))
    .filter((l) => l.url);

  if (links.length === 0) return json({ error: "Ningún enlace utilizable" }, 400);

  // added_by va a null: el token no identifica a una persona, identifica al
  // navegador que lo tiene pegado. Quién llamó sí queda registrado, porque las
  // notas se escriben desde el panel con sesión.
  const result = await insertPortalLinks({
    clientId,
    userId: null,
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
