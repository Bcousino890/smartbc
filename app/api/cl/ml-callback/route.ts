import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { exchangeCodeForTokens } from "@/lib/sync/portalinmobiliario/ml-config";
import { requireRoles } from "@/lib/auth/guard";

const REDIRECT_URI = "https://portal.bcousinoprop.com/api/cl/ml-callback";
const BASE_URL = "https://portal.bcousinoprop.com";

/** Misma cookie que escribe /api/admin/cl/ml-connect (no se importa de allí para no acoplar rutas). */
const ML_OAUTH_STATE_COOKIE = "ml_oauth_state";

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function sameState(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function clearState(res: NextResponse): NextResponse {
  res.cookies.set(ML_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/cl/ml-callback",
    maxAge: 0,
  });
  return res;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Guarda los tokens de la cuenta de la agencia: exige sesión de Propietario o
  // Administrador y que el `state` coincida con el que generó ml-connect para
  // ESTE navegador. Sin esto, cualquiera que entregara un `code` ajeno al
  // callback conseguía que la agencia quedara conectada a otra cuenta.
  const gate = await requireRoles(["owner", "admin"], { country: "cl" });
  if (!gate.ok) return gate.response;

  const expectedState = readCookie(request, ML_OAUTH_STATE_COOKIE);
  if (!sameState(expectedState, searchParams.get("state"))) {
    console.error("[ml-callback] state inválido o ausente; se rechaza el callback");
    return clearState(
      NextResponse.redirect(
        `${BASE_URL}/cl/admin/configuracion?ml_error=${encodeURIComponent("state_invalido")}`
      )
    );
  }

  if (error) {
    console.error(`[ml-callback] OAuth error from ML: ${error}`);
    return clearState(NextResponse.redirect(
      `${BASE_URL}/cl/admin/configuracion?ml_error=${encodeURIComponent(error)}`
    ));
  }

  if (!code) {
    return NextResponse.json({ error: "No code received" }, { status: 400 });
  }

  const result = await exchangeCodeForTokens(code, REDIRECT_URI);

  if ("error" in result) {
    console.error(`[ml-callback] Token exchange failed: ${result.error}`);
    return clearState(NextResponse.redirect(
      `${BASE_URL}/cl/admin/configuracion?ml_error=${encodeURIComponent(result.error)}`
    ));
  }

  console.log(`[ml-callback] ✓ OAuth success. user_id=${result.tokens.user_id}`);

  return clearState(NextResponse.redirect(
    `${BASE_URL}/cl/admin/configuracion?ml_connected=1`
  ));
}
