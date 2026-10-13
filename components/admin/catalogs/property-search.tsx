"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/catalogs/access";
import { criteriaSummary, type CatalogCriteria } from "@/lib/catalogs/criteria";
import type { CatalogItemView } from "@/lib/catalogs/types";

// Búsqueda para añadir viviendas a mano (BCP-01 ampliación X7). Usa los
// criterios del panel (zonas, operación, precio y orden) más un texto
// (referencia BC o título). Solo lee propiedades; añadir pasa por la acción
// de siempre (catalog_add_property). No hay buscador público.

type Found = CatalogItemView & { inCatalog: boolean };

export type SearchAction = (i: {
  catalogId: string;
  criteria: CatalogCriteria;
  text?: string | null;
  offset?: number;
}) => Promise<ActionResult<{ items: Found[]; total: number }>>;

export function PropertySearch({
  catalogId,
  criteria,
  search,
  onAdd,
  disabled,
}: {
  catalogId: string;
  criteria: CatalogCriteria;
  search: SearchAction;
  /** Añade (con el «run» del gestor). Devuelve true si se añadió. */
  onAdd: (it: CatalogItemView) => Promise<boolean>;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<Found[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function run(offset: number) {
    setError(null);
    start(async () => {
      const r = await search({ catalogId, criteria, text: text.trim() || null, offset });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTotal(r.total);
      setResults((prev) => (offset > 0 && prev ? [...prev, ...r.items] : r.items));
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-gold/20 bg-white/60 p-3" data-testid="property-search">
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
        <button
          type="submit"
          disabled={disabled || busy}
          className="rounded-lg border border-gold/40 px-4 py-2 text-sm text-ink/80 hover:bg-white disabled:opacity-50"
        >
          Buscar con los filtros
        </button>
      </form>
      <p className="text-xs text-ink/50">Filtros: {criteriaSummary(criteria) || "todas las zonas y precios"}.</p>
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
            {results.map((it) => (
              <li key={it.propertyId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gold/10 bg-white/70 px-2 py-1.5" data-check-overflow="busqueda">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-sm text-ink">
                    {it.bcReference ? <span className="mr-2 text-xs text-ink/45">{it.bcReference}</span> : null}
                    {it.title}
                  </p>
                  <p className="text-xs text-ink/55">
                    {[it.zone ?? "Zona · sin dato", it.operation, it.price].join(" · ")}
                    {it.status === "reserved" ? " · Reservada" : ""}
                  </p>
                </div>
                {it.inCatalog ? (
                  <span className="shrink-0 text-xs text-ink/50">Ya está</span>
                ) : (
                  <button
                    type="button"
                    disabled={disabled || busy}
                    onClick={async () => {
                      if (await onAdd(it)) setResults((xs) => (xs ? xs.map((x) => (x.propertyId === it.propertyId ? { ...x, inCatalog: true } : x)) : xs));
                    }}
                    className="shrink-0 rounded-md bg-gold/90 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Añadir
                  </button>
                )}
              </li>
            ))}
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
