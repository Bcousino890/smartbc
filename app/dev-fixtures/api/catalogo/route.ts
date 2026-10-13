import { NextResponse } from "next/server";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";

// SOLO DESARROLLO LOCAL (BCP-01 T11, E7): cambios sintéticos sobre el almacén
// en memoria para probar el lector en vivo (D12, revocación, caducidad y la
// medición sintética). Avisa al vigilante igual que las acciones reales.
// 404 fuera de NODE_ENV=development + CATALOG_FIXTURES=1.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isCatalogFixtureMode()) return new NextResponse("not_found", { status: 404 });
  const host = req.headers.get("host") ?? "";
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return new NextResponse("forbidden", { status: 403 });
  const op = await req.json().catch(() => null);
  if (!op || typeof op.op !== "string") return NextResponse.json({ error: "bad_op" }, { status: 400 });
  const { fixtureMutate, fixtureGetPublic } = await import("@/lib/catalogs/fixture-store");
  const { notifyCatalogChanged } = await import("@/lib/catalogs/sync-hub-instance");
  // Huella antes y después (medición: «sin cambio público»). notify:false =
  // «sin aviso inmediato» (el cambio llega por la pasada del vigilante).
  const before = typeof op.token === "string" ? (await fixtureGetPublic(op.token))?.fingerprint ?? null : null;
  const res = op.op === "noop" ? { fingerprint: before } : await fixtureMutate(op);
  if (op.notify !== false) notifyCatalogChanged();
  return NextResponse.json({ ...res, before }, { headers: { "Cache-Control": "no-store" } });
}
