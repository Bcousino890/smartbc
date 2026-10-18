import { checkPermission } from "@/lib/auth/guard";
import { servePdfAsset } from "@/lib/imports/pdf/assets-server";

export const dynamic = "force-dynamic";

/**
 * Ficheros de pdf.js y del OCR para importar desde PDF (BCP-01 P7): worker de
 * pdf.js, worker y núcleo de tesseract.js y los datos de idioma spa/eng. Solo
 * para quien puede crear propiedades; lista cerrada (lib/imports/pdf/ocr.ts).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ version: string; file: string }> }) {
  const g = await checkPermission("properties", "create", { country: "es" });
  if (!g.ok) return new Response("forbidden", { status: 403 });
  const { version, file } = await params;
  return servePdfAsset(version, file);
}
