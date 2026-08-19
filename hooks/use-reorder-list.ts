"use client";

// ============================================================================
// Reordenar arrastrando, con el pulgar.
//
// ⚠️ NO usa el arrastre nativo de HTML5 (`draggable`), y es deliberado: en
// Safari de iOS y en Chrome de Android esos eventos NO se disparan con el
// dedo. Un shortlist se abre en el móvil, así que un arrastre que solo
// funcione con ratón no sirve de nada. Con Pointer Events funcionan los dos.
//
// Sin dependencias: el proyecto no tiene ninguna librería de drag & drop y
// esto son cien líneas.
//
// Tres decisiones que hacen que se sienta bien:
//   · Se arrastra SOLO desde el asa. Si toda la tarjeta arrastrara, no se
//     podría hacer scroll con el dedo encima de la lista.
//   · La lista se recoloca EN VIVO al pasar el punto medio de cada tarjeta,
//     así que el hueco va abriéndose donde va a caer. Al soltar no salta nada.
//   · Cerca del borde de la pantalla la página se desplaza sola: con catorce
//     residencias, llevar la primera al final es imposible sin eso.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

/** Franja del borde donde empieza el desplazamiento automático. */
const EDGE_PX = 90;
const EDGE_SPEED = 14;

export function useReorderList({
  ids,
  onReorder,
  onCommit,
  disabled = false,
}: {
  /** Orden actual. */
  ids: string[];
  /** Recolocación en vivo mientras se arrastra (optimista). */
  onReorder: (nextIds: string[]) => void;
  /** Al soltar, con el orden definitivo. No se llama si nada cambió. */
  onCommit: (nextIds: string[]) => void;
  disabled?: boolean;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Refs y no estado: se leen dentro de los manejadores de puntero, que no se
  // vuelven a crear en cada render.
  const elements = useRef(new Map<string, HTMLElement>());
  const order = useRef(ids);
  order.current = ids;
  const startOrder = useRef<string[]>([]);
  const pointerY = useRef(0);
  const frame = useRef(0);

  const registerItem = useCallback((id: string, el: HTMLElement | null) => {
    if (el) elements.current.set(id, el);
    else elements.current.delete(id);
  }, []);

  /** Coloca la tarjeta arrastrada en el hueco que le toca según la altura. */
  const placeAt = useCallback(
    (id: string, clientY: number) => {
      const current = order.current;
      const from = current.indexOf(id);
      if (from === -1) return;

      let to = current.length - 1;
      for (let i = 0; i < current.length; i++) {
        const el = elements.current.get(current[i]);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (clientY < r.top + r.height / 2) {
          to = i;
          break;
        }
      }
      if (to === from) return;

      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, id);
      order.current = next;
      onReorder(next);
    },
    [onReorder],
  );

  // Desplazamiento automático cerca de los bordes, en su propio bucle: el dedo
  // puede quedarse QUIETO en el borde y la página tiene que seguir moviéndose,
  // cosa que no pasaría si solo reaccionáramos a pointermove.
  useEffect(() => {
    if (!draggingId) return;
    const tick = () => {
      const y = pointerY.current;
      const h = window.innerHeight;
      if (y < EDGE_PX) window.scrollBy(0, -EDGE_SPEED);
      else if (y > h - EDGE_PX) window.scrollBy(0, EDGE_SPEED);
      if (y < EDGE_PX || y > h - EDGE_PX) placeAt(draggingId, y);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [draggingId, placeAt]);

  const handleProps = useCallback(
    (id: string) => ({
      // `none` para que el navegador no interprete el gesto como scroll: sin
      // esto, en móvil el arrastre se pierde en cuanto el dedo se mueve.
      style: { touchAction: "none" as const, cursor: "grab" },
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (disabled || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        startOrder.current = order.current;
        pointerY.current = e.clientY;
        setDraggingId(id);
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (!draggingId) return;
        pointerY.current = e.clientY;
        placeAt(draggingId, e.clientY);
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        if (!draggingId) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        const next = order.current;
        setDraggingId(null);
        if (next.join() !== startOrder.current.join()) onCommit(next);
      },
      onPointerCancel: () => {
        if (!draggingId) return;
        const next = order.current;
        setDraggingId(null);
        if (next.join() !== startOrder.current.join()) onCommit(next);
      },
    }),
    [disabled, draggingId, onCommit, placeAt],
  );

  const itemProps = useCallback(
    (id: string) => ({
      ref: (el: HTMLElement | null) => registerItem(id, el),
      style: draggingId === id ? { pointerEvents: "none" as const } : undefined,
    }),
    [draggingId, registerItem],
  );

  return { draggingId, handleProps, itemProps };
}
