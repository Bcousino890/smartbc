"use client";

// ============================================================================
// Favoritos y visitas.
//
// Vienen de la ficha anterior, pero con dos correcciones: las fechas se
// formatean con el locale del PAÍS del cliente (antes: "es-ES" fijo, también
// para Chile) y el "+N más" ya no es un texto muerto — despliega el resto,
// que era lo que uno esperaba al leerlo.
// ============================================================================

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, Check, Clock, Heart, X } from "lucide-react";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import {
  addPropertiesToSelection,
  addPropertyToSelection,
} from "@/app/[country]/(admin)/admin/clientes/viewing-collections-actions";
import { AddToSelectionButton } from "@/components/admin/viewing-collections/selected-properties-block";
import { formatDate } from "./format";
import { Button, Empty, Panel, Pill, type Tone } from "./ui";

export type FavoriteRef = { id: string; slug: string | null; title: string | null };

export type RawVisit = {
  id: string;
  property_id: string;
  requested_at: string;
  status: string;
  propertyTitle: string | null;
  propertySlug: string | null;
};

const VISIT_TONE: Record<string, Tone> = {
  pending: "warning",
  confirmed: "positive",
  completed: "info",
  cancelled: "neutral",
};

const VISIT_ICON: Record<string, React.ReactNode> = {
  pending: <Clock size={10} strokeWidth={2} />,
  confirmed: <Check size={10} strokeWidth={2} />,
  completed: <Check size={10} strokeWidth={2} />,
  cancelled: <X size={10} strokeWidth={2} />,
};

export function FavoritesBlock({
  favorites,
  clientId,
  country,
  selectedPropertyIds,
  canAddToSelection,
}: {
  favorites: FavoriteRef[];
  clientId: string;
  country: Country;
  selectedPropertyIds: Set<string>;
  canAddToSelection: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const config = getCountryConfig(country);
  const [showAll, setShowAll] = useState(false);
  const [adding, startAdd] = useTransition();

  const pending = favorites.filter((f) => !selectedPropertyIds.has(f.id));
  const shown = showAll ? favorites : favorites.slice(0, 8);

  return (
    <Panel
      title={t("clientes.ficha.favorites.title")}
      count={favorites.length}
      action={
        canAddToSelection && pending.length > 0 ? (
          <Button
            size="sm"
            disabled={adding}
            onClick={() =>
              startAdd(async () => {
                await addPropertiesToSelection(
                  clientId,
                  pending.map((f) => f.id),
                  "favorite",
                );
                router.refresh();
              })
            }
          >
            {adding
              ? t("cc.saving")
              : t("cc.favorites.addAll", { count: pending.length })}
          </Button>
        ) : null
      }
    >
      {favorites.length === 0 ? (
        <Empty>{t("clientes.ficha.favorites.empty")}</Empty>
      ) : (
        <>
          <ul className="space-y-1">
            {shown.map((fav) => (
              <li
                key={fav.id}
                className="flex items-center justify-between gap-3 rounded border border-ink/8 px-2.5 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Heart size={12} strokeWidth={1.75} className="shrink-0 text-gold" />
                  <span className="truncate text-xs text-ink">
                    {fav.title ?? "—"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {canAddToSelection && (
                    <AddToSelectionButton
                      added={selectedPropertyIds.has(fav.id)}
                      onAdd={() => addPropertyToSelection(clientId, fav.id, "favorite")}
                    />
                  )}
                  {fav.slug && (
                    <Link
                      href={`${config.prefix}/propiedades/${fav.slug}`}
                      className="text-xs font-medium text-gold-dark hover:underline"
                    >
                      {t("clientes.ficha.favorites.viewProperty")}
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {favorites.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 w-full text-xs font-medium text-ink/50 transition hover:text-ink"
            >
              {showAll
                ? t("cc.showLess")
                : t("clientes.ficha.moreCount", { count: favorites.length - 8 })}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}

export function VisitsBlock({
  visits,
  country,
}: {
  visits: RawVisit[];
  country: Country;
}) {
  const t = useT();
  const config = getCountryConfig(country);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? visits : visits.slice(0, 10);

  return (
    <Panel title={t("clientes.ficha.visits.title")} count={visits.length}>
      {visits.length === 0 ? (
        <Empty>{t("clientes.ficha.visits.empty")}</Empty>
      ) : (
        <>
          <ul className="space-y-1">
            {shown.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 rounded border border-ink/8 px-2.5 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Calendar size={12} strokeWidth={1.75} className="shrink-0 text-gold" />
                  <span className="min-w-0">
                    {v.propertySlug ? (
                      <Link
                        href={`${config.prefix}/propiedades/${v.propertySlug}`}
                        className="block truncate text-xs text-ink hover:underline"
                      >
                        {v.propertyTitle ?? "—"}
                      </Link>
                    ) : (
                      <span className="block truncate text-xs text-ink">
                        {v.propertyTitle ?? "—"}
                      </span>
                    )}
                    <span className="block text-xs text-ink/40">
                      {formatDate(v.requested_at, config.locale)}
                    </span>
                  </span>
                </span>
                <Pill tone={VISIT_TONE[v.status] ?? "neutral"} icon={VISIT_ICON[v.status]}>
                  {t(`clientes.ficha.visits.status.${v.status}`)}
                </Pill>
              </li>
            ))}
          </ul>
          {visits.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 w-full text-xs font-medium text-ink/50 transition hover:text-ink"
            >
              {showAll
                ? t("cc.showLess")
                : t("clientes.ficha.moreCount", { count: visits.length - 10 })}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}
