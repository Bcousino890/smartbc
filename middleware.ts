import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/db/middleware";
import { isStaffRole } from "@/lib/permissions";
import { apiAdminNeedsSession } from "@/lib/auth/api-session-policy";
import { isSuspended } from "@/lib/auth/user-rank";
import {
  getClientIP,
  isIPWhitelisted,
  isIPBlocked,
} from "@/lib/security/ip-security";

// SmartLinks públicos: `/compartir/{slug}` (link estable por propiedad)
// y `/c/{token}` (link único por envío comercial, con tracking). `/og/*`
// son las imágenes para preview en redes sociales/WhatsApp. Todos
// accesibles sin login.
// "/v" → Viewing Collections: colección privada de un itinerario publicado,
// con su propio token. NO confundir con "/c", que es el SmartLink de UNA sola
// propiedad. Ambas son públicas y se resuelven con service role en servidor.
// "/a" → enlace temporal de UN particular (anuncio scrapeado, no ficha
// nuestra), completamente aparte de "/c"/"/v" — ver migración 0149.
const PUBLIC_PATHS = ["/login", "/auth", "/compartir", "/c", "/og", "/p", "/v", "/a", "/seleccion", "/colaboracion"];
const CLIENT_PATHS = ["/inicio", "/propiedades", "/favoritos", "/perfil", "/mensajes", "/documentacion"];
// Los árboles de país (/es/admin, /cl/admin) también son admin: antes solo
// se protegían en el layout; el middleware ni los miraba.
const ADMIN_PATHS = ["/admin", "/es/admin", "/cl/admin"];

// www.bcousinoprop.com / bcousinoprop.com son el dominio público de marketing:
// sirven el sitio que vive en app/web (mismo server que el CRM en
// portal.bcousinoprop.com) vía rewrite, sin tocar nginx ni el DNS del deploy.
const MARKETING_HOSTS = new Set(["www.bcousinoprop.com", "bcousinoprop.com"]);
const MARKETING_PATHS = ["/propiedades", "/contacto", "/nosotros", "/off-market"];

// Roles staff: se usa isStaffRole de lib/permissions como única fuente de
// verdad (la copia local anterior no incluía 'captadora' y divergía).

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isPublicRoute(pathname: string) {
  return startsWithAny(pathname, PUBLIC_PATHS) || pathname === "/";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Dominio de marketing: www.bcousinoprop.com/(bcousinoprop.com) sirve
  // el sitio público de app/web sin exponer el prefijo /web en el request
  // original. Se resuelve antes que cualquier otra regla porque estas
  // páginas son 100% públicas y no participan de la sesión/roles del CRM.
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  if (
    MARKETING_HOSTS.has(host) &&
    !pathname.startsWith("/web") &&
    (pathname === "/" || startsWithAny(pathname, MARKETING_PATHS))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/web" : `/web${pathname}`;
    return NextResponse.rewrite(url);
  }

  // --- API pública (/api/v1): no pasa por sesión ni por control de acceso ---
  // Se autentica con clave de API en la propia ruta (lib/api/auth.ts), así que
  // resolver la sesión de cookies aquí sería una llamada a GoTrue por cada
  // petición de un proveedor, para nada.
  if (pathname.startsWith("/api/v1")) {
    return NextResponse.next();
  }

  // --- IP Security: solo en rutas públicas, excluir /api/tracking ---
  // Las rutas de admin y cliente siguen el flujo normal de auth.
  // /api/tracking debe recibir eventos aunque la IP esté bloqueada.
  if (isPublicRoute(pathname) && !pathname.startsWith("/api/tracking")) {
    const ip = getClientIP(request);
    if (ip) {
      // Primero comprobar whitelist: si la IP está whitelisted, saltar todos los checks
      const whitelisted = await isIPWhitelisted(ip);
      if (!whitelisted) {
        // Verificar blacklist
        const blocked = await isIPBlocked(ip);
        if (blocked) {
          return new NextResponse(
            "<h1>Acceso denegado</h1><p>Tu acceso ha sido bloqueado. Contacta con soporte.</p>",
            {
              status: 403,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }
          );
        }
      }
    }
  }

  // --- Sesión y control de acceso ---
  const { supabase, response, user: sessionUser } = await updateSession(request);

  // --- API de administración: sesión obligatoria en la capa de entrada ---
  // Segunda barrera, además del guard de cada ruta: una ruta de /api/admin que
  // olvide autenticarse ya no queda abierta a Internet. Solo se exceptúan las
  // que aceptan otra credencial (secreto de cron / token de acceso) y la
  // comprueban ellas mismas; ver lib/auth/api-session-policy.ts. No decide
  // PERMISOS (eso sigue en cada ruta): solo exige que haya una sesión válida.
  if (apiAdminNeedsSession(pathname) && !sessionUser) {
    return NextResponse.json(
      { error: "No autenticado" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (isPublicRoute(pathname)) {
    return response;
  }

  const isClient = startsWithAny(pathname, CLIENT_PATHS);
  const isAdmin = startsWithAny(pathname, ADMIN_PATHS);

  if (!isClient && !isAdmin) return response;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // `suspended_at` (migración 0211) viaja en la misma consulta; si la columna
  // aún no existe, la consulta falla y se repite solo con el rol — así el
  // despliegue nunca depende del orden en que se apliquen código y migración.
  let { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, suspended_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    ({ data: profile } = (await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()) as { data: typeof profile });
  }

  // Cuenta suspendida: se cierra la sesión y se vuelve al login. El baneo de
  // GoTrue impide renovar el token; esto corta la sesión que aún siga viva.
  if (isSuspended(profile as { suspended_at?: string | null } | null)) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("suspended", "1");
    const redirectResponse = NextResponse.redirect(url);
    // Las cookies de sesión de Supabase (`sb-…`, también las troceadas `.0`,
    // `.1`) se borran a mano: `signOut` las limpia en una respuesta interna que
    // no es la que devolvemos.
    request.cookies
      .getAll()
      .filter((c) => c.name.startsWith("sb-"))
      .forEach((c) => redirectResponse.cookies.set(c.name, "", { maxAge: 0, path: "/" }));
    return redirectResponse;
  }

  const role = profile?.role ?? "client";
  const isStaff = isStaffRole(role);

  // Clientes y roles sin acceso admin son redirigidos a /inicio
  if (isAdmin && !isStaff) {
    return NextResponse.redirect(new URL("/inicio", request.url));
  }
  // Staff (incluidos agent_*) es redirigido a /admin si intenta acceder a rutas de cliente
  if (isClient && isStaff) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Rutas que RECIBEN ARCHIVOS, fuera del middleware: Next 15.5 copia el
    // cuerpo de cada petición que pasa por aquí y lo CORTA a 10 MB
    // (`middlewareClientMaxBodySize`, solo avisa con un console.warn) — la
    // ruta recibe un FormData truncado ("Failed to parse body as FormData").
    // En /api el middleware no controla acceso (solo refresca la cookie de
    // sesión; isAdmin/isClient no casan con /api), y cada una de estas rutas
    // comprueba sesión y permisos por su cuenta. Si añades una ruta de subida,
    // añádela aquí y que se autentique sola.
    // api/seleccion (BCP-01): canal en vivo y consultas del lector público de
    // catálogos; sin sesión (entra por token), así se ahorra el refresco de
    // la cookie en cada consulta de respaldo (2 por segundo) y el SSE no
    // pasa por aquí.
    "/((?!_next/static|_next/image|favicon.ico|api/admin/properties/upload|api/admin/publicacion/upload-media|api/admin/idealista/upload-media|api/admin/idealista/video-music|api/admin/zinto/media/send|api/property-applications/documents/upload|api/property-applications/documents/auto-upload|api/seleccion|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
