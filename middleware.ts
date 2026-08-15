import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/db/middleware";
import { isStaffRole } from "@/lib/permissions";
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
const PUBLIC_PATHS = ["/login", "/auth", "/compartir", "/c", "/og", "/p", "/v"];
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
  const { supabase, response } = await updateSession(request);

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
