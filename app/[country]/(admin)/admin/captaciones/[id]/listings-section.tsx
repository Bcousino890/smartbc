"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink, Loader2, Trash2, RefreshCw, Plus, Building2,
  TrendingDown, TrendingUp, Image as ImageIcon,
} from "lucide-react";

type ListingPrice = {
  price: number | null;
  currency: string | null;
  scraped_at: string;
};

type Listing = {
  id: string;
  source_url: string;
  source_site: string | null;
  broker_name: string | null;
  external_reference: string | null;
  title: string | null;
  price: number | null;
  currency: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  commune: string | null;
  cover_photo_url: string | null;
  photo_urls: string[] | null;
  features: string[] | null;
  scraped_at: string | null;
  prices: ListingPrice[];
};

function formatListingPrice(price: number | null, currency: string | null): string {
  if (price == null) return "—";
  if (currency === "uf") return `UF ${price.toLocaleString("es-CL")}`;
  return `$${price.toLocaleString("es-CL")}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

// Avisos de la misma propiedad en distintas corredoras. Cada URL se scrapea
// completa y guarda su historial de precios (trazabilidad de subidas/bajadas).
export function ListingsSection({
  captacionId,
  canEdit,
}: {
  captacionId: string;
  canEdit: boolean;
}) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/cl/captaciones/${captacionId}/listings`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setListings(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setListings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [captacionId]);

  async function scrapeUrl(urlToScrape: string, listingIdBeingUpdated?: string) {
    setError("");
    if (listingIdBeingUpdated) setUpdatingId(listingIdBeingUpdated);
    else setAdding(true);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${captacionId}/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToScrape }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al scrapear el aviso");
        return;
      }
      setListings((prev) => {
        const list = prev || [];
        const idx = list.findIndex((l) => l.id === data.id);
        if (idx >= 0) return list.map((l) => (l.id === data.id ? data : l));
        return [...list, data];
      });
      if (!listingIdBeingUpdated) setUrl("");
    } catch {
      setError("Error de conexión");
    } finally {
      setAdding(false);
      setUpdatingId(null);
    }
  }

  async function handleDelete(listingId: string) {
    if (!confirm("¿Eliminar este aviso de corredora?")) return;
    setDeletingId(listingId);
    try {
      const res = await fetch(
        `/api/admin/cl/captaciones/${captacionId}/listings/${listingId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setError("Error al eliminar el aviso");
        return;
      }
      setListings((prev) => (prev || []).filter((l) => l.id !== listingId));
    } catch {
      setError("Error de conexión");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-gold/15 bg-white/70 p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-ink">Avisos por corredora</h3>
        <p className="mt-1 text-xs text-ink/50">
          Agrega las URLs de esta misma propiedad publicada por otras corredoras.
          Cada aviso se scrapea completo y guarda su historial de precios para
          hacer trazabilidad (quién subió o bajó el precio, cuántas la tienen).
        </p>
      </div>

      {canEdit && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) scrapeUrl(url.trim());
          }}
        >
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.portalinmobiliario.com/MLC-..."
            disabled={adding}
            className="flex-1 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={adding || !url.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {adding ? "Scrapeando..." : "Agregar aviso"}
          </button>
        </form>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {listings === null ? (
        <div className="py-8 text-center">
          <Loader2 size={20} className="mx-auto animate-spin text-ink/30" />
        </div>
      ) : listings.length === 0 ? (
        <div className="py-8 text-center">
          <Building2 size={28} className="mx-auto mb-3 text-ink/25" />
          <p className="text-sm text-ink/50">Sin avisos de corredoras registrados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => {
            const current = listing.prices?.[0];
            const previous = listing.prices?.[1];
            const trend =
              current?.price != null && previous?.price != null
                ? Number(current.price) - Number(previous.price)
                : null;
            return (
              <div key={listing.id} className="rounded-xl border border-ink/10 bg-white p-4">
                <div className="flex items-start gap-3">
                  {listing.cover_photo_url ? (
                    <img
                      src={listing.cover_photo_url}
                      alt=""
                      className="h-16 w-24 flex-shrink-0 rounded-lg object-cover border border-ink/10"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  ) : (
                    <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center rounded-lg bg-ink/5">
                      <ImageIcon size={18} className="text-ink/25" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-ink truncate">
                        {listing.broker_name || listing.source_site || "Corredora"}
                      </p>
                      {listing.external_reference && (
                        <span className="rounded-full bg-ink/6 px-2 py-0.5 text-[10px] font-medium text-ink/60">
                          {listing.external_reference}
                        </span>
                      )}
                    </div>
                    {listing.title && (
                      <p className="mt-0.5 text-xs text-ink/55 truncate">{listing.title}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-3 flex-wrap text-xs text-ink/60">
                      <span className="text-sm font-bold text-ink">
                        {formatListingPrice(
                          listing.price,
                          listing.currency
                        )}
                      </span>
                      {trend != null && trend !== 0 && (
                        <span
                          className={
                            trend < 0
                              ? "flex items-center gap-1 text-emerald-600 font-medium"
                              : "flex items-center gap-1 text-red-600 font-medium"
                          }
                        >
                          {trend < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                          {trend < 0 ? "Bajó" : "Subió"} desde{" "}
                          {formatListingPrice(previous!.price, previous!.currency)}
                        </span>
                      )}
                      {(listing.photo_urls?.length ?? 0) > 0 && (
                        <span>{listing.photo_urls!.length} fotos</span>
                      )}
                      {(listing.features?.length ?? 0) > 0 && (
                        <span>{listing.features!.length} características</span>
                      )}
                      {listing.scraped_at && (
                        <span className="text-ink/40">
                          Actualizado {formatDate(listing.scraped_at)}
                        </span>
                      )}
                    </div>

                    {/* Historial de precios (trazabilidad) */}
                    {(listing.prices?.length ?? 0) > 1 && (
                      <p className="mt-1.5 text-[11px] text-ink/45">
                        Historial:{" "}
                        {listing.prices
                          .map(
                            (p) =>
                              `${formatListingPrice(p.price, p.currency)} (${formatDate(p.scraped_at)})`
                          )
                          .join(" ← ")}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-1">
                    <a
                      href={listing.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver aviso original"
                      className="rounded p-1.5 text-ink/50 hover:text-ink hover:bg-ink/5"
                    >
                      <ExternalLink size={14} />
                    </a>
                    {canEdit && (
                      <>
                        <button
                          onClick={() => scrapeUrl(listing.source_url, listing.id)}
                          disabled={updatingId === listing.id}
                          title="Re-scrapear este aviso (actualiza precio y ficha)"
                          className="rounded p-1.5 text-ink/50 hover:text-ink hover:bg-ink/5 disabled:opacity-50"
                        >
                          {updatingId === listing.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(listing.id)}
                          disabled={deletingId === listing.id}
                          title="Eliminar aviso"
                          className="rounded p-1.5 text-ink/50 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
