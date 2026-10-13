// ============================================================================
// Acceso a la HOME de Fabricio y a sus catálogos (BCP-01). Lógica PURA, sin
// red ni base de datos, para poder probarla con scripts/test-catalogs.mts.
//
// La regla: solo entra un perfil que esté en `home_owners` (migración 0192),
// comparado por id de perfil. Ni el rol, ni el nombre, ni el correo, ni tener
// la URL dan acceso. Cualquier fallo al comprobarlo cuenta como "no" (fallo
// cerrado).
// ============================================================================

export type HomeAccessFailure = "unauthenticated" | "forbidden";

export type HomeAccess<P> =
  | { ok: true; profile: P }
  | { ok: false; reason: HomeAccessFailure };

export interface HomeAccessDeps<P extends { id: string }> {
  /** Perfil de la sesión actual, o null si no hay sesión. */
  getProfile: () => Promise<P | null>;
  /** ¿Está este id de perfil en home_owners? */
  isOwner: (profileId: string) => Promise<boolean>;
}

export async function resolveHomeAccess<P extends { id: string }>(
  deps: HomeAccessDeps<P>,
): Promise<HomeAccess<P>> {
  let profile: P | null;
  try {
    profile = await deps.getProfile();
  } catch {
    return { ok: false, reason: "unauthenticated" };
  }
  if (!profile || !profile.id) return { ok: false, reason: "unauthenticated" };

  let owner = false;
  try {
    owner = await deps.isOwner(profile.id);
  } catch {
    owner = false;
  }
  if (owner !== true) return { ok: false, reason: "forbidden" };
  return { ok: true, profile };
}

export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** Envoltorio de toda acción de gestión: si no es el dueño, la acción ni se
 *  ejecuta y se devuelve el motivo ('unauthenticated' | 'forbidden'). */
export async function withHomeAccess<P extends { id: string }, T extends object>(
  deps: HomeAccessDeps<P>,
  fn: (profile: P) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const access = await resolveHomeAccess(deps);
  if (!access.ok) return { ok: false, error: access.reason };
  return fn(access.profile);
}

/** La HOME es solo de España en la V1 (D16). */
export function isHomeCountry(country: string): boolean {
  return country === "es";
}
