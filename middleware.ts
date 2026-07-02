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
const PUBLIC_PATHS = ["/login", "/auth", "/compartir", "/c", "/og", "/p"];
const CLIENT_PATHS = ["/inicio", "/propiedades", "/favoritos", "/perfil", "/mensajes"];
// Los árboles de país (/es/admin, /cl/admin) también son admin: antes solo
// se protegían en el layout; el middleware ni los miraba.
const ADMIN_PATHS = ["/admin", "/es/admin", "/cl/admin"];

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
