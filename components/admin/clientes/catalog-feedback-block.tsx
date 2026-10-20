"use client";

import { ArrowRight, Star } from "lucide-react";
import { useState } from "react";
import { Empty, Panel, Pill } from "@/components/admin/ui/primitives";
import type { ClientCatalogFeedback, ClientFeedbackRow } from "@/lib/catalogs/feedback-rules";
import { shareExpiryLabel } from "@/lib/catalogs/share";
import { cn } from "@/lib/utils";

// Ficha del cliente · «Opiniones de catálogos» (0218, DC16). Lo que el
// cliente valoró desde su enlace personal: vivienda (con el título que veía
// al opinar), catálogo, estrellas, comentario y fecha; y sus enlaces
// personales. Separado de la nota del agente y de la selección. Solo lectura.

function when(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={12} strokeWidth={1.75} className={n <= value ? "fill-gold text-gold" : "text-ink/20"} aria-hidden />
      ))}
    </span>
  );
}

function FeedbackItem({ f, locale }: { f: ClientFeedbackRow; locale: string }) {
  return (
    <li className="py-3" data-testid="client-feedback-row">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0 text-sm font-medium text-ink">{f.propertyTitle}</span>
        <Stars value={f.rating} />
      </div>
      <p className="mt-0.5 text-xs text-ink/50">
        Catálogo «{f.catalogTitle}» · {when(f.updatedAt, locale)}
        {f.updatedAt !== f.createdAt ? " · editada" : ""}
        {!f.inCatalog ? (
          <>
            {" · "}
            <span className="text-amber-800" data-testid="client-feedback-gone">ya no está en el catálogo</span>
          </>
        ) : null}
      </p>
      {f.comment ? <p className="mt-1.5 whitespace-pre-line break-words text-sm text-ink/80">«{f.comment}»</p> : null}
    </li>
  );
}

/** Bloque completo (pestaña Propiedades, ancla #catalog-feedback). */
export function CatalogFeedbackBlock({ data, locale }: { data: ClientCatalogFeedback; locale: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? data.feedback : data.feedback.slice(0, 10);
  const active = data.links.filter((l) => l.state === "active");
  return (
    <Panel id="catalog-feedback" title="Opiniones de catálogos" count={data.feedback.length} className="scroll-mt-28">
      {data.feedback.length === 0 ? (
        <Empty>
          {data.links.length
            ? "Todavía no ha valorado ninguna vivienda desde su enlace personal."
            : "No tiene ningún catálogo asignado. Se asigna desde Compartir en el catálogo."}
        </Empty>
      ) : (
        <>
          <ul className="divide-y divide-ink/8" data-testid="client-feedback-list">
            {shown.map((f) => (
              <FeedbackItem key={f.id} f={f} locale={locale} />
            ))}
          </ul>
          {data.feedback.length > 10 ? (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-xs font-medium text-ink/55 hover:text-ink">
              {all ? "Ver menos" : `Ver las ${data.feedback.length}`}
            </button>
          ) : null}
        </>
      )}
      {data.links.length ? (
        <div className="mt-4 border-t border-ink/8 pt-3" data-testid="client-catalog-links">
          <p className="crm-label-sm text-ink/55">Enlaces personales</p>
          <ul className="mt-2 space-y-1.5">
            {data.links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="min-w-0 truncate font-medium text-ink/80">{l.catalogTitle}</span>
                <Pill tone={l.state === "active" ? "positive" : "neutral"}>
                  {l.state === "active" ? "Activo" : l.state === "expired" ? "Caducado" : "Revocado"}
                </Pill>
                {l.state === "active" ? <span className="text-ink/45">caduca el {shareExpiryLabel(l.expiresAt)}</span> : null}
                {l.state === "active" ? (
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-ink/55 underline-offset-2 hover:text-ink hover:underline">
                    Ver lo que ve
                  </a>
                ) : null}
                {l.managerHref ? (
                  <a href={l.managerHref} className="inline-flex items-center gap-1 text-ink/55 hover:text-ink">
                    Gestionar <ArrowRight size={11} strokeWidth={2} aria-hidden />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          {active.length === 0 ? <p className="mt-2 text-xs text-ink/45">Ningún enlace activo: no puede valorar hasta que se le asigne de nuevo.</p> : null}
        </div>
      ) : null}
    </Panel>
  );
}

/** Tarjeta de Resumen: la media, lo último y un salto al bloque. */
export function CatalogFeedbackCard({ data, locale, onGo }: { data: ClientCatalogFeedback; locale: string; onGo: () => void }) {
  if (data.feedback.length === 0 && data.links.length === 0) return null;
  const latest = data.feedback.slice(0, 3);
  const avg = data.feedback.length ? data.feedback.reduce((a, f) => a + f.rating, 0) / data.feedback.length : null;
  return (
    <Panel
      title="Opiniones de catálogos"
      count={data.feedback.length}
      action={
        <button type="button" onClick={onGo} className="inline-flex items-center gap-1 text-xs font-medium text-ink/55 transition hover:text-ink">
          Ver todas <ArrowRight size={11} strokeWidth={2} />
        </button>
      }
    >
      {data.feedback.length === 0 ? (
        <p className="text-xs leading-relaxed text-ink/50">Tiene un enlace personal pero todavía no ha valorado ninguna vivienda.</p>
      ) : (
        <>
          <p className="text-xs text-ink/55">
            Media <span className="font-semibold tabular-nums text-ink">{avg!.toLocaleString(locale, { maximumFractionDigits: 1 })}</span> de 5
          </p>
          <ul className="mt-3 space-y-2 border-t border-ink/8 pt-3">
            {latest.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={onGo} className="group flex w-full items-center justify-between gap-2 text-left">
                  <span className="min-w-0 truncate text-xs font-medium text-ink group-hover:text-gold-dark">{f.propertyTitle}</span>
                  <Stars value={f.rating} className="shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
