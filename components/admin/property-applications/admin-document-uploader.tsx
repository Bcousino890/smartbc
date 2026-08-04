"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Loader2, RefreshCw, Upload } from "lucide-react";
import type {
  ApplicationCountry,
  ApplicationOperation,
  PropertyApplicationDocumentType,
} from "@/lib/property-applications/types";

type Props = {
  applicationId: string;
  country: ApplicationCountry;
  operation: ApplicationOperation;
  existingDocumentTypeIds: string[];
  onUploaded: () => void;
};

const COUNTRY_LABEL: Record<ApplicationCountry, string> = {
  ES: "🇪🇸 España",
  CL: "🇨🇱 Chile",
};

// Permite al equipo subir documentos en nombre del cliente directamente
// desde el panel de admin. La sección se muestra SIEMPRE (antes desaparecía
// cuando todos los tipos ya tenían un documento, dando la impresión de que
// no existía forma de añadir archivos): los tipos que faltan aparecen como
// botones destacados y los ya subidos permiten añadir una nueva versión.
//
// Los paneles /es/admin y /cl/admin son independientes: los tipos de
// documento son siempre los del país de la propia solicitud, nunca del
// otro. El candidato sí puede ser de cualquier nacionalidad y aportar
// documentos en cualquier moneda — eso lo detecta la IA por documento
// (ver ai-analysis.ts) y el scoring lo convierte a EUR, sin que haga
// falta elegir un país de documentación aparte.
export function AdminDocumentUploader({
  applicationId,
  country,
  operation,
  existingDocumentTypeIds,
  onUploaded,
}: Props) {
  const [docTypes, setDocTypes] = useState<PropertyApplicationDocumentType[] | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    setDocTypes(null);
    fetch(`/api/property-application-document-types?country=${country}&operation=${operation}`)
      .then((r) => r.json())
      .then((data: { types?: PropertyApplicationDocumentType[] }) => {
        if (!cancelled) setDocTypes(data.types ?? []);
      })
      .catch(() => {
        if (!cancelled) setDocTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [country, operation]);

  const existingIds = new Set(existingDocumentTypeIds);
  const missingTypes = (docTypes ?? []).filter((t) => !existingIds.has(t.id));
  const uploadedTypes = (docTypes ?? []).filter((t) => existingIds.has(t.id));

  async function handleUpload(docType: PropertyApplicationDocumentType, file: File) {
    setError(null);
    setUploadingId(docType.id);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("application_id", applicationId);
      formData.append("document_type_id", docType.id);

      const res = await fetch("/api/property-applications/documents/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Error al subir el archivo");
        return;
      }
      onUploaded();
    } catch {
      setError("Error de conexión");
    } finally {
      setUploadingId(null);
      const input = inputRefs.current[docType.id];
      if (input) input.value = "";
    }
  }

  function renderUploadButton(docType: PropertyApplicationDocumentType, alreadyUploaded: boolean) {
    return (
      <div key={docType.id}>
        <input
          ref={(el) => { inputRefs.current[docType.id] = el; }}
          type="file"
          accept={(docType.accepted_formats as string[]).map((f) => `.${f}`).join(",")}
          className="hidden"
          disabled={uploadingId !== null}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(docType, file);
          }}
        />
        <button
          onClick={() => inputRefs.current[docType.id]?.click()}
          disabled={uploadingId !== null}
          className={
            alreadyUploaded
              ? "flex items-center gap-1.5 rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-1.5 text-xs text-ink/50 transition hover:border-ink/20 hover:text-ink disabled:opacity-50"
              : "flex items-center gap-1.5 rounded-lg border border-gold/40 bg-white/90 px-3 py-1.5 text-xs font-medium text-ink/80 shadow-sm transition hover:border-gold hover:text-ink disabled:opacity-50"
          }
        >
          {uploadingId === docType.id ? (
            <Loader2 size={12} className="animate-spin" />
          ) : alreadyUploaded ? (
            <RefreshCw size={11} />
          ) : (
            <Upload size={12} />
          )}
          {docType.display_name}
          {!alreadyUploaded && !docType.is_required && <span className="text-ink/30">(opcional)</span>}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-ink/15 bg-white/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Upload size={13} className="text-ink/40" />
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
          Añadir documentos (en nombre del cliente) — {COUNTRY_LABEL[country]}
        </p>
      </div>

      {docTypes === null && (
        <p className="flex items-center gap-1.5 text-xs text-ink/40">
          <Loader2 size={12} className="animate-spin" />
          Cargando tipos de documento...
        </p>
      )}

      {docTypes !== null && docTypes.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700">
          <AlertCircle size={12} />
          No hay tipos de documento configurados para {COUNTRY_LABEL[country]} /{" "}
          {operation === "rent" ? "alquiler" : "compra"}.
        </p>
      )}

      {error && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle size={12} />
          {error}
        </p>
      )}

      {missingTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {missingTypes.map((t) => renderUploadButton(t, false))}
        </div>
      )}

      {docTypes !== null && docTypes.length > 0 && missingTypes.length === 0 && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-green-700">
          <CheckCircle size={12} />
          Todos los tipos de documento ya tienen un archivo subido.
        </p>
      )}

      {uploadedTypes.length > 0 && (
        <div className="mt-3 border-t border-ink/5 pt-3">
          <p className="mb-2 text-[11px] text-ink/40">Subir nueva versión de un documento existente:</p>
          <div className="flex flex-wrap gap-2">
            {uploadedTypes.map((t) => renderUploadButton(t, true))}
          </div>
        </div>
      )}
    </div>
  );
}
