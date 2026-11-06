"use client";

import { AlertTriangle, BookOpen, CheckCircle2, ChevronDown, CirclePause, CircleX, ExternalLink, Link2, Pencil, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ClientPicker, { type PickedClient } from "@/components/admin/captaciones-map/client-picker";
import { ENCARGO_STATUS_LABEL } from "@/lib/encargos/ui-state";
import { encargoEditHref } from "@/lib/encargos/links";
import type { EncargoStatus } from "@/lib/encargos/model";
import { cn } from "@/lib/utils";
import type { ClientContext, EncargoOption } from "../client-flow-actions";
import { BAR_BUTTON, FOCUS_RING } from "./controls";

/** Abre/cierra un desplegable: clic fuera o Escape lo cierran (Escape devuelve el foco al botón). */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return { open, setOpen, ref, trigger };
}

// El estado nunca va solo por color: icono + texto.
const STATUS_ICON: Record<EncargoStatus, React.ReactNode> = {
  active: <CheckCircle2 size={13} aria-hidden />,
  paused: <CirclePause size={13} aria-hidden />,
  closed: <CircleX size={13} aria-hidden />,
};
const STATUS_TONE: Record<EncargoStatus, string> = {
  active: "border-emerald-700/30 bg-emerald-50 text-emerald-900",
  paused: "border-amber-700/30 bg-amber-50 text-amber-900",
  closed: "border-ink/20 bg-ink/5 text-ink/75",
};

function StatusTag({ status }: { status: EncargoStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_TONE[status])}>
      {STATUS_ICON[status]}
      {ENCARGO_STATUS_LABEL[status]}
    </span>
  );
}


/**
 * Selector de encargo (solo con dos o más; un cliente con uno solo no ve nada nuevo). Un botón con el encargo
 * elegido abre la lista de TODOS: nombre, «Principal», estado y resumen. Teclado: flechas para moverse, Intro
 * para elegir, Escape para cerrar.
 */
function EncargoPicker({
  clientName,
  encargos,
  selected,
  onPick,
}: {
  clientName: string;
  encargos: EncargoOption[];
  selected: EncargoOption;
  onPick: (id: string, isPrimary: boolean) => void;
}) {
  const { open, setOpen, ref, trigger } = usePopover();
  const list = useRef<HTMLUListElement>(null);
  const items = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button[data-encargo]") ?? []);

  useEffect(() => {
    if (!open) return;
    // Al abrir, el foco va al encargo elegido.
    const all = items();
    (all.find((b) => b.dataset.encargo === selected.id) ?? all[0])?.focus();
  }, [open, selected.id]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const all = items();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : e.key === "ArrowDown" ? (i + 1) % all.length : (i - 1 + all.length) % all.length;
    all[next]?.focus();
  };

  const listId = `encargos-${selected.id}`;
  return (
    <div
      ref={ref}
      className="relative"
      // Salir con Tab (el foco se va fuera del selector) lo cierra.
      onBlur={(e) => {
        if (open && !ref.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${listId}-panel` : undefined}
        aria-label={`Encargo: ${selected.label}${selected.isPrimary ? " (principal)" : ""}, ${ENCARGO_STATUS_LABEL[selected.status]}. Cambiar de encargo`}
        onClick={() => setOpen((v) => !v)}
        className={cn(BAR_BUTTON, "max-w-full", FOCUS_RING)}
      >
        <span className="text-ink/60">Encargo</span>
        <span className="truncate font-semibold">{selected.label}</span>
        {selected.status !== "active" && <StatusTag status={selected.status} />}
        <ChevronDown size={14} aria-hidden className={cn("shrink-0 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div
          id={`${listId}-panel`}
          role="dialog"
          aria-labelledby={`${listId}-t`}
          className="absolute left-0 top-full z-40 mt-1 w-[min(92vw,480px)] rounded-xl border border-ink/10 bg-white p-1.5 shadow-xl"
        >
          <p id={`${listId}-t`} className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-ink/65">
            Encargos de {clientName} · {encargos.length}
          </p>
          <ul id={listId} ref={list} aria-labelledby={`${listId}-t`} onKeyDown={onKey} className="max-h-[60vh] space-y-0.5 overflow-y-auto">
            {encargos.map((e) => {
              const current = e.id === selected.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    data-encargo={e.id}
                    aria-current={current ? "true" : undefined}
                    onClick={() => {
                      setOpen(false);
                      trigger.current?.focus();
                      onPick(e.id, e.isPrimary);
                    }}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition hover:bg-cream-50",
                      current ? "border-ink/40 bg-cream-50" : "border-transparent",
                      FOCUS_RING,
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink">{e.label}</span>
                      {e.isPrimary && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-gold-dark/40 bg-gold/15 px-2 py-0.5 text-xs font-medium text-ink">
                          <Star size={12} aria-hidden /> Principal
                        </span>
                      )}
                      <StatusTag status={e.status} />
                      {current && <span className="ml-auto text-xs font-medium text-ink/65">Elegido</span>}
                    </span>
                    {e.endClientLabel && <span className="text-xs text-ink/65">{e.endClientLabel}</span>}
                    <span className="text-xs text-ink/75">{e.summary}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-2.5 pb-1.5 pt-2 text-xs text-ink/60">Al elegir un encargo, los filtros se rellenan con su búsqueda. Puedes retocarlos.</p>
        </div>
      )}
    </div>
  );
}

/**
 * Cliente para el que se capta. Una sola barra para las tres vistas (Cuadrícula,
 * Lista y Mapa): el selector, el encargo con el que se trabaja (si tiene varios,
 * se elige aquí), un resumen de ese encargo (con el detalle a un clic, sin salir
 * de Captaciones) y los enlaces de ida y vuelta a su ficha, a su lista de
 * anuncios y a su book.
 */
export function ClientBar({
  prefix,
  value,
  onChange,
  context,
  loading,
  error,
  fallbackSubtitle,
  onPickEncargo,
}: {
  /** `/es`, `/cl`… */
  prefix: string;
  value: PickedClient | null;
  onChange: (c: PickedClient | null) => void;
  context: ClientContext | null;
  loading: boolean;
  error: string | null;
  fallbackSubtitle?: string;
  /** Elegir otro encargo del cliente (Captaciones). */
  onPickEncargo?: (encargoId: string, isPrimary: boolean) => void;
}) {
  const { open, setOpen, ref, trigger } = usePopover();

  const base = value ? `${prefix}/admin/clientes/${value.id}` : "";
  const summary = context?.items.filter((i) => ["Operación", "Presupuesto", "Dormitorios", "Zonas"].includes(i.label)) ?? [];
  const subtitle = context?.hasBrief ? summary.map((i) => i.value).join(" · ") || "Encargo sin resumen" : loading ? "Cargando encargo…" : fallbackSubtitle;
  const selected = context?.selectedEncargo ?? null;
  const several = !!context && context.encargos.length > 1 && !!selected;
  const encargoName = several && selected ? `«${selected.label}» de ${context.name}` : `Encargo de ${context?.name ?? ""}`;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-ink/10 bg-white/70 px-3 py-2.5">
      <ClientPicker value={value} onChange={onChange} subtitle={subtitle} theme="light" />

      {!value && (
        <p className="min-w-[220px] flex-1 text-sm text-ink/70">
          Elige un cliente para puntuar los anuncios según su encargo, captarlos para su ficha y montar su book.
        </p>
      )}

      {value && error && (
        <p className="flex items-center gap-1.5 text-sm text-red-700">
          <AlertTriangle size={14} aria-hidden /> {error}
        </p>
      )}

      {value && context && (
        <>
          {!context.available && (
            <p className="flex items-center gap-1.5 text-sm text-amber-800">
              <AlertTriangle size={14} aria-hidden /> Cliente de fuera de España: los anuncios de Captaciones no se le pueden cruzar.
            </p>
          )}
          {context.available && !context.hasBrief && (
            <p className="flex items-center gap-1.5 text-sm text-amber-800">
              <AlertTriangle size={14} aria-hidden /> Este cliente aún no tiene encargo, así que no se puede puntuar.{" "}
              <a href={`${base}?encargo=editar`} className="font-semibold underline">Crear el encargo</a>
            </p>
          )}

          {several && selected && onPickEncargo && (
            <EncargoPicker clientName={context.name} encargos={context.encargos} selected={selected} onPick={onPickEncargo} />
          )}

          <div ref={ref} className="relative">
            {context.hasBrief && (
              <button ref={trigger} type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={cn(BAR_BUTTON, FOCUS_RING)}>
                Ver encargo
                <ChevronDown size={14} aria-hidden className={cn("transition", open && "rotate-180")} />
              </button>
            )}
            {open && (
              <div role="dialog" aria-label={encargoName} className="absolute left-0 top-full z-40 mt-1 w-[min(92vw,460px)] rounded-xl border border-ink/10 bg-white p-4 shadow-xl">
                <p className="mb-2 text-sm font-semibold text-ink">{encargoName}</p>
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
                  {context.items.map((i) => (
                    <div key={i.label} className="contents">
                      <dt className="text-ink/60">{i.label}</dt>
                      <dd className="text-ink">{i.value}</dd>
                    </div>
                  ))}
                </dl>
                {context.gaps.length > 0 && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Falta por concretar: {context.gaps.map((g) => g.label).join(", ")}. Con más datos la puntuación es más fiable.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={encargoEditHref(base, selected && !selected.isPrimary ? selected.id : null)} className={cn(BAR_BUTTON, FOCUS_RING)}>
                    <Pencil size={14} aria-hidden /> Editar encargo
                  </a>
                </div>
              </div>
            )}
          </div>

          {selected && selected.status !== "active" && (
            <p role="status" className="flex items-center gap-1.5 text-sm text-amber-900">
              {STATUS_ICON[selected.status]}
              {selected.status === "paused" ? "Encargo en pausa: no hace matching" : "Encargo cerrado: no hace matching"}
            </p>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            <a href={`${base}?tab=properties#portal-links`} className={cn(BAR_BUTTON, FOCUS_RING)} title="Los anuncios que ya están en su lista para llamar">
              <Link2 size={14} aria-hidden />
              Su lista · {context.links.total}
              {context.links.total > 0 && <span className="text-ink/60"> ({context.links.withProperty} con ficha)</span>}
            </a>
            <a
              href={`${base}?tab=properties`}
              className={cn(BAR_BUTTON, FOCUS_RING)}
              title={context.book ? (context.book.status === "draft" ? "Book en borrador: aquí entran los pisos nuevos" : "Book publicado") : "Aún no tiene book: se crea solo al captar el primer piso"}
            >
              <BookOpen size={14} aria-hidden />
              {context.book ? `Book · ${context.book.stops} ${context.book.stops === 1 ? "piso" : "pisos"}${context.book.status === "published" ? " (publicado)" : ""}` : "Book · aún sin crear"}
            </a>
            <a href={base} className={cn(BAR_BUTTON, FOCUS_RING)}>
              Ficha del cliente <ExternalLink size={13} aria-hidden />
            </a>
          </div>
        </>
      )}
    </div>
  );
}
