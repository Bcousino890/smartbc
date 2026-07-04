"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Upload } from "lucide-react";
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

// Permite al equipo subir documentos en nombre del cliente directamente
// desde el panel de admin — hasta ahora el modal de detalle solo permitía
// ver/verificar documentos ya subidos por el propio cliente desde el
// portal, sin ninguna forma de añadir uno desde aquí.
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

  if (docTypes === null) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-ink/40">
        <Loader2 size={12} className="animate-spin" />
        Cargando tipos de documento...
      </p>
    );
  }

  if (missingTypes.length === 0) return null;

  return (
    <div className="rounded-xl border border-dashed border-ink/15 bg-white/40 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/40">
        Subir en nombre del cliente
      </p>
      {error && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle size={12} />
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {missingTypes.map((docType) => (
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
              className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white/80 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:text-ink disabled:opacity-50"
            >
              {uploadingId === docType.id ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Upload size={12} />
              )}
              {docType.display_name}
              {!docType.is_required && <span className="text-ink/30">(opcional)</span>}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
