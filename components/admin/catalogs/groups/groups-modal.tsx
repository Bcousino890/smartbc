"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Diálogo de los grupos de la HOME (expediente 2026-10-16-bcp-01-home-grupos).
// Mismo aspecto que el Modal del CRM (components/ui/modal.tsx: portal en
// body, crema, oro, z-50, scroll del fondo bloqueado), y además lo que pide
// un diálogo accesible: role="dialog", aria-modal, título, foco dentro al
// abrir, Tab no sale del diálogo, Esc cierra y el foco vuelve a quien lo
// abrió. En móvil ocupa toda la pantalla (variante "sheet": hoja desde abajo).

// Diálogos abiertos, el último arriba: solo el de arriba atiende Esc y Tab
// (la confirmación de borrar se abre encima de «Organizar»).
const STACK: symbol[] = [];

export function GroupsModal({
  title,
  onClose,
  children,
  footer,
  variant = "panel",
  testId,
  busy = false,
  returnFocusTo,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** panel: a la derecha en escritorio; dialog: centrado; sheet: hoja de lista. */
  variant?: "panel" | "dialog" | "sheet";
  testId?: string;
  /** Mientras guarda, Esc y el fondo no cierran. */
  busy?: boolean;
  /** A quién vuelve el foco al cerrar (si quien abrió ya no existe, p. ej. una
   *  opción de un menú que se cierra). Por defecto, el elemento activo al abrir. */
  returnFocusTo?: () => HTMLElement | null | undefined;
}) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const me = Symbol("dialog");
    STACK.push(me);
    const top = () => STACK[STACK.length - 1] === me;
    const active = document.activeElement as HTMLElement | null;
    const back = returnFocusTo;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const box = boxRef.current;
    const first = box?.querySelector<HTMLElement>("[data-autofocus]") ?? box?.querySelector<HTMLElement>("h2");
    first?.focus({ preventScroll: true });
    // En captura sobre window: con el diálogo abierto, Esc y Tab son suyos
    // (antes que, p. ej., el Esc del panel de la vivienda del gestor). Un menú
    // propio abierto dentro del diálogo atiende antes su Esc.
    const onKey = (e: KeyboardEvent) => {
      if (!top()) return;
      if (e.key === "Escape") {
        if ((e.target as HTMLElement | null)?.closest?.("[role=menu]") && box?.contains(e.target as Node)) return;
        e.preventDefault();
        e.stopPropagation();
        if (!busyRef.current) closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !box) return;
      const items = [...box.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
      if (!items.length) return;
      const a = items[0];
      const z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      } else if (!box.contains(document.activeElement)) {
        e.preventDefault();
        a.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      STACK.splice(STACK.indexOf(me), 1);
      document.body.style.overflow = prev;
      const target = back?.() ?? active;
      if (target && document.contains(target)) target.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === "undefined") return null;
  const inCrm = document.querySelector(".crm-root") !== null;
  const place =
    variant === "panel"
      ? "inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[30rem] sm:rounded-none sm:border-l"
      : variant === "sheet"
        ? "inset-x-0 bottom-0 top-16 rounded-t-2xl sm:inset-auto sm:left-1/2 sm:top-24 sm:w-[26rem] sm:-translate-x-1/2 sm:rounded-2xl"
        : "inset-0 sm:inset-auto sm:left-1/2 sm:top-24 sm:w-[30rem] sm:-translate-x-1/2 sm:rounded-2xl";

  return createPortal(
    <div className={`${inCrm ? "crm-root " : ""}fixed inset-0 z-50`} data-testid={testId ? `${testId}-layer` : undefined}>
      <div
        className="absolute inset-0 bg-ink/45 backdrop-blur-[1px]"
        aria-hidden="true"
        onClick={() => {
          if (!busyRef.current) closeRef.current();
        }}
      />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        className={`absolute flex max-h-full flex-col overflow-hidden border-gold/20 bg-cream-50 shadow-[0_30px_80px_-25px_rgba(40,28,10,0.5)] sm:max-h-[calc(100vh-7rem)] ${variant === "panel" ? "sm:max-h-none" : "sm:border"} ${place}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gold/15 px-4 py-3">
          <h2 id={titleId} tabIndex={-1} className="crm-body-strong min-w-0 text-ink focus:outline-none">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => {
              if (!busyRef.current) closeRef.current();
            }}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink/60 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer ? <div className="border-t border-gold/15 bg-white/80 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
