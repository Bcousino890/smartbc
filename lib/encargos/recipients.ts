import { createAdminClient } from "../db/admin";

/** País de los encargos con aviso: España (Chile queda fuera de alcance). */
const COUNTRY = "es";
const ADMIN_ROLES = ["admin", "owner", "agent_admin"] as const;

export type Person = {
  id: string;
  role: string;
  suspendedAt: string | null;
  country: string;
  countries: string[];
  multiCountry: boolean;
};

/**
 * ¿Tiene la persona acceso a España? `country`, `countries[]` o `multiCountry`.
 * No se reutiliza `canOperateInCountry` (lib/auth/guard.ts): da paso libre a admin/owner en
 * cualquier país y arrastra `server-only`/`next/navigation`; aquí un admin sin acceso a `es`
 * NO debe recibir el aviso.
 */
function hasAccess(p: Person): boolean {
  return p.multiCountry || p.country === COUNTRY || p.countries.includes(COUNTRY);
}

function isActive(p: Person): boolean {
  return !(typeof p.suspendedAt === "string" && p.suspendedAt.length > 0 && Number.isFinite(Date.parse(p.suspendedAt)));
}

/**
 * Quién recibe el aviso de un encargo: el asesor asignado (si no está suspendido y accede a `es`)
 * y los administradores (`admin`, `owner`, `agent_admin`) activos con acceso a `es`. Sin duplicados.
 * Un asesor con alcance «solo lo suyo» que no sea el asignado nunca llega aquí: solo se mira al
 * asignado y a los roles de administración.
 */
export function pickRecipients(input: { advisor: Person | null; admins: Person[] }): string[] {
  const ids = new Set<string>();
  const { advisor } = input;
  if (advisor && isActive(advisor) && hasAccess(advisor)) ids.add(advisor.id);
  for (const a of input.admins) {
    if ((ADMIN_ROLES as readonly string[]).includes(a.role) && isActive(a) && hasAccess(a)) ids.add(a.id);
  }
  return [...ids];
}

const COLUMNS = "id, role, suspended_at, country, countries, multi_country";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPerson(r: any): Person {
  return {
    id: String(r.id),
    role: String(r.role ?? ""),
    suspendedAt: r.suspended_at ?? null,
    country: r.country ?? "",
    countries: Array.isArray(r.countries) ? r.countries : [],
    multiCountry: r.multi_country === true,
  };
}

/** Lee asesor asignado y administradores (service role) y devuelve los ids a avisar. */
export async function resolveRecipients(clientId: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: client, error: cErr } = await db
    .from("profiles").select("country, assigned_advisor_id").eq("id", clientId).maybeSingle();
  if (cErr) throw new Error(`resolveRecipients: ${cErr.message}`);
  if (!client || client.country !== COUNTRY) return [];

  let advisor: Person | null = null;
  if (client.assigned_advisor_id) {
    const { data, error } = await db.from("profiles").select(COLUMNS).eq("id", client.assigned_advisor_id).maybeSingle();
    if (error) throw new Error(`resolveRecipients: ${error.message}`);
    if (data) advisor = toPerson(data);
  }
  const { data: admins, error: aErr } = await db.from("profiles").select(COLUMNS).in("role", [...ADMIN_ROLES]);
  if (aErr) throw new Error(`resolveRecipients: ${aErr.message}`);
  return pickRecipients({ advisor, admins: (admins ?? []).map(toPerson) });
}
