import "server-only";
import { createClient } from "@/lib/db/server";
import { requireSession } from "@/lib/db/auth-helpers";
import { getApplicationById } from "@/lib/db/queries/property-applications";
import { isStaffRole } from "@/lib/permissions";
import {
  buildCandidateSummaryPdfData,
  renderCandidateSummaryPdfBuffer,
} from "@/lib/property-applications/candidate-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireSession(supabase);
    if (!auth.ok) return new Response("No autorizado", { status: 401 });

    const isStaff = isStaffRole(auth.role);
    if (!isStaff) return new Response("Sin permiso", { status: 403 });

    const application = await getApplicationById(id, true);
    if (!application) return new Response("No encontrada", { status: 404 });

    const data = buildCandidateSummaryPdfData(application);
    const buffer = await renderCandidateSummaryPdfBuffer(data);

    const safeName = data.clientName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="candidato-${safeName || id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[export-summary] Error:", err);
    return new Response("Error interno", { status: 500 });
  }
}
