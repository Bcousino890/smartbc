"use client";

// ============================================================================
// Primitivas editoriales de la Viewing Collection.
//
// El principio que las gobierna: la información se compone con TIPOGRAFÍA y
// ESPACIO, no con cajas, iconos ni badges. Las referencias del sector
// (Christie's, Sotheby's) presentan los datos como "elegant typographic data
// points" — es lo que separa una publicación de un panel de control.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Etiqueta en versalitas: Cinzel, tracking amplio, tamaño pequeño pero legible. */
export function Label({
  children,
  className,
  tone = "ink",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "ink" | "cream" | "gold";
}) {
  return (
    <span
      className={cn(
        "block font-display text-[10.5px] font-medium uppercase vc-tracked md:text-[11px]",
        tone === "ink" && "text-ink/45",
        tone === "cream" && "text-cream-50/60",
        tone === "gold" && "text-gold-dark",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Filete horizontal. El único "borde" que usa la colección. */
export function Rule({
  className,
  tone = "ink",
}: {
  className?: string;
  tone?: "ink" | "cream" | "gold";
}) {
  return (
    <hr
      className={cn(
        "border-0 border-t",
        tone === "ink" && "border-ink/12",
        tone === "cream" && "border-cream-50/20",
        tone === "gold" && "border-gold/40",
        className,
      )}
    />
  );
}

/** Filete corto centrado — separador de secciones, al modo de un libro. */
export function Ornament({
  className,
  tone = "ink",
}: {
  className?: string;
  tone?: "ink" | "cream";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "mx-auto block h-px w-10",
        tone === "ink" ? "bg-gold/50" : "bg-cream-50/35",
        className,
      )}
    />
  );
}

/**
 * Dato tipográfico: etiqueta minúscula arriba, valor en serif grande debajo.
 * Sustituye a los chips de icono+número. Tres o cuatro en fila componen la
 * ficha técnica de una residencia sin una sola caja.
 */
export function DataPoint({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label className="text-ink/40">{label}</Label>
      <p className="mt-1.5 font-serif text-[19px] leading-none text-ink vc-nums md:text-[22px]">
        {value}
      </p>
    </div>
  );
}

/**
 * Reveal al entrar en viewport.
 *
 * Sin IntersectionObserver (o con JS caído) el contenido se muestra
 * directamente: el movimiento es un adorno, nunca un requisito para leer.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: 0 | 1 | 2 | 3 | 4;
  className?: string;
  as?: "div" | "section" | "li" | "figure" | "header" | "footer";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setRevealed(true);
            obs.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={cn(
        "vc-reveal",
        delay > 0 && `vc-reveal-d${delay}`,
        revealed && "is-revealed",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * Estado de la visita o de la propiedad, en una línea de texto.
 *
 * Deliberadamente NO es un badge de color: en una publicación editorial el
 * estado se dice, no se pinta. El único recurso gráfico es un punto de 4px.
 */
export function StatusLine({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "confirmed" | "pending" | "muted" | "neutral" | "alert";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display text-[10px] font-medium uppercase vc-tracked-sm md:text-[10.5px]",
        tone === "confirmed" && "text-ink/70",
        tone === "pending" && "text-gold-dark",
        tone === "alert" && "text-gold-dark",
        tone === "muted" && "text-ink/35",
        tone === "neutral" && "text-ink/55",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1 w-1 rounded-full",
          tone === "confirmed" && "bg-ink/60",
          tone === "pending" && "bg-gold",
          tone === "alert" && "bg-gold",
          tone === "muted" && "bg-ink/25",
          tone === "neutral" && "bg-ink/40",
        )}
      />
      {children}
    </span>
  );
}

/** Número de capítulo: "01 / 06" en versalitas. */
export function ChapterMark({
  index,
  total,
  tone = "ink",
  className,
}: {
  index: number;
  total: number;
  tone?: "ink" | "cream";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-display text-[11px] font-medium uppercase vc-tracked vc-nums md:text-[12px]",
        tone === "ink" ? "text-ink/40" : "text-cream-50/55",
        className,
      )}
    >
      {String(index).padStart(2, "0")}
      <span className="mx-1.5 opacity-50">/</span>
      {String(total).padStart(2, "0")}
    </span>
  );
}

/**
 * Acción principal. Un rectángulo de filete fino que se rellena al pasar el
 * cursor — sin sombras, sin degradados, sin esquinas redondeadas marcadas.
 */
export function EditorialAction({
  href,
  children,
  onClick,
  tone = "ink",
  className,
  external = true,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "ink" | "cream";
  className?: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className={cn(
        "group vc-focus inline-flex items-center justify-center gap-3 border px-8 py-4 font-display text-[11px] font-medium uppercase vc-tracked transition-colors duration-500 md:text-[11.5px]",
        tone === "ink"
          ? "border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-cream-50"
          : "border-cream-50/35 text-cream-50 hover:border-cream-50 hover:bg-cream-50 hover:text-ink",
        className,
      )}
    >
      {children}
      <span
        aria-hidden
        className="inline-block transition-transform duration-500 group-hover:translate-x-1"
      >
        &rarr;
      </span>
    </a>
  );
}
