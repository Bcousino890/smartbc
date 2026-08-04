import "server-only";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { requireStaff } from "@/lib/db/auth-helpers";
import {
  getApplicationById,
  getDocumentTypes,
  insertDocument,
} from "@/lib/db/queries/property-applications";
import { classifyApplicationDocument, analyzeApplicationDocument } from "@/lib/property-applications/ai-analysis";
import { recalculateApplicationScore } from "@/lib/property-applications/scoring-engine";
import type { ApplicationCountry } from "@/lib/property-applications/types";

const BUCKET = "property-application-documents";
// pdf + formatos de imagen habituales de cámara/escáner de móvil (incluye
// HEIC/HEIF de iPhone y WEBP). Si el proveedor de IA no logra decodificar
// alguno igualmente se sube (queda disponible para revisión manual), pero
// no se le pide a la IA que "adivine" sin haber visto el archivo (ver
// strictImages en lib/services/ai/chat.ts).
const AUTO_ACCEPTED_EXT = ["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif"];
const MAX_AUTO_SIZE_BYTES = 20 * 1024 * 1024;

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

// Sube un archivo sin que el equipo indique de antemano de qué tipo de
// documento se trata: la IA lo clasifica contra la lista de tipos DEL
// PROPIO PAÍS de la solicitud (el panel de España y el de Chile son
// independientes — /es/admin/solicitudes-documentacion nunca debe mezclar
// tipos de Chile ni viceversa) y, si acierta con confianza, crea la fila
// directamente y lanza el mismo análisis que la subida manual. El
// candidato SÍ puede ser de cualquier nacionalidad y aportar documentos en
// cualquier moneda (eso lo maneja la clasificación por categoría y la
// conversión de moneda, no el país del checklist). Si no logra
// identificarlo, el archivo queda subido igualmente y se devuelve para que
// el equipo asigne el tipo a mano (ver /documents/assign-pending), sin
// volver a subirlo.
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireStaff(supabase);
    if (!auth.ok) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const applicationId = formData.get("application_id") as string | null;
    const coApplicantId = formData.get("co_applicant_id") as string | null;

    if (!file || !applicationId) {
      return Response.json({ error: "Faltan parámetros: file, application_id" }, { status: 400 });
    }

    const application = await getApplicationById(applicationId, true);
    if (!application) {
      return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!AUTO_ACCEPTED_EXT.includes(ext)) {
      return Response.json(
        { error: `Formato no permitido para detección automática (.${ext}). Usa "elegir tipo manualmente" y sube ahí ese archivo.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_AUTO_SIZE_BYTES) {
      return Response.json({ error: "Archivo demasiado grande (máx 20MB)" }, { status: 400 });
    }

    // Candidatos: solo los tipos de documento del propio país de la
    // solicitud (paneles ES/CL independientes).
    const candidates = await getDocumentTypes(application.country, application.operation);

    const timestamp = Date.now();
    const safeName = sanitizeFileName(file.name);
    const storagePath = `${application.country}/${applicationId}/_auto/${timestamp}-${safeName}`;

    const adminSupabase = await createAdminClient();
    const { error: uploadError } = await adminSupabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { upsert: false });
    if (uploadError) {
      console.error("[auto-upload] Storage error:", uploadError);
      return Response.json({ error: "Error al subir el archivo. Inténtalo de nuevo." }, { status: 500 });
    }

    const mimeType = file.type || (ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`);
    const { data: signed } = await adminSupabase.storage.from(BUCKET).createSignedUrl(storagePath, 600);

    const classification = signed?.signedUrl
      ? await classifyApplicationDocument(
          signed.signedUrl,
          mimeType,
          candidates.map((c) => ({
            id: c.id,
            country: c.country,
            display_name: c.display_name,
            description: c.description,
          }))
        )
      : { document_type_id: null, confidence: "low" as const };

    const matchedType = classification.document_type_id
      ? candidates.find((c) => c.id === classification.document_type_id)
      : null;

    if (!matchedType || classification.confidence === "low") {
      return Response.json({
        ok: true,
        needs_manual_type: true,
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: mimeType,
        suggestion: matchedType
          ? { id: matchedType.id, display_name: matchedType.display_name, country: matchedType.country as ApplicationCountry }
          : null,
      });
    }

    const document = await insertDocument(
      {
        property_application_id: applicationId,
        document_type_id: matchedType.id,
        co_applicant_id: coApplicantId ?? undefined,
        file_name: file.name,
        storage_path: storagePath,
        file_url: storagePath,
        file_size: file.size,
        mime_type: mimeType,
      },
      true
    );

    await recalculateApplicationScore(applicationId);
    void analyzeApplicationDocument(document.id).catch((err) => {
      console.error("[auto-upload] Error en análisis IA:", err);
    });

    return Response.json({
      ok: true,
      document_id: document.id,
      detected_type: {
        id: matchedType.id,
        display_name: matchedType.display_name,
        country: matchedType.country as ApplicationCountry,
      },
      confidence: classification.confidence,
    });
  } catch (err) {
    console.error("[auto-upload] Error:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
