"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Mail,
  RotateCcw,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import type { PropertyApplicationWithDetails } from "@/lib/property-applications/types";
import { DocumentVerificationRow } from "./document-verification-row";
import { CandidateScoreCard } from "./candidate-score-card";
import { AdminDocumentUploader } from "./admin-document-uploader";
import { AutoDocumentUploader } from "./auto-document-uploader";

type Props = {
  applicationId: string;
  onClose: () => void;
  onUpdated: () => void;
  // Navegación entre solicitudes sin cerrar el modal (cola de revisión)
  onNavigate?: (direction: -1 | 1) => void;
  navPosition?: { index: number; total: number };
};

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-40 rounded-xl bg-ink/5" />
      <div className="space-y-3">
        <div className="h-4 w-48 rounded bg-ink/5" />
        <div className="h-20 rounded-xl bg-ink/5" />
        <div className="h-20 rounded-xl bg-ink/5" />
      </div>
      <div className="h-16 rounded-xl bg-ink/5" />
    </div>
  );
}

export function ApplicationDetailModal({ applicationId, onClose, onUpdated, onNavigate, navPosition }: Props) {
  const [application, setApplication] = useState<PropertyApplicationWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [sendingToOwner, setSendingToOwner] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadApplication = useCallback(async (withSpinner: boolean) => {
    if (withSpinner) setLoading(true);
    try {
      const res = await fetch(`/api/property-applications/${applicationId}`);
      const data = await res.json() as PropertyApplicationWithDetails & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Error al cargar la solicitud");
        return;
      }
      setApplication(data);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    // Al cambiar de solicitud (navegación ← →) se resetea todo el estado local
    setApplication(null);
    setError(null);
    setRejectNotes("");
    setShowRejectForm(false);
    setShowApproveConfirm(false);
    setSendResult(null);
    void loadApplication(true);
  }, [loadApplication]);

  // Cerrar con Escape / navegar con flechas
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      // No robar las flechas si el foco está en un campo de texto
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft" && onNavigate) onNavigate(-1);
      if (e.key === "ArrowRight" && onNavigate) onNavigate(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onNavigate]);

  async function handleSendToOwner() {
    setSendingToOwner(true);
    setSendResult(null);
    try {
      const res = await fetch(`/api/property-applications/${applicationId}/export-summary/send`, {
        method: "POST",
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSendResult({ ok: false, message: data.error ?? "No se pudo enviar" });
        return;
      }
      setSendResult({ ok: true, message: "Resumen enviado al propietario" });
    } catch {
      setSendResult({ ok: false, message: "Error de conexión" });
    } finally {
      setSendingToOwner(false);
    }
  }

  async function patchAction(body: Record<string, unknown>, fallbackError: string): Promise<boolean> {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/property-applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? fallbackError);
        return false;
      }
      return true;
    } catch {
      setError("Error de conexión");
      return false;
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApprove() {
    const ok = await patchAction({ action: "approve" }, "Error al aprobar");
    if (ok) {
      setShowApproveConfirm(false);
      await loadApplication(false);
      onUpdated();
    }
  }

  async function handleReject() {
    if (!rejectNotes.trim()) {
      setError("Debes indicar el motivo del rechazo");
      return;
    }
    const ok = await patchAction({ action: "reject", notes: rejectNotes }, "Error al rechazar");
    if (ok) {
      setShowRejectForm(false);
      setRejectNotes("");
      await loadApplication(false);
      onUpdated();
    }
  }

  async function handleReopen() {
    const ok = await patchAction({ action: "reopen" }, "Error al reabrir");
    if (ok) {
      await loadApplication(false);
      onUpdated();
    }
  }

  async function handleRecalculate() {
    const ok = await patchAction({ action: "recalculate" }, "Error al recalcular");
    if (ok) {
      await loadApplication(false);
      onUpdated();
    }
  }

  function handleDocUpdated() {
    void loadApplication(false);
    onUpdated();
  }

  const score = application?.score;
  const docs = application?.documents ?? [];
  const verifiedCount = docs.filter((d) => d.status === "verified").length;
  const unverifiedCount = docs.length - verifiedCount;
  const allVerified = docs.length > 0 && verifiedCount === docs.length;
  const opLabel = application?.operation === "rent" ? "Alquiler" : "Compra";
  const countryFlag = application?.country === "ES" ? "🇪🇸" : "🇨🇱";
  const decided = application?.status === "approved" || application?.status === "rejected" || application?.status === "completed";

  const reviewedAtLabel = application?.reviewed_at
    ? new Date(application.reviewed_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-serif text-lg text-ink">
              Solicitud de {opLabel} {countryFlag}
            </h2>
            {application && (
              <p className="mt-0.5 truncate text-sm text-ink/50">
                {application.client?.full_name ?? application.client?.email}
                {application.property && ` · ${application.property.title}`}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onNavigate && navPosition && navPosition.total > 1 && (
              <div className="mr-2 flex items-center gap-1">
                <button
                  onClick={() => onNavigate(-1)}
                  disabled={navPosition.index <= 0}
                  title="Solicitud anterior (←)"
                  className="rounded-lg p-2 text-ink/40 transition hover:bg-ink/5 hover:text-ink disabled:opacity-25"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[11px] tabular-nums text-ink/40">
                  {navPosition.index + 1}/{navPosition.total}
                </span>
                <button
                  onClick={() => onNavigate(1)}
                  disabled={navPosition.index >= navPosition.total - 1}
                  title="Solicitud siguiente (→)"
                  className="rounded-lg p-2 text-ink/40 transition hover:bg-ink/5 hover:text-ink disabled:opacity-25"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              title="Cerrar (Esc)"
              className="rounded-lg p-2 text-ink/40 transition hover:bg-ink/5 hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-6">
          {loading && <DetailSkeleton />}

          {!loading && error && !application && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {!loading && application && (
            <div className="space-y-6">
              {/* Banner de decisión ya tomada */}
              {decided && (
                <div className={`rounded-xl border p-4 ${
                  application.status === "rejected"
                    ? "border-red-200 bg-red-50"
                    : "border-green-200 bg-green-50"
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      {application.status === "rejected" ? (
                        <XCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
                      ) : (
                        <CheckCircle size={18} className="mt-0.5 shrink-0 text-green-600" />
                      )}
                      <div>
                        <p className={`text-sm font-semibold ${application.status === "rejected" ? "text-red-700" : "text-green-700"}`}>
                          {application.status === "rejected"
                            ? "Solicitud rechazada"
                            : application.status === "completed"
                            ? "Solicitud completada"
                            : "Solicitud aprobada"}
                          {reviewedAtLabel && (
                            <span className="ml-1 font-normal opacity-70">· {reviewedAtLabel}</span>
                          )}
                        </p>
                        {application.review_notes && (
                          <p className="mt-1 text-xs text-ink/60">
                            <span className="font-medium">Motivo:</span> {application.review_notes}
                          </p>
                        )}
                      </div>
                    </div>
                    {application.status !== "completed" && (
                      <button
                        onClick={handleReopen}
                        disabled={actionLoading}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink/15 bg-white/80 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:text-ink disabled:opacity-50"
                      >
                        {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                        Reabrir revisión
                      </button>
                    )}
                  </div>
                  {error && (
                    <p className="mt-2 text-xs text-red-600">{error}</p>
                  )}
                </div>
              )}

              {/* Score */}
              {score ? (
                <div>
                  <CandidateScoreCard score={score} country={application.country} />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={handleRecalculate}
                      disabled={actionLoading}
                      className="flex items-center gap-1 text-[11px] font-medium text-ink/40 transition hover:text-ink disabled:opacity-50"
                    >
                      <Sparkles size={11} />
                      {actionLoading ? "Recalculando..." : "Recalcular score y conversiones"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-ink/15 bg-ink/[0.02] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Sparkles size={16} className="mt-0.5 shrink-0 text-gold" />
                      <div>
                        <p className="text-sm font-medium text-ink">Análisis IA del candidato</p>
                        <p className="mt-0.5 text-xs text-ink/55">
                          En cuanto haya documentos subidos, la IA generará el score (0-100), el resumen
                          explicado, los ingresos detectados y las conversiones de moneda (CLP ↔ EUR)
                          para calcular el ratio frente a la renta.
                        </p>
                      </div>
                    </div>
                    {docs.length > 0 && (
                      <button
                        onClick={handleRecalculate}
                        disabled={actionLoading}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink/15 bg-white/80 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:text-ink disabled:opacity-50"
                      >
                        {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        Calcular ahora
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Documentos */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">
                    Documentos ({verifiedCount}/{docs.length} verificados)
                  </h3>
                  {allVerified && (
                    <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                      <CheckCircle size={11} />
                      Todo verificado
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {docs.map((doc) => (
                    <DocumentVerificationRow
                      key={doc.id}
                      document={doc}
                      onVerified={handleDocUpdated}
                      applicationCountry={application.country}
                    />
                  ))}
                </div>

                {docs.length === 0 && (
                  <p className="py-6 text-center text-sm text-ink/40">
                    No hay documentos subidos todavía
                  </p>
                )}

                <div className="mt-3 space-y-3">
                  <AutoDocumentUploader
                    applicationId={application.id}
                    country={application.country}
                    operation={application.operation}
                    onUploaded={handleDocUpdated}
                  />
                  <details className="group">
                    <summary className="cursor-pointer select-none text-xs font-medium text-ink/40 transition hover:text-ink">
                      O elige el tipo de documento manualmente
                    </summary>
                    <div className="mt-2">
                      <AdminDocumentUploader
                        applicationId={application.id}
                        country={application.country}
                        operation={application.operation}
                        existingDocumentTypeIds={docs.map((d) => d.document_type_id)}
                        onUploaded={handleDocUpdated}
                      />
                    </div>
                  </details>
                </div>
              </div>

              {/* Acciones principales */}
              {(application.status === "pending_review" || application.status === "draft") && (
                <div className="rounded-xl border border-ink/10 bg-ink/[0.02] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink">Decisión</h3>

                  {error && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      <AlertCircle size={14} />
                      {error}
                    </div>
                  )}

                  {showApproveConfirm ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-ink/80">
                        <p className="font-medium text-green-800">
                          ¿Aprobar la solicitud de {application.client?.full_name ?? application.client?.email}?
                        </p>
                        <p className="mt-1 text-xs text-ink/60">
                          Se notificará al cliente por email.
                        </p>
                        {unverifiedCount > 0 && (
                          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                            <AlertCircle size={12} />
                            Atención: hay {unverifiedCount} documento{unverifiedCount === 1 ? "" : "s"} sin verificar.
                          </p>
                        )}
                        {docs.length === 0 && (
                          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                            <AlertCircle size={12} />
                            Atención: la solicitud no tiene ningún documento subido.
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleApprove}
                          disabled={actionLoading}
                          className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                          Confirmar aprobación
                        </button>
                        <button
                          onClick={() => { setShowApproveConfirm(false); setError(null); }}
                          className="rounded-xl border border-ink/15 px-4 py-2.5 text-sm text-ink/60 transition hover:text-ink"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : !showRejectForm ? (
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setShowApproveConfirm(true); setError(null); }}
                        disabled={actionLoading}
                        className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle size={15} />
                        Aprobar solicitud
                      </button>
                      <button
                        onClick={() => { setShowRejectForm(true); setError(null); }}
                        disabled={actionLoading}
                        className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                      >
                        <XCircle size={15} />
                        Rechazar
                      </button>
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
                      <p className="text-xs text-ink/50">Se notificará al cliente por email con este motivo.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleReject}
                          disabled={actionLoading}
                          className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                        >
                          {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                          Confirmar rechazo
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
              <div className="rounded-xl border border-ink/10 bg-ink/[0.02] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">Resumen para el propietario</p>
                    <p className="text-xs text-ink/50">
                      PDF con análisis explicado, sin documentos crudos
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <a
                      href={`/api/property-applications/${applicationId}/export-summary`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:text-ink"
                    >
                      <Download size={12} />
                      Descargar PDF
                    </a>
                    <button
                      onClick={handleSendToOwner}
                      disabled={sendingToOwner}
                      className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:text-ink disabled:opacity-50"
                    >
                      {sendingToOwner ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                      Enviar al propietario
                    </button>
                  </div>
                </div>
                {sendResult && (
                  <p className={`mt-2 text-xs ${sendResult.ok ? "text-green-600" : "text-red-600"}`}>
                    {sendResult.message}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
