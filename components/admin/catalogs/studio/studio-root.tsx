import type { ReactNode } from "react";
import { studioFontVariables } from "./fonts";
import s from "./studio.module.css";

// Raíz del gestor de catálogos (expediente 2026-10-23-bcp-01-gestor-rediseno,
// I2): define las fuentes y las superficies del rediseño SOLO para su árbol.
// La usan la HOME de «Mi espacio» y la página de un catálogo (y sus páginas
// de prueba). El resto del CRM, el lector y el PDF no la ven.

export function StudioRoot({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${studioFontVariables} ${s.root} ${className}`.trim()}>{children}</div>;
}

export { s as studio };
