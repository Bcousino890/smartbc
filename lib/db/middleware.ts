import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Cabecera interna con el país del panel de la petición (`es`/`cl`), para que
 * los permisos se evalúen con el país de la URL (ver `lib/auth/guard.ts`). La
 * pone SOLO el middleware: cualquier valor que mande el navegador se borra.
 */
export const COUNTRY_HEADER = "x-smartbc-country";

function downstreamHeaders(request: NextRequest, country: string | null): Headers {
  const headers = new Headers(request.headers);
  headers.delete(COUNTRY_HEADER);
  if (country) headers.set(COUNTRY_HEADER, country);
  return headers;
}

export async function updateSession(request: NextRequest, opts?: { country?: string | null }) {
  const country = opts?.country ?? null;
  let response = NextResponse.next({ request: { headers: downstreamHeaders(request, country) } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Las cabeceras se reconstruyen DESPUÉS de tocar las cookies, para
          // que la sesión renovada llegue también a la página.
          response = NextResponse.next({ request: { headers: downstreamHeaders(request, country) } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return { supabase, response };
}
