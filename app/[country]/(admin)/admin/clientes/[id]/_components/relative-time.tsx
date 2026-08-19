"use client";

// ============================================================================
// "hace 3 h" sin romper la hidratación.
//
// El tiempo relativo depende del reloj, así que el servidor y el navegador
// pueden calcular cadenas distintas ("hace 59 min" / "hace 1 h") para el mismo
// dato. React trata esa diferencia como un fallo de hidratación y vuelve a
// pintar el subárbol en el cliente.
//
// Por eso: en el servidor se pinta la FECHA (que es estable) y, ya montado, se
// cambia al relativo. El dato es el mismo; solo cambia la forma de decirlo.
// ============================================================================

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/provider";
import { formatDate, formatRelative, type UiLang } from "./format";

export function RelativeTime({
  at,
  locale,
  className,
}: {
  at: string | null | undefined;
  locale: string;
  className?: string;
}) {
  const { lang } = useLanguage();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!at) return <span className={className}>—</span>;

  return (
    <span className={className} title={formatDate(at, locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}>
      {mounted ? formatRelative(at, lang as UiLang) : formatDate(at, locale)}
    </span>
  );
}
