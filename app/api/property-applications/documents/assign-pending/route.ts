import "server-only";
import { createClient } from "@/lib/db/server";
import { requireStaff } from "@/lib/db/auth-helpers";
import {
  getApplicationById,
  getDocumentTypeById,
  insertDocument,
} from "@/lib/db/queries/property-applications";
import { analyzeApplicationDocument } from "@/lib/property-applications/ai-analysis";
import { recalculateApplicationScore } from "@/lib/property-applications/scoring-engine";

type Body = {
  application_id?: string;
  document_type_id?: string;
  storage_path?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  co_applicant_id?: string;
};

// Completa una subida que /documents/auto-upload no pudo clasificar sola: el
// archivo ya está en storage, aquí solo se asigna el tipo elegido a mano y se
// crea la fila (sin volver a subir el archivo).
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireStaff(supabase);
    if (!auth.ok) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const { application_id, document_type_id, storage_path, file_name, file_size, mime_type, co_applicant_id } = body;
    if (!application_id || !document_type_id || !storage_path || !file_name) {
      return Response.json(
        { error: "Faltan parámetros: application_id, document_type_id, storage_path, file_name" },
        { status: 400 }
      );
    }

    const application = await getApplicationById(application_id, true);
    if (!application) {
      return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    const docType = await getDocumentTypeById(document_type_id);
    if (!docType) {
      return Response.json({ error: "Tipo de documento no válido" }, { status: 400 });
    }
    if (docType.operation !== application.operation) {
      return Response.json(
        { error: "El tipo de documento no corresponde a esta operación (alquiler/compra)" },
        { status: 400 }
      );
    }
    if (docType.country !== application.country) {
      return Response.json(
        { error: "El tipo de documento no corresponde al país de esta solicitud" },
        { status: 400 }
      );
    }

    const document = await insertDocument(
      {
        property_application_id: application_id,
        document_type_id: docType.id,
        co_applicant_id: co_applicant_id ?? undefined,
        file_name,
        storage_path,
        file_url: storage_path,
        file_size,
        mime_type,
      },
      true
    );

    await recalculateApplicationScore(application_id);
    void analyzeApplicationDocument(document.id).catch((err) => {
      console.error("[assign-pending] Error en análisis IA:", err);
    });

    return Response.json({ ok: true, document_id: document.id });
  } catch (err) {
    console.error("[assign-pending] Error:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
