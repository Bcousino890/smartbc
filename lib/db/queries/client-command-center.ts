import "server-only";

// ============================================================================
// CLIENT COMMAND CENTER · lectura
//
// Lo que la ficha necesita y `getClientById` no trae: el asesor de verdad, la
// analítica atribuible al cliente, sus solicitudes con documentos y el hilo de
// llamadas. Cada función está cerrada por permisos y devuelve algo vacío en
// lugar de reventar: un fallo de una consulta secundaria no puede tumbar la
// ficha entera.
//
// ⚠️ Se lee con el cliente de servicio a propósito (igual que `analytics.ts`):
// `page_views` no tiene política para staff. Por eso TODAS las funciones que
// lo usan comprueban el permiso ANTES de tocar la base.
// ============================================================================

import { createAdminClient } from "../admin";
import { createClient } from "../server";
import { checkPermission } from "@/lib/auth/guard";
import type { EngagementSummary } from "@/lib/client-command-center/types";
import { EMPTY_ENGAGEMENT } from "@/lib/client-command-center/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = () => createAdminClient() as any;

// ─── Asesor asignado ─────────────────────────────────────────────────────────

export type AdvisorRef = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

/**
 * El asesor real de `profiles.assigned_advisor_id`. La ficha llevaba desde
 * siempre un guion fijo en su lugar, así que nadie sabía de quién era el
 * cliente mirando su ficha.
 */
export async function getClientAdvisor(
  advisorId: string | null,
): Promise<AdvisorRef | null> {
  if (!advisorId) return null;
  try {
    const { data } = await admin()
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("id", advisorId)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      name: data.full_name || data.email || "—",
      email: data.email ?? null,
      phone: data.phone ?? null,
    };
  } catch {
    return null;
  }
}

// ─── Analítica atribuible ────────────────────────────────────────────────────

export type EngagementSession = {
  sessionId: string;
  at: string;
  views: number;
  pageType: string | null;
  device: string | null;
  city: string | null;
  country: string | null;
  events: Record<string, number>;
};

export type ClientEngagement = EngagementSummary & {
  /** El detalle de cada sesión. `sessions` (el número) viene del resumen. */
  sessionList: EngagementSession[];
};

export const EMPTY_CLIENT_ENGAGEMENT: ClientEngagement = {
  ...EMPTY_ENGAGEMENT,
  sessionList: [],
};

/**
 * Todo lo que este cliente ha mirado en sus enlaces privados.
 *
 * La atribución no se inventa: una vista es suya si lleva el id de UNA de sus
 * selecciones privadas, el de un enlace de UNA de sus jornadas, o el de un
 * SmartLink colgado de una parada suya. Fuera de esos tres caminos no se
 * cuenta nada — sin cookies, sin cruzar por IP, sin adivinar por sesión.
 *
 * (Hoy la tercera vía sale a cero: el rastreador todavía no manda `share_id`
 * en las páginas de propiedad. Se deja escrita porque la relación SÍ es
 * segura, y así el día que empiece a mandarlo la cifra aparece sola.)
 */
export async function getClientEngagement(
  clientId: string,
): Promise<ClientEngagement> {
  const gate = await checkPermission("clientes", "view");
  if (!gate.ok) return EMPTY_CLIENT_ENGAGEMENT;

  try {
    const db = admin();

    const [{ data: shortlists }, { data: itineraries }] = await Promise.all([
      db.from("client_shortlists").select("id").eq("client_id", clientId),
      db.from("viewing_itineraries").select("id").eq("client_id", clientId),
    ]);

    const shortlistIds = (shortlists ?? []).map((r: { id: string }) => r.id);
    const itineraryIds = (itineraries ?? []).map((r: { id: string }) => r.id);

    let shareIds: string[] = [];
    let propertyShareIds: string[] = [];
    if (itineraryIds.length) {
      const [{ data: shares }, { data: stops }] = await Promise.all([
        db
          .from("viewing_collection_shares")
          .select("id")
          .in("itinerary_id", itineraryIds),
        db
          .from("viewing_stops")
          .select("property_share_id")
          .in("itinerary_id", itineraryIds)
          .not("property_share_id", "is", null),
      ]);
      shareIds = (shares ?? []).map((r: { id: string }) => r.id);
      propertyShareIds = (stops ?? [])
        .map((r: { property_share_id: string | null }) => r.property_share_id)
        .filter((v: string | null): v is string => Boolean(v));
    }

    const totalLinks = shortlistIds.length + shareIds.length;
    if (totalLinks === 0 && propertyShareIds.length === 0) {
      return EMPTY_CLIENT_ENGAGEMENT;
    }

    // PostgREST no admite `.in()` con lista vacía dentro de un `or`, así que se
    // arma la condición solo con los tramos que tienen ids.
    const clauses: string[] = [];
    if (shortlistIds.length) clauses.push(`shortlist_id.in.(${shortlistIds.join(",")})`);
    if (shareIds.length) clauses.push(`collection_share_id.in.(${shareIds.join(",")})`);
    if (propertyShareIds.length) clauses.push(`share_id.in.(${propertyShareIds.join(",")})`);

    const { data: views } = await db
      .from("page_views")
      .select(
        "id, session_id, page_type, device_type, city, country_name, created_at",
      )
      .or(clauses.join(","))
      .order("created_at", { ascending: false })
      .limit(2000);

    const rows = (views ?? []) as Array<{
      id: string;
      session_id: string | null;
      page_type: string | null;
      device_type: string | null;
      city: string | null;
      country_name: string | null;
      created_at: string;
    }>;

    if (rows.length === 0) {
      return { ...EMPTY_CLIENT_ENGAGEMENT, totalLinks };
    }

    const { data: eventRows } = await db
      .from("page_events")
      .select("page_view_id, event_type")
      .in(
        "page_view_id",
        rows.slice(0, 1000).map((r) => r.id),
      )
      .limit(5000);

    const eventsByView = new Map<string, string[]>();
    const events: Record<string, number> = {};
    for (const e of (eventRows ?? []) as Array<{
      page_view_id: string;
      event_type: string;
    }>) {
      events[e.event_type] = (events[e.event_type] ?? 0) + 1;
      const list = eventsByView.get(e.page_view_id);
      if (list) list.push(e.event_type);
      else eventsByView.set(e.page_view_id, [e.event_type]);
    }

    // Una sesión = una visita de verdad. 203 filas de `page_views` son unas
    // pocas decenas de sesiones: la línea de tiempo se lee, y no se ahoga.
    const bySession = new Map<string, EngagementSession>();
    for (const r of rows) {
      const key = r.session_id ?? r.id;
      const found = bySession.get(key);
      const evts = eventsByView.get(r.id) ?? [];
      if (found) {
        found.views += 1;
        if (new Date(r.created_at) > new Date(found.at)) found.at = r.created_at;
        for (const t of evts) found.events[t] = (found.events[t] ?? 0) + 1;
      } else {
        const acc: Record<string, number> = {};
        for (const t of evts) acc[t] = (acc[t] ?? 0) + 1;
        bySession.set(key, {
          sessionId: key,
          at: r.created_at,
          views: 1,
          pageType: r.page_type,
          device: r.device_type,
          city: r.city,
          country: r.country_name,
          events: acc,
        });
      }
    }

    const sessions = [...bySession.values()].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );

    const openedShortlists = new Set<string>();
    const openedShares = new Set<string>();
    const { data: openedRows } = await db
      .from("page_views")
      .select("shortlist_id, collection_share_id")
      .or(clauses.join(","))
      .limit(2000);
    for (const r of (openedRows ?? []) as Array<{
      shortlist_id: string | null;
      collection_share_id: string | null;
    }>) {
      if (r.shortlist_id) openedShortlists.add(r.shortlist_id);
      if (r.collection_share_id) openedShares.add(r.collection_share_id);
    }

    return {
      views: rows.length,
      sessions: sessions.length,
      lastViewAt: rows[0]?.created_at ?? null,
      events,
      openedLinks: openedShortlists.size + openedShares.size,
      totalLinks,
      sessionList: sessions,
    };
  } catch (e) {
    console.error("[getClientEngagement]", e);
    return EMPTY_CLIENT_ENGAGEMENT;
  }
}

// ─── Solicitudes de alquiler/compra ──────────────────────────────────────────

export type ClientApplicationDocument = {
  id: string;
  fileName: string;
  status: string;
  documentTypeName: string | null;
  createdAt: string;
  verifiedAt: string | null;
};

export type ClientApplication = {
  id: string;
  status: string;
  operation: string;
  country: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  moveInDate: string | null;
  reviewNotes: string | null;
  property: { id: string; slug: string | null; title: string | null } | null;
  documents: ClientApplicationDocument[];
  documentsPending: number;
};

/**
 * Las solicitudes del cliente con sus documentos. Existían en la base y en su
 * propia pantalla, pero la ficha no las mencionaba: un agente no podía saber
 * desde aquí que su cliente ya había entregado la nómina.
 */
export async function getClientApplications(
  clientId: string,
): Promise<ClientApplication[]> {
  const gate = await checkPermission("clientes", "view");
  if (!gate.ok) return [];

  try {
    const db = admin();
    const { data } = await db
      .from("property_applications")
      .select(
        `id, status, operation, country, submitted_at, reviewed_at, created_at,
         updated_at, move_in_date, review_notes,
         properties ( id, slug, title )`,
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    const apps = (data ?? []) as Array<Record<string, any>>;
    if (!apps.length) return [];

    const { data: docs } = await db
      .from("property_application_documents")
      .select(
        `id, property_application_id, file_name, status, created_at,
         verification_timestamp,
         property_application_document_types ( display_name )`,
      )
      .in(
        "property_application_id",
        apps.map((a) => a.id as string),
      );

    const byApp = new Map<string, ClientApplicationDocument[]>();
    for (const d of (docs ?? []) as Array<Record<string, any>>) {
      const type = Array.isArray(d.property_application_document_types)
        ? d.property_application_document_types[0]
        : d.property_application_document_types;
      const entry: ClientApplicationDocument = {
        id: d.id,
        fileName: d.file_name,
        status: d.status,
        documentTypeName: type?.display_name ?? null,
        createdAt: d.created_at,
        verifiedAt: d.verification_timestamp ?? null,
      };
      const list = byApp.get(d.property_application_id);
      if (list) list.push(entry);
      else byApp.set(d.property_application_id, [entry]);
    }

    return apps.map((a) => {
      const prop = Array.isArray(a.properties) ? a.properties[0] : a.properties;
      const documents = (byApp.get(a.id) ?? []).sort(
        (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime(),
      );
      return {
        id: a.id,
        status: a.status,
        operation: a.operation,
        country: a.country,
        submittedAt: a.submitted_at ?? null,
        reviewedAt: a.reviewed_at ?? null,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
        moveInDate: a.move_in_date ?? null,
        reviewNotes: a.review_notes ?? null,
        property: prop
          ? { id: prop.id, slug: prop.slug ?? null, title: prop.title ?? null }
          : null,
        documents,
        documentsPending: documents.filter(
          (d) => d.status === "pending" || d.status === "needs_correction",
        ).length,
      };
    });
  } catch (e) {
    console.error("[getClientApplications]", e);
    return [];
  }
}

// ─── Preferencias completas ──────────────────────────────────────────────────

export type ClientPreferencesFull = {
  operation: string | null;
  stay: string | null;
  min_price: number | null;
  max_price: number | null;
  min_bedrooms: number | null;
  max_bedrooms: number | null;
  min_bathrooms: number | null;
  min_square_meters: number | null;
  max_square_meters: number | null;
  zones: string[];
  available_from: string | null;
  notes: string | null;
  occupants: number | null;
  students: number | null;
  workers: number | null;
  pets: boolean | null;
  universities: string | null;
  updated_at: string | null;
  // Chile
  preferred_regions: string[];
  preferred_communes: string[];
  preferred_sectors: string[];
  requires_service_bedroom: boolean | null;
  min_parking_spaces: number | null;
  prefers_condominium: boolean | null;
  preferred_orientations: string[];
  min_floors: number | null;
  currency_preference: string | null;
  min_price_uf: number | null;
  max_price_uf: number | null;
};

const asArray = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

/**
 * Las 34 columnas, no las seis que se pintaban. La tarjeta de preferencias
 * ignoraba dormitorios, baños, metros, fecha de entrada y **las trece columnas
 * chilenas**: un cliente de Chile no veía una sola de sus preferencias reales.
 */
export async function getClientPreferencesFull(
  clientId: string,
): Promise<ClientPreferencesFull | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("client_preferences")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();
    if (!data) return null;
    const r = data as Record<string, any>;
    return {
      operation: r.operation ?? null,
      stay: r.stay ?? null,
      min_price: r.min_price === null ? null : Number(r.min_price),
      max_price: r.max_price === null ? null : Number(r.max_price),
      min_bedrooms: r.min_bedrooms ?? null,
      max_bedrooms: r.max_bedrooms ?? null,
      min_bathrooms: r.min_bathrooms ?? null,
      min_square_meters: r.min_square_meters ?? null,
      max_square_meters: r.max_square_meters ?? null,
      zones: asArray(r.zones),
      available_from: r.available_from ?? null,
      notes: r.notes ?? null,
      occupants: r.occupants ?? null,
      students: r.students ?? null,
      workers: r.workers ?? null,
      pets: r.pets ?? null,
      universities: r.universities ?? null,
      updated_at: r.updated_at ?? null,
      preferred_regions: asArray(r.preferred_regions),
      preferred_communes: asArray(r.preferred_communes),
      preferred_sectors: asArray(r.preferred_sectors),
      requires_service_bedroom: r.requires_service_bedroom ?? null,
      min_parking_spaces: r.min_parking_spaces ?? null,
      prefers_condominium: r.prefers_condominium ?? null,
      preferred_orientations: asArray(r.preferred_orientations),
      min_floors: r.min_floors ?? null,
      currency_preference: r.currency_preference ?? null,
      min_price_uf: r.min_price_uf === null ? null : Number(r.min_price_uf),
      max_price_uf: r.max_price_uf === null ? null : Number(r.max_price_uf),
    };
  } catch (e) {
    console.error("[getClientPreferencesFull]", e);
    return null;
  }
}

// ─── Etiquetas ───────────────────────────────────────────────────────────────

export type ClientTagRef = {
  id: string;
  name: string;
  category: string | null;
  color: string | null;
};

export async function getClientTags(clientId: string): Promise<ClientTagRef[]> {
  try {
    const { data } = await admin()
      .from("client_tag_assignments")
      .select("client_tags ( id, name, category, color )")
      .eq("client_id", clientId);
    return ((data ?? []) as Array<Record<string, any>>)
      .map((r) => (Array.isArray(r.client_tags) ? r.client_tags[0] : r.client_tags))
      .filter(Boolean)
      .map((t: Record<string, any>) => ({
        id: t.id,
        name: t.name,
        category: t.category ?? null,
        color: t.color ?? null,
      }));
  } catch {
    return [];
  }
}
