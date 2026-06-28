import "server-only";
import { createClient } from "@/lib/db/server";
import { requireStaff } from "@/lib/db/auth-helpers";
import { verifyDocument, addAnnotation } from "@/lib/db/queries/property-applications";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireStaff(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json() as {
      status: "verified" | "rejected" | "needs_correction";
      notes?: string;
      annotation?: {
        text: string;
        type: "info" | "warning" | "error";
      };
    };

    if (!body.status) {
      return Response.json({ error: "Se requiere el campo status" }, { status: 400 });
    }

    await verifyDocument(id, auth.userId, {
      status: body.status,
      notes: body.notes,
    });

    // Si viene anotación adjunta, guardarla también
    if (body.annotation?.text) {
      await addAnnotation({
        document_id: id,
        annotation_text: body.annotation.text,
        annotation_type: body.annotation.type ?? "info",
        created_by: auth.userId,
      });
    }

    return Response.json({ ok: true, status: body.status });
  } catch (err) {
    console.error("[verify-doc] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
