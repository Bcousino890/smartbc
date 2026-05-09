"use client";

import { Bell } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/lib/i18n/provider";

export function AdminPageHeader({
  titleKey,
  subtitleKey,
  welcome = true,
}: {
  titleKey: string;
  subtitleKey?: string;
  welcome?: boolean;
}) {
  const t = useT();
  return (
    <header className="flex items-start justify-between gap-6 pt-7 md:pt-9">
      <div className="min-w-0">
        {welcome && (
          <p className="text-[12px] font-medium tracking-wide text-gold">
            {t("admin.welcome")}
          </p>
        )}
        <h1 className="mt-1 font-serif text-3xl font-medium leading-tight tracking-tight text-ink md:text-[2.5rem]">
          {t(titleKey)}
        </h1>
        {subtitleKey && (
          <p className="mt-1 max-w-2xl text-sm text-ink/55">
            {t(subtitleKey)}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          aria-label={t("admin.notifications")}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white/70 text-ink/65 transition hover:border-gold/40 hover:text-ink"
        >
          <Bell size={16} strokeWidth={1.75} />
        </button>
        <LanguageSwitcher />
      </div>
    </header>
  );
}
