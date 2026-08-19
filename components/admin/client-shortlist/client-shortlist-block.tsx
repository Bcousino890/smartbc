"use client";

// ============================================================================
// "Selección privada del cliente" en la ficha.
//
// Un vistazo tiene que bastar: si la mandó, si la abrió, por dónde va, qué ha
// elegido y en qué orden. Y desde aquí, el paso siguiente — convertirlo en un
// itinerario — sin salir de la ficha.
//
// La curación de BCP sigue viviendo en su bloque, intacta. Esto es la voz del
// cliente, y se muestra aparte a propósito.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Ban,
  Check,
  Copy,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react";
import type { ShortlistWithItems } from "@/lib/client-shortlist/types";
import type { SelectionWithProperty } from "@/lib/viewing-collections/types";
import { LANGUAGE_LABELS } from "@/lib/viewing-collections/i18n";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { PORTAL_URL } from "@/lib/portal-url";
import { cn } from "@/lib/utils";
import { CollapsibleBlock } from "@/components/admin/viewing-collections/collapsible-block";
import {
  archiveClientShortlist,
  createItineraryFromShortlist,
  renewClientShortlist,
  revokeClientShortlist,
} from "@/app/[country]/(admin)/admin/clientes/shortlist-actions";
import type { PortalLinkWithNotes } from "@/lib/portal-links/types";
import { CreateShortlistDialog } from "./create-shortlist-dialog";

const DECISION_LABEL: Record<string, string> = {
  must_visit: "Quiere visitarla",
  maybe: "Alternativa",
  not_for_me: "Descartada",
  undecided: "Sin decidir",
};

function ago(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function when(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function ClientShortlistBlock({
  clientId,
  country,
  shortlists,
  selections,
  portalLinks = [],
  canEdit,
  canCreate,
}: {
  clientId: string;
  country: Country;
  shortlists: ShortlistWithItems[];
  selections: SelectionWithProperty[];
  /** Anuncios del cliente que aún no son ficha; también pueden mandarse. */
  portalLinks?: PortalLinkWithNotes[];
  canEdit: boolean;
  canCreate: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const visible = shortlists.filter((s) => s.status !== "archived");

  return (
    <>
      <CollapsibleBlock
        title="Selección privada del cliente"
        count={visible.length}
      >
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-6 text-center text-[12px] text-ink/55">
            Manda al cliente su selección para que elija y ordene lo que quiere
            visitar, antes de montar el día.
          </p>
        ) : (
          <ul className="space-y-3">
            {visible.map((s) => (
              <ShortlistRow
                key={s.id}
                shortlist={s}
                country={country}
                canEdit={canEdit}
              />
            ))}
          </ul>
        )}

        {canCreate && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={selections.length === 0 && portalLinks.length === 0}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gold/35 bg-gold/10 px-3 py-1.5 text-[11px] font-medium text-ink transition hover:border-gold/60 disabled:opacity-40"
            title={
              selections.length === 0 && portalLinks.length === 0
                ? "Primero añade propiedades a su selección o enlaces de portales"
                : undefined
            }
          >
            <Plus size={11} strokeWidth={2} className="text-gold-dark" />
            Crear selección privada
          </button>
        )}
      </CollapsibleBlock>

      {createOpen && (
        <CreateShortlistDialog
          clientId={clientId}
          country={country}
          selections={selections}
          portalLinks={portalLinks}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </>
  );
}

function ShortlistRow({
  shortlist: s,
  country,
  canEdit,
}: {
  shortlist: ShortlistWithItems;
  country: Country;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const prefix = getCountryConfig(country).prefix;

  const url = `${PORTAL_URL}/s/${s.token}`;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "No se pudo completar.");
      else router.refresh();
    });
  };

  const must = s.items.filter((i) => i.decision === "must_visit");
  const maybe = s.items.filter((i) => i.decision === "maybe");
  const no = s.items.filter((i) => i.decision === "not_for_me");

  return (
    <li className="rounded-xl border border-ink/10 bg-white/70 p-3.5">
      {/* Estado: el del TRABAJO y el del ENLACE, separados a propósito. */}
      <div className="flex flex-wrap items-center gap-2">
        {s.status === "submitted" ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            Enviada · {when(s.submitted_at)}
          </span>
        ) : (
          <span className="rounded-full border border-ink/15 bg-white px-2 py-0.5 text-[10px] font-medium text-ink/60">
            {s.first_opened_at ? "Revisando" : "Sin abrir"}
          </span>
        )}

        {s.linkState !== "active" && (
          <span className="rounded-full border border-ink/15 bg-ink/5 px-2 py-0.5 text-[10px] font-medium text-ink/50">
            Enlace {s.linkState === "revoked" ? "revocado" : "caducado"}
          </span>
        )}

        {s.updatedAfterSubmit && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
            Cambió cosas después de enviar
          </span>
        )}

        <span className="ms-auto text-[10.5px] text-ink/40">
          {LANGUAGE_LABELS[s.language]}
        </span>
      </div>

      {/* Progreso */}
      <p className="mt-2 text-[12px] text-ink/70">
        <span className="font-medium text-ink">
          {s.counts.decided} de {s.counts.total}
        </span>{" "}
        decididas
        {s.client_updated_at && (
          <span className="text-ink/40"> · última actividad {ago(s.client_updated_at)}</span>
        )}
      </p>

      {s.counts.decided > 0 && (
        <div className="mt-2.5 space-y-2">
          <Group label="Quiere visitar" items={must} numbered />
          <Group label="Alternativas" items={maybe} />
          <Group label="Descartadas" items={no} dim />
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">
          {error}
        </p>
      )}

      {/* Acciones */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <a
          href={`/s/preview/${s.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink/70 transition hover:border-gold/55"
        >
          <Eye size={11} strokeWidth={1.75} />
          Previsualizar
        </a>

        {s.linkState === "active" && (
          <>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink/70 transition hover:border-gold/55"
            >
              {copied ? (
                <Check size={11} strokeWidth={2} className="text-emerald-600" />
              ) : (
                <Copy size={11} strokeWidth={1.75} />
              )}
              {copied ? "Copiado" : "Copiar enlace"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink/70 transition hover:border-gold/55"
            >
              <Send size={11} strokeWidth={1.75} className="text-gold-dark" />
              WhatsApp
            </a>
          </>
        )}

        {canEdit && s.counts.mustVisit > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await createItineraryFromShortlist(s.id);
                if (res.ok) {
                  // Lo que se quedó fuera se dice ANTES de navegar: si no, el
                  // agente cuenta tres paradas donde el cliente eligió cinco y
                  // no sabe por qué.
                  const fuera: string[] = [];
                  if (res.skippedPending > 0) {
                    fuera.push(
                      `${res.skippedPending} son anuncios que todavía no son ficha`,
                    );
                  }
                  if (res.skippedArchived > 0) {
                    fuera.push(`${res.skippedArchived} ya no están disponibles`);
                  }
                  if (fuera.length > 0) {
                    alert(
                      `Itinerario creado, pero no han entrado todas: ${fuera.join(" y ")}.`,
                    );
                  }
                  router.push(`${prefix}/clientes/${s.client_id}#viewing-collections`);
                }
                return res;
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
          >
            {pending ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <ArrowRight size={11} strokeWidth={2} className="text-gold" />
            )}
            Crear itinerario con sus prioridades
          </button>
        )}

        {canEdit && (
          <span className="ms-auto flex items-center gap-1.5">
            {s.linkState !== "active" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => renewClientShortlist(s.id))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink/60 transition hover:border-gold/55"
              >
                <RefreshCw size={11} strokeWidth={1.75} />
                Reactivar
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!confirm("¿Cortar el acceso del cliente a esta selección?")) return;
                  run(() => revokeClientShortlist(s.id));
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink/50 transition hover:border-rose-300 hover:text-rose-600"
              >
                <Ban size={11} strokeWidth={1.75} />
                Revocar
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => archiveClientShortlist(s.id))}
              className="rounded-lg px-2 py-1.5 text-[11px] font-medium text-ink/40 transition hover:text-ink"
            >
              Archivar
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

function Group({
  label,
  items,
  numbered,
  dim,
}: {
  label: string;
  items: ShortlistWithItems["items"];
  numbered?: boolean;
  dim?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn(dim && "opacity-60")}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/45">
        {label} · {items.length}
      </p>
      <ul className="mt-1 space-y-1">
        {items.map((i, idx) => (
          <li key={i.id} className="text-[12px] leading-snug text-ink/80">
            <span className="inline-flex items-baseline gap-1.5">
              {numbered && (
                <span className="font-mono text-[10.5px] tabular-nums text-gold-dark">
                  {String(idx + 1).padStart(2, "0")}
                </span>
              )}
              <span>{i.property.displayTitle}</span>
              {i.origin === "client_added" && (
                <span className="rounded-full border border-gold/35 bg-gold/10 px-1.5 py-px text-[9px] font-medium text-gold-dark">
                  la añadió él
                </span>
              )}
              {i.property.isArchived && (
                <span className="text-[9.5px] text-rose-600">ya no disponible</span>
              )}
            </span>
            {i.client_comment && (
              <span className="mt-0.5 block ps-1 text-[11.5px] italic text-ink/50">
                “{i.client_comment}”
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
