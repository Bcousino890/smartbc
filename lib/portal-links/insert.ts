import "server-only";

// ============================================================================
// Alta de enlaces de portales.
//
// Vive fuera de las server actions porque tiene DOS puntas: el diálogo del
// panel (server action) y la ruta que recibe los envíos de la extensión de
// Chrome (route handler). Un fichero "use server" solo puede exportar funciones
// asíncronas, así que los helpers puros no cabrían allí.
// ============================================================================

import { createAdminClient } from "@/lib/db/admin";
import { parsePortalUrl } from "./portals";
import type { PortalLinkInput } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
function db() {
  return createAdminClient() as any;
}

const DB_ERROR_MAP: Array<{ match: RegExp; message: string }> = [
  {
    match: /cpl_unique_client_url/,
    message: "Ese anuncio ya está en la lista de este cliente.",
  },
  {
    match: /cpl_converted_requires_property/,
    message:
      "«Ficha creada» solo se pone al vincular la propiedad; usa «Crear ficha».",
  },
  {
    match: /cpl_url_scheme|cpl_url_len/,
    message: "El enlace no es válido. Debe empezar por http:// o https://.",
  },
  {
    match: /cpl_status_valid|cpln_status_valid/,
    message: "Ese estado no existe.",
  },
  {
    match: /cpln_body_len/,
    message: "La nota no puede estar vacía ni superar los 2000 caracteres.",
  },
  {
    match: /client_portal_links.*does not exist|PGRST205/i,
    message:
      "La tabla de enlaces todavía no está migrada en este entorno. Ejecuta el post-deploy.",
  },
];

export function translateLinkDbError(message: string): string {
  for (const { match, message: friendly } of DB_ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  console.error("[portal-links] error sin traducir:", message);
  return "No se ha podido completar la operación. Inténtalo de nuevo.";
}

export function linkText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export function linkInt(v: unknown, max: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n);
}

/** El país del enlace es el del cliente: es su ficha la que lo contiene. */
export async function countryOfClient(clientId: string): Promise<string> {
  const { data } = await db()
    .from("profiles")
    .select("country")
    .eq("id", clientId)
    .maybeSingle();
  return (data as { country?: string } | null)?.country === "cl" ? "cl" : "es";
}

/**
 * Fila lista para insertar a partir de una entrada cruda (del diálogo o de la
 * extensión). Devuelve `null` si la URL no es utilizable.
 */
export function buildLinkRow(
  input: PortalLinkInput,
  ctx: {
    clientId: string;
    userId: string | null;
    country: string;
    assignedTo: string | null;
  },
): Record<string, unknown> | null {
  const parsed = parsePortalUrl(input.url ?? "");
  if (!parsed) return null;

  const price =
    typeof input.price === "number" && Number.isFinite(input.price) && input.price > 0
      ? Math.round(input.price)
      : null;

  return {
    client_id: ctx.clientId,
    url: parsed.url,
    url_key: parsed.urlKey,
    portal: parsed.portal,
    external_ref: parsed.externalRef,
    title: linkText(input.title, 300),
    price,
    price_label: linkText(input.priceLabel, 100),
    operation:
      input.operation === "rent" || input.operation === "sale"
        ? input.operation
        : null,
    zone: linkText(input.zone, 200),
    bedrooms: linkInt(input.bedrooms, 60),
    bathrooms: linkInt(input.bathrooms, 60),
    square_meters: linkInt(input.squareMeters, 100000),
    image_url: linkText(input.imageUrl, 1000),
    contact_name: linkText(input.contactName, 200),
    contact_phone: linkText(input.contactPhone, 60),
    notes: linkText(input.notes, 4000),
    assigned_to: ctx.assignedTo,
    added_by: ctx.userId,
    country: ctx.country,
  };
}

export type InsertLinksResult = {
  inserted: number;
  skipped: number;
  invalid: number;
  error?: string;
};

/**
 * Inserta enlaces saltándose los que ya existían (mismo `url_key` para ese
 * cliente). Reenviar la misma página de resultados no crea duplicados: es la
 * garantía que permite a la extensión mandar sin miedo.
 */
export async function insertPortalLinks(params: {
  clientId: string;
  userId: string | null;
  assignedTo?: string | null;
  links: PortalLinkInput[];
}): Promise<InsertLinksResult> {
  const country = await countryOfClient(params.clientId);
  const rows: Record<string, unknown>[] = [];
  let invalid = 0;

  // Dedup dentro del propio envío: una página de resultados puede traer el
  // mismo anuncio dos veces (destacado arriba y en su posición natural).
  const seen = new Set<string>();
  for (const input of params.links) {
    const row = buildLinkRow(input, {
      clientId: params.clientId,
      userId: params.userId,
      country,
      assignedTo: params.assignedTo ?? null,
    });
    if (!row) {
      invalid++;
      continue;
    }
    const key = row.url_key as string;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  if (rows.length === 0) return { inserted: 0, skipped: 0, invalid };

  const { data, error } = await db()
    .from("client_portal_links")
    .upsert(rows, { onConflict: "client_id,url_key", ignoreDuplicates: true })
    .select("id");

  if (error) {
    return {
      inserted: 0,
      skipped: 0,
      invalid,
      error: translateLinkDbError(error.message),
    };
  }

  const inserted = ((data ?? []) as unknown[]).length;
  return { inserted, skipped: rows.length - inserted, invalid };
}
