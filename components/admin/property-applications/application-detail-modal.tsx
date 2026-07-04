"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Download,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import type {
  PropertyApplicationDocumentType,
  PropertyApplicationWithDetails,
} from "@/lib/property-applications/types";
import { DocumentVerificationRow } from "./document-verification-row";
import { CandidateScoreCard } from "./candidate-score-card";

type Progress = {
  total: number;
  required: number;
  uploaded: number;
  required_uploaded: number;
  verified: number;
  pct: number;
};

type ApplicationDetail = PropertyApplicationWithDetails & {
  progress?: Progress;
  document_types?: PropertyApplicationDocumentType[];
};

type Props = {
  applicationId: string;
  onClose: () => void;
  onUpdated: () => void;
};

function MissingDocumentRow({
  docType,
  applicationId,
  onUploaded,
  disabled,
}: {
  docType: PropertyApplicationDocumentType;
  applicationId: string;
  onUploaded: () => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
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
        setError(data.error ?? "Error al subir el archivo");
        return;
      }
      onUploaded();
    } catch {
      setError("Error de conexión");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-ink/15 bg-white/40 p-4">
      <div className="flex items-center gap-3">
        <div className={`h-5 w-5 shrink-0 rounded-full border-2 ${docType.is_required ? "border-ink/30" : "border-ink/15"}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-ink/70">{docType.display_name}</p>
            {docType.is_required ? (
              <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">Requerido</span>
            ) : (
              <span className="rounded-full bg-ink/8 px-1.5 py-0.5 text-[10px] text-ink/50">Opcional</span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-ink/45">{docType.description}</p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
        {!disabled && (
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
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink/20 bg-white/80 px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-white disabled:opacity-50"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {uploading ? "Subiendo..." : "Subir"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ApplicationDetailModal({ applicationId, onClose, onUpdated }: Props) {
  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const dirtyRef = useRef(false);
  const pollCountRef = useRef(0);

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
    try {
      const res = await fetch(`/api/property-applications/${applicationId}`);
      const data = await res.json() as ApplicationDetail & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Error al cargar la solicitud");
        return;
      }
      setError(null);
      setApplication(data);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Mientras haya documentos sin análisis IA, refrescar periódicamente
  // (el análisis corre en segundo plano tras la subida)
  const hasUnanalyzed = (application?.documents ?? []).some(
    (d) => !d.ai_analysis && d.status === "pending"
  );
  useEffect(() => {
    if (!hasUnanalyzed) {
      pollCountRef.current = 0;
      return;
    }
    if (pollCountRef.current >= 15) return; // ~90s máx
    const t = setTimeout(() => {
      pollCountRef.current += 1;
      void load(true);
    }, 6000);
    return () => clearTimeout(t);
  }, [hasUnanalyzed, application, load]);

  function refresh() {
    dirtyRef.current = true;
    void load(true);
  }

  function handleClose() {
    if (dirtyRef.current) onUpdated();
    else onClose();
  }

  async function runAction(action: string, notes?: string) {
    setActionLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/property-applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Error al ejecutar la acción");
        return false;
      }
      return true;
    } catch {
      setError("Error de conexión");
      return false;
    } finally {
      setActionLoading(null);
    }
  }

  async function handleStatusAction(action: "submit" | "approve" | "complete" | "reopen") {
    if (await runAction(action)) onUpdated();
  }

  async function handleReject() {
    if (!rejectNotes.trim()) {
      setError("Debes indicar el motivo del rechazo");
      return;
    }
    if (await runAction("reject", rejectNotes)) onUpdated();
  }

  async function handleRecalculate() {
    if (await runAction("recalculate_score")) refresh();
  }

  const score = application?.score;
  const docs = application?.documents ?? [];
  const docTypes = application?.document_types ?? [];
  const progress = application?.progress;
  const verifiedCount = docs.filter((d) => d.status === "verified").length;
  const allVerified = docs.length > 0 && verifiedCount === docs.length;
  const opLabel = application?.operation === "rent" ? "Alquiler" : "Compra";
  const countryFlag = application?.country === "ES" ? "🇪🇸" : "🇨🇱";
  const status = application?.status;
  const isReadonly = status === "completed";

  const uploadedTypeIds = new Set(docs.map((d) => d.document_type_id));
  const missingTypes = docTypes.filter((t) => !uploadedTypeIds.has(t.id));
  const missingRequired = missingTypes.filter((t) => t.is_required);
  const missingOptional = missingTypes.filter((t) => !t.is_required);

  const STATUS_LABEL: Record<string, { label: string; className: string }> = {
    draft: { label: "Borrador", className: "bg-zinc-100 text-zinc-600" },
    pending_review: { label: "Pendiente de revisión", className: "bg-blue-100 text-blue-700" },
    approved: { label: "Aprobada", className: "bg-green-100 text-green-700" },
    rejected: { label: "Rechazada", className: "bg-red-100 text-red-700" },
    completed: { label: "Completada", className: "bg-emerald-100 text-emerald-700" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-lg text-ink">
                Solicitud de {opLabel} {countryFlag}
              </h2>
              {status && STATUS_LABEL[status] && (
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_LABEL[status].className}`}>
                  {STATUS_LABEL[status].label}
                </span>
              )}
            </div>
            {application && (
              <p className="mt-0.5 truncate text-sm text-ink/50">
                {application.client?.full_name ?? application.client?.email}
                {application.client?.phone && ` · ${application.client.phone}`}
                {application.property && ` · ${application.property.title}`}
                {application.property?.bc_reference && ` (${application.property.bc_reference})`}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => void load(true)}
              disabled={refreshing}
              title="Actualizar"
              className="rounded-lg p-2 text-ink/40 transition hover:bg-ink/5 hover:text-ink disabled:opacity-50"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button
              onClick={handleClose}
              className="rounded-lg p-2 text-ink/40 transition hover:bg-ink/5 hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-6">
          {loading && (
            <div className="py-16 text-center text-sm text-ink/40">Cargando...</div>
          )}

          {!loading && error && !application && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {!loading && application && (
            <div className="space-y-6">
              {/* Score */}
              {score ? (
                <div>
                  <CandidateScoreCard score={score} country={application.country} />
                  <button
                    onClick={handleRecalculate}
                    disabled={actionLoading !== null}
                    className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-ink/40 transition hover:text-ink disabled:opacity-50"
                  >
                    {actionLoading === "recalculate_score"
                      ? <Loader2 size={11} className="animate-spin" />
                      : <RefreshCw size={11} />}
                    Recalcular score
                  </button>
                </div>
              ) : docs.length > 0 ? (
                <div className="flex items-center justify-between rounded-xl border border-ink/10 bg-ink/[0.02] px-4 py-3">
                  <p className="text-sm text-ink/50">Sin score calculado todavía</p>
                  <button
                    onClick={handleRecalculate}
                    disabled={actionLoading !== null}
                    className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:text-ink disabled:opacity-50"
                  >
                    {actionLoading === "recalculate_score"
                      ? <Loader2 size={12} className="animate-spin" />
                      : <RefreshCw size={12} />}
                    Calcular score
                  </button>
                </div>
              ) : null}

              {/* Documentos subidos */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">
                    Documentos subidos ({verifiedCount}/{docs.length} verificados)
                  </h3>
                  <div className="flex items-center gap-2">
                    {hasUnanalyzed && (
                      <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-600">
                        <Loader2 size={11} className="animate-spin" />
                        Análisis IA en curso
                      </span>
                    )}
                    {allVerified && (
                      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                        <CheckCircle size={11} />
                        Todo verificado
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {docs.map((doc) => (
                    <DocumentVerificationRow
                      key={doc.id}
                      document={doc}
                      onVerified={refresh}
                      readonly={isReadonly}
                    />
                  ))}
                </div>

                {docs.length === 0 && (
                  <p className="rounded-xl border border-dashed border-ink/15 py-6 text-center text-sm text-ink/40">
                    No hay documentos subidos todavía — súbelos aquí abajo o pide al cliente que los cargue desde su portal
                  </p>
                )}
              </div>

              {/* Documentos pendientes de subir */}
              {missingTypes.length > 0 && !isReadonly && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-ink">
                    Pendientes de subir
                    {progress && (
                      <span className="ml-2 text-xs font-normal text-ink/40">
                        ({progress.required_uploaded}/{progress.required} requeridos subidos)
                      </span>
                    )}
                  </h3>
                  <div className="space-y-2">
                    {missingRequired.map((t) => (
                      <MissingDocumentRow
                        key={t.id}
                        docType={t}
                        applicationId={applicationId}
                        onUploaded={refresh}
                        disabled={status === "approved"}
                      />
                    ))}
                    {missingOptional.map((t) => (
                      <MissingDocumentRow
                        key={t.id}
                        docType={t}
                        applicationId={applicationId}
                        onUploaded={refresh}
                        disabled={status === "approved"}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Acciones principales */}
              {status !== "completed" && (
                <div className="rounded-xl border border-ink/10 bg-ink/[0.02] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink">Decisión</h3>

                  {error && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      <AlertCircle size={14} />
                      {error}
                    </div>
                  )}

                  {application.review_notes && status === "rejected" && (
                    <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                      Motivo del rechazo: {application.review_notes}
                    </p>
                  )}

                  {!showRejectForm ? (
                    <div className="flex flex-wrap gap-3">
                      {status === "draft" && (
                        <button
                          onClick={() => handleStatusAction("submit")}
                          disabled={actionLoading !== null}
                          className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Send size={15} />
                          {actionLoading === "submit" ? "..." : "Enviar a revisión"}
                        </button>
                      )}

                      {(status === "pending_review" || status === "draft") && (
                        <>
                          <button
                            onClick={() => handleStatusAction("approve")}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
                          >
                            <CheckCircle size={15} />
                            {actionLoading === "approve" ? "..." : "Aprobar solicitud"}
                          </button>
                          <button
                            onClick={() => setShowRejectForm(true)}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                          >
                            <XCircle size={15} />
                            Rechazar
                          </button>
                        </>
                      )}

                      {status === "approved" && (
                        <button
                          onClick={() => handleStatusAction("complete")}
                          disabled={actionLoading !== null}
                          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle size={15} />
                          {actionLoading === "complete" ? "..." : "Marcar como completada"}
                        </button>
                      )}

                      {(status === "rejected" || status === "approved") && (
                        <button
                          onClick={() => handleStatusAction("reopen")}
                          disabled={actionLoading !== null}
                          className="flex items-center gap-2 rounded-xl border border-ink/15 bg-white/70 px-5 py-2.5 text-sm font-medium text-ink/70 transition hover:text-ink disabled:opacity-50"
                        >
                          <RotateCcw size={15} />
                          {actionLoading === "reopen" ? "..." : "Reabrir revisión"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        value={rejectNotes}
                        onChange={(e) => setRejectNotes(e.target.value)}
                        placeholder="Indica el motivo del rechazo (será visible para el cliente)..."
                        rows={3}
                        className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3 text-sm text-ink placeholder:text-ink/30 focus:outline-none focus:ring-1 focus:ring-red-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleReject}
                          disabled={actionLoading !== null}
                          className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                        >
                          <XCircle size={15} />
                          {actionLoading === "reject" ? "..." : "Confirmar rechazo"}
                        </button>
                        <button
                          onClick={() => { setShowRejectForm(false); setRejectNotes(""); setError(null); }}
                          className="rounded-xl border border-ink/15 px-4 py-2.5 text-sm text-ink/60 transition hover:text-ink"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PDF para dueño */}
              <div className="flex items-center justify-between rounded-xl border border-ink/10 bg-ink/[0.02] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">Enviar resumen al dueño</p>
                  <p className="text-xs text-ink/50">
                    Informe con análisis explicado, sin documentos crudos
                  </p>
                </div>
                <a
                  href={`/api/property-applications/${applicationId}/export-summary`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:text-ink"
                >
                  <Download size={12} />
                  Ver informe
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
