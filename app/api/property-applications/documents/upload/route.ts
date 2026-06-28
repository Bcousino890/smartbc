import "server-only";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { requireSession } from "@/lib/db/auth-helpers";
import {
  getDocumentTypes,
  getApplicationById,
  insertDocument,
} from "@/lib/db/queries/property-applications";

const BUCKET = "property-application-documents";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireSession(supabase);
    if (!auth.ok) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const applicationId = formData.get("application_id") as string | null;
    const documentTypeId = formData.get("document_type_id") as string | null;
    const coApplicantId = formData.get("co_applicant_id") as string | null;

    if (!file || !applicationId || !documentTypeId) {
      return Response.json(
        { error: "Faltan parámetros: file, application_id, document_type_id" },
        { status: 400 }
      );
    }

    // Verificar que el usuario puede acceder a esta solicitud
    const application = await getApplicationById(applicationId);
    if (!application) {
      return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    const isStaff = ["admin", "advisor", "agent_admin", "agent_senior"].includes(auth.role);
    const isOwner = application.client_id === auth.userId;
    const isCoApplicant = coApplicantId === auth.userId;

    if (!isStaff && !isOwner && !isCoApplicant) {
      return Response.json({ error: "Sin permiso para esta solicitud" }, { status: 403 });
    }

    // Obtener tipo de documento para validaciones
    const docTypes = await getDocumentTypes(application.country, application.operation);
    const docType = docTypes.find((t) => t.id === documentTypeId);
    if (!docType) {
      return Response.json({ error: "Tipo de documento no válido" }, { status: 400 });
    }

    // Validar tamaño
    if (file.size > docType.max_file_size_bytes) {
      const maxMB = Math.round(docType.max_file_size_bytes / 1024 / 1024);
      return Response.json(
        { error: `Archivo demasiado grande (máx ${maxMB}MB)` },
        { status: 400 }
      );
    }

    // Validar formato
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const acceptedFormats = docType.accepted_formats as string[];
    if (!acceptedFormats.includes(ext)) {
      return Response.json(
        { error: `Formato no permitido. Acepta: ${acceptedFormats.join(", ")}` },
        { status: 400 }
      );
    }

    // Construir path en storage
    const timestamp = Date.now();
    const safeName = sanitizeFileName(file.name);
    const storagePath = `${application.country}/${applicationId}/${docType.document_key}/${timestamp}-${safeName}`;

    // Upload al bucket
    const adminSupabase = await createAdminClient();
    const { error: uploadError } = await adminSupabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { upsert: false });

    if (uploadError) {
      console.error("[upload-doc] Storage error:", uploadError);
      return Response.json(
        { error: "Error al subir el archivo. Inténtalo de nuevo." },
        { status: 500 }
      );
    }

    const { data: { publicUrl } } = adminSupabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    // Insertar en BD
    const document = await insertDocument({
      property_application_id: applicationId,
      document_type_id: documentTypeId,
      co_applicant_id: coApplicantId ?? undefined,
      file_name: file.name,
      storage_path: storagePath,
      file_url: publicUrl,
      file_size_bytes: file.size,
      mime_type: file.type || undefined,
    });

    return Response.json({
      ok: true,
      document_id: document.id,
      file_url: publicUrl,
      analysis_status: "pending",
    });
  } catch (err) {
    console.error("[upload-doc] Error:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
