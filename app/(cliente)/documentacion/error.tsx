"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function DocumentacionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/documentacion] Error en el cliente:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-4 pb-10 md:px-8">
      <div className="w-full max-w-md rounded-2xl border border-gold/25 bg-cream-50/85 p-8 text-center shadow-[0_15px_40px_-25px_rgba(40,28,10,0.30)] backdrop-blur-sm">
        <AlertTriangle size={36} strokeWidth={1.25} className="mx-auto text-gold/60" />
        <p className="mt-4 font-serif text-lg text-ink">No se pudo cargar tu documentación</p>
        <p className="mt-1 text-sm text-ink/55">
          Ha ocurrido un problema al conectar con el servidor. Inténtalo de nuevo en unos
          instantes; si el problema continúa, contacta con tu asesor.
        </p>
        {error.digest && (
          <p className="mt-3 text-[11px] text-ink/35">Código: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-6 rounded-xl bg-ink px-6 py-3 text-sm font-medium text-cream-50 transition hover:bg-ink/90"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
