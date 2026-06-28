"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Info,
  Upload,
  XCircle,
} from "lucide-react";
import type {
  ApplicationOperation,
  ApplicationStatus,
  DocumentStatus,
  PropertyApplicationDocumentType,
  PropertyApplicationDocumentWithType,
} from "@/lib/property-applications/types";

type Progress = {
  total: number;
  required: number;
  uploaded: number;
  required_uploaded: number;
  verified: number;
  pct: number;
};

type Props = {
  applicationId: string;
  operation: ApplicationOperation;
  country: "ES" | "CL";
  status: ApplicationStatus;
  documents: PropertyApplicationDocumentWithType[];
  docTypes: PropertyApplicationDocumentType[];
  progress: Progress;
};

const DOC_STATUS_CONFIG: Record<DocumentStatus, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; className: string }> = {
  pending: { label: "Pendiente de revisión", icon: Clock, className: "text-blue-600" },
  verified: { label: "Verificado", icon: CheckCircle, className: "text-green-600" },
  rejected: { label: "Rechazado", icon: XCircle, className: "text-red-600" },
  needs_correction: { label: "Necesita corrección", icon: AlertCircle, className: "text-amber-600" },
};

function bytesToMB(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(0);
}

function DocumentRow({
  docType,
  document,
  applicationId,
  disabled,
  onUploaded,
}: {
  docType: PropertyApplicationDocumentType;
  document: PropertyApplicationDocumentWithType | null;
  applicationId: string;
  disabled: boolean;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const statusCfg = document ? DOC_STATUS_CONFIG[document.status] : null;
  const StatusIcon = statusCfg?.icon;
  const annotations = document?.annotations ?? [];
  const pendingAnnotations = annotations.filter((a) => !a.resolved_at);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);

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
        setUploadError(data.error ?? "Error al subir el archivo");
        return;
      }
      onUploaded();
    } catch {
      setUploadError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const isVerified = document?.status === "verified";
  const hasIssue = document?.status === "rejected" || document?.status === "needs_correction";

  return (
    <div className={`rounded-xl border transition ${
      isVerified
        ? "border-green-200 bg-green-50/50"
        : hasIssue
        ? "border-amber-200 bg-amber-50/50"
        : document
        ? "border-blue-200 bg-blue-50/30"
        : "border-cream-50/60 bg-cream-50/40"
    }`}>
      <div className="flex items-start gap-4 p-4">
        {/* Estado icono */}
        <div className="mt-0.5 shrink-0">
          {isVerified ? (
            <CheckCircle size={20} className="text-green-600" />
          ) : hasIssue ? (
            <AlertCircle size={20} className="text-amber-600" />
          ) : document ? (
            <Clock size={20} className="text-blue-500" />
          ) : (
            <div className={`h-5 w-5 rounded-full border-2 ${docType.is_required ? "border-ink/30" : "border-ink/15"}`} />
          )}
        </div>

        {/* Info principal */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">{docType.display_name}</span>
            {!docType.is_required && (
              <span className="rounded-full bg-ink/8 px-2 py-0.5 text-[10px] text-ink/50">Opcional</span>
            )}
            {statusCfg && StatusIcon && (
              <span className={`flex items-center gap-1 text-[11px] font-medium ${statusCfg.className}`}>
                <StatusIcon size={11} />
                {statusCfg.label}
              </span>
            )}
          </div>

          {document ? (
            <div className="mt-1 flex items-center gap-2 text-xs text-ink/50">
              <FileText size={11} />
              <span className="truncate">{document.file_name}</span>
            </div>
          ) : (
            <p className="mt-0.5 text-xs text-ink/50">{docType.description}</p>
          )}

          {/* Anotaciones del admin */}
          {pendingAnnotations.length > 0 && (
            <div className="mt-2 space-y-1">
              {pendingAnnotations.map((ann) => (
                <div key={ann.id} className="flex items-start gap-1.5 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>{ann.annotation_text}</span>
                </div>
              ))}
            </div>
          )}

          {uploadError && (
            <p className="mt-1.5 text-xs text-red-600">{uploadError}</p>
          )}
        </div>

        {/* Acciones */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Botón ayuda */}
          {docType.help_text && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded-lg p-1.5 text-ink/30 transition hover:bg-ink/5 hover:text-ink/60"
              title="Ver ayuda"
            >
              {expanded ? <ChevronUp size={14} /> : <Info size={14} />}
            </button>
          )}

          {/* Botón subir (deshabilitado si aprobada la solicitud) */}
          {!disabled && !isVerified && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={(docType.accepted_formats as string[]).map((f) => `.${f}`).join(",")}
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading}
              />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 rounded-lg border border-ink/20 bg-white/80 px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-white disabled:opacity-50"
              >
                <Upload size={12} strokeWidth={1.75} />
                {uploading ? "Subiendo..." : document ? "Cambiar" : "Subir"}
              </button>
            </>
          )}

          {/* Link ver documento */}
          {document?.file_url && (
            <a
              href={document.file_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-ink/15 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:text-ink"
            >
              Ver
            </a>
          )}
        </div>
      </div>

      {/* Panel de ayuda expandible */}
      {expanded && docType.help_text && (
        <div className="border-t border-current/10 px-4 py-3">
          <p className="text-xs leading-relaxed text-ink/60">{docType.help_text}</p>
          <p className="mt-1.5 text-[11px] text-ink/40">
            Formatos: {(docType.accepted_formats as string[]).join(", ").toUpperCase()} · Máx {bytesToMB(docType.max_file_size_bytes)}MB
          </p>
        </div>
      )}
    </div>
  );
}

export function PropertyApplicationChecklist({
  applicationId,
  status,
  documents,
  docTypes,
  progress,
}: Props) {
  const isReadonly = status === "approved" || status === "completed";

  function reload() {
    window.location.reload();
  }

  const requiredTypes = docTypes.filter((t) => t.is_required);
  const optionalTypes = docTypes.filter((t) => !t.is_required);

  function getDocumentForType(typeId: string) {
    return documents.find((d) => d.document_type_id === typeId) ?? null;
  }

  return (
    <div className="rounded-2xl border border-gold/25 bg-cream-50/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
      {/* Cabecera con progreso */}
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-serif text-base text-ink">Documentos requeridos</h2>
        <div className="text-right">
          <p className="text-xs text-ink/50">
            {progress.verified} verificados · {progress.uploaded} subidos
          </p>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-gold transition-all"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-ink/60">{progress.pct}%</span>
          </div>
        </div>
      </div>

      {/* Documentos requeridos */}
      <div className="space-y-3">
        {requiredTypes.map((docType) => (
          <DocumentRow
            key={docType.id}
            docType={docType}
            document={getDocumentForType(docType.id)}
            applicationId={applicationId}
            disabled={isReadonly}
            onUploaded={reload}
          />
        ))}
      </div>

      {/* Documentos opcionales */}
      {optionalTypes.length > 0 && (
        <div className="mt-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink/40">
            Documentos opcionales (recomendados)
          </p>
          <div className="space-y-3">
            {optionalTypes.map((docType) => (
              <DocumentRow
                key={docType.id}
                docType={docType}
                document={getDocumentForType(docType.id)}
                applicationId={applicationId}
                disabled={isReadonly}
                onUploaded={reload}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
