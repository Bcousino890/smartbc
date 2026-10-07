import "server-only";

// ============================================================================
// Quién está detrás de cada petición de la extensión de Chrome.
//
// Todas las rutas /api/extension/** pasan por `authenticateExtension`. Acepta:
//   · el token POR USUARIO (sbx_…), que sale de conectar la extensión desde
//     /{país}/admin/extension — dice quién es, se revoca de uno en uno y
//     caduca si no se usa;
//   · el token COMPARTIDO antiguo (HMAC), solo mientras un admin no lo apague
//     (`extension.security.legacyTokenEnabled`). Las extensiones ya
//     instaladas lo llevan pegado; apagarlo es el último paso de la migración.
//
// Con un token por usuario, cada ruta aplica además lo que ese usuario puede
// ver en el CRM (su cartera, sus países): la extensión deja de ser una puerta
// trasera a la lista entera de clientes.
// ============================================================================

import { createAdminClient } from "@/lib/db/admin";
import { verifyExtensionToken } from "@/lib/services/idealista/extension-token";
import {
  describeUserAgent,
  extensionIdFromOrigin,
  generateExtensionToken,
  hashExtensionToken,
  isSessionToken,
  originAllowed,
  sessionExpiry,
  shouldTouch,
} from "./token";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;

/** Quien puede usar la extensión: el equipo, nunca un cliente. */
export const EXTENSION_ROLES = [
  "owner",
  "admin",
  "advisor",
  "agent_junior",
  "agent_senior",
  "agent_admin",
] as const;

// ─── Ajustes ─────────────────────────────────────────────────────────────────

export type ExtensionSecurity = {
  /** ¿Se sigue aceptando el token compartido de antes? */
  legacyTokenEnabled: boolean;
  /** IDs de extensión admitidos (vacío = cualquiera; ver `originAllowed`). */
  allowedExtensionIds: string[];
  /** Enlace de instalación (Chrome Web Store) que enseña la página de conectar. */
  storeUrl: string | null;
};

const SETTINGS_KEY = "extension.security";
const DEFAULT_SECURITY: ExtensionSecurity = {
  legacyTokenEnabled: true,
  allowedExtensionIds: [],
  storeUrl: null,
};
const CACHE_MS = 30_000;
let cache: { at: number; value: ExtensionSecurity } | null = null;

function normalizeSecurity(raw: unknown): ExtensionSecurity {
  const r = (raw ?? {}) as Partial<ExtensionSecurity>;
  return {
    legacyTokenEnabled: r.legacyTokenEnabled !== false,
    allowedExtensionIds: Array.isArray(r.allowedExtensionIds)
      ? r.allowedExtensionIds.filter((id) => typeof id === "string" && /^[a-p]{32}$/.test(id))
      : [],
    storeUrl:
      typeof r.storeUrl === "string" && /^https:\/\/chromewebstore\.google\.com\//.test(r.storeUrl)
        ? r.storeUrl
        : null,
  };
}

export async function getExtensionSecurity(): Promise<ExtensionSecurity> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const { data, error } = await db()
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  // Sin fila (migración sin aplicar) o error: el comportamiento de siempre.
  const value = error ? DEFAULT_SECURITY : normalizeSecurity(data?.value);
  cache = { at: Date.now(), value };
  return value;
}

export async function setExtensionSecurity(
  patch: Partial<ExtensionSecurity>,
): Promise<{ ok: true; value: ExtensionSecurity } | { ok: false; error: string }> {
  const next = normalizeSecurity({ ...(await getExtensionSecurity()), ...patch });
  const { error } = await db()
    .from("app_settings")
    .upsert({ key: SETTINGS_KEY, value: next, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  cache = { at: Date.now(), value: next };
  return { ok: true, value: next };
}

// ─── Sesiones ────────────────────────────────────────────────────────────────

export async function createExtensionSession(
  userId: string,
  userAgent: string | null,
  extensionId: string,
): Promise<{ ok: true; token: string; prefix: string } | { ok: false; error: string }> {
  if (!/^[a-p]{32}$/.test(extensionId)) {
    return { ok: false, error: "No se reconoce la extensión instalada." };
  }
  const security = await getExtensionSecurity();
  if (security.allowedExtensionIds.length && !security.allowedExtensionIds.includes(extensionId)) {
    return {
      ok: false,
      error: "Esta copia de la extensión no está autorizada: instala la oficial desde el enlace de la empresa.",
    };
  }
  const { token, prefix, hash } = generateExtensionToken();
  const { error } = await db()
    .from("extension_sessions")
    .insert({
      user_id: userId,
      token_hash: hash,
      token_prefix: prefix,
      label: describeUserAgent(userAgent),
      extension_id: extensionId,
      expires_at: sessionExpiry().toISOString(),
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true, token, prefix };
}

export type ExtensionSessionRow = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  prefix: string;
  label: string | null;
  extensionId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
};

/** Sesiones activas (no revocadas ni caducadas), de un usuario o de todos. */
export async function listExtensionSessions(userId?: string): Promise<ExtensionSessionRow[]> {
  let q = db()
    .from("extension_sessions")
    .select("id, user_id, token_prefix, label, extension_id, created_at, last_used_at, expires_at, revoked_at")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error || !data) return [];

  const rows = data as Array<Record<string, string | null>>;
  const ids = [...new Set(rows.map((r) => r.user_id as string))];
  const names = new Map<string, { full_name: string | null; email: string | null }>();
  if (ids.length) {
    const { data: people } = await db().from("profiles").select("id, full_name, email").in("id", ids);
    for (const p of (people ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      names.set(p.id, p);
    }
  }
  return rows.map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    userName: names.get(r.user_id as string)?.full_name ?? null,
    userEmail: names.get(r.user_id as string)?.email ?? null,
    prefix: r.token_prefix as string,
    label: r.label,
    extensionId: r.extension_id,
    createdAt: r.created_at as string,
    lastUsedAt: r.last_used_at,
    expiresAt: r.expires_at as string,
    revokedAt: r.revoked_at,
  }));
}

/**
 * Revoca una sesión. `onlyUserId` limita a las del propio usuario (quien no es
 * admin solo puede desconectar sus navegadores).
 */
export async function revokeExtensionSession(
  sessionId: string,
  revokedBy: string,
  onlyUserId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let q = db()
    .from("extension_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_by: revokedBy })
    .eq("id", sessionId)
    .is("revoked_at", null);
  if (onlyUserId) q = q.eq("user_id", onlyUserId);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Esa sesión no existe o ya estaba cerrada." };
  return { ok: true };
}

/** Desconecta TODOS los navegadores de un usuario (p. ej. deja la empresa). */
export async function revokeAllForUser(userId: string, revokedBy: string): Promise<number> {
  const { data } = await db()
    .from("extension_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_by: revokedBy })
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");
  return (data ?? []).length;
}

// ─── La comprobación de cada petición ────────────────────────────────────────

export type ExtensionUser = {
  id: string;
  role: string;
  fullName: string | null;
  email: string | null;
  /** Países a los que tiene acceso (el suyo si no tiene lista). */
  countries: string[];
};

export type ExtensionAuth =
  | { ok: true; kind: "user"; sessionId: string; user: ExtensionUser }
  | { ok: true; kind: "legacy" }
  | { ok: false; status: 401 | 403; code: string; error: string };

const fail = (status: 401 | 403, code: string, error: string): ExtensionAuth => ({
  ok: false,
  status,
  code,
  error,
});

export async function authenticateExtension(request: Request): Promise<ExtensionAuth> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return fail(401, "missing", "La extensión no está conectada: conéctala con tu usuario del CRM.");
  }

  const security = await getExtensionSecurity();

  if (!isSessionToken(token)) {
    if (!security.legacyTokenEnabled) {
      return fail(
        401,
        "legacy_disabled",
        "El token compartido ya no se acepta: conecta la extensión con tu usuario del CRM.",
      );
    }
    return verifyExtensionToken(token)
      ? { ok: true, kind: "legacy" }
      : fail(401, "invalid", "Token inválido o caducado: vuelve a conectar la extensión.");
  }

  if (!originAllowed(request.headers.get("origin"), security.allowedExtensionIds)) {
    return fail(403, "origin", "Esta copia de la extensión no está autorizada.");
  }

  const { data: session } = await db()
    .from("extension_sessions")
    .select("id, user_id, expires_at, revoked_at, last_used_at, extension_id")
    .eq("token_hash", hashExtensionToken(token))
    .maybeSingle();

  if (!session) return fail(401, "invalid", "Sesión no válida: vuelve a conectar la extensión.");
  if (session.revoked_at) {
    return fail(401, "revoked", "Esta extensión se desconectó desde el CRM: vuelve a conectarla.");
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return fail(401, "expired", "La sesión de la extensión caducó por no usarse: vuelve a conectarla.");
  }
  // El token va atado a la extensión que lo pidió: usado desde cualquier otra
  // (una copia, un script) no vale. El Origin lo pone Chrome, no la extensión.
  // ⚠️ Chrome solo manda ese Origin en peticiones POST del service worker (en
  // GET no lo manda): por eso la 2.0 llama a todo con POST, y un token por
  // usuario usado con GET se rechaza aquí.
  if (session.extension_id && extensionIdFromOrigin(request.headers.get("origin")) !== session.extension_id) {
    return fail(403, "origin", "Este token pertenece a otra instalación de la extensión.");
  }

  const { data: profile } = await db()
    .from("profiles")
    .select("id, role, full_name, email, country, countries")
    .eq("id", session.user_id)
    .maybeSingle();

  // Quien deja de ser del equipo pierde la extensión en ese mismo momento,
  // sin esperar a que alguien se acuerde de desconectarla.
  if (!profile || !(EXTENSION_ROLES as readonly string[]).includes(profile.role)) {
    return fail(401, "not_staff", "Tu usuario ya no tiene acceso a la extensión.");
  }

  if (shouldTouch(session.last_used_at)) {
    await db()
      .from("extension_sessions")
      .update({ last_used_at: new Date().toISOString(), expires_at: sessionExpiry().toISOString() })
      .eq("id", session.id);
  }

  const countries: string[] =
    Array.isArray(profile.countries) && profile.countries.length
      ? profile.countries
      : [profile.country ?? "es"];

  return {
    ok: true,
    kind: "user",
    sessionId: session.id,
    user: {
      id: profile.id,
      role: profile.role,
      fullName: profile.full_name ?? null,
      email: profile.email ?? null,
      countries,
    },
  };
}
