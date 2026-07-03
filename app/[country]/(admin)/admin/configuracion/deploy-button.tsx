"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type DeployState = "idle" | "loading" | "success" | "error";

export function DeployButton() {
  const [state, setState] = useState<DeployState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleDeploy() {
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/deploy", { method: "POST" });
      const data = await res.json() as { ok: boolean; message?: string; error?: string };
      if (data.ok) {
        setState("success");
        setMessage(data.message ?? "Deploy iniciado correctamente.");
      } else {
        setState("error");
        setMessage(data.error ?? "Error desconocido.");
      }
    } catch {
      setState("error");
      setMessage("No se pudo conectar con el servidor.");
    } finally {
      setTimeout(() => {
        setState("idle");
        setMessage(null);
      }, 8000);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleDeploy}
        disabled={state === "loading"}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white shadow-sm transition",
          state === "loading" && "cursor-not-allowed opacity-70 bg-sky-500",
          state === "success" && "bg-emerald-600 hover:bg-emerald-700",
          state === "error" && "bg-red-600 hover:bg-red-700",
          state === "idle" && "bg-sky-600 hover:bg-sky-700",
        )}
      >
        {state === "loading" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : state === "success" ? (
          <CheckCircle2 size={15} />
        ) : state === "error" ? (
          <AlertCircle size={15} />
        ) : (
          <RefreshCw size={15} strokeWidth={2} />
        )}
        {state === "loading"
          ? "Desplegando…"
          : state === "success"
          ? "¡Deploy iniciado!"
          : state === "error"
          ? "Error en deploy"
          : "Desplegar ahora"}
      </button>

      {message && (
        <p
          className={cn(
            "text-xs leading-relaxed",
            state === "error" ? "text-red-600" : "text-ink/60",
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}
