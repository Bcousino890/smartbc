"use client";

import { ArrowRight, Heart } from "lucide-react";
import Link from "next/link";
import { PropertyCard } from "@/components/property-card";
import { SectionHeader } from "@/components/section-header";
import { PageFooter } from "@/components/ui/page-footer";
import { useT } from "@/lib/i18n/provider";
import { mockFavorites } from "@/lib/mock-favorites";
import type { FavoriteEntry } from "@/lib/types";

export default function FavoritosPage() {
  const t = useT();
  const items = mockFavorites;

  const countKey =
    items.length === 0
      ? "favoritos.count.0"
      : items.length === 1
        ? "favoritos.count.1"
        : "favoritos.count.n";

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-10 md:px-8">
      <SectionHeader
        titleKey="favoritos.title"
        subtitleKey="favoritos.subtitle"
      />

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="mt-8 flex items-center gap-3">
            <Heart size={16} strokeWidth={1.75} className="text-gold" />
            <p className="text-sm text-gold-dark">
              {t(countKey, { count: items.length })}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {items.map((entry) => (
              <FavoriteTile key={entry.property.id} entry={entry} />
            ))}
          </div>
        </>
      )}

      <PageFooter textKey="login.footer" />
    </div>
  );
}

function FavoriteTile({ entry }: { entry: FavoriteEntry }) {
  const t = useT();
  return (
    <div className="relative">
      {entry.unavailable && (
        <span className="absolute right-3 top-3 z-10 rounded-md bg-ink/85 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-cream-50 shadow-sm backdrop-blur-sm">
          {t("favoritos.unavailable")}
        </span>
      )}
      <div
        className={
          entry.unavailable ? "pointer-events-none opacity-60" : undefined
        }
      >
        <PropertyCard property={entry.property} variant="grid" />
      </div>
    </div>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="mt-12 rounded-2xl border border-gold/25 bg-cream-50/85 p-12 text-center shadow-[0_15px_40px_-25px_rgba(40,28,10,0.30)] backdrop-blur-sm">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gold/40 text-gold">
        <Heart size={20} strokeWidth={1.5} />
      </span>
      <p className="mt-4 font-serif text-lg text-ink">
        {t("favoritos.empty.title")}
      </p>
      <p className="mt-2 max-w-sm mx-auto text-sm text-ink/60">
        {t("favoritos.empty.text")}
      </p>
      <Link
        href="/propiedades"
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink-soft"
      >
        <span>{t("favoritos.empty.cta")}</span>
        <ArrowRight size={14} strokeWidth={1.75} className="text-gold" />
      </Link>
    </div>
  );
}
