"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./reader.module.css";

// Zona de texto que, en la doble página, puede desplazarse POR DENTRO de la
// página (descripciones largas). Si hay más texto del que cabe, se ve una
// señal («Sigue leyendo ↓») con un degradado, y la zona se puede enfocar con
// el teclado para desplazarla con flechas, Av Pág o espacio. En una página
// (móvil) el texto fluye y la señal no aparece. El índice usa la misma zona
// (variante «index»), con su propia señal, para que ninguna entrada quede
// recortada en la doble página.

export function ScrollRegion({
  label,
  children,
  variant = "text",
  cue = "Sigue leyendo ↓",
}: {
  label: string;
  children: ReactNode;
  variant?: "text" | "index";
  cue?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ scrollable: boolean; atEnd: boolean }>({ scrollable: false, atEnd: true });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const scrollable = el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflowY !== "visible";
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    setState((s) => (s.scrollable === scrollable && s.atEnd === atEnd ? s : { scrollable, atEnd }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const more = state.scrollable && !state.atEnd;
  return (
    <div className={styles.scrollWrap}>
      <div
        ref={ref}
        className={variant === "index" ? `${styles.textScroll} ${styles.indexScroll}` : styles.textScroll}
        data-scroll-region=""
        data-scrollable={state.scrollable ? "true" : "false"}
        data-more={more ? "true" : "false"}
        tabIndex={state.scrollable ? 0 : undefined}
        role={state.scrollable ? "region" : undefined}
        aria-label={state.scrollable ? `${label} (se desplaza)` : undefined}
      >
        {children}
      </div>
      {more ? (
        <button
          type="button"
          className={styles.scrollCue}
          data-testid="scroll-cue"
          onClick={() => ref.current?.scrollBy({ top: (ref.current?.clientHeight ?? 300) * 0.8, behavior: "smooth" })}
        >
          {cue}
        </button>
      ) : null}
    </div>
  );
}
