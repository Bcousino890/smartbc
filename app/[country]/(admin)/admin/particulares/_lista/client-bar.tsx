"use client";

import { AlertTriangle, BookOpen, ChevronDown, ExternalLink, Link2, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ClientPicker, { type PickedClient } from "@/components/admin/captaciones-map/client-picker";
import { cn } from "@/lib/utils";
import type { ClientContext } from "../client-flow-actions";
import { BAR_BUTTON, FOCUS_RING } from "./controls";

/**
 * Cliente para el que se capta. Una sola barra para las tres vistas (Cuadrícula,
 * Lista y Mapa): el selector, un resumen de su encargo (con el detalle a un
 * clic, sin salir de Captaciones) y los enlaces de ida y vuelta a su ficha, a su
 * lista de anuncios y a su book.
 */
export function ClientBar({
  prefix,
  value,
  onChange,
  context,
  loading,
  error,
  fallbackSubtitle,
}: {
  /** `/es`, `/cl`… */
  prefix: string;
  value: PickedClient | null;
  onChange: (c: PickedClient | null) => void;
  context: ClientContext | null;
  loading: boolean;
  error: string | null;
  fallbackSubtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const base = value ? `${prefix}/admin/clientes/${value.id}` : "";
  const summary = context?.items.filter((i) => ["Operación", "Presupuesto", "Dormitorios", "Zonas"].includes(i.label)) ?? [];
  const subtitle = context?.hasBrief ? summary.map((i) => i.value).join(" · ") || "Encargo sin resumen" : loading ? "Cargando encargo…" : fallbackSubtitle;

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

          <div ref={ref} className="relative">
            {context.hasBrief && (
              <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={cn(BAR_BUTTON, FOCUS_RING)}>
                Ver encargo
                <ChevronDown size={14} aria-hidden className={cn("transition", open && "rotate-180")} />
              </button>
            )}
            {open && (
              <div role="dialog" aria-label={`Encargo de ${context.name}`} className="absolute left-0 top-full z-40 mt-1 w-[min(92vw,460px)] rounded-xl border border-ink/10 bg-white p-4 shadow-xl">
                <p className="mb-2 text-sm font-semibold text-ink">Encargo de {context.name}</p>
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
                  <a href={`${base}?encargo=editar`} className={cn(BAR_BUTTON, FOCUS_RING)}>
                    <Pencil size={14} aria-hidden /> Editar encargo
                  </a>
                </div>
              </div>
            )}
          </div>

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
