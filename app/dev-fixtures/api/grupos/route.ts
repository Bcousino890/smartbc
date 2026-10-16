import { NextResponse } from "next/server";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";

// SOLO DESARROLLO LOCAL (HOME · grupos): grupos y catálogos creados en la HOME
// de fixtures, sobre un almacén sintético en memoria. A diferencia de
// /dev-fixtures/api/catalogo, NUNCA avisa al vigilante de los lectores:
// organizar no cambia ningún catálogo. 404 fuera de NODE_ENV=development +
// CATALOG_FIXTURES=1, y solo desde localhost.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isCatalogFixtureMode()) return new NextResponse("not_found", { status: 404 });
  const host = req.headers.get("host") ?? "";
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return new NextResponse("forbidden", { status: 403 });
  const op = await req.json().catch(() => null);
  if (!op || typeof op.op !== "string") return NextResponse.json({ ok: false, error: "bad_op" }, { status: 400 });
  const { fixtureGroupsMutate } = await import("@/lib/catalogs/fixture-groups");
  return NextResponse.json(await fixtureGroupsMutate(op), { headers: { "Cache-Control": "no-store" } });
}
