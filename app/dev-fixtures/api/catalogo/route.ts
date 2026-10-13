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
  const { fixtureMutate } = await import("@/lib/catalogs/fixture-store");
  const { notifyCatalogChanged } = await import("@/lib/catalogs/sync-hub-instance");
  const res = await fixtureMutate(op);
  notifyCatalogChanged();
  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
}
