"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, RotateCw } from "lucide-react";

/**
 * Botón de rescate para cuando el despliegue automático se queda atascado
 * (típico: node_modules corrupto en el VPS) y ni siquiera un `git push`
 * nuevo lo destraba, porque el cron solo reintenta si hay un commit distinto
 * al que ya está en HEAD — ver scripts/deploy-retry.sh.
 *
 * El POST lanza el script en segundo plano y responde al instante (el propio
 * script reinicia PM2 a mitad de camino si sale bien, así que no tiene
 * sentido esperar la respuesta de esa misma petición). El progreso real se
 * sigue con polling al GET, que lee el mismo log que ya usa el deploy
 * automático.
 */
export function DeployRetryManager() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<"idle" | "started" | "error">("idle");
  const [message, setMessage] = useState("");
  const [tail, setTail] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/admin/deploy/retry", { cache: "no-store" });
        const data = await res.json();
        if (data.tail) setTail(data.tail);
      } catch {
        // Se reintenta en el siguiente tick.
      }
    }, 5000);
  }

  async function retryDeploy() {
    setRunning(true);
    setStatus("idle");
    setMessage("");
    try {
      const res = await fetch("/api/admin/deploy/retry", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus("error");
        setMessage(data.error || "No se pudo iniciar el reintento");
        setRunning(false);
        return;
      }
      setStatus("started");
      setMessage(data.message);
      startPolling();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Error de conexión");
      setRunning(false);
    }
    // `running` se queda en true mientras dure el polling manual (lo apaga el usuario).
  }

  function stopWatching() {
    if (pollRef.current) clearInterval(pollRef.current);
    setRunning(false);
  }

  return (
    <div className="rounded-2xl border border-gold/15 bg-cream-50/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)]">
      <div className="mb-4 flex items-center gap-2">
        <RotateCw size={20} className="text-gold" />
        <h2 className="text-lg font-semibold text-ink">Reintentar despliegue</h2>
      </div>

      <p className="mb-4 text-sm text-ink/60">
        Si un despliegue se quedó a medias (build roto, dependencias
        corruptas) y ya no hay ningún commit nuevo que lo despierte, este
        botón reinstala las dependencias del servidor y vuelve a compilar la
        versión ya descargada. Tarda varios minutos; la app se reinicia sola
        al terminar.
      </p>

      {status === "started" && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <Loader2 size={20} className="mt-0.5 flex-shrink-0 animate-spin text-amber-600" />
          <div className="min-w-0">
            <p className="font-medium text-amber-800">{message}</p>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-red-600" />
          <p className="font-medium text-red-800">{message}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={retryDeploy}
          disabled={running}
          className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
        >
          {running && status === "idle" && <Loader2 size={16} className="animate-spin" />}
          <span>{running ? "Reintento en curso…" : "Reintentar despliegue ahora"}</span>
        </button>

        {running && (
          <button
            onClick={stopWatching}
            className="text-sm text-ink/50 underline underline-offset-2 hover:text-ink"
          >
            Dejar de seguir (sigue corriendo igual en el servidor)
          </button>
        )}
      </div>

      {tail && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink/50">
            {tail.includes("[ok] reintento completado") ? (
              <CheckCircle2 size={13} className="text-emerald-600" />
            ) : null}
            <span>Últimas líneas del log</span>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ink p-3 text-xs leading-relaxed text-cream-50/90">
            {tail}
          </pre>
        </div>
      )}

      <p className="mt-4 text-xs text-ink/55">
        ⚠️ Solo tiene efecto una vez que este mismo botón ya llegó a
        producción una primera vez (es parte del código de la app: si el
        build sigue roto, primero hay que destrabarlo por SSH).
      </p>
    </div>
  );
}
