"use client";

// Estrellas del cliente, de 1 a 5, en cada residencia de la selección.
// Independientes de la decisión: "quiero visitarla" con 3 estrellas o "quizá"
// con 5 dicen cosas distintas, y el agente quiere saber las dos.
// Tocar la estrella que ya está puesta la quita (vuelve a 0).

import type { ShortlistDictionary } from "@/lib/client-shortlist/i18n";
import { cn } from "@/lib/utils";

export function StarRating({
  t,
  value,
  onRate,
  disabled,
  size = "md",
}: {
  t: ShortlistDictionary;
  value: number;
  onRate: (n: number) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const px = size === "sm" ? 15 : 21;
  return (
    <div
      role="radiogroup"
      aria-label={t.yourRating}
      className="flex items-center gap-0.5"
      dir="ltr"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={t.rateStars(n)}
            disabled={disabled}
            onClick={() => onRate(value === n ? 0 : n)}
            className={cn(
              "p-0.5 transition-transform duration-200 hover:scale-110 disabled:opacity-50",
              on ? "text-gold" : "text-ink/20 hover:text-gold/60",
            )}
          >
            <svg width={px} height={px} viewBox="0 0 24 24" aria-hidden>
              <path
                d="M12 2.8l2.83 5.74 6.33.92-4.58 4.47 1.08 6.3L12 17.25l-5.66 2.98 1.08-6.3L2.84 9.46l6.33-.92L12 2.8z"
                fill={on ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
