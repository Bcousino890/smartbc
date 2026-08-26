"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * FLIP: la residencia VIAJA a su sitio nuevo.
 *
 * Cuando el cliente marca una casa como prioritaria, la tarjeta salta de la
 * sección «sin decidir» a «tus prioridades». Sin esto el salto es
 * instantáneo y se pierde de vista cuál acaba de mover — con quince en
 * pantalla, eso es justo lo que no puede pasar.
 *
 * La técnica es la de siempre: se apunta dónde estaba cada tarjeta (First),
 * se deja que React la coloque donde toca (Last), se calcula la diferencia
 * (Invert) y se anima de vuelta a cero (Play). El navegador solo mueve
 * transformaciones, así que no hay recálculo de maquetación por fotograma.
 *
 * Se salta entero mientras se arrastra —ahí ya manda el gesto— y cuando el
 * sistema pide menos movimiento.
 */
export function useFlipLayout(
  /** Cambia cuando cambia la disposición: decisiones, orden, altas y bajas. */
  signature: string,
  options: { disabled?: boolean; selector?: string } = {},
) {
  const { disabled = false, selector = "[data-reorder-id]" } = options;
  const previous = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(selector),
    );
    const current = new Map<string, DOMRect>();
    for (const node of nodes) {
      const id = node.dataset.reorderId;
      if (id) current.set(id, node.getBoundingClientRect());
    }

    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!disabled && !reduced && previous.current.size > 0) {
      for (const node of nodes) {
        const id = node.dataset.reorderId;
        if (!id) continue;
        const before = previous.current.get(id);
        const after = current.get(id);
        // Sin `before` es una residencia recién añadida: entra con su propio
        // fundido, no con un viaje desde ninguna parte.
        if (!before || !after) continue;

        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

        node.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0, 0)" },
          ],
          {
            duration: 520,
            easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
            composite: "replace",
          },
        );
      }
    }

    previous.current = current;
  }, [signature, disabled, selector]);
}
