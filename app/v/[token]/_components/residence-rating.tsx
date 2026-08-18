"use client";

// ============================================================================
// "¿Qué le parece esta residencia?" — la única cosa que el cliente ESCRIBE.
//
// Las estrellas van en TIPOGRAFÍA (★ / ☆), no en un icono SVG: la publicación
// compone con letra y espacio, y un icono importado se vería como un control
// de panel de administración pegado en medio de un libro.
//
// La residencia se nombra por su PUESTO en la jornada, nunca por un id — la
// proyección pública no expone un solo UUID. Guardar es optimista: la estrella
// se enciende al instante y, si el envío falla, vuelve a como estaba. Nadie
// debería quedarse mirando un spinner por decir que un piso le gusta.
// ============================================================================

import { useState, useTransition } from "react";
import type { CollectionDictionary } from "@/lib/viewing-collections/i18n";
import { Label } from "./editorial";
import { cn } from "@/lib/utils";

export function ResidenceRating({
  order,
  initialRating,
  collectionToken,
  dict,
  className,
  compact = false,
}: {
  order: number;
  initialRating: number;
  /** Vacío en la previsualización del agente: entonces no se guarda nada. */
  collectionToken: string;
  dict: CollectionDictionary;
  className?: string;
  /**
   * Modo libro: la página tiene ALTURA FIJA y no puede crecer, así que se
   * recorta a etiqueta + estrellas. El matiz de "solo lo vemos nosotros" se
   * pierde ahí, pero un bloque que desborde rompería la composición entera.
   */
  compact?: boolean;
}) {
  const [value, setValue] = useState(initialRating);
  const [saved, setSaved] = useState(initialRating > 0);
  const [pending, startTransition] = useTransition();
  const readOnly = !collectionToken;

  const send = (next: number) => {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v/${collectionToken}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order, rating: next }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setSaved(next > 0);
      } catch {
        setValue(previous);
      }
    });
  };

  return (
    <div className={cn(compact ? "mt-5" : "mt-8 md:mt-10", className)}>
      <Label tone="gold">{dict.feedbackPrompt}</Label>

      <div
        className={cn("flex items-center gap-3", compact ? "mt-2" : "mt-3")}
        role={readOnly ? "img" : "radiogroup"}
        aria-label={dict.feedbackPrompt}
      >
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = n <= value;
            return (
              <button
                key={n}
                type="button"
                disabled={readOnly || pending}
                aria-label={`${n}/5`}
                aria-pressed={on}
                // Pulsar la que ya estaba puesta la quita: sin ese gesto, una
                // valoración dada sin querer solo se puede bajar a 1.
                onClick={() => send(value === n ? 0 : n)}
                className={cn(
                  "vc-focus font-serif leading-none transition-colors duration-300",
                  compact ? "text-[20px]" : "text-[26px] md:text-[30px]",
                  on ? "text-gold-dark" : "text-ink/20",
                  !readOnly && "hover:text-gold-dark",
                  readOnly && "cursor-default",
                )}
              >
                {on ? "★" : "☆"}
              </button>
            );
          })}
        </div>

        {saved && !pending && (
          <span className="font-sans text-[11.5px] text-ink/45">
            {dict.feedbackSaved}
          </span>
        )}
      </div>

      {!compact && (
        <p className="mt-3 font-sans text-[11.5px] text-ink/40">
          {dict.feedbackHint}
        </p>
      )}
    </div>
  );
}
