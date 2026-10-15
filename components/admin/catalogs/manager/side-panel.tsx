"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, X } from "lucide-react";

// Panel de una vivienda (BCP-01 E2, plan §3.7, §3.8 y §3.13). En escritorio
// (≥ 1024 px) es un aside al lado de la lista, fijo bajo la cabecera, que se
// desplaza por dentro; en móvil es una pantalla propia (la lista se oculta)
// con «‹ Volver». Al abrir, el foco va a su título; Esc o ✕ lo cierran (la
// sección devuelve el foco a la fila). El pie (SidePanelFooter) queda fijo
// abajo y los campos reservan su altura (scroll-margin), así que nunca los
// tapa. Ningún z-index supera al menú del CRM (30/40).

export function SidePanel({
  label,
  heading,
  sub,
  backLabel,
  onClose,
  onPrev,
  onNext,
  children,
  testId,
}: {
  /** Nombre accesible de la región («Vivienda …», «Texto de …»). */
  label: string;
  heading: string;
  sub?: ReactNode;
  /** Texto del botón de vuelta en móvil («Viviendas», «Contenido»). */
  backLabel: string;
  onClose: () => void;
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
  children: ReactNode;
  testId?: string;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Esc también cuando el foco se ha quedado en <body> (p. ej. al desactivarse
  // el botón pulsado); si está en otro sitio fuera del panel, no se toca.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const a = document.activeElement;
      if (a === document.body || a === null || asideRef.current?.contains(a)) {
        e.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: false });
  }, [heading]);
  // En móvil el desplazamiento es el de la página: se reserva el pie.
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.scrollPaddingBottom;
    html.style.scrollPaddingBottom = "6rem";
    return () => {
      html.style.scrollPaddingBottom = before;
    };
  }, []);

  const iconBtn = "inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink/70 hover:bg-cream-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-30";
  return (
    <aside
      ref={asideRef}
      aria-label={label}
      data-testid={testId}
      className="min-w-0 rounded-xl border border-gold/25 bg-white/90 shadow-sm lg:sticky lg:top-28 lg:flex lg:max-h-[calc(100vh-8rem)] lg:flex-col"
    >
      <div className="flex items-start gap-2 border-b border-gold/15 p-3">
        <button type="button" onClick={onClose} className={`${iconBtn} w-auto gap-1 px-2 text-sm lg:hidden`}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {backLabel}
        </button>
        <div className="hidden min-w-0 flex-1 lg:block" />
        <div className="ml-auto flex items-center gap-1">
          {onPrev !== undefined ? (
            <button type="button" onClick={onPrev ?? undefined} disabled={!onPrev} aria-label="Vivienda anterior" className={iconBtn}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          {onNext !== undefined ? (
            <button type="button" onClick={onNext ?? undefined} disabled={!onNext} aria-label="Vivienda siguiente" className={iconBtn}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" onClick={onClose} aria-label="Cerrar el panel" className={`${iconBtn} hidden lg:inline-flex`}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        className="min-w-0 space-y-3 p-3 lg:flex-1 lg:overflow-y-auto [&_:is(input,textarea,select,button,a,label)]:scroll-mb-28 [&_:is(input,textarea,select,button,a,label)]:scroll-mt-4"
        style={{ scrollPaddingBottom: "6rem" }}
        data-testid="side-panel-body"
      >
        <div>
          {sub ? <div className="text-xs text-ink/55">{sub}</div> : null}
          <h2 ref={titleRef} tabIndex={-1} className="crm-body-strong mt-0.5 text-ink focus:outline-none" data-testid="side-panel-title">
            {heading}
          </h2>
        </div>
        {children}
      </div>
    </aside>
  );
}

/** Pie de acciones fijo del panel (escritorio: abajo del panel; móvil: abajo
 *  de la pantalla). Lleva también el mensaje del gestor cuando el panel está
 *  abierto, para que se vea junto a las acciones. */
export function SidePanelFooter({ children, message }: { children: ReactNode; message?: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-10 -mx-3 -mb-3 space-y-2 border-t border-gold/20 bg-white/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur"
      data-testid="side-panel-footer"
    >
      {message}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
