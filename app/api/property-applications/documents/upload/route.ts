import "server-only";
import { after } from "next/server";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { requireSession } from "@/lib/db/auth-helpers";
import {
  getDocumentTypes,
  getApplicationByIdAdmin,
  insertDocument,
} from "@/lib/db/queries/property-applications";
import { analyzeDocument, APPLICATION_DOCS_BUCKET } from "@/lib/property-applications/analyze";

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
    const application = await getApplicationByIdAdmin(applicationId);
    if (!application) {
      return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    if (application.status === "approved" || application.status === "completed") {
      return Response.json(
        { error: "La solicitud ya está aprobada; no se pueden modificar los documentos" },
        { status: 400 }
      );
    }

    const isStaff = ["admin", "owner", "advisor", "agent_admin", "agent_senior"].includes(auth.role);
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

    const adminSupabase = createAdminClient();

    // Construir path en storage
    const timestamp = Date.now();
    const safeName = sanitizeFileName(file.name);
    const storagePath = `${application.country}/${applicationId}/${docType.document_key}/${timestamp}-${safeName}`;

    // Upload al bucket (auto-creándolo si aún no existe en el VPS)
    let { error: uploadError } = await adminSupabase.storage
      .from(APPLICATION_DOCS_BUCKET)
      .upload(storagePath, file, { upsert: false });

    if (uploadError && /bucket.*not.*found/i.test(uploadError.message ?? "")) {
      await adminSupabase.storage.createBucket(APPLICATION_DOCS_BUCKET, { public: true });
      ({ error: uploadError } = await adminSupabase.storage
        .from(APPLICATION_DOCS_BUCKET)
        .upload(storagePath, file, { upsert: false }));
    }

    if (uploadError) {
      console.error("[upload-doc] Storage error:", uploadError);
      return Response.json(
        { error: "Error al subir el archivo. Inténtalo de nuevo." },
        { status: 500 }
      );
    }

    const { data: { publicUrl } } = adminSupabase.storage
      .from(APPLICATION_DOCS_BUCKET)
      .getPublicUrl(storagePath);

    // Reemplazo: eliminar documentos anteriores del mismo tipo (mismo ámbito
    // titular/co-solicitante) para no acumular duplicados al "Cambiar"
    const { data: previousDocs } = await adminSupabase
      .from("property_application_documents")
      .select("id, storage_path, co_applicant_id")
      .eq("property_application_id", applicationId)
      .eq("document_type_id", documentTypeId);

    const previousToDelete = ((previousDocs ?? []) as { id: string; storage_path: string; co_applicant_id: string | null }[])
      .filter((d) => (d.co_applicant_id ?? null) === (coApplicantId ?? null));

    if (previousToDelete.length > 0) {
      await adminSupabase
        .from("property_application_documents")
        .delete()
        .in("id", previousToDelete.map((d) => d.id));
      await adminSupabase.storage
        .from(APPLICATION_DOCS_BUCKET)
        .remove(previousToDelete.map((d) => d.storage_path));
    }

    // Insertar en BD
    const document = await insertDocument({
      property_application_id: applicationId,
      document_type_id: documentTypeId,
      co_applicant_id: coApplicantId ?? undefined,
      file_name: file.name,
      storage_path: storagePath,
      file_url: publicUrl,
      file_size: file.size,
      mime_type: file.type || undefined,
    });

    // Análisis IA en segundo plano (no bloquea la respuesta al cliente)
    after(async () => {
      await analyzeDocument(document.id);
    });

    return Response.json({
      ok: true,
      document_id: document.id,
      file_url: publicUrl,
      analysis_status: "processing",
    });
  } catch (err) {
    console.error("[upload-doc] Error:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
