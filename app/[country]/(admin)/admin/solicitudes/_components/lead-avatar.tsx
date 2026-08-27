"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Foto de perfil del contacto, ampliable al pulsarla.
 *
 * Idealista sirve el avatar recortado y pequeño, y a veces es la única cara
 * que se tiene antes de una visita: poder verla en grande ayuda a reconocer
 * a quien viene. No se usa el `Modal` común porque este trae título, borde y
 * padding — aquí estorban: lo que se quiere ver es la foto, y nada más.
 *
 * Se renderiza con createPortal en `document.body` por el mismo motivo que
 * el Modal común: la cabecera del lead tiene ancestros con `backdrop-filter`,
 * que crean un containing block nuevo y dejarían el `fixed` atrapado dentro
 * del panel en vez de cubrir la pantalla.
 */
export function LeadAvatar({
  src,
  name,
  className,
}: {
  src: string;
  name: string | null;
  className?: string;
}) {
  const [zoomed, setZoomed] = useState(false);
  // `createPortal` necesita el DOM: en el render del servidor no existe.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!zoomed) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setZoomed(false);
    }
    document.addEventListener("keydown", onKey);
    // Sin esto, la rueda del ratón sigue moviendo la bandeja por detrás.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [zoomed]);

  const label = name?.trim() ? `Ver la foto de ${name.trim()} más grande` : "Ver la foto más grande";

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        aria-label={label}
        title={label}
        className="shrink-0 rounded-full transition hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className={className} />
      </button>

      {mounted &&
        zoomed &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onClick={() => setZoomed(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/80 p-6 backdrop-blur-sm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={name?.trim() || ""}
              // Clic en la foto NO cierra: solo el fondo. Si no, arrastrar
              // para verla o pulsar sin querer la cierra en la cara.
              onClick={(e) => e.stopPropagation()}
              className="max-h-[80vh] max-w-[80vw] rounded-xl object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setZoomed(false)}
              aria-label="Cerrar"
              className="absolute right-5 top-5 rounded-full bg-white/90 p-2 text-ink transition hover:bg-white"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
