import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getEffectiveRoleAndPermissions } from "@/lib/db/queries/permissions";
import { getCountryConfig, isCountry, type Country } from "@/lib/country-config";
import type { ProfileRow } from "@/lib/db/queries/session";
import { resolveCountryAccess, type CountryAccessProfile } from "@/lib/auth/country-access";
import { COUNTRY_HEADER } from "@/lib/db/middleware";
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  type EffectivePermissions,
  type PermissionAction,
  type PermissionResource,
} from "@/lib/permissions";

// ─── País de la petición ──────────────────────────────────────────────────────
//
// Los permisos dependen del país (rol por país y excepciones por país), pero
// las rutas /api/admin/** y las server actions no llevan el país en la URL.
// Hasta 2026-10-05 se evaluaban SIN país: se ignoraba el rol por país y se
// aplicaban a la vez las excepciones de España y de Chile en un orden
// cualquiera — el menú decía una cosa y la API hacía otra. Ahora:
//
//   1. país explícito (`opts.country`, o el de la URL en `guardPage`);
//   2. si no, el del panel de la petición: el de la URL para páginas y server
//      actions (lo marca el middleware), o el de la página que llama para las
//      rutas /api (Referer `/es/admin/…`, que el navegador manda en toda
//      petición del mismo origen);
//   3. si el usuario solo tiene un país, ese;
//   4. si tiene varios y no se sabe cuál: lo permitido en TODOS (lo más
//      estricto — nunca más de lo que tendría en cualquiera de ellos).
//
// Un país explícito al que el usuario no tiene acceso no concede nada.

/**
 * País del panel de la petición: el que marca el middleware a partir de la
 * URL (páginas y server actions viven bajo `/es/admin…` o `/cl/admin…`) o, en
 * las rutas /api, el de la página que llama (Referer).
 */
async function countryFromRequest(): Promise<Country | null> {
  try {
    const h = await headers();
    const marked = h.get(COUNTRY_HEADER);
    if (isCountry(marked)) return marked;
    const referer = h.get("referer");
    if (!referer) return null;
    const match = /^\/(es|cl)\/admin(?:\/|$)/.exec(new URL(referer).pathname);
    return match ? (match[1] as Country) : null;
  } catch {
    // Fuera de una petición (scripts) o Referer malformado.
    return null;
  }
}

function noPermissions(): EffectivePermissions {
  const out = {} as EffectivePermissions;
  for (const r of PERMISSION_RESOURCES) {
    out[r] = {} as Record<PermissionAction, boolean>;
    for (const a of PERMISSION_ACTIONS) out[r][a] = false;
  }
  return out;
}

export type RequestPermissions = {
  permissions: EffectivePermissions;
  /** País con el que se evaluó, o null si se cruzaron todos sus países. */
  country: Country | null;
  /** Rol efectivo de cada país evaluado (uno, o varios si se cruzaron). */
  effectiveRoles: string[];
};

/**
 * Permisos efectivos del usuario para la petición en curso, con el país
 * resuelto como se explica arriba. Es lo que usan todos los gates de este
 * archivo; úsalo también cuando una ruta necesite la matriz entera.
 */
export async function getRequestPermissions(
  profile: ProfileRow,
  explicitCountry?: string | null,
): Promise<RequestPermissions> {
  const access = resolveCountryAccess(profile as CountryAccessProfile);
  const accessible = access.countries.filter(isCountry);

  if (explicitCountry !== undefined && explicitCountry !== null) {
    if (!isCountry(explicitCountry) || !accessible.includes(explicitCountry)) {
      return { permissions: noPermissions(), country: null, effectiveRoles: [] };
    }
  }

  let country: Country | null =
    explicitCountry && isCountry(explicitCountry) ? explicitCountry : await countryFromRequest();
  if (country && !accessible.includes(country)) country = null;
  if (!country && accessible.length === 1) country = accessible[0];

  if (country) {
    const r = await getEffectiveRoleAndPermissions(profile.id, profile.role, country);
    return { permissions: r.permissions, country, effectiveRoles: [r.effectiveRole] };
  }

  const all = await Promise.all(
    accessible.map((c) => getEffectiveRoleAndPermissions(profile.id, profile.role, c)),
  );
  if (all.length === 0) return { permissions: noPermissions(), country: null, effectiveRoles: [] };
  const permissions = noPermissions();
  for (const r of PERMISSION_RESOURCES) {
    for (const a of PERMISSION_ACTIONS) {
      permissions[r][a] = all.every((x) => x.permissions[r]?.[a] === true);
    }
  }
  return { permissions, country: null, effectiveRoles: all.map((x) => x.effectiveRole) };
}

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

  const { permissions: effective } = await getRequestPermissions(profile);
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
 * ⚠️ En producción, Next.js sustituye el mensaje de cualquier excepción no
 * capturada que salga de una server action por uno genérico ("An error
 * occurred in the Server Components render...") antes de que llegue al
 * cliente — así que un `throw` aquí deja al usuario sin saber que el
 * problema es de permisos (parecía "no me deja subir/guardar" sin más
 * explicación). Si la action ya devuelve un `{ ok: false; error: string }`,
 * usa `checkPermission` en su lugar para que el motivo real SÍ le llegue.
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

  const { permissions: effective } = await getRequestPermissions(profile, opts?.country);
  const allowed = effective[resource]?.[action] ?? false;

  if (!allowed) {
    throw new Error(`Sin permisos para ${resource}.${action}`);
  }

  return profile;
}

/** Resultado de `checkPermission`: o pasa (con el profile) o trae un mensaje listo para mostrar. */
export type PermissionCheckResult =
  | { ok: true; profile: ProfileRow }
  | { ok: false; error: string };

/**
 * Igual que `assertPermission`, pero NO lanza: devuelve `{ ok: false, error }`
 * en vez de un `throw`. Pensada para server actions cuyo tipo de retorno ya es
 * `{ ok: true; ... } | { ok: false; error: string }` — al no lanzar, evitamos
 * que Next.js redacte el mensaje en producción (ver nota en `assertPermission`)
 * y el usuario ve el motivo real ("no tienes permiso...") en vez de un error
 * genérico sin explicación.
 *
 *   "use server";
 *   export async function crearAlgo(input): Promise<CrearAlgoResult> {
 *     const gate = await checkPermission("clientes", "create");
 *     if (!gate.ok) return gate;
 *     // ...mutación, ya autorizada (gate.profile si hace falta)
 *   }
 */
export async function checkPermission(
  resource: PermissionResource,
  action: PermissionAction,
  opts?: { country?: string },
): Promise<PermissionCheckResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, error: "No autenticado" };
  }

  const { permissions: effective } = await getRequestPermissions(profile, opts?.country);
  const allowed = effective[resource]?.[action] ?? false;

  if (!allowed) {
    return {
      ok: false,
      error:
        "No tienes permiso para esta acción. Pide a un administrador que te dé acceso desde Usuarios.",
    };
  }

  return { ok: true, profile };
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

  const { permissions: effective } = await getRequestPermissions(profile, safeCountry);
  if (!(effective[resource]?.view ?? false)) {
    redirect(prefix);
  }

  return profile;
}

/**
 * Verifica que un profile puede operar en un país concreto. Misma regla que el
 * layout del panel (`resolveCountryAccess`): owner/admin, los dos; el resto,
 * los de `profiles.countries` (o su país único).
 */
export function canOperateInCountry(
  profile: ProfileRow,
  country: string,
): boolean {
  const access = resolveCountryAccess(profile as CountryAccessProfile);
  return access.isOwnerOrAdmin || access.countries.includes(country);
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
