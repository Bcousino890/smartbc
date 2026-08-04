import "server-only";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { requireSession } from "@/lib/db/auth-helpers";
import {
  getDocumentTypeById,
  getApplicationById,
  insertDocument,
} from "@/lib/db/queries/property-applications";
import { analyzeApplicationDocument } from "@/lib/property-applications/ai-analysis";
import { recalculateApplicationScore } from "@/lib/property-applications/scoring-engine";

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
    const clientNote = (formData.get("client_note") as string | null)?.trim() || undefined;

    if (!file || !applicationId || !documentTypeId) {
      return Response.json(
        { error: "Faltan parámetros: file, application_id, document_type_id" },
        { status: 400 }
      );
    }

    // Verificar que el usuario puede acceder a esta solicitud. El rol
    // 'owner' es staff y faltaba en la lista; para staff se lee con el
    // cliente admin (las RLS de la sesión pueden no cubrir su rol).
    const isStaff = ["owner", "admin", "advisor", "agent_admin", "agent_senior"].includes(auth.role);
    const application = await getApplicationById(applicationId, isStaff);
    if (!application) {
      return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    const isOwner = application.client_id === auth.userId;
    const isCoApplicant = coApplicantId === auth.userId;

    if (!isStaff && !isOwner && !isCoApplicant) {
      return Response.json({ error: "Sin permiso para esta solicitud" }, { status: 403 });
    }

    // Obtener tipo de documento para validaciones. Se busca por id (no por
    // la lista del país de la solicitud) para permitir documentación de
    // otro país — p.ej. nóminas chilenas en CLP para una solicitud
    // española; la IA detecta la moneda y el scoring la convierte a EUR.
    const docType = await getDocumentTypeById(documentTypeId);
    if (!docType) {
      return Response.json({ error: "Tipo de documento no válido" }, { status: 400 });
    }
    if (docType.operation !== application.operation) {
      return Response.json(
        { error: "El tipo de documento no corresponde a esta operación (alquiler/compra)" },
        { status: 400 }
      );
    }

    // El tipo catch-all "Otro documento" no tiene forma de saber qué es sin
    // que el cliente lo describa — se exige la nota en vez de dejar un
    // documento anónimo que nadie sabrá interpretar.
    if (docType.document_key === "other_document" && !clientNote) {
      return Response.json(
        { error: "Describe brevemente qué es este documento antes de subirlo" },
        { status: 400 }
      );
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

    // El bucket es privado — no hay URL pública. La visualización siempre
    // pasa por una URL firmada generada bajo demanda (ver attachSignedUrls
    // en lib/db/queries/property-applications.ts). file_url guarda el path
    // como referencia legible, no un enlace directo.
    const document = await insertDocument({
      property_application_id: applicationId,
      document_type_id: documentTypeId,
      co_applicant_id: coApplicantId ?? undefined,
      file_name: file.name,
      storage_path: storagePath,
      file_url: storagePath,
      file_size: file.size,
      mime_type: file.type || undefined,
      client_note: clientNote,
    }, isStaff);

    // Recalculamos ya la completitud documental (rápido, sin IA) y
    // lanzamos el análisis IA en segundo plano — no bloquea la respuesta
    // de subida. El servidor es un proceso Node persistente (PM2), no
    // serverless, así que el trabajo continúa tras devolver la respuesta.
    await recalculateApplicationScore(applicationId);
    void analyzeApplicationDocument(document.id).catch((err) => {
      console.error("[upload-doc] Error en análisis IA:", err);
    });

    return Response.json({
      ok: true,
      document_id: document.id,
      analysis_status: "processing",
    });
  } catch (err) {
    console.error("[upload-doc] Error:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
