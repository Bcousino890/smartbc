import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { buildOAuthUrl } from "@/lib/sync/portalinmobiliario/ml-config";
import { requireRoles } from "@/lib/auth/guard";

const REDIRECT_URI = "https://portal.bcousinoprop.com/api/cl/ml-callback";

/** Nombre de la cookie que liga el inicio del flujo OAuth con su callback. */
const ML_OAUTH_STATE_COOKIE = "ml_oauth_state";

/**
 * Inicia la conexión de la cuenta de MercadoLibre de la agencia.
 *
 * Antes no pedía sesión (cualquiera podía lanzar el flujo) y la URL de
 * autorización no llevaba `state`, así que el callback aceptaba cualquier
 * `code` (CSRF de login: se podía forzar a la agencia a conectar una cuenta de
 * MercadoLibre ajena). Ahora: solo Propietario y Administrador, y se genera un
 * `state` aleatorio que se guarda en una cookie httpOnly y se exige al volver.
 */
export async function GET() {
  const gate = await requireRoles(["owner", "admin"], {
    country: "cl",
    message: "Solo el Propietario o un Administrador pueden conectar MercadoLibre",
  });
  if (!gate.ok) return gate.response;

  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(buildOAuthUrl(REDIRECT_URI, state));
  res.cookies.set(ML_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    // Lax: la vuelta desde MercadoLibre es una navegación de primer nivel (GET),
    // así que la cookie viaja; un POST cruzado desde otro sitio no la lleva.
    sameSite: "lax",
    path: "/api/cl/ml-callback",
    maxAge: 10 * 60,
  });
  return res;
}
