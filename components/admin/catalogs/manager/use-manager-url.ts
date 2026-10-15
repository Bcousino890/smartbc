"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { managerSearch, parseSection, type Section } from "@/lib/catalogs/manager-state";

// Sección y vivienda abierta del gestor, en la URL (BCP-01 E2, plan §3.2):
// ?seccion=viviendas|contenido|diseno|compartir y &vivienda=<propertyId>.
// Se cambian con history.pushState, que Next 15 integra con useSearchParams:
// sin ida y vuelta al servidor (la página es force-dynamic y router.push
// volvería a pedir todos los datos). Atrás/Adelante recorren secciones y
// paneles; el resto de parámetros (medir, vivo, grande) se conserva.

export function useManagerUrl() {
  const sp = useSearchParams();
  const raw = sp.get("seccion");
  const section = parseSection(raw);
  const vivienda = sp.get("vivienda");

  const navigate = useCallback((next: { seccion: Section; vivienda?: string | null }, mode: "push" | "replace" = "push") => {
    const search = managerSearch(window.location.search, next);
    if (search === window.location.search) return;
    const url = `${window.location.pathname}${search}${window.location.hash}`;
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  // Una sección desconocida se corrige sin dejar rastro en el historial.
  useEffect(() => {
    if (raw !== null && raw !== section) navigate({ seccion: section, vivienda }, "replace");
  }, [raw, section, vivienda, navigate]);

  return { section, vivienda, navigate };
}
