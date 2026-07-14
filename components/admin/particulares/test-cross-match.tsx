"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Database, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type CrossMatchResult = {
  ok: boolean;
  timestamp: string;
  targets_sin_telefono: number;
  candidatos_con_telefono: number;
  rellenados: number;
  ejemplos: Array<{ id: string; phone: string; matched_portal: string | null }>;
  error?: string;
};

export function TestCrossMatch() {
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState("5000");
  const [result, setResult] = useState<CrossMatchResult | null>(null);

  const handleTest = async (source: "admin" | "cron") => {
    if (!limit.trim() || isNaN(parseInt(limit, 10))) return;

    setLoading(true);
    setResult(null);

    try {
      const url =
        source === "admin"
          ? "/api/admin/particulares/cross-match-phones"
          : `/api/cron/particulares/cross-match-phones?limit=${encodeURIComponent(
              limit,
            )}`;

      const res = await fetch(url, {
        method: "POST",
        headers:
          source === "cron"
            ? { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || ""}` }
            : {},
      });

      const data = (await res.json()) as CrossMatchResult;
      setResult(data);
    } catch (err) {
      setResult({
        ok: false,
        timestamp: new Date().toISOString(),
        targets_sin_telefono: 0,
        candidatos_con_telefono: 0,
        rellenados: 0,
        ejemplos: [],
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const fillPercentage =
    result && result.targets_sin_telefono > 0
      ? Math.round(
          (result.rellenados / result.targets_sin_telefono) * 100,
        )
      : 0;

  return (
    <div className="rounded-xl border border-gold/15 bg-white/60 p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <Database size={16} />
        Cross-match de teléfonos (pisos.com → Idealista)
      </h3>

      <div className="mb-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
        <p className="font-medium mb-1">ℹ️ Cómo funciona:</p>
        <p>
          Empareja anuncios de Idealista sin teléfono con anuncios de pisos.com
          que sí lo tienen (misma propiedad: precio exacto + zona + habitaciones
          + m² + dirección). Rellena sin tocar DataDome ni proxy.
        </p>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          min="1"
          max="5000"
          placeholder="Límite de anuncios a procesar"
          className="w-40 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
          disabled={loading}
        />
        <button
          onClick={() => handleTest("admin")}
          disabled={loading}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
            loading
              ? "cursor-not-allowed bg-ink/10 text-ink/40"
              : "bg-ink text-cream-50 hover:bg-ink/90",
          )}
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Zap size={14} />
          )}
          {loading ? "Procesando…" : "Ejecutar ahora"}
        </button>
      </div>

      {result && (
        <div className="rounded-lg border border-ink/10 bg-white p-3">
          {result.ok ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span className="font-medium text-ink">✓ Cross-match completado</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-blue-50 p-2">
                  <div className="text-xs font-medium text-blue-900">
                    Sin teléfono
                  </div>
                  <div className="text-lg font-bold text-blue-700">
                    {result.targets_sin_telefono.toLocaleString("es-ES")}
                  </div>
                </div>
                <div className="rounded-lg bg-purple-50 p-2">
                  <div className="text-xs font-medium text-purple-900">
                    Candidatos (con teléfono)
                  </div>
                  <div className="text-lg font-bold text-purple-700">
                    {result.candidatos_con_telefono.toLocaleString("es-ES")}
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2">
                  <div className="text-xs font-medium text-emerald-900">
                    Rellenados
                  </div>
                  <div className="text-lg font-bold text-emerald-700">
                    {result.rellenados.toLocaleString("es-ES")}
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-ink/3 p-2">
                <div className="text-xs font-medium text-ink/70 mb-1">
                  Tasa de relleno
                </div>
                <div className="w-full bg-ink/10 rounded-full h-2">
                  <div
                    className="bg-emerald-600 h-2 rounded-full transition-all"
                    style={{ width: `${fillPercentage}%` }}
                  />
                </div>
                <div className="text-xs text-ink/60 mt-1">
                  {fillPercentage}% ({result.rellenados} de{" "}
                  {result.targets_sin_telefono})
                </div>
              </div>

              {result.ejemplos && result.ejemplos.length > 0 && (
                <details className="mt-2 group">
                  <summary className="cursor-pointer select-none text-xs font-medium text-ink/40 hover:text-ink/60 group-open:text-ink/70 transition">
                    📋 Ejemplos de rellenos ({result.ejemplos.length})
                  </summary>
                  <div className="mt-2 rounded-lg bg-ink/3 p-2 space-y-1 max-h-48 overflow-y-auto">
                    {result.ejemplos.map((ex, i) => (
                      <div
                        key={i}
                        className="text-[10px] font-mono text-ink/60 bg-white p-1 rounded border border-ink/10"
                      >
                        <div className="font-bold text-ink">ID: {ex.id}</div>
                        <div>
                          Teléfono:{" "}
                          <span className="text-emerald-700 font-semibold">
                            {ex.phone}
                          </span>
                        </div>
                        {ex.matched_portal && (
                          <div className="text-ink/50">
                            Origen: {ex.matched_portal}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div className="text-xs text-ink/50 pt-2 border-t border-ink/10">
                Procesado: {new Date(result.timestamp).toLocaleString("es-ES")}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
              <div className="text-xs text-red-700">
                <p className="font-medium">Error en cross-match</p>
                <p className="mt-0.5">{result.error}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 text-xs text-ink/50 border-t border-ink/10 pt-2">
        <p className="mb-1">
          <strong>💡 Tip:</strong> Ejecuta periódicamente para mantener teléfonos
          actualizados. Los mejores resultados se consiguen después de scraping de
          pisos.com.
        </p>
      </div>
    </div>
  );
}
