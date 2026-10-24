"use client";

// Selector «Apariencia» de la tarjeta de cuenta (expediente
// docs/changes/2026-10-23-crm-apariencia, I11). Un <select> nativo: teclado,
// lector de pantalla y selector del sistema en móvil sin código propio. La
// barra lateral es oscura en los dos temas, así que sus colores no cambian.

import { ChevronDown, SunMoon } from "lucide-react";
import { useId } from "react";
import { useCrmTheme } from "@/components/admin/crm-theme";
import { useT } from "@/lib/i18n/provider";
import { CRM_APPEARANCES, parseAppearance } from "@/lib/theme/crm-appearance";

const LABEL_KEY = { light: "appearance.light", dark: "appearance.dark", system: "appearance.system" } as const;

export function AppearanceSelect() {
  const t = useT();
  const theme = useCrmTheme();
  const id = useId();
  const noteId = `${id}-note`;
  if (!theme) return null;

  return (
    <div className="mt-3">
      <label htmlFor={id} className="crm-meta flex items-center gap-1.5 text-cream-50/55">
        <SunMoon size={13} strokeWidth={1.75} aria-hidden="true" />
        {t("appearance.label")}
      </label>
      <div className="relative mt-1.5">
        <select
          id={id}
          value={theme.appearance}
          onChange={(e) => theme.setAppearance(parseAppearance(e.target.value))}
          aria-describedby={theme.persisted ? undefined : noteId}
          className="w-full cursor-pointer appearance-none rounded-lg border border-cream-50/15 bg-transparent py-2 pl-3 pr-8 text-base text-cream-50/85 transition hover:border-cream-50/30 hover:text-cream-50 focus-visible:border-gold/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 lg:text-sm"
        >
          {CRM_APPEARANCES.map((value) => (
            <option key={value} value={value} className="bg-white text-ink">
              {t(LABEL_KEY[value])}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-cream-50/50"
        />
      </div>
      {!theme.persisted && (
        <p id={noteId} className="crm-meta mt-1.5 text-cream-50/55">
          {t("appearance.notSaved")}
        </p>
      )}
    </div>
  );
}
