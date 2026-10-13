"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/catalogs/access";
import { criteriaSummary, type CatalogCriteria } from "@/lib/catalogs/criteria";
import type { CatalogItemView } from "@/lib/catalogs/types";

// Búsqueda de viviendas en la gestión (BCP-01 ampliación X7, C1). Usa los
// criterios del panel (zonas, operación, precio y orden) más un texto
// (referencia BC o título), o bien «todas las viviendas» para encontrar las
// que están fuera de los criterios. Solo lee propiedades.
//   · Manual: «Añadir» (catalog_add_property, como siempre).
//   · Automático (C1): «Incluir», «Excluir», «Quitar inclusión» y «Volver a
//     permitir» (catalog_adjust / catalog_adjust_clear), con el motivo de por
//     qué cada vivienda entra o no entra. Nada de esto llega al lector.

type Found = CatalogItemView & { inCatalog: boolean };

export type SearchAction = (i: {
  catalogId: string;
  criteria: CatalogCriteria;
  text?: string | null;
  offset?: number;
}) => Promise<ActionResult<{ items: Found[]; total: number }>>;

/** Sin filtros de zona, operación ni precio: todas las disponibles. */
function allHomes(c: CatalogCriteria): CatalogCriteria {
  return { ...c, operation: "any", zones: [], price_min: null, price_max: null };
}

export function PropertySearch({
  catalogId,
  criteria,
  search,
  onAdd,
  mode = "manual",
  onAdjust,
  onClear,
  disabled,
  refreshKey,
}: {
  /** Cambia cuando cambia la lista o sus ajustes (también desde la lista):
   *  los resultados que se ven se vuelven a pedir para no quedar desfasados. */
  refreshKey?: string;
  catalogId: string;
  criteria: CatalogCriteria;
  search: SearchAction;
  /** Manual: añade (con el «run» del gestor). Devuelve true si se añadió. */
  onAdd?: (it: CatalogItemView) => Promise<boolean>;
  mode?: "manual" | "auto";
  /** Automático: incluir o excluir. Devuelve true si se guardó. */
  onAdjust?: (it: CatalogItemView, kind: "include" | "exclude") => Promise<boolean>;
  /** Automático: quitar el ajuste. */
  onClear?: (it: CatalogItemView) => Promise<boolean>;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [scope, setScope] = useState<"criteria" | "all">("criteria");
  const [results, setResults] = useState<Found[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const auto = mode === "auto";
  const used = scope === "all" ? allHomes(criteria) : criteria;

  function run(offset: number) {
    setError(null);
    start(async () => {
      const r = await search({ catalogId, criteria: used, text: text.trim() || null, offset });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTotal(r.total);
      setResults((prev) => (offset > 0 && prev ? [...prev, ...r.items] : r.items));
    });
  }

  /** Tras un ajuste, se vuelve a pedir lo que ya se veía (estado al día). */
  async function after(ok: boolean) {
    if (!ok || !results) return;
    const shown = results.length;
    setError(null);
    start(async () => {
      const r = await search({ catalogId, criteria: used, text: text.trim() || null, offset: 0 });
      if (!r.ok) return;
      let items = r.items;
      while (items.length < shown && items.length < r.total) {
        const more = await search({ catalogId, criteria: used, text: text.trim() || null, offset: items.length });
        if (!more.ok || more.items.length === 0) break;
        items = [...items, ...more.items];
      }
      setTotal(r.total);
      setResults(items);
    });
  }

  const lastKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === lastKey.current) return;
    lastKey.current = refreshKey;
    if (results) void after(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const btn = "shrink-0 rounded-md px-3 py-1 text-xs disabled:opacity-50";

  return (
    <div className="space-y-2 rounded-xl border border-gold/20 bg-white/60 p-3" data-testid="property-search">
      {auto ? (
        <p className="text-xs text-ink/60">
          Busca para <strong>incluir</strong> una vivienda aunque no cumpla los criterios, o para <strong>excluir</strong> una que sí los
          cumple. Los ajustes se conservan y la lista sigue actualizándose sola.
        </p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(0);
        }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <label className="sr-only" htmlFor="ps-text">
          Referencia BC o título
        </label>
        <input
          id="ps-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          placeholder="Buscar por referencia o título (opcional)"
          className="min-w-0 flex-1 rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
        />
        <label className="sr-only" htmlFor="ps-scope">
          Dónde buscar
        </label>
        <select
          id="ps-scope"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value === "all" ? "all" : "criteria");
            setResults(null);
          }}
          disabled={disabled}
          className="rounded-lg border border-gold/25 bg-white px-2 py-2 text-sm text-ink"
        >
          <option value="criteria">Con los filtros</option>
          <option value="all">Todas las viviendas</option>
        </select>
        <button
          type="submit"
          disabled={disabled || busy}
          className="rounded-lg border border-gold/40 px-4 py-2 text-sm text-ink/80 hover:bg-white disabled:opacity-50"
        >
          {scope === "all" ? "Buscar en todas" : "Buscar con los filtros"}
        </button>
      </form>
      <p className="text-xs text-ink/50">
        {scope === "all" ? "Todas las viviendas disponibles de España, también fuera de los criterios." : `Filtros: ${criteriaSummary(criteria) || "todas las zonas y precios"}.`}
      </p>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {results ? (
        <>
          <p className="text-xs text-ink/60" data-testid="search-count">
            {total === 0 ? "Ninguna vivienda encaja." : `${results.length} de ${total}`}
          </p>
          <ul className="space-y-1">
            {results.map((it) => {
              const reason = auto && it.explain ? [it.explain.headline, ...it.explain.details.slice(0, 2), ...it.explain.warnings].join(" · ") : null;
              return (
                <li
                  key={it.propertyId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gold/10 bg-white/70 px-2 py-1.5"
                  data-check-overflow="busqueda"
                  data-testid="search-result"
                >
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="text-sm text-ink">
                      {it.bcReference ? <span className="mr-2 text-xs text-ink/45">{it.bcReference}</span> : null}
                      {it.title}
                    </p>
                    <p className="text-xs text-ink/55">
                      {[it.zone ?? "Zona · sin dato", it.operation, it.price].join(" · ")}
                      {it.status === "reserved" ? " · Reservada" : ""}
                    </p>
                    {reason ? (
                      <p className="text-xs text-ink/60" data-testid="search-reason">
                        {reason}
                      </p>
                    ) : null}
                  </div>
                  {!auto ? (
                    it.inCatalog ? (
                      <span className="shrink-0 text-xs text-ink/50">Ya está</span>
                    ) : (
                      <button
                        type="button"
                        disabled={disabled || busy}
                        onClick={async () => {
                          if (onAdd && (await onAdd(it))) setResults((xs) => (xs ? xs.map((x) => (x.propertyId === it.propertyId ? { ...x, inCatalog: true } : x)) : xs));
                        }}
                        className={`${btn} bg-gold/90 font-semibold text-white`}
                      >
                        Añadir
                      </button>
                    )
                  ) : (
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {it.inCatalog ? <span className="text-xs text-ink/50">En el catálogo</span> : null}
                      {it.adjustment === "include" ? (
                        <button
                          type="button"
                          disabled={disabled || busy}
                          aria-label={`Quitar la inclusión de «${it.title}»`}
                          onClick={async () => after(!!onClear && (await onClear(it)))}
                          className={`${btn} border border-gold/40 text-ink/80`}
                        >
                          Quitar inclusión
                        </button>
                      ) : it.adjustment !== "exclude" && !it.inCatalog ? (
                        <button
                          type="button"
                          disabled={disabled || busy}
                          aria-label={`Incluir «${it.title}»`}
                          onClick={async () => after(!!onAdjust && (await onAdjust(it, "include")))}
                          className={`${btn} bg-gold/90 font-semibold text-white`}
                        >
                          Incluir
                        </button>
                      ) : null}
                      {it.adjustment === "exclude" ? (
                        <button
                          type="button"
                          disabled={disabled || busy}
                          aria-label={`Volver a permitir «${it.title}»`}
                          onClick={async () => after(!!onClear && (await onClear(it)))}
                          className={`${btn} border border-gold/40 text-ink/80`}
                        >
                          Volver a permitir
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={disabled || busy}
                          aria-label={`Excluir «${it.title}»`}
                          onClick={async () => after(!!onAdjust && (await onAdjust(it, "exclude")))}
                          className={`${btn} text-red-700 hover:bg-red-50`}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {results.length < total ? (
            <button type="button" onClick={() => run(results.length)} disabled={busy} className="text-xs text-ink/70 underline">
              Ver más
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
