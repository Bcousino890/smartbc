import "server-only";
import { createAdminClient } from "../admin";

/**
 * Listado de particulares enriquecido para el panel:
 *  - columnas base del anuncio
 *  - asignación (assigned_to → nombre del asesor)  [migración 0034]
 *  - último contacto registrado (quién/cuándo/cómo) [migración 0033]
 *
 * Cada extra degrada con elegancia si su migración aún no está aplicada
 * en el VPS: el listado nunca se rompe.
 */

const BASE_COLUMNS =
  "id, portal, external_id, source_url, zone, price, operation, bedrooms, bathrooms, square_meters, description, photos, features, owner_name, phone, chat_only, latitude, longitude, taken_down_at, created_at, is_active";

export type EnrichedParticularRow = Record<string, unknown> & {
  id: string;
  assigned_to: string | null;
  assigned_name: string | null;
  last_contact_at: string | null;
  last_contact_by: string | null;
  last_contact_type: string | null;
  contact_count: number;
};

export async function getParticularesPage(offset: number, pageSize: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  // Intentos de más completo a más básico según migraciones aplicadas.
  const attempts = [
    `${BASE_COLUMNS}, particular_reference, assigned_to, assigned_at`,
    `${BASE_COLUMNS}, particular_reference`,
    BASE_COLUMNS,
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = [];
  let total = 0;
  let lastError: { message: string } | null = null;
  for (const cols of attempts) {
    const res = await supabase
      .from("particulares")
      .select(cols, { count: "exact" })
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (!res.error) {
      rows = res.data ?? [];
      total = res.count ?? 0;
      lastError = null;
      break;
    }
    lastError = res.error;
  }
  if (lastError) throw new Error(lastError.message);

  const ids = rows.map((r) => r.id);
  const advisorIds = new Set<string>(
    rows.map((r) => r.assigned_to).filter(Boolean),
  );

  // Último contacto + nº de contactos por anuncio (particulares_contacts).
  const lastContacts = new Map<
    string,
    { advisor_id: string; contact_type: string; contacted_at: string }
  >();
  const contactCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: contacts, error: contactsErr } = await supabase
      .from("particulares_contacts")
      .select("particular_id, advisor_id, contact_type, contacted_at")
      .in("particular_id", ids)
      .order("contacted_at", { ascending: false });
    if (!contactsErr) {
      for (const c of contacts ?? []) {
        contactCounts.set(
          c.particular_id,
          (contactCounts.get(c.particular_id) ?? 0) + 1,
        );
        if (!lastContacts.has(c.particular_id)) {
          lastContacts.set(c.particular_id, c);
          advisorIds.add(c.advisor_id);
        }
      }
    }
  }

  // Nombres de los asesores implicados (asignados o que contactaron).
  const names = new Map<string, string>();
  if (advisorIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", Array.from(advisorIds));
    for (const p of profs ?? []) {
      names.set(p.id, (p.full_name as string) || (p.email as string));
    }
  }

  const enriched: EnrichedParticularRow[] = rows.map((r) => {
    const lc = lastContacts.get(r.id);
    return {
      ...r,
      assigned_to: r.assigned_to ?? null,
      assigned_name: r.assigned_to ? (names.get(r.assigned_to) ?? null) : null,
      last_contact_at: lc?.contacted_at ?? null,
      last_contact_by: lc ? (names.get(lc.advisor_id) ?? null) : null,
      last_contact_type: lc?.contact_type ?? null,
      contact_count: contactCounts.get(r.id) ?? 0,
    };
  });

  return { rows: enriched, total };
}

/** Opciones de staff para el desplegable de asignación. */
export async function getStaffOptions(): Promise<
  Array<{ id: string; name: string }>
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", [
      "owner",
      "admin",
      "advisor",
      "agent_junior",
      "agent_senior",
      "agent_admin",
    ])
    .order("full_name");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((p: any) => ({
    id: p.id as string,
    name: (p.full_name as string) || (p.email as string),
  }));
}
