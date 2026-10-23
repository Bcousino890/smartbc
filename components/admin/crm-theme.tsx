"use client";

// Tema del CRM interno (expediente docs/changes/2026-10-23-crm-apariencia).
// Lo montan solo las cáscaras del CRM: aplica `data-crm-theme="dark"` en
// <html> mientras el CRM está montado y lo quita al salir (antes de pintar la
// página siguiente), así que la web pública, el portal y el login no lo
// reciben nunca. Los diálogos que se pintan en <body> heredan el tema solos.

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  CRM_THEME_ATTRIBUTE,
  DARK_QUERY,
  appearanceStorageKey,
  parseAppearance,
  readAppearance,
  resolveTheme,
  writeAppearance,
  type CrmAppearance,
  type CrmTheme,
} from "@/lib/theme/crm-appearance";

type Ctx = {
  appearance: CrmAppearance;
  theme: CrmTheme;
  setAppearance: (next: CrmAppearance) => void;
  /** false si el navegador no deja guardar: la elección vale solo para esta página. */
  persisted: boolean;
};

const CrmThemeContext = createContext<Ctx | null>(null);

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

function applyTheme(theme: CrmTheme) {
  const root = document.documentElement;
  if (theme === "dark") root.setAttribute(CRM_THEME_ATTRIBUTE, "dark");
  else root.removeAttribute(CRM_THEME_ATTRIBUTE);
}

export function CrmThemeProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  // El servidor no conoce la preferencia (vive en el navegador): arranca en
  // claro y se corrige en el primer efecto. El guion previo ya pintó el
  // atributo correcto, así que no hay destello.
  const [appearance, setAppearanceState] = useState<CrmAppearance>("light");
  const [systemDark, setSystemDark] = useState(false);
  const [persisted, setPersisted] = useState(true);
  const theme = resolveTheme(appearance, systemDark);

  // Lee la preferencia de este usuario (también al cambiar de usuario).
  useLayoutEffect(() => {
    setAppearanceState(readAppearance(safeStorage(), userId));
    setSystemDark(systemPrefersDark());
  }, [userId]);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Al desmontar (salir del CRM en la misma pestaña): fuera el atributo.
  useLayoutEffect(() => () => document.documentElement.removeAttribute(CRM_THEME_ATTRIBUTE), []);

  // «Según el sistema»: sigue al sistema operativo en vivo.
  useEffect(() => {
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Otra pestaña del mismo usuario cambió la preferencia.
  useEffect(() => {
    const key = appearanceStorageKey(userId);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setAppearanceState(parseAppearance(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  const setAppearance = useCallback(
    (next: CrmAppearance) => {
      setAppearanceState(next);
      setPersisted(writeAppearance(safeStorage(), userId, next));
    },
    [userId],
  );

  const value = useMemo(() => ({ appearance, theme, setAppearance, persisted }), [appearance, theme, setAppearance, persisted]);
  return <CrmThemeContext.Provider value={value}>{children}</CrmThemeContext.Provider>;
}

export function useCrmTheme(): Ctx | null {
  return useContext(CrmThemeContext);
}
