"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/catalogs/access";
import type { CatalogAdView } from "@/lib/catalogs/types";

// Anuncios de Idealista de origen (BCP-01 ampliación X8, D22). Interno: sirve
// para organizar qué catálogos se mandan a quién escribe por qué anuncio. Un
// anuncio puede estar en varios catálogos y un catálogo servir a varios
// anuncios. La URL pegada NO se abre: solo se lee su número. Nada de esto
// llega al lector público.

type Listing = { id: string; reference: string | null; title: string | null; code: string | null; state: string | null };

export interface AdActions {
  add: (i: { catalogId: string; listingId?: string | null; codeOrUrl?: string | null; note?: string | null }) => Promise<ActionResult<{ id: string }>>;
  remove: (i: { catalogId: string; adId: string }) => Promise<ActionResult<object>>;
  searchListings: (i: { text: string }) => Promise<ActionResult<{ items: Listing[] }>>;
}

export function AdsPanel({
  catalogId,
  ads: initial,
  actions,
  onChanged,
}: {
  catalogId: string;
  ads: CatalogAdView[];
  actions: AdActions;
  onChanged?: () => void;
}) {
  const [ads, setAds] = useState(initial);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Listing[] | null>(null);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, start] = useTransition();

  function add(input: { listingId?: string; codeOrUrl?: string }, label: Partial<CatalogAdView>) {
    setMessage(null);
    start(async () => {
      const r = await actions.add({ catalogId, ...input, note: note.trim() || null });
      if (!r.ok) {
        setMessage({ kind: "error", text: r.error });
        return;
      }
      setAds((xs) => [...xs, { id: r.id, reference: label.reference ?? null, title: label.title ?? null, code: label.code ?? null, note: note.trim() || null }]);
      setCode("");
      setNote("");
      setMessage({ kind: "ok", text: "Anuncio asociado." });
      onChanged?.();
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-gold/20 bg-white/60 p-4" aria-labelledby="ads-title" data-testid="ads-panel">
      <h2 id="ads-title" className="crm-label-sm text-ink/70">
        Anuncios de origen
      </h2>
      <p className="text-xs text-ink/55">Solo para organizarte: el cliente nunca ve estos anuncios.</p>
      {ads.length ? (
        <ul className="space-y-1" data-testid="ads-list">
          {ads.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-xs text-ink/80">
              <span className="min-w-0">
                {a.reference ? <strong className="mr-1">{a.reference}</strong> : null}
                {a.title ?? (a.code ? `Anuncio ${a.code}` : "Anuncio")}
                {a.code && a.title ? <span className="ml-1 text-ink/45">· {a.code}</span> : null}
                {a.note ? <span className="block text-ink/50">{a.note}</span> : null}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const r = await actions.remove({ catalogId, adId: a.id });
                    if (r.ok) {
                      setAds((xs) => xs.filter((x) => x.id !== a.id));
                      onChanged?.();
                    } else setMessage({ kind: "error", text: r.error });
                  })
                }
                className="shrink-0 text-red-700"
                aria-label={`Quitar ${a.reference ?? a.code ?? "anuncio"}`}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink/45">Sin anuncios asociados.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await actions.searchListings({ text: query });
            if (r.ok) setFound(r.items);
            else setMessage({ kind: "error", text: r.error });
          });
        }}
        className="flex min-w-0 gap-2"
      >
        <input
          aria-label="Buscar en Fichas guardadas"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en Fichas guardadas (referencia, título o código)"
          className="min-w-0 flex-1 rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
        />
        <button type="submit" disabled={busy || query.trim().length < 2} className="shrink-0 rounded-lg border border-gold/40 px-3 text-sm text-ink/80 disabled:opacity-40">
          Buscar
        </button>
      </form>
      {found ? (
        found.length ? (
          <ul className="space-y-1" data-testid="listing-results">
            {found.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 text-xs text-ink/80">
                <span className="min-w-0">
                  {l.reference ? <strong className="mr-1">{l.reference}</strong> : null}
                  {l.title ?? "Sin título"}
                  {l.code ? <span className="ml-1 text-ink/45">· {l.code}</span> : null}
                </span>
                <button
                  type="button"
                  disabled={busy || ads.some((a) => a.reference && a.reference === l.reference)}
                  onClick={() => add({ listingId: l.id }, { reference: l.reference, title: l.title, code: l.code })}
                  className="shrink-0 rounded-md bg-gold/90 px-2 py-1 font-semibold text-white disabled:opacity-40"
                >
                  Asociar
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink/45">Ninguna ficha guardada coincide.</p>
        )
      ) : null}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <input
          aria-label="Enlace o número del anuncio de Idealista"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="…o pega el enlace o el número del anuncio"
          className="min-w-0 flex-1 rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
        />
        <button
          type="button"
          disabled={busy || !code.trim()}
          onClick={() => add({ codeOrUrl: code }, { code: code.replace(/\D/g, "").slice(0, 12) || null })}
          className="shrink-0 rounded-lg border border-gold/40 px-3 py-2 text-sm text-ink/80 disabled:opacity-40"
        >
          Asociar
        </button>
      </div>
      <input
        aria-label="Nota interna (opcional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={200}
        placeholder="Nota interna (opcional): p. ej. «familias con niños»"
        className="w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-xs text-ink outline-none focus:border-gold"
      />
      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-lg px-2 py-1.5 text-xs ${message.kind === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
