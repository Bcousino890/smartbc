"use client";

import { useCallback, useRef, useState } from "react";
import { AlertCircle, CheckCircle, FileText, Loader2, Sparkles, Upload } from "lucide-react";
import type { ApplicationOperation, PropertyApplicationDocumentType } from "@/lib/property-applications/types";

type Props = {
  applicationId: string;
  operation: ApplicationOperation;
  onUploaded: () => void;
};

const COUNTRY_FLAG: Record<string, string> = { ES: "🇪🇸", CL: "🇨🇱" };

type PendingFile = {
  key: string;
  fileName: string;
  status: "uploading" | "detecting" | "done" | "needs_type" | "error";
  error?: string;
  detectedLabel?: string;
  pending?: {
    storage_path: string;
    file_size: number;
    mime_type: string;
  };
  selectedTypeId?: string;
};

// Zona de subida "sin pensar": el equipo arrastra o selecciona archivos sin
// indicar de antemano de qué documento se trata, y la IA los clasifica
// contra los tipos configurados (España + Chile, ya que el candidato puede
// aportar documentación extranjera). Si no logra identificar alguno con
// confianza, se le pide al equipo que elija el tipo para ESE archivo
// concreto — el archivo ya está subido, no hace falta repetir la subida.
export function AutoDocumentUploader({ applicationId, operation, onUploaded }: Props) {
  const [items, setItems] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [allTypes, setAllTypes] = useState<PropertyApplicationDocumentType[] | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const updateItem = useCallback((key: string, patch: Partial<PendingFile>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }, []);

  async function ensureTypesLoaded() {
    if (allTypes !== null) return allTypes;
    try {
      const [es, cl] = await Promise.all([
        fetch(`/api/property-application-document-types?country=ES&operation=${operation}`).then((r) => r.json()),
        fetch(`/api/property-application-document-types?country=CL&operation=${operation}`).then((r) => r.json()),
      ]);
      const types = [...(es.types ?? []), ...(cl.types ?? [])] as PropertyApplicationDocumentType[];
      setAllTypes(types);
      return types;
    } catch {
      setAllTypes([]);
      return [];
    }
  }

  async function uploadOne(key: string, file: File) {
    updateItem(key, { status: "detecting" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("application_id", applicationId);

      const res = await fetch("/api/property-applications/documents/auto-upload", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        needs_manual_type?: boolean;
        storage_path?: string;
        file_size?: number;
        mime_type?: string;
        suggestion?: { id: string; display_name: string; country: string } | null;
        detected_type?: { id: string; display_name: string; country: string };
      };

      if (!res.ok || !data.ok) {
        updateItem(key, { status: "error", error: data.error ?? "Error al subir el archivo" });
        return;
      }

      if (data.needs_manual_type) {
        updateItem(key, {
          status: "needs_type",
          pending: {
            storage_path: data.storage_path!,
            file_size: data.file_size!,
            mime_type: data.mime_type!,
          },
          selectedTypeId: data.suggestion?.id,
        });
        return;
      }

      updateItem(key, {
        status: "done",
        detectedLabel: `${COUNTRY_FLAG[data.detected_type!.country] ?? ""} ${data.detected_type!.display_name}`,
      });
      onUploaded();
    } catch {
      updateItem(key, { status: "error", error: "Error de conexión" });
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    void ensureTypesLoaded();
    for (const file of list) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setItems((prev) => [...prev, { key, fileName: file.name, status: "uploading" }]);
      void uploadOne(key, file);
    }
  }

  async function assignManualType(key: string) {
    const item = items.find((it) => it.key === key);
    if (!item?.pending || !item.selectedTypeId) return;
    updateItem(key, { status: "detecting", error: undefined });
    try {
      const res = await fetch("/api/property-applications/documents/assign-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          document_type_id: item.selectedTypeId,
          storage_path: item.pending.storage_path,
          file_name: item.fileName,
          file_size: item.pending.file_size,
          mime_type: item.pending.mime_type,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        updateItem(key, { status: "needs_type", error: data.error ?? "Error al asignar el tipo" });
        return;
      }
      const t = allTypes?.find((x) => x.id === item.selectedTypeId);
      updateItem(key, {
        status: "done",
        detectedLabel: t ? `${COUNTRY_FLAG[t.country] ?? ""} ${t.display_name}` : "Asignado",
      });
      onUploaded();
    } catch {
      updateItem(key, { status: "needs_type", error: "Error de conexión" });
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
      }}
      className={`rounded-xl border-2 border-dashed p-4 transition ${
        dragOver ? "border-gold bg-gold/5" : "border-ink/15 bg-white/40"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-gold" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              Subir y detectar automáticamente
            </p>
            <p className="text-[11px] text-ink/40">
              Arrastra los archivos aquí o selecciónalos — la IA identifica de qué documento se trata (y de qué país)
            </p>
          </div>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gold/40 bg-white/90 px-3 py-1.5 text-xs font-medium text-ink/80 shadow-sm transition hover:border-gold hover:text-ink"
        >
          <Upload size={12} />
          Elegir archivos
        </button>
      </div>

      {items.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-ink/5 pt-3">
          {items.map((it) => (
            <div key={it.key} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-xs">
              <FileText size={13} className="shrink-0 text-ink/30" />
              <span className="min-w-0 flex-1 truncate text-ink/70">{it.fileName}</span>

              {(it.status === "uploading" || it.status === "detecting") && (
                <span className="flex shrink-0 items-center gap-1 text-ink/40">
                  <Loader2 size={12} className="animate-spin" />
                  {it.status === "uploading" ? "Subiendo..." : "Detectando tipo..."}
                </span>
              )}

              {it.status === "done" && (
                <span className="flex shrink-0 items-center gap-1 font-medium text-green-700">
                  <CheckCircle size={12} />
                  {it.detectedLabel}
                </span>
              )}

              {it.status === "error" && (
                <span className="flex shrink-0 items-center gap-1 text-red-600">
                  <AlertCircle size={12} />
                  {it.error}
                </span>
              )}

              {it.status === "needs_type" && (
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-1 text-amber-700">
                    <AlertCircle size={12} />
                    No se pudo identificar{it.error ? ` — ${it.error}` : ""}
                  </span>
                  <select
                    value={it.selectedTypeId ?? ""}
                    onChange={(e) => updateItem(it.key, { selectedTypeId: e.target.value })}
                    className="rounded-md border border-ink/15 bg-white px-2 py-1 text-[11px] text-ink"
                  >
                    <option value="">Elige el tipo...</option>
                    {(allTypes ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {COUNTRY_FLAG[t.country] ?? ""} {t.display_name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void assignManualType(it.key)}
                    disabled={!it.selectedTypeId}
                    className="rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-cream-50 transition disabled:opacity-40"
                  >
                    Asignar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
