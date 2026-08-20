"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownWideNarrow,
  Calendar,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Heart,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  removePropertyFromSelection,
  reorderSelections,
  setSelectionRating,
  updateSelectionStatus,
} from "@/app/[country]/(admin)/admin/clientes/viewing-collections-actions";
import { comparePriority, orderByRating, reorderIds } from "@/lib/ordering";
// Átomo compartido: las estrellas se ven igual aquí y en los enlaces de
// portales, que es lo que hace que se lean sin pensar.
import { RatingStars } from "@/components/admin/clientes/portal-links/portal-links-ui";
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
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Orden optimista: arrastrar tiene que verse al instante, no esperar al
  // round-trip. Se descarta en cuanto el servidor devuelve la lista nueva.
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const selectionsRef = useRef(selections);
  useEffect(() => {
    if (selectionsRef.current !== selections) {
      selectionsRef.current = selections;
      setDraftOrder(null);
    }
  }, [selections]);

  const ordered = useMemo(() => {
    const base = [...selections].sort((a, b) =>
      comparePriority(a, b, (x) => x.added_at),
    );
    if (!draftOrder) return base;
    const byId = new Map(base.map((s) => [s.id, s]));
    const seen = new Set(draftOrder);
    const out = draftOrder
      .map((id) => byId.get(id))
      .filter((s): s is SelectionWithProperty => Boolean(s));
    for (const s of base) if (!seen.has(s.id)) out.push(s);
    return out;
  }, [selections, draftOrder]);

  const commitOrder = (nextIds: string[]) => {
    setDraftOrder(nextIds);
    setError(null);
    startTransition(async () => {
      const res = await reorderSelections(clientId, nextIds);
      if (!res.ok) {
        setDraftOrder(null);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const dropBefore = (movedId: string, beforeId: string | null) => {
    const ids = ordered.map((s) => s.id);
    const next = reorderIds(ids, movedId, beforeId);
    setDragId(null);
    setOverId(null);
    if (next.join() === ids.join()) return;
    commitOrder(next);
  };

  const moveBy = (id: string, direction: -1 | 1) => {
    const ids = ordered.map((s) => s.id);
    const from = ids.indexOf(id);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= ids.length) return;
    const beforeId = direction === -1 ? ids[to] : (ids[to + 1] ?? null);
    commitOrder(reorderIds(ids, id, beforeId));
  };

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
    if (filter === "all") return ordered;
    if (filter === "unplanned") {
      return ordered.filter(
        (s) => !s.badges.inItinerary && s.status !== "discarded",
      );
    }
    return ordered.filter((s) => s.status === filter);
  }, [ordered, filter]);

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
      {/* Ancla del salto desde Solicitudes → "Preparar visitas". */}
      <span id="viewing-collections" className="scroll-mt-24" />
      <CollapsibleBlock
        title="Propiedades seleccionadas"
        count={selections.length}
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
            >
              <Search size={12} strokeWidth={1.75} className="text-gold-dark" />
              Buscar
            </button>
          ) : null
        }
      >
        {selections.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-8 text-center text-xs text-ink/55">
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
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                    filter === key
                      ? "border-gold/50 bg-gold/15 text-ink"
                      : "border-ink/10 bg-white/60 text-ink/60 hover:border-gold/30",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {canEdit && selections.some((s) => s.rating > 0 || s.client_rating > 0) && (
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => commitOrder(orderByRating(ordered))}
                  title="Pone arriba lo que TÚ has valorado mejor. Después puedes afinar arrastrando."
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/55 transition hover:text-gold-dark disabled:opacity-50"
                >
                  <ArrowDownWideNarrow size={12} strokeWidth={1.75} className="text-gold-dark" />
                  Ordenar por mi valoración
                </button>
                {selections.some((s) => s.client_rating > 0) && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      commitOrder(
                        orderByRating(
                          ordered.map((s) => ({ id: s.id, rating: s.client_rating })),
                        ),
                      )
                    }
                    title="Pone arriba lo que más le ha gustado AL CLIENTE en su enlace privado."
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/55 transition hover:text-gold-dark disabled:opacity-50"
                  >
                    <ArrowDownWideNarrow size={12} strokeWidth={1.75} className="text-gold-dark" />
                    Ordenar por lo que dice el cliente
                  </button>
                )}
              </div>
            )}

            {error && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50/85 px-3 py-2 text-xs text-rose-700">
                {error}
              </p>
            )}

            <ul className="mt-3 space-y-2">
              {visible.map((sel, i) => (
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
                  order={ordered.indexOf(sel) + 1}
                  isDragging={dragId === sel.id}
                  isDropTarget={Boolean(dragId) && overId === sel.id && dragId !== sel.id}
                  onDragStart={() => setDragId(sel.id)}
                  onDragEnter={() => setOverId(sel.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  onDrop={() => dragId && dropBefore(dragId, sel.id)}
                  onMove={(direction) => moveBy(sel.id, direction)}
                  canMoveUp={i > 0}
                  canMoveDown={i < visible.length - 1}
                />
              ))}
            </ul>

            {/* Soltar aquí = al final del todo. Sin esta zona no hay forma de
                mandar una propiedad detrás de la última. */}
            {dragId && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  dropBefore(dragId, null);
                }}
                className="mt-2 rounded-lg border border-dashed border-gold/40 bg-gold/5 py-2 text-center crm-label-sm text-gold-dark"
              >
                Soltar al final
              </div>
            )}

            {visible.length === 0 && (
              <p className="mt-3 text-center text-xs text-ink/45">
                Ninguna propiedad en este filtro.
              </p>
            )}

            {canCreateItinerary && checked.size > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-gold/25 bg-gold/5 px-4 py-3">
                <span className="text-xs font-medium text-ink/75">
                  {checked.size} seleccionada{checked.size > 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-cream-50 transition hover:bg-ink-soft"
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
  order,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  selection: SelectionWithProperty;
  country: Country;
  priceLabel: string;
  checked: boolean;
  onToggle: () => void;
  canEdit: boolean;
  canDelete: boolean;
  onError: (msg: string | null) => void;
  /** Puesto en el orden de prioridad, 1-based. */
  order: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
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
      // El arrastre nativo de HTML5 no pide dependencias pero no existe en
      // táctil: las flechas de al lado son la única vía desde una tablet.
      draggable={canEdit}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", selection.id);
        onDragStart();
      }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-xl border bg-white/65 px-3 py-2.5 transition",
        checked ? "border-gold/50 bg-gold/5" : "border-ink/5",
        pending && "opacity-60",
        isDragging && "opacity-40",
        isDropTarget && "border-t-2 border-t-gold",
      )}
    >
      <div className="flex items-start gap-3">
        {canEdit && (
          <div className="mt-0.5 flex shrink-0 flex-col items-center">
            <button
              type="button"
              disabled={!canMoveUp}
              onClick={() => onMove(-1)}
              aria-label="Subir en la prioridad"
              className="text-ink/25 transition hover:text-gold-dark disabled:opacity-0"
            >
              <ChevronUp size={13} strokeWidth={2} />
            </button>
            <span
              className="cursor-grab text-xs leading-none text-ink/35 active:cursor-grabbing"
              title="Arrastra para cambiar la prioridad"
            >
              {String(order).padStart(2, "0")}
            </span>
            <button
              type="button"
              disabled={!canMoveDown}
              onClick={() => onMove(1)}
              aria-label="Bajar en la prioridad"
              className="text-ink/25 transition hover:text-gold-dark disabled:opacity-0"
            >
              <ChevronDown size={13} strokeWidth={2} />
            </button>
          </div>
        )}
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
              <p className="truncate text-sm font-medium text-ink">
                {prop.title}
              </p>
              <p className="mt-0.5 truncate text-xs text-ink/55">
                {prop.bcReference ? `${prop.bcReference} · ` : ""}
                {prop.zone}
                {prop.subzone ? ` · ${prop.subzone}` : ""} · {prop.bedrooms}h{" "}
                {prop.bathrooms}b
                {prop.squareMeters ? ` · ${prop.squareMeters} m²` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-semibold text-ink">{priceLabel}</p>
              <div className="mt-1 flex items-center justify-end gap-1.5">
                <span className="crm-label-sm text-ink/35">
                  Yo
                </span>
                <RatingStars
                  value={selection.rating}
                  disabled={!canEdit || pending}
                  onChange={
                    canEdit
                      ? (next) =>
                          startTransition(async () => {
                            const res = await setSelectionRating(selection.id, next);
                            if (!res.ok) onError(res.error);
                          })
                      : undefined
                  }
                />
              </div>
              {/* La opinión del cliente solo aparece cuando la ha dado: una
                  fila de estrellas vacías se leería como "no le gusta". */}
              {selection.client_feedback_at && (
                <div
                  className="mt-1 flex items-center justify-end gap-1.5"
                  title="Lo que ha valorado el cliente desde su enlace privado"
                >
                  <span className="crm-label-sm text-gold-dark">
                    Cliente
                  </span>
                  <RatingStars value={selection.client_rating} />
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-medium",
                STATUS_STYLE[selection.status],
              )}
            >
              {STATUS_LABEL[selection.status]}
            </span>

            {selection.badges.isClientFavorite && (
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
                <Heart size={9} className="fill-rose-500 text-rose-500" />
                Favorita
              </span>
            )}
            {selection.badges.inItinerary && (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                <Calendar size={9} strokeWidth={2} />
                {selection.badges.itineraryTitles.join(", ")}
              </span>
            )}
            {selection.badges.visited && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Visitada
              </span>
            )}
            {prop.isArchived ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                Archivada
              </span>
            ) : prop.status !== "available" ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
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
                className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs text-ink/75 focus:border-gold/55 focus:outline-none"
              >
                <option value="selected">Seleccionada</option>
                <option value="interested">Le interesa</option>
                <option value="discarded">Descartada</option>
              </select>
            )}

            <Link
              href={`${config.prefix}/propiedades/${prop.slug}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-gold-dark transition hover:text-gold hover:underline"
            >
              <ExternalLink size={11} strokeWidth={1.75} />
              Ficha
            </Link>

            {canDelete && (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="ml-auto inline-flex items-center gap-1 text-xs text-ink/45 transition hover:text-rose-600 disabled:opacity-50"
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
        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700"
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
        "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition disabled:opacity-50",
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
