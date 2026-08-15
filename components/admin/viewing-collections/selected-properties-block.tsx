"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Calendar,
  CalendarPlus,
  Check,
  ExternalLink,
  Heart,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  removePropertyFromSelection,
  updateSelectionStatus,
} from "@/app/[country]/(admin)/admin/clientes/viewing-collections-actions";
import type {
  SelectionStatus,
  SelectionWithProperty,
} from "@/lib/viewing-collections/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { cn } from "@/lib/utils";
import { CollapsibleBlock } from "./collapsible-block";
import { PropertySelectionSearch } from "./property-selection-search";
import { CreateItineraryDialog } from "./create-itinerary-dialog";

type Filter = "all" | "unplanned" | SelectionStatus;

const STATUS_LABEL: Record<SelectionStatus, string> = {
  selected: "Seleccionada",
  interested: "Le interesa",
  discarded: "Descartada",
};

const STATUS_STYLE: Record<SelectionStatus, string> = {
  selected: "border-ink/15 bg-white text-ink/75",
  interested: "border-emerald-200 bg-emerald-50 text-emerald-700",
  discarded: "border-ink/10 bg-ink/5 text-ink/45",
};

export function SelectedPropertiesBlock({
  clientId,
  clientName,
  country,
  selections,
  canEdit,
  canDelete,
  canCreateItinerary,
}: {
  clientId: string;
  clientName: string;
  country: Country;
  selections: SelectionWithProperty[];
  canEdit: boolean;
  canDelete: boolean;
  canCreateItinerary: boolean;
}) {
  const config = getCountryConfig(country);
  const [filter, setFilter] = useState<Filter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: selections.length,
      unplanned: selections.filter(
        (s) => !s.badges.inItinerary && s.status !== "discarded",
      ).length,
      selected: selections.filter((s) => s.status === "selected").length,
      interested: selections.filter((s) => s.status === "interested").length,
      discarded: selections.filter((s) => s.status === "discarded").length,
    }),
    [selections],
  );

  const visible = useMemo(() => {
    if (filter === "all") return selections;
    if (filter === "unplanned") {
      return selections.filter(
        (s) => !s.badges.inItinerary && s.status !== "discarded",
      );
    }
    return selections.filter((s) => s.status === filter);
  }, [selections, filter]);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <CollapsibleBlock
        title="Propiedades seleccionadas"
        count={selections.length}
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
            >
              <Search size={12} strokeWidth={1.75} className="text-gold-dark" />
              Buscar
            </button>
          ) : null
        }
      >
        {selections.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-8 text-center text-[12px] text-ink/55">
            Aún no has seleccionado propiedades para {clientName}. Añádelas
            desde sus favoritos, las sugerencias o buscándolas.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", `Todas ${counts.all}`],
                  ["unplanned", `Sin planificar ${counts.unplanned}`],
                  ["interested", `Le interesan ${counts.interested}`],
                  ["discarded", `Descartadas ${counts.discarded}`],
                ] as Array<[Filter, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    filter === key
                      ? "border-gold/50 bg-gold/15 text-ink"
                      : "border-ink/10 bg-white/60 text-ink/60 hover:border-gold/30",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50/85 px-3 py-2 text-[12px] text-rose-700">
                {error}
              </p>
            )}

            <ul className="mt-3 space-y-2">
              {visible.map((sel) => (
                <SelectionRow
                  key={sel.id}
                  selection={sel}
                  country={country}
                  priceLabel={config.formatPrice(
                    sel.property.price,
                    sel.property.currency,
                    sel.property.operation,
                  )}
                  checked={checked.has(sel.id)}
                  onToggle={() => toggle(sel.id)}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onError={setError}
                />
              ))}
            </ul>

            {visible.length === 0 && (
              <p className="mt-3 text-center text-[12px] text-ink/45">
                Ninguna propiedad en este filtro.
              </p>
            )}

            {canCreateItinerary && checked.size > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-gold/25 bg-gold/5 px-4 py-3">
                <span className="text-[12px] font-medium text-ink/75">
                  {checked.size} seleccionada{checked.size > 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-[12px] font-medium text-cream-50 transition hover:bg-ink-soft"
                >
                  <CalendarPlus size={13} strokeWidth={1.75} className="text-gold" />
                  Crear itinerario
                </button>
              </div>
            )}
          </>
        )}
      </CollapsibleBlock>

      {searchOpen && (
        <PropertySelectionSearch
          clientId={clientId}
          country={country}
          excludePropertyIds={selections.map((s) => s.property_id)}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {createOpen && (
        <CreateItineraryDialog
          clientId={clientId}
          country={country}
          selections={selections.filter((s) => checked.has(s.id))}
          onClose={() => {
            setCreateOpen(false);
            setChecked(new Set());
          }}
        />
      )}
    </>
  );
}

function SelectionRow({
  selection,
  country,
  priceLabel,
  checked,
  onToggle,
  canEdit,
  canDelete,
  onError,
}: {
  selection: SelectionWithProperty;
  country: Country;
  priceLabel: string;
  checked: boolean;
  onToggle: () => void;
  canEdit: boolean;
  canDelete: boolean;
  onError: (msg: string | null) => void;
}) {
  const config = getCountryConfig(country);
  const [pending, startTransition] = useTransition();
  const prop = selection.property;

  const changeStatus = (status: SelectionStatus) => {
    onError(null);
    startTransition(async () => {
      const res = await updateSelectionStatus(selection.id, status);
      if (!res.ok) onError(res.error);
    });
  };

  const remove = () => {
    if (!confirm("¿Quitar esta propiedad de la selección?")) return;
    onError(null);
    startTransition(async () => {
      const res = await removePropertyFromSelection(selection.id);
      if (!res.ok) onError(res.error);
    });
  };

  return (
    <li
      className={cn(
        "rounded-xl border bg-white/65 px-3 py-2.5 transition",
        checked ? "border-gold/50 bg-gold/5" : "border-ink/5",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={checked ? "Quitar de la selección múltiple" : "Marcar"}
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
            checked
              ? "border-gold bg-gold text-white"
              : "border-ink/25 bg-white hover:border-gold/60",
          )}
        >
          {checked && <Check size={11} strokeWidth={3} />}
        </button>

        {prop.coverPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={prop.coverPhotoUrl}
            alt=""
            loading="lazy"
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-lg bg-ink/5" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink">
                {prop.title}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-ink/55">
                {prop.bcReference ? `${prop.bcReference} · ` : ""}
                {prop.zone}
                {prop.subzone ? ` · ${prop.subzone}` : ""} · {prop.bedrooms}h{" "}
                {prop.bathrooms}b
                {prop.squareMeters ? ` · ${prop.squareMeters} m²` : ""}
              </p>
            </div>
            <p className="shrink-0 text-[12px] font-semibold text-ink">
              {priceLabel}
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                STATUS_STYLE[selection.status],
              )}
            >
              {STATUS_LABEL[selection.status]}
            </span>

            {selection.badges.isClientFavorite && (
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600">
                <Heart size={9} className="fill-rose-500 text-rose-500" />
                Favorita
              </span>
            )}
            {selection.badges.inItinerary && (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                <Calendar size={9} strokeWidth={2} />
                {selection.badges.itineraryTitles.join(", ")}
              </span>
            )}
            {selection.badges.visited && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                Visitada
              </span>
            )}
            {prop.isArchived ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                Archivada
              </span>
            ) : prop.status !== "available" ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                {prop.status === "reserved" ? "Reservada" : "Vendida"}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {canEdit && (
              <select
                value={selection.status}
                onChange={(e) => changeStatus(e.target.value as SelectionStatus)}
                disabled={pending}
                className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-[11px] text-ink/75 focus:border-gold/55 focus:outline-none"
              >
                <option value="selected">Seleccionada</option>
                <option value="interested">Le interesa</option>
                <option value="discarded">Descartada</option>
              </select>
            )}

            <Link
              href={`${config.prefix}/propiedades/${prop.slug}`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-gold-dark transition hover:text-gold hover:underline"
            >
              <ExternalLink size={11} strokeWidth={1.75} />
              Ficha
            </Link>

            {canDelete && (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink/45 transition hover:text-rose-600 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Trash2 size={11} strokeWidth={1.75} />
                )}
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/** Botón reutilizable "Añadir a la selección" para favoritos y sugerencias. */
export function AddToSelectionButton({
  onAdd,
  added,
  label = "A la selección",
}: {
  onAdd: () => Promise<{ ok: boolean; error?: string }>;
  added: boolean;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(added);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-700"
        title="Ya está en la selección"
      >
        <Check size={11} strokeWidth={2.5} />
        En selección
      </span>
    );
  }

  return (
    <button
      type="button"
      title={error ?? undefined}
      onClick={() =>
        startTransition(async () => {
          setError(null);
          const res = await onAdd();
          if (res.ok) setDone(true);
          else setError(res.error ?? "No se pudo añadir");
        })
      }
      disabled={pending}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition disabled:opacity-50",
        error
          ? "border-rose-300 bg-rose-50 text-rose-700"
          : "border-ink/15 bg-white text-ink/70 hover:border-gold/55 hover:text-ink",
      )}
    >
      {pending ? (
        <Loader2 size={11} className="animate-spin" />
      ) : (
        <Plus size={11} strokeWidth={2} className="text-gold-dark" />
      )}
      {error ? "Error" : label}
    </button>
  );
}
