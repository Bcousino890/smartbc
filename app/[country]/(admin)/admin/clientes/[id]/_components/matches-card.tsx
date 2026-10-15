"use client";

// ============================================================================
// QUÉ LE ENCAJA — el encargo convertido en propiedades, en el Resumen.
//
// Las sugerencias vivían solo al fondo de la pestaña Propiedades, así que al
// abrir la ficha no se veía que el encargo sirve para algo. Aquí se cuentan las
// dos fuentes (catálogo propio y anuncios de portales) con las tres que mejor
// encajan, y un salto a la lista completa.
//
// Si al encargo le falta lo esencial (zonas, presupuesto, dormitorios) se dice
// ANTES de enseñar nada: lo que salga es orientativo y el botón lleva a
// completarlo. Sin encargo no se pide nada al servidor.
// ============================================================================

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, Sparkles } from "lucide-react";
import type { SuggestedProperty } from "@/lib/db/queries/suggested-properties";
import type { SuggestedParticular } from "@/lib/db/queries/suggested-particulares";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { Button, Empty, Panel } from "./ui";

type Row = {
  key: string;
  source: "catalog" | "portal";
  title: string;
  place: string | null;
  price: number;
  operation: "rent" | "sale";
  bedrooms: number | null;
  squareMeters: number | null;
  image: string | null;
  score: number;
  portal: string | null;
};

type Side = { ok: true; rows: Row[]; total: number } | { ok: false; missing?: string[] };

const PORTAL: Record<string, string> = {
  idealista: "Idealista",
  fotocasa: "Fotocasa",
  pisos: "pisos.com",
  habitaclia: "Habitaclia",
};

async function load<T>(
  url: string,
): Promise<{ ok: true; items: T[]; total: number } | { ok: false; missing?: string[] }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false };
    const json = await res.json();
    if (json.reason === "not_available") return { ok: false };
    if (json.reason === "insufficient_brief") return { ok: false, missing: json.missing ?? [] };
    const items = (json.suggestions ?? []) as T[];
    return { ok: true, items, total: typeof json.total === "number" ? json.total : items.length };
  } catch {
    return { ok: false };
  }
}

export function MatchesCard({
  clientId,
  clientName,
  country,
  hasPreferences,
  essentialGaps,
  canEdit,
  onEditBrief,
  onGo,
}: {
  clientId: string;
  clientName: string;
  country: Country;
  hasPreferences: boolean;
  essentialGaps: string[];
  canEdit: boolean;
  onEditBrief: () => void;
  onGo: (anchor: string) => void;
}) {
  const config = getCountryConfig(country);
  const [catalog, setCatalog] = useState<Side | null>(null);
  const [portals, setPortals] = useState<Side | null>(null);

  useEffect(() => {
    if (!hasPreferences) return;
    let cancelled = false;
    load<SuggestedProperty>(`/api/admin/clientes/${clientId}/suggested-properties`).then((r) => {
      if (cancelled) return;
      setCatalog(
        r.ok
          ? {
              ok: true,
              total: r.total,
              rows: r.items.map((p) => ({
                key: `c-${p.id}`,
                source: "catalog",
                title: p.title,
                place: [p.zone, p.subzone].filter(Boolean).join(" · ") || null,
                price: p.price,
                operation: p.operation,
                bedrooms: p.bedrooms || null,
                squareMeters: p.squareMeters || null,
                image: p.photos[0] ?? null,
                score: p.matchScore,
                portal: null,
              })),
            }
          : r,
      );
    });
    load<SuggestedParticular>(`/api/admin/clientes/${clientId}/suggested-particulares`).then((r) => {
      if (cancelled) return;
      setPortals(
        r.ok
          ? {
              ok: true,
              total: r.total,
              rows: r.items.map((p) => ({
                key: `p-${p.id}`,
                source: "portal",
                title: p.title,
                place: p.zone,
                price: p.price,
                operation: p.operation,
                bedrooms: p.bedrooms,
                squareMeters: p.squareMeters,
                image: p.coverUrl,
                score: p.matchScore,
                portal: p.portal,
              })),
            }
          : r,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, hasPreferences]);

  const title = `Propiedades para ${clientName || "el cliente"}`;

  if (!hasPreferences) {
    return (
      <Panel title={title}>
        <Empty
          action={
            canEdit ? (
              <Button size="sm" variant="primary" onClick={onEditBrief}>
                Definir encargo
              </Button>
            ) : null
          }
        >
          Define qué busca (operación, zonas, presupuesto, dormitorios) y aquí aparecerán las propiedades
          que le encajan.
        </Empty>
      </Panel>
    );
  }

  // Sin zona o sin presupuesto el servidor no sugiere nada (saldría de todo).
  const missing = catalog && !catalog.ok ? catalog.missing : undefined;
  if (missing && missing.length) {
    return (
      <Panel title={title}>
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-900">
          <p className="flex items-start gap-1.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>
              Para sugerirle propiedades falta: <strong>{missing.join(", ").toLowerCase()}</strong>. Con eso se
              cruzan el catálogo y los portales y aparecen aquí las que encajan.
            </span>
          </p>
          {canEdit && (
            <div className="mt-2">
              <Button size="sm" variant="primary" onClick={onEditBrief}>
                Completar encargo
              </Button>
            </div>
          )}
        </div>
      </Panel>
    );
  }

  const loading = catalog === null || portals === null;
  const top = [
    ...(catalog?.ok ? catalog.rows : []),
    ...(portals?.ok ? portals.rows : []),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const nothing = !loading && top.length === 0;

  return (
    <Panel
      title={title}
      action={
        <Button size="sm" variant="ghost" onClick={() => onGo("cc-suggested")}>
          Ver todas
          <ArrowRight size={11} strokeWidth={1.75} />
        </Button>
      }
    >
      {essentialGaps.length > 0 && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="flex items-start gap-1.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>
              <strong>Orientativas:</strong> al encargo le falta {essentialGaps.join(", ").toLowerCase()}.
            </span>
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={onEditBrief}
              className="shrink-0 font-semibold text-amber-900 underline underline-offset-2"
            >
              Completar
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Counter
          label="Del catálogo"
          side={catalog}
          onClick={() => onGo("cc-suggested")}
        />
        <Counter
          label="En portales"
          side={portals}
          onClick={() => onGo("cc-suggested-portales")}
        />
      </div>

      {loading && top.length === 0 && (
        <div className="mt-3 flex h-14 items-center justify-center text-xs text-ink/45">
          <Loader2 size={14} className="mr-2 animate-spin" />
          Cruzando el encargo con el catálogo y los portales…
        </div>
      )}

      {nothing && (
        <p className="mt-3 text-xs text-ink/55">
          Nada encaja ahora mismo. Revisa en «Ver todas» qué se ha descartado y por qué, o amplía el encargo.
        </p>
      )}

      {top.length > 0 && (
        <ul className="mt-3 space-y-2">
          {top.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => onGo(r.source === "catalog" ? "cc-suggested" : "cc-suggested-portales")}
                className="flex w-full items-center gap-3 rounded-md border border-ink/8 bg-white/60 p-2 text-left transition hover:border-gold/40"
              >
                {r.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.image} alt="" loading="lazy" className="h-12 w-16 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-12 w-16 shrink-0 rounded bg-ink/5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink">{r.title}</p>
                  <p className="mt-0.5 truncate text-xs text-ink/55">
                    {config.formatPrice(r.price, null, r.operation)}
                    {r.bedrooms ? ` · ${r.bedrooms} dorm.` : ""}
                    {r.squareMeters ? ` · ${r.squareMeters} m²` : ""}
                    {r.place ? ` · ${r.place}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold-dark">
                    {r.score}%
                  </span>
                  <span className="text-[11px] text-ink/45">
                    {r.source === "catalog" ? "Catálogo" : (r.portal && PORTAL[r.portal]) || "Portal"}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Counter({ label, side, onClick }: { label: string; side: Side | null; onClick: () => void }) {
  // Un rol sin permiso de particulares recibe 403: no es "0", es "no disponible".
  if (side && !side.ok) {
    return (
      <div className="rounded-md border border-ink/8 px-3 py-2">
        <p className="text-lg leading-none text-ink/30">—</p>
        <p className="mt-1 text-xs text-ink/45">{label}</p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-ink/8 px-3 py-2 text-left transition hover:border-gold/40"
    >
      <p className="flex items-center gap-1.5 text-lg leading-none text-ink">
        {side === null ? <Loader2 size={14} className="animate-spin text-ink/40" /> : side.total}
        {side?.ok && side.total > 0 && <Sparkles size={12} className="text-gold" />}
      </p>
      <p className="mt-1 text-xs text-ink/55">{label}</p>
    </button>
  );
}
