import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";

// SOLO DESARROLLO LOCAL (BCP-01 P7): los PDF SINTÉTICOS de
// scripts/fixtures/pdf para la página de pruebas. Lista cerrada.
export const dynamic = "force-dynamic";
const NAMES = new Set(["digital.pdf", "escaneado.pdf", "mixto.pdf", "varias.pdf"]);

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isCatalogFixtureMode() || !NAMES.has(name)) return new Response("not_found", { status: 404 });
  const body = await readFile(join(process.cwd(), "scripts", "fixtures", "pdf", name));
  return new Response(new Uint8Array(body), { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
}
