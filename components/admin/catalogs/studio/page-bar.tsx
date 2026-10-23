"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { NotificationsBell } from "@/components/admin/notifications-bell";
import { useT } from "@/lib/i18n/provider";

// Barra compacta de «Mi espacio» (rediseño 2026-10-23, D3/D4): sustituye al
// título grande de AdminPageHeader en la HOME del gestor. Conserva sus dos
// herramientas (avisos e idioma del CRM), con los mismos componentes. El
// título de la página es el h1 «Catálogos» de la estantería.

export function StudioPageBar({ tools = true }: { tools?: boolean }) {
  const t = useT();
  return (
    <div className="flex min-h-[3rem] items-center justify-between gap-4 border-b border-[color:var(--st-line)] pt-4 pb-3 md:pt-6">
      <nav aria-label="Ruta" className="min-w-0 truncate text-sm text-ink/60">
        <span>{t("miEspacio.title")}</span>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-ink" aria-current="page">
          Catálogos
        </span>
      </nav>
      {tools ? (
        <div className="flex shrink-0 items-center gap-3">
          <NotificationsBell />
          <LanguageSwitcher />
        </div>
      ) : null}
    </div>
  );
}
