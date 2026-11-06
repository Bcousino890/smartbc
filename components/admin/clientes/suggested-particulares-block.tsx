"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, PhoneCall, TrendingDown } from "lucide-react";
import { addPortalLinks } from "@/app/[country]/(admin)/admin/clientes/portal-links-actions";
import { parsePortalUrl } from "@/lib/portal-links/portals";
import type { SuggestedParticular } from "@/lib/db/queries/suggested-particulares";
import {
  EncargoInactive,
  HIGHLIGHT_RING,
  MatchingFor,
  NewBadge,
  type MatchingEncargo,
} from "@/components/admin/clientes/encargo/matching-context";
import { cn } from "@/lib/utils";
import { highlightMissMessage } from "@/lib/encargos/pin";

type State =
  | { kind: "loading" }
  | {
      kind: "ready";
      suggestions: SuggestedParticular[];
      total: number;
      excluded: Array<{ label: string; count: number }>;
      /** Por qué el anuncio del aviso no sale (si se pidió y no encaja). */
      highlightMiss: string | null;
    }
  /** Encargo (no el único) al que le falta lo esencial: se dice, no se oculta el bloque. */
  | { kind: "insufficient"; missing: string[] }
  | { kind: "hidden" };

const PORTAL: Record<string, string> = { idealista: "Idealista", fotocasa: "Fotocasa", pisos: "pisos.com", habitaclia: "Habitaclia" };
const eur = (n: number, rent: boolean) =>
  new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n) + (rent ? " €/mes" : " €");

/**
 * Anuncios de portales (particulares y agencias scrapeados) que encajan con el
 * encargo. Complementa a "Propiedades sugeridas" (catálogo propio). Si el rol
 * no puede ver particulares la API responde 403 y el bloque no se pinta.
 */
export function SuggestedParticularesBlock({
  clientId,
  clientName,
  existingUrlKeys,
  canAdd,
  encargo = null,
  highlightId = null,
}: {
  clientId: string;
  clientName: string;
  /** `url_key` de los anuncios que ya están en su lista para llamar. */
  existingUrlKeys?: Set<string>;
  /** Puede mandar anuncios a la lista para llamar (permiso de colecciones). */
  canAdd?: boolean;
  /** Encargo para el que se busca (encargos múltiples, España). Sin él, el principal como siempre. */
  encargo?: MatchingEncargo | null;
  /** Anuncio que llega destacado desde un aviso (`?destacar=particular:<id>`). */
  highlightId?: string | null;
}) {
  const encargoId = encargo?.id ?? null;
  const inactive = Boolean(encargo && encargo.status !== "active");
  const highlightRef = useRef<HTMLElement>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const router = useRouter();
  const prefix = `/${(usePathname() ?? "").split("/")[1] || "es"}`;
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inList = (p: SuggestedParticular) => {
    if (added.has(p.id)) return true;
    const key = p.sourceUrl ? parsePortalUrl(p.sourceUrl)?.urlKey : null;
    return Boolean(key && existingUrlKeys?.has(key));
  };

  async function addToCallList(p: SuggestedParticular) {
    if (!p.sourceUrl) return;
    setBusy(p.id);
    setError(null);
    try {
      const res = await addPortalLinks(clientId, [
        {
          url: p.sourceUrl,
          title: p.title,
          price: p.price,
          operation: p.operation,
          zone: p.zone,
          bedrooms: p.bedrooms,
          bathrooms: p.bathrooms,
          squareMeters: p.squareMeters,
          imageUrl: p.coverUrl,
          notes: `Sugerido por el encargo (${p.matchScore}% de encaje)`,
        },
      ]);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAdded((prev) => new Set(prev).add(p.id));
      router.refresh();
    } catch {
      setError("No se pudo añadir. Inténtalo de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    // Un encargo en pausa o cerrado no hace matching: ni se pide.
    if (inactive) return;
    setState({ kind: "loading" });
    (async () => {
      try {
        const sp = new URLSearchParams();
        if (encargoId) sp.set("encargo", encargoId);
        // El anuncio del aviso se pide aparte: aunque no esté entre los mejores,
        // el servidor lo evalúa y lo pone el primero, o dice por qué ya no encaja.
        if (highlightId) sp.set("incluir", highlightId);
        const qs = sp.toString() ? `?${sp.toString()}` : "";
        const res = await fetch(`/api/admin/clientes/${clientId}/suggested-particulares${qs}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        // Con varios encargos el bloque dice para cuál busca: si a ESE le falta
        // algo, se dice (como en «Propiedades sugeridas») en vez de desaparecer.
        if (res.ok && json.reason === "insufficient_brief" && encargoId) {
          return setState({ kind: "insufficient", missing: Array.isArray(json.missing) ? json.missing : [] });
        }
        if (!res.ok || json.reason === "no_preferences" || json.reason === "not_available" || json.reason === "insufficient_brief") {
          return setState({ kind: "hidden" });
        }
        const suggestions = json.suggestions ?? [];
        setState({
          kind: "ready",
          suggestions,
          total: typeof json.total === "number" ? json.total : suggestions.length,
          excluded: json.excluded ?? [],
          highlightMiss:
            json.highlight && json.highlight.found === false && typeof json.highlight.reason === "string"
              ? highlightMissMessage(json.highlight.reason)
              : null,
        });
      } catch {
        if (!cancelled) setState({ kind: "hidden" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, encargoId, inactive, highlightId]);

  // La lista tiene scroll propio: el destacado se trae a la vista dentro de ella.
  const highlightShown = state.kind === "ready" && Boolean(highlightId) && state.suggestions.some((p) => p.id === highlightId);
  useEffect(() => {
    if (highlightShown) highlightRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlightShown]);

  if (!inactive && state.kind === "hidden") return null;
  const total = state.kind === "ready" ? state.excluded.reduce((n, e) => n + e.count, 0) : 0;

  return (
    <section className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <h2 className="crm-label-sm text-ink/50">Encontradas en portales</h2>
        {!inactive && state.kind === "ready" && state.suggestions.length > 0 && (
          <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold-dark">
            {state.total}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <a
            href={`${prefix}/admin/captaciones?cliente=${clientId}&vista=map`}
            className="rounded-lg border border-gold/30 bg-white/70 px-2.5 py-1 text-xs font-semibold text-ink hover:border-gold/60"
          >
            Ver en el mapa
          </a>
          <a
            href={`${prefix}/admin/captaciones?cliente=${clientId}`}
            className="rounded-lg border border-gold/30 bg-white/70 px-2.5 py-1 text-xs font-semibold text-ink hover:border-gold/60"
          >
            Abrir en Captaciones
          </a>
        </div>
      </div>

      {encargo && <MatchingFor encargo={encargo} />}
      {encargo && inactive && <EncargoInactive encargo={encargo} />}

      {!inactive && (
        <p className="mt-1 text-xs text-ink/50">
          Anuncios de Idealista, Fotocasa y otros portales que encajan con su encargo. Añádelos a su lista
          para llamar y siguen el mismo camino: llamada, ficha y selección. En Captaciones puedes ver todos en el
          mapa, elegir varios de golpe y captarlos para su book.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}

      {!inactive && state.kind === "loading" && (
        <div className="mt-4 flex h-16 items-center justify-center text-ink/45">
          <Loader2 size={15} className="mr-2 animate-spin" />
          <span className="text-xs">Buscando en portales…</span>
        </div>
      )}

      {!inactive && state.kind === "insufficient" && (
        <p className="mt-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-4 py-6 text-center text-xs text-amber-900">
          Para buscarle anuncios falta en el encargo:{" "}
          <strong>{state.missing.join(", ").toLowerCase() || "zona y presupuesto"}</strong>.
        </p>
      )}

      {!inactive && state.kind === "ready" && state.highlightMiss && (
        <p role="status" className="mt-3 rounded-lg border border-ink/15 bg-white/70 px-3 py-2 text-xs text-ink/70">
          {state.highlightMiss}
        </p>
      )}

      {!inactive && state.kind === "ready" && state.suggestions.length === 0 && (
        <p className="mt-3 rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-6 text-center text-xs text-ink/55">
          Ningún anuncio de portal encaja ahora con el encargo de <strong>{clientName}</strong>.
        </p>
      )}

      {!inactive && state.kind === "ready" && total > 0 && (
        <p className="mt-2 text-xs text-ink/50">
          {total === 1 ? "1 descartado" : `${total} descartados`} por el encargo:{" "}
          {state.excluded.slice(0, 4).map((e) => `${e.label.toLowerCase()} (${e.count})`).join(" · ")}
        </p>
      )}

      {!inactive && state.kind === "ready" && state.total > state.suggestions.length && (
        <p className="mt-2 text-xs text-ink/55">
          Encajan {state.total}. Se ven las {state.suggestions.length} que mejor encajan.
        </p>
      )}

      {!inactive && state.kind === "ready" && state.suggestions.length > 0 && (
        <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
          {state.suggestions.map((p) => (
            <article
              key={p.id}
              ref={p.id === highlightId ? highlightRef : undefined}
              data-highlighted={p.id === highlightId || undefined}
              className={cn(
                "flex gap-3 rounded-xl border border-ink/10 bg-white/70 p-3",
                p.id === highlightId && HIGHLIGHT_RING,
              )}
            >
              {p.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.coverUrl} alt="" className="h-20 w-24 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : (
                <div className="h-20 w-24 shrink-0 rounded-lg bg-ink/5" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                  {p.id === highlightId && <NewBadge />}
                  <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold-dark">
                    {p.matchScore}%
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink/60">
                  {eur(p.price, p.operation === "rent")}
                  {p.bedrooms ? ` · ${p.bedrooms} dorm.` : ""}
                  {p.squareMeters ? ` · ${p.squareMeters} m²` : ""}
                  {p.zone ? ` · ${p.zone}` : ""}
                  {p.portal ? ` · ${PORTAL[p.portal] ?? p.portal}` : ""}
                  {p.advertiser === "professional" ? " · Agencia" : p.advertiser === "particular" ? " · Particular" : ""}
                </p>
                {p.priceDropPct ? (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700">
                    <TrendingDown size={12} /> Bajó {Math.round(p.priceDropPct)} %
                  </p>
                ) : null}
                {p.matchReasons.length > 0 && (
                  <p className="mt-1 text-xs text-ink/55">{p.matchReasons.slice(0, 4).join(" · ")}</p>
                )}
                {p.matchWarnings.length > 0 && (
                  <p className="mt-0.5 text-xs text-amber-700">{p.matchWarnings.slice(0, 2).join(" · ")}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  {p.sourceUrl && canAdd && (
                    inList(p) ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <Check size={12} /> En su lista para llamar
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => addToCallList(p)}
                        className="inline-flex items-center gap-1 rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
                      >
                        {busy === p.id ? <Loader2 size={11} className="animate-spin" /> : <PhoneCall size={11} />}
                        Añadir a su lista para llamar
                      </button>
                    )
                  )}
                  {p.sourceUrl && (
                    <a
                      href={p.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-gold-dark hover:underline"
                    >
                      Ver anuncio <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
