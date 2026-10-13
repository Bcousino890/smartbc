import "server-only";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile, type ProfileRow } from "@/lib/db/queries/session";
import { isHomeCountry, resolveHomeAccess, type HomeAccessFailure } from "./access";

// ============================================================================
// Guarda de servidor de la HOME (BCP-01 T2). Se usa en la página, en cada
// acción de servidor y en cualquier ruta de API de catálogos. El menú lateral
// también la consulta, pero ocultar el enlace NO protege nada: la protección
// es esta.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

/** ¿Está este perfil en home_owners? Ante cualquier error (p.ej. la tabla aún
 *  no existe porque la migración 0192 no se ha aplicado), responde false. */
export async function isHomeOwner(profileId: string): Promise<boolean> {
  try {
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("home_owners")
      .select("profile_id")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data && data.profile_id === profileId);
  } catch {
    return false;
  }
}

export function getHomeAccess() {
  return resolveHomeAccess<ProfileRow>({
    getProfile: getCurrentProfile,
    isOwner: isHomeOwner,
  });
}

/** Para páginas: sin sesión → /login; cualquier otro caso que no sea el dueño
 *  → 404 (no se revela que la página existe). */
export async function requireHomeOwnerPage(country: string): Promise<ProfileRow> {
  if (!isHomeCountry(country)) notFound();
  const access = await getHomeAccess();
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    notFound();
  }
  return access.profile;
}

/** Para acciones de servidor y rutas de API: nunca lanza, devuelve el motivo. */
export async function assertHomeOwner(): Promise<
  { ok: true; profile: ProfileRow } | { ok: false; error: HomeAccessFailure }
> {
  const access = await getHomeAccess();
  if (!access.ok) return { ok: false, error: access.reason };
  return { ok: true, profile: access.profile };
}
