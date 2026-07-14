import "server-only";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getEffectivePermissions } from "@/lib/db/queries/permissions";
import { getCountryConfig, isCountry, type Country } from "@/lib/country-config";
import type { ProfileRow } from "@/lib/db/queries/session";
import type { PermissionResource, PermissionAction } from "@/lib/permissions";

/**
 * Gate de autorización server-side reutilizable para route handlers de
 * `app/api/admin/**`.
 *
 * Los permisos del sidebar son cosméticos: ocultan módulos por rol en el
 * cliente. Este helper aplica el mismo modelo de permisos (rol + overrides)
 * en el servidor para que un rol bajo no pueda saltarse la UI llamando a la
 * API directamente.
 *
 * Uso típico en un handler:
 *
 *   const gate = await requirePermission("clientes", "edit");
 *   if (!gate.ok) return gate.response;
 *   const profile = gate.profile; // perfil ya autenticado y autorizado
 */

/** Resultado de un gate: o pasa (con el profile) o trae la Response de error. */
export type GuardResult =
  | { ok: true; profile: ProfileRow }
  | { ok: false; response: Response };

/**
 * Exige que el usuario actual tenga permiso `action` sobre `resource`.
 *
 * - Sin sesión/perfil → 401.
 * - Sin permiso efectivo (rol + overrides) → 403.
 * - En caso correcto → { ok: true, profile }.
 *
 * owner/admin (y demás roles con acceso) resuelven `true` en la matriz
 * efectiva, así que nunca reciben 403 en recursos permitidos.
 */
export async function requirePermission(
  resource: PermissionResource,
  action: PermissionAction,
): Promise<GuardResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return {
      ok: false,
      response: Response.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  const effective = await getEffectivePermissions(profile.id, profile.role);
  const allowed = effective[resource]?.[action] ?? false;

  if (!allowed) {
    return {
      ok: false,
      response: Response.json(
        { error: "No tienes permisos para realizar esta acción" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, profile };
}

/**
 * Gate de permisos para **server actions** (`"use server"`).
 *
 * A diferencia de `requirePermission` (que devuelve una `Response` para route
 * handlers), aquí LANZAMOS: las server actions no devuelven una `Response`, así
 * que propagan el `throw` como error de la acción. El componente/cliente que la
 * invocó recibe el error y el efecto (INSERT/UPDATE/DELETE) nunca se ejecuta.
 *
 * Usa permisos EFECTIVOS (rol + overrides), opcionalmente por país.
 *
 *   "use server";
 *   export async function crearAlgo(input) {
 *     await assertPermission("clientes", "create");
 *     // ...mutación, ya autorizada
 *   }
 *
 * @throws Error("No autenticado") si no hay sesión/perfil.
 * @throws Error("Sin permisos para <resource>.<action>") si el permiso es falso.
 * @returns el `profile` autenticado y autorizado.
 */
export async function assertPermission(
  resource: PermissionResource,
  action: PermissionAction,
  opts?: { country?: string },
): Promise<ProfileRow> {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error("No autenticado");
  }

  const effective = await getEffectivePermissions(
    profile.id,
    profile.role,
    opts?.country,
  );
  const allowed = effective[resource]?.[action] ?? false;

  if (!allowed) {
    throw new Error(`Sin permisos para ${resource}.${action}`);
  }

  return profile;
}

/**
 * Gate de permisos para **páginas server-component** del panel.
 *
 * El sidebar oculta módulos por rol, pero eso es cosmético: se puede entrar por
 * URL directa. Este helper aplica el modelo de permisos (rol + overrides) a
 * nivel de página. Si el usuario no tiene `view` efectivo sobre `resource`,
 * redirige al home del país en vez de renderizar la página.
 *
 *   export default async function Page({ params }) {
 *     const { country } = await params;
 *     await guardPage("clientes", country);
 *     // ...datos + render, ya autorizado
 *   }
 *
 * `redirect()` lanza internamente (tipo `never`), así que tras llamarlo el
 * `profile` queda garantizado no-nulo para el resto de la página.
 *
 * @returns el `profile` autenticado y autorizado.
 */
export async function guardPage(
  resource: PermissionResource,
  country: string,
): Promise<ProfileRow> {
  // País de destino para el redirect. Si llega algo que no es país válido,
  // caemos a 'es' para tener un prefix seguro al que redirigir.
  const safeCountry: Country = isCountry(country) ? country : "es";
  const prefix = getCountryConfig(safeCountry).prefix;

  const profile = await getCurrentProfile();
  if (!profile) {
    redirect(prefix);
  }

  const effective = await getEffectivePermissions(
    profile.id,
    profile.role,
    safeCountry,
  );
  if (!(effective[resource]?.view ?? false)) {
    redirect(prefix);
  }

  return profile;
}

/**
 * Verifica que un profile puede operar en un país concreto.
 *
 * Regla actual:
 *   role ∈ {owner, admin}  ||  multi_country === true  ||
 *   profile.country === country  ||  profile.countries?.includes(country)
 *
 * `profiles.countries[]` aún no existe en el esquema; se lee de forma
 * defensiva (optional chaining) para no romper si otro agente lo añade.
 */
export function canOperateInCountry(
  profile: ProfileRow,
  country: string,
): boolean {
  if (profile.role === "owner" || profile.role === "admin") return true;
  if (profile.multi_country === true) return true;
  if (profile.country === country) return true;
  // Campo futuro `countries[]`: lectura defensiva.
  const countries = (profile as { countries?: string[] | null }).countries;
  if (Array.isArray(countries) && countries.includes(country)) return true;
  return false;
}

/**
 * Gate de país: exige sesión y que el perfil pueda operar en `country`.
 *
 * Acepta opcionalmente un `profile` ya resuelto (p. ej. el devuelto por
 * `requirePermission`) para evitar una segunda consulta. Si no se pasa, lo
 * resuelve por su cuenta.
 *
 *   const gate = await requireCountryAccess("cl", pProfile);
 *   if (!gate.ok) return gate.response;
 */
export async function requireCountryAccess(
  country: string,
  profile?: ProfileRow,
): Promise<GuardResult> {
  const resolved = profile ?? (await getCurrentProfile());
  if (!resolved) {
    return {
      ok: false,
      response: Response.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (!canOperateInCountry(resolved, country)) {
    return {
      ok: false,
      response: Response.json(
        { error: "No tienes acceso a este país" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, profile: resolved };
}
