import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { syncDraftBook } from "@/lib/viewing-collections/auto-book";
import { getClientDescription } from "@/lib/services/properties/client-description";

// ============================================================================
// Crear la ficha de un anuncio de portal, sin nadie delante (2026-10-08).
//
// Antes la ficha se creaba a mano ("Crear N fichas") o no se creaba: la
// selección privada y el book se quedaban con la foto suelta del anuncio, y
// había que acordarse de crearla antes de montar nada. Ahora cada enlace que
// entra (extensión de Chrome o "Añadir enlaces") se convierte en ficha solo:
//
//   · Nada más entrar, en segundo plano (after() en la acción / ruta).
//   · Y un cron cada 5 min (/api/cron/portal-links-import) recoge lo que se
//     quedó a medias: un reinicio en mitad de la tanda, un bloqueo del portal.
//
// Uno detrás de otro, nunca en paralelo: son descargas reales del portal y
// machacarlo es justo lo que dispara los bloqueos anti-bot. Cada enlace tiene
// 3 intentos; el motivo del último fallo queda en import_error (migración
// 0173). Los descartados no se importan.
//
// Al crear la ficha se deja ya limpia (IA) la descripción que enseña el
// SmartLink: así la primera vez que el cliente lo abre no espera.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

export const PORTAL_IMPORT_AGENCY_SLUG = "portales-externos";
const MAX_ATTEMPTS = 3;

export type LinkImportOutcome = {
  linkId: string;
  ok: boolean;
  /** Motivo legible cuando ok=false; título de la ficha creada cuando ok=true. */
  detail: string;
};

/**
 * El enlace pasa a ser ficha nuestra y entra en la selección del cliente (y en
 * el borrador de su book). Idempotente: la UNIQUE cps_unique_client_property
 * impide duplicar la selección.
 */
export async function attachPropertyToLink(args: {
  linkId: string;
  clientId: string;
  propertyId: string;
  userId: string | null;
  note: string;
}): Promise<{ ok: true; addedToSelection: boolean } | { ok: false; error: string }> {
  const { linkId, clientId, propertyId, userId, note } = args;
  const { data: prop } = await db()
    .from("properties")
    .select("id, country")
    .eq("id", propertyId)
    .maybeSingle();
  if (!prop) return { ok: false, error: "Esa propiedad no existe." };

  const { error } = await db()
    .from("client_portal_links")
    .update({ property_id: propertyId, status: "converted", import_error: null })
    .eq("id", linkId);
  if (error) return { ok: false, error: error.message };

  const { error: selError } = await db()
    .from("client_property_selections")
    .upsert(
      {
        client_id: clientId,
        property_id: propertyId,
        source: "manual",
        added_by: userId,
        country: prop.country === "cl" ? "cl" : "es",
      },
      { onConflict: "client_id,property_id", ignoreDuplicates: true },
    );

  // Que falle la selección no debe deshacer el vínculo: la ficha ya existe y
  // añadirla a la selección se puede repetir desde el propio panel.
  const addedToSelection = !selError;
  if (selError) {
    console.error("[portal-links] no se pudo añadir a la selección:", selError.message);
  } else {
    await syncDraftBook(clientId, userId);
  }

  await db().from("client_portal_link_notes").insert({
    link_id: linkId,
    author_id: userId,
    kind: "status",
    body: note,
    status_after: "converted",
  });

  return { ok: true, addedToSelection };
}

const REASONS: Record<string, string> = {
  fetch_failed: "no se pudo descargar la página",
  blocked: "el portal bloqueó la petición",
  unsupported_url: "portal no soportado",
  parse_failed: "no se pudo leer el HTML",
};

/**
 * Lee el anuncio entero (título, precio, todas las fotos, descripción), crea
 * la ficha y la vincula. Misma extracción y misma inserción que el importador
 * de siempre: no es un atajo con menos garantías.
 */
export async function importPortalLink(
  linkId: string,
  userId: string | null,
): Promise<LinkImportOutcome> {
  const fail = async (detail: string): Promise<LinkImportOutcome> => {
    const { data: cur } = await db()
      .from("client_portal_links")
      .select("import_attempts")
      .eq("id", linkId)
      .maybeSingle();
    await db()
      .from("client_portal_links")
      .update({
        import_attempts: (cur?.import_attempts ?? 0) + 1,
        import_error: detail.slice(0, 300),
        import_tried_at: new Date().toISOString(),
      })
      .eq("id", linkId);
    return { linkId, ok: false, detail };
  };

  const { data: link } = await db()
    .from("client_portal_links")
    .select("id, client_id, url, country, status, property_id, added_by")
    .eq("id", linkId)
    .maybeSingle();
  if (!link) return { linkId, ok: false, detail: "el enlace ya no existe" };
  if (link.property_id || link.status === "converted") {
    return { linkId, ok: true, detail: "ya tenía ficha" };
  }
  if (link.status === "discarded") return { linkId, ok: false, detail: "descartado" };

  const { data: agency } = await db()
    .from("agencies")
    .select("id")
    .eq("slug", PORTAL_IMPORT_AGENCY_SLUG)
    .maybeSingle();
  if (!agency) return fail(`No existe la agencia "${PORTAL_IMPORT_AGENCY_SLUG}".`);

  // Import dinámico: trae scrapers pesados que no hace falta cargar antes.
  const { extractFromUrl } = await import("@/lib/sync/import-by-link");
  const { insertImportedProperty } = await import("@/lib/sync/import-by-link/insert");

  let extracted: Awaited<ReturnType<typeof extractFromUrl>>;
  try {
    extracted = await extractFromUrl(link.url);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "fallo desconocido al leer el portal");
  }
  if (!extracted.ok) return fail(REASONS[extracted.error.kind] ?? "fallo desconocido");

  const preview = extracted.preview;
  const title = preview.title?.trim();
  const zone = preview.zone?.trim();
  // Mismas validaciones mínimas que confirmByLink: si el scraping no trajo lo
  // imprescindible, mejor dejarlo pendiente que crear una ficha coja.
  if (!title || !zone || !preview.price || preview.price <= 0) {
    return fail("faltan datos básicos (título, zona o precio) en el anuncio");
  }

  const inserted = await insertImportedProperty({
    preview,
    agencyId: agency.id,
    agencySlug: PORTAL_IMPORT_AGENCY_SLUG,
    country: link.country === "cl" ? "cl" : "es",
    overrides: {
      title,
      description: preview.description?.trim() || null,
      operation: preview.operation === "rent" ? "rent" : "sale",
      stay: preview.stay ?? null,
      price: preview.price,
      bedrooms: preview.bedrooms ?? 0,
      bathrooms: preview.bathrooms ?? 0,
      squareMeters: preview.squareMeters ?? null,
      zone,
      address: preview.address?.trim() || null,
      features: preview.features,
      externalReference: preview.externalReference,
    },
  });
  if (!inserted.ok) return fail(inserted.error);

  const attached = await attachPropertyToLink({
    linkId,
    clientId: link.client_id,
    propertyId: inserted.propertyId,
    userId: userId ?? link.added_by ?? null,
    note: userId
      ? "Ficha creada en el CRM y añadida a la selección del cliente."
      : "Ficha creada automáticamente al entrar el enlace y añadida a la selección del cliente.",
  });

  // Descripción limpia para el SmartLink, ya preparada. Best-effort.
  await getClientDescription(inserted.propertyId, "es").catch(() => {});

  return {
    linkId,
    ok: true,
    // La ficha YA existe aunque el vínculo falle: se avisa en vez de deshacer
    // una importación buena.
    detail: attached.ok ? title : `${title} (ficha creada, pero sin vincular)`,
  };
}

// Un solo recorrido a la vez en este proceso: el cron y los after() de varias
// altas seguidas no deben lanzar descargas en paralelo contra el portal. El
// recorrido vuelve a mirar al acabar cada tanda, así que lo que entre mientras
// tanto se recoge en la misma pasada en vez de esperar al cron.
let running: Promise<number> | null = null;
const RETRY_AFTER_MS = 10 * 60 * 1000;
const MAX_PER_RUN = 150;

async function nextBatch(limit: number): Promise<string[]> {
  const retryBefore = new Date(Date.now() - RETRY_AFTER_MS).toISOString();
  const { data } = await db()
    .from("client_portal_links")
    .select("id")
    .is("property_id", null)
    .not("status", "in", "(discarded,converted)")
    .lt("import_attempts", MAX_ATTEMPTS)
    // Un fallo se reintenta pasados 10 min, no en el mismo recorrido: si el
    // portal está bloqueando, insistir al momento solo gasta los intentos.
    .or(`import_tried_at.is.null,import_tried_at.lt.${retryBefore}`)
    .order("created_at", { ascending: true })
    .limit(limit);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

/** Crea la ficha de los enlaces pendientes, uno detrás de otro. */
export function processPendingPortalLinks(): Promise<number> {
  if (running) return running;
  running = (async () => {
    let done = 0;
    let tried = 0;
    const seen = new Set<string>();
    while (tried < MAX_PER_RUN) {
      const ids = (await nextBatch(10)).filter((id) => !seen.has(id));
      if (ids.length === 0) break;
      for (const id of ids) {
        seen.add(id);
        tried++;
        try {
          const res = await importPortalLink(id, null);
          if (res.ok) done++;
          else console.log(`[auto-import] ${id}: ${res.detail}`);
        } catch (err) {
          console.error("[auto-import] fallo inesperado", id, err);
        }
      }
    }
    if (done > 0) console.log(`[auto-import] ${done} ficha(s) creada(s)`);
    return done;
  })().finally(() => {
    running = null;
  });
  return running;
}
