"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Wrench } from "lucide-react";

type Result = {
  propertiesScanned: number;
  ownerUpdated: number;
  photosRehosted: number;
};

export function RepairConversionsManager() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setLoading(true);
    setStatus("idle");
    setMessage("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/cl/captaciones/backfill-conversions", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Error al reparar las conversiones");
        return;
      }
      setStatus("success");
      setResult({
        propertiesScanned: data.propertiesScanned ?? 0,
        ownerUpdated: data.ownerUpdated ?? 0,
        photosRehosted: data.photosRehosted ?? 0,
      });
      setMessage("Reparación completada.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gold/15 bg-cream-50/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)]">
      <div className="flex items-center gap-2 mb-4">
        <Wrench size={20} className="text-gold" />
        <h2 className="text-lg font-semibold text-ink">
          Reparar propiedades ya convertidas
        </h2>
      </div>

      <p className="text-sm text-ink/60 mb-4">
        Recorre las propiedades creadas al convertir captaciones y arregla las que
        se convirtieron antes de las últimas mejoras: rellena los datos del dueño,
        notas, subzona y tipo que faltaban, y descarga al almacenamiento las fotos
        que quedaron como enlaces externos del portal (que se rompen). Es seguro
        ejecutarlo varias veces: no pisa datos editados a mano ni re-sube fotos ya
        guardadas.
      </p>

      {status === "success" && result && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-800">
            <p className="font-medium">{message}</p>
            <ul className="mt-1 text-[13px] text-emerald-700">
              <li>Propiedades revisadas: {result.propertiesScanned}</li>
              <li>Con datos del dueño completados: {result.ownerUpdated}</li>
              <li>Fotos descargadas y re-alojadas: {result.photosRehosted}</li>
            </ul>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="font-medium text-red-800 text-sm">{message}</p>
        </div>
      )}

      <button
        onClick={run}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        <span>{loading ? "Reparando..." : "Reparar conversiones ahora"}</span>
      </button>

      <p className="mt-4 text-[11px] text-ink/55">
        ⚠️ Puede tardar según cuántas propiedades y fotos haya. Descarga las fotos
        una a una desde el portal.
      </p>
    </div>
  );
}
