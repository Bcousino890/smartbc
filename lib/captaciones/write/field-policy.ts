/**
 * Qué campos de una captación puede pisar una integración externa.
 *
 * La regla que hace que esto sea usable en producción: el proveedor manda la
 * ficha del anuncio, pero el trabajo del equipo (teléfono del dueño, dirección
 * real, notas, etapa, asignación) NO se sobrescribe en cada sincronización.
 * Es la misma decisión que ya toma el motor de sindicación con las propiedades
 * (ver el comentario de updateExistingProperty en lib/sync/diff-engine.ts).
 */

/** Campos que vienen del anuncio: la integración manda y siempre se actualizan. */
export const PROVIDER_FIELDS = [
  "title",
  "description",
  "operation",
  "price",
  "currency",
  "bedrooms",
  "bathrooms",
  "square_meters",
  "useful_square_meters",
  "property_type",
  "features",
  "cover_photo_url",
  "source_url",
  "source_site",
  "broker_name",
  "external_reference",
  "portal_publication_number",
  "published_ago",
  "region",
  "zone",
  "subzone",
  "address_scraped",
  "latitude",
  "longitude",
  "scrape_status",
  "scrape_error",
  "scraped_at",
] as const;

/**
 * Campos que rellena el equipo desde el panel. Solo se escriben si están
 * vacíos, salvo que el cliente API tenga `overwrite_manual_fields` o los pida
 * explícitamente en `options.force_fields`.
 *
 * `commune` está aquí a propósito: la captadora la corrige desde la pestaña
 * Ubicación cuando el portal la trae mal (ver update/route.ts).
 */
export const TEAM_FIELDS = [
  "owner_name",
  "owner_phone",
  "owner_contact",
  "owner_confirmed",
  "address_real",
  "address_verified",
  "commune",
  "rol_propiedad",
  "notes",
  "revision_notes",
  "next_action_at",
  "next_action_note",
  "assigned_to",
  "stage_id",
  "pipeline_id",
  "status",
] as const;

export type ProviderField = (typeof PROVIDER_FIELDS)[number];
export type TeamField = (typeof TEAM_FIELDS)[number];
export type WritableField = ProviderField | TeamField;

const TEAM_FIELD_SET: ReadonlySet<string> = new Set(TEAM_FIELDS);

export function isTeamField(field: string): boolean {
  return TEAM_FIELD_SET.has(field);
}

export type FieldPolicy = {
  /** El cliente API puede pisar cualquier campo del equipo. */
  overwriteManualFields: boolean;
  /** Campos concretos que esta petición pide forzar. */
  forceFields: ReadonlySet<string>;
};

/**
 * Dos condiciones, deliberadamente independientes:
 *
 *   1. `api_clients.overwrite_manual_fields` — el admin AUTORIZA a esta
 *      integración a pisar datos del equipo.
 *   2. `options` del envío — el proveedor lo PIDE, en ese envío concreto.
 *
 * Hacen falta las dos. Así, activar el permiso en el panel no provoca por sí
 * solo que la siguiente sincronización borre el trabajo de las captadoras: el
 * proveedor tiene que pedirlo explícitamente, envío a envío.
 */
export function buildFieldPolicy(
  clientAllowsOverwrite: boolean,
  options?: { overwrite_manual_fields?: boolean; force_fields?: string[] }
): FieldPolicy {
  if (!clientAllowsOverwrite) {
    return { overwriteManualFields: false, forceFields: new Set() };
  }
  return {
    overwriteManualFields: options?.overwrite_manual_fields === true,
    forceFields: new Set<string>(options?.force_fields ?? []),
  };
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Decide si un campo concreto se puede escribir sobre la fila existente.
 *
 * - Campo del proveedor → siempre sí.
 * - Campo del equipo → solo si está vacío, o si la política lo permite.
 * - En un alta (`existing` = null) no hay nada que proteger.
 */
export function canWriteField(
  field: string,
  existing: Record<string, unknown> | null,
  policy: FieldPolicy
): boolean {
  if (!isTeamField(field)) return true;
  if (policy.overwriteManualFields) return true;
  if (policy.forceFields.has(field)) return true;
  if (!existing) return true;
  return isEmpty(existing[field]);
}

/**
 * Aplica un parche respetando la política y devolviendo solo lo que realmente
 * cambia, para no escribir (ni disparar `updated_at`) cuando no hay nada nuevo.
 */
export function buildPatch(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown> | null,
  policy: FieldPolicy
): { patch: Record<string, unknown>; skipped: string[]; changed: string[] } {
  const patch: Record<string, unknown> = {};
  const skipped: string[] = [];
  const changed: string[] = [];

  for (const [field, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (!canWriteField(field, existing, policy)) {
      skipped.push(field);
      continue;
    }
    if (existing && isSameValue(existing[field], value)) continue;
    patch[field] = value;
    changed.push(field);
  }

  return { patch, skipped, changed };
}

/** Comparación tolerante: numérico como texto, arrays y fechas ISO. */
export function isSameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  // Postgres devuelve NUMERIC como string; el proveedor manda number.
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }
  if (typeof a === "string" && typeof b === "string") {
    // Fechas: comparar por instante, no por formato.
    const da = Date.parse(a);
    const dbb = Date.parse(b);
    if (!Number.isNaN(da) && !Number.isNaN(dbb) && /\d{4}-\d{2}-\d{2}/.test(a)) {
      return da === dbb;
    }
    return a === b;
  }
  return false;
}
