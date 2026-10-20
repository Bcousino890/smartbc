import { NextResponse } from "next/server";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";

// SOLO DESARROLLO LOCAL (0218, E7): asignaciones a clientes SINTÉTICOS para
// el gestor de prueba y la QA (crear, renovar, revocar, caducar, buscar).
// Mismas reglas que las funciones SQL. 404 fuera del modo fixtures.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isCatalogFixtureMode()) return new NextResponse("not_found", { status: 404 });
  const host = req.headers.get("host") ?? "";
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return new NextResponse("forbidden", { status: 403 });
  const op = await req.json().catch(() => null);
  if (!op || typeof op.op !== "string") return NextResponse.json({ error: "bad_op" }, { status: 400 });
  const { fixtureClientLinks, fixtureNotices } = await import("@/lib/catalogs/fixture-store");
  const { notifyCatalogChanged } = await import("@/lib/catalogs/sync-hub-instance");
  try {
    if (op.op === "notices") return NextResponse.json({ notices: fixtureNotices() }, { headers: { "Cache-Control": "no-store" } });
    const data = await fixtureClientLinks(op);
    if (op.op === "revoke" || op.op === "expire" || op.op === "renew") notifyCatalogChanged();
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "error" }, { status: 400 });
  }
}
