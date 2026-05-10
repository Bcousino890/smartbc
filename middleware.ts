import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/db/middleware";

const PUBLIC_PATHS = ["/login", "/auth"];
const CLIENT_PATHS = ["/inicio", "/propiedades", "/favoritos", "/perfil", "/mensajes"];
const ADMIN_PATHS = ["/admin"];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { supabase, response } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (startsWithAny(pathname, PUBLIC_PATHS) || pathname === "/") {
    return response;
  }

  const isClient = startsWithAny(pathname, CLIENT_PATHS);
  const isAdmin = startsWithAny(pathname, ADMIN_PATHS);

  if (!isClient && !isAdmin) return response;

  const { data: { user } } = await supabase.auth.getUser();
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

  if (isAdmin && role === "client") {
    return NextResponse.redirect(new URL("/inicio", request.url));
  }
  if (isClient && (role === "admin" || role === "advisor")) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
