"use client";

import { useEffect, useRef, type RefObject } from "react";

// Aviso al salir con cambios sin guardar (BCP-01 E2, plan §3.6). Solo activo
// mientras hay cambios:
//   · beforeunload: recargar, cerrar la pestaña, otra URL, enlaces externos;
//   · clic en fase de CAPTURA sobre document (llega antes que el Link de
//     Next) en enlaces del mismo origen que cambian de ruta: barra lateral del
//     CRM, «‹ Mi espacio»… Cancelar = no se navega; Aceptar = se descartan los
//     borradores de este catálogo y se sigue;
//   · submit en captura de formularios de FUERA del gestor («Cerrar sesión»).
// «Atrás» del navegador que sale del gestor no se intercepta (A1): los valores
// siguen en el almacén y reaparecen al volver dentro del mismo documento.

export function leaveMessage(forms: string[]): string {
  return `Tienes cambios sin guardar en: ${forms.join(", ")}. Si sales, se pierden. ¿Salir sin guardar?`;
}

export function useLeaveGuard(forms: string[], onDiscard: () => void, root: RefObject<HTMLElement | null>) {
  const state = useRef({ forms, onDiscard });
  state.current = { forms, onDiscard };
  const active = forms.length > 0;

  useEffect(() => {
    if (!active) return;
    const confirmLeave = () => {
      const ok = window.confirm(leaveMessage(state.current.forms));
      if (ok) state.current.onDiscard();
      return ok;
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("download")) return;
      const target = a.getAttribute("target");
      if (target && target !== "_self") return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      // Otro origen: navegación completa → la cubre beforeunload.
      if (url.origin !== window.location.origin) return;
      // Misma página (anclas, parámetros del propio gestor): no se sale.
      if (url.pathname === window.location.pathname) return;
      if (!confirmLeave()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement | null;
      if (!form || root.current?.contains(form)) return;
      if (!confirmLeave()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [active, root]);
}
