/**
 * Política de sesión de la capa de entrada para `/api/admin/**`. Módulo PURO:
 * `npm run test:api-session-policy`.
 *
 * Por qué existe: el middleware dejaba pasar todo `/api` sin mirar la sesión
 * (solo refrescaba la cookie), así que cada ruta tenía que autenticarse sola. Una
 * ruta nueva, o una existente que olvidara el guard, quedaba abierta a Internet
 * con service role detrás (pasó con los contactos de las captaciones, el
 * historial de estados de Idealista y las notificaciones).
 *
 * Ahora `middleware.ts` responde 401 a cualquier petición a `/api/admin/**` sin
 * sesión válida, SALVO a las rutas de esta lista, que aceptan otro tipo de
 * credencial y la comprueban ellas mismas (secreto de cron o token de acceso en
 * la cabecera). Es una segunda barrera, no sustituye a los guards de cada ruta:
 * las rutas siguen decidiendo QUIÉN puede hacer QUÉ (`requirePermission`…).
 *
 * La lista solo debe encoger. Una ruta nueva que acepte `Authorization` o
 * `x-cron-secret` debe añadirse aquí (el test falla si se olvida).
 */

export const API_ADMIN_PREFIX = "/api/admin";

/**
 * Rutas (o prefijos, para rutas dinámicas) de `/api/admin` que aceptan una
 * credencial distinta de la cookie de sesión. Clave = ruta; valor = motivo.
 */
export const API_ADMIN_NON_SESSION_ROUTES: Record<string, string> = {
  "/api/admin/idealista/process-scheduled":
    "cron del VPS: cabecera x-cron-secret (CRON_SECRET)",
  "/api/admin/particulares/proxy-health":
    "sesión de owner/admin o Authorization: Bearer CRON_SECRET (comprobaciones del VPS)",
  "/api/admin/particulares/refresh-phones":
    "sesión con permiso o Authorization: Bearer CRON_SECRET (workflow sweep-missing-phones de GitHub)",
  "/api/admin/particulares/verify-phones":
    "sesión con permiso o Authorization: Bearer CRON_SECRET (scripts/verify-particulares-phones.sh)",
  "/api/admin/video/ffmpeg-health":
    "sesión de owner/admin o Authorization: Bearer CRON_SECRET (diagnóstico desde el VPS)",
  "/api/admin/zinto/health":
    "sesión de owner/admin o Authorization: Bearer CRON_SECRET (diagnóstico desde el VPS)",
  "/api/admin/zinto/conversations":
    "LEGADO (ninguna pantalla lo usa): valida un token de acceso de Supabase en la cabecera Authorization. Retirar con el resto del Zinto legacy.",
};

function normalize(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/** ¿Es una ruta de la API de administración? */
export function isApiAdminPath(pathname: string): boolean {
  const p = normalize(pathname);
  return p === API_ADMIN_PREFIX || p.startsWith(`${API_ADMIN_PREFIX}/`);
}

/** ¿Está en la lista de rutas que se autentican con otra credencial? */
export function isNonSessionRoute(pathname: string): boolean {
  const p = normalize(pathname);
  return Object.keys(API_ADMIN_NON_SESSION_ROUTES).some(
    (route) => p === route || p.startsWith(`${route}/`),
  );
}

/**
 * ¿Debe el middleware exigir una sesión válida para esta ruta?
 * Sí para toda `/api/admin/**` que no esté en la lista de excepciones.
 */
export function apiAdminNeedsSession(pathname: string): boolean {
  return isApiAdminPath(pathname) && !isNonSessionRoute(pathname);
}
