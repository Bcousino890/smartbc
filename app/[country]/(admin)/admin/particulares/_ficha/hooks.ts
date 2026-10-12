"use client";

import { type RefObject, useEffect, useRef, useSyncExternalStore } from "react";

/** `matchMedia` como estado de React (sin parpadeo de layout al abrir la ficha). */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden",
  );
}

/** ¿La tecla viene de un campo de texto? (no robar ←/→ a quien está escribiendo). */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}

/**
 * Atrapa el foco dentro de un diálogo:
 *  - al montar, lleva el foco al contenedor (que lleva tabIndex -1) y, al
 *    desmontar, lo devuelve a quien lo tenía (la tarjeta del listado);
 *  - mientras `active`, Tab/Shift+Tab dan la vuelta y un foco que se escapa
 *    se recupera.
 * `active` se apaga cuando encima se abre OTRO diálogo (el de editar teléfono,
 * que vive en su propio portal): si no, los dos se pelearían por el foco. La
 * restauración va aparte de `active` a propósito, para que apagar/encender el
 * trap no devuelva el foco a la tarjeta del listado a mitad de uso.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => {
      if (previous && document.contains(previous)) previous.focus?.({ preventScroll: true });
    };
    // Solo al montar/desmontar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      const root = ref.current;
      if (e.key !== "Tab" || !root) return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === root || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    }
    function onFocusIn(e: FocusEvent) {
      const root = ref.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        (focusables(root)[0] ?? root).focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [active, ref]);
}

/** Prefiere menos animación (scroll suave, fundidos). */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/** Para efectos que necesitan «el valor de ayer» sin provocar otro render. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
