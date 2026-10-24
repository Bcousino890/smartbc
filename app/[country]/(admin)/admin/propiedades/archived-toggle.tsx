"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * «Ver/Ocultar archivadas» conservando los demás filtros de la lista (CRM-01).
 *
 * Los filtros los escribe la lista en la URL con replaceState, así que el
 * servidor no los conoce: el enlace se construye aquí, en el cliente, con la
 * consulta ACTUAL (Next refleja replaceState en useSearchParams) y cambiando
 * solo `archivadas`. Si la página deja de existir, la lista la corrige.
 */
export function ArchivedToggle({ showArchived }: { showArchived: boolean }) {
  const pathname = usePathname();
  const sp = new URLSearchParams(useSearchParams().toString());
  if (showArchived) sp.delete("archivadas");
  else sp.set("archivadas", "1");
  const qs = sp.toString();
  return (
    <Link
      href={qs ? `${pathname}?${qs}` : pathname}
      scroll={false}
      className="inline-flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
    >
      {showArchived ? "Ocultar archivadas" : "Ver archivadas"}
    </Link>
  );
}
