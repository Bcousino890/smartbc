"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink, Loader2, Trash2, RefreshCw, Plus, Building2,
  TrendingDown, TrendingUp, Image as ImageIcon, X, MapPin, Globe, Tag,
} from "lucide-react";

type ListingPrice = {
  price: number | null;
  currency: string | null;
  source?: string | null;
  scraped_at: string;
};

type Listing = {
  id: string;
  source_url: string;
  source_site: string | null;
  broker_name: string | null;
  external_reference: string | null;
  operation: "venta" | "arriendo" | null;
  portal_publication_number: string | null;
  published_ago: string | null;
  broker_website_url: string | null;
  broker_price: number | null;
  broker_currency: string | null;
  broker_scraped_at: string | null;
  broker_scrape_error: string | null;
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  useful_square_meters: number | null;
  region: string | null;
  commune: string | null;
  zone: string | null;
  address_scraped: string | null;
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

function formatLocation(listing: Listing): string {
  return [listing.zone, listing.commune, listing.region].filter(Boolean).join(", ");
}

function OperationBadge({ operation }: { operation: Listing["operation"] }) {
  if (!operation) return null;
  return (
    <span
      className={
        operation === "arriendo"
          ? "rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-700"
          : "rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700"
      }
    >
      {operation === "arriendo" ? "Arriendo" : "Venta"}
    </span>
  );
}

// Avisos de la misma propiedad en distintas corredoras. Cada URL se scrapea
// completa y guarda su historial de precios (trazabilidad de subidas/bajadas).
// Una propiedad puede tener aviso de venta Y de arriendo: se agregan ambas
// URLs y se distinguen por la etiqueta de operación. Al hacer clic en un
// aviso se abre su ficha completa, donde además se guarda la URL de la web
// interna de la corredora para trackearla aparte.
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
  const [openId, setOpenId] = useState<string | null>(null);
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

  function replaceListing(updated: Listing) {
    setListings((prev) => {
      const list = prev || [];
      const idx = list.findIndex((l) => l.id === updated.id);
      if (idx >= 0) return list.map((l) => (l.id === updated.id ? updated : l));
      return [...list, updated];
    });
  }

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
        const msg = String(data.error || "Error al scrapear el aviso");
        // Tabla/columna inexistente / caché de esquema => falta aplicar la migración
        setError(
          /does not exist|schema cache|not find the table/i.test(msg)
            ? "Faltan las tablas de este módulo: ve a Configuración → \"Migraciones de Base de Datos\" → aplicar, y vuelve a intentarlo."
            : msg
        );
        return;
      }
      replaceListing(data);
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
      if (openId === listingId) setOpenId(null);
    } catch {
      setError("Error de conexión");
    } finally {
      setDeletingId(null);
    }
  }

  const openListing = listings?.find((l) => l.id === openId) || null;

  return (
    <div className="rounded-2xl border border-gold/15 bg-white/70 p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-ink">Avisos por corredora</h3>
        <p className="mt-1 text-xs text-ink/50">
          Agrega las URLs de esta misma propiedad publicada por otras corredoras
          (si está en venta y arriendo, agrega ambos avisos). Cada aviso se
          scrapea completo y guarda su historial de precios. Haz clic en un
          aviso para abrir su ficha y trackear también la web de la corredora.
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
            const portalPrices = listing.prices?.filter((p) => (p.source ?? "portal") === "portal") ?? [];
            const current = portalPrices[0];
            const previous = portalPrices[1];
            const trend =
              current?.price != null && previous?.price != null
                ? Number(current.price) - Number(previous.price)
                : null;
            const location = formatLocation(listing);
            return (
              <div key={listing.id} className="rounded-xl border border-ink/10 bg-white p-4">
                <div className="flex items-start gap-3">
                  {listing.cover_photo_url ? (
                    <img
                      src={listing.cover_photo_url}
                      alt=""
                      className="h-16 w-24 flex-shrink-0 rounded-lg object-cover border border-ink/10 cursor-pointer"
                      onClick={() => setOpenId(listing.id)}
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  ) : (
                    <div
                      className="flex h-16 w-24 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg bg-ink/5"
                      onClick={() => setOpenId(listing.id)}
                    >
                      <ImageIcon size={18} className="text-ink/25" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setOpenId(listing.id)}
                        className="text-sm font-semibold text-ink truncate hover:text-gold hover:underline"
                        title="Abrir ficha del aviso"
                      >
                        {listing.broker_name || listing.source_site || "Corredora"}
                      </button>
                      <OperationBadge operation={listing.operation} />
                      {listing.external_reference && (
                        <span className="rounded-full bg-ink/6 px-2 py-0.5 text-[10px] font-medium text-ink/60">
                          {listing.external_reference}
                        </span>
                      )}
                      {listing.broker_website_url && (
                        <span title="Trackea también la web de la corredora">
                          <Globe size={12} className="text-ink/40" />
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
                      {listing.square_meters != null && (
                        <span>{listing.square_meters} m²{listing.useful_square_meters != null ? ` (útil ${listing.useful_square_meters} m²)` : ""}</span>
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
                    <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-ink/45">
                      {location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={10} />
                          {location}
                        </span>
                      )}
                      {listing.portal_publication_number && (
                        <span>Publicación #{listing.portal_publication_number}</span>
                      )}
                      {listing.published_ago && <span>{listing.published_ago}</span>}
                    </div>

                    {/* Historial de precios (trazabilidad) */}
                    {(listing.prices?.length ?? 0) > 1 && (
                      <p className="mt-1.5 text-[11px] text-ink/45">
                        Historial:{" "}
                        {listing.prices
                          .map(
                            (p) =>
                              `${formatListingPrice(p.price, p.currency)}${(p.source ?? "portal") === "broker_web" ? " (web)" : ""} (${formatDate(p.scraped_at)})`
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

      {openListing && (
        <ListingFicha
          listing={openListing}
          captacionId={captacionId}
          canEdit={canEdit}
          rescraping={updatingId === openListing.id}
          onClose={() => setOpenId(null)}
          onRescrape={() => scrapeUrl(openListing.source_url, openListing.id)}
          onUpdated={replaceListing}
        />
      )}
    </div>
  );
}

// Ficha completa de un aviso de corredora: todo lo scrapeado del portal más
// la URL de la web interna de la corredora, que se chequea aparte para
// detectar cambios de precio o baja de la propiedad.
function ListingFicha({
  listing,
  captacionId,
  canEdit,
  rescraping,
  onClose,
  onRescrape,
  onUpdated,
}: {
  listing: Listing;
  captacionId: string;
  canEdit: boolean;
  rescraping: boolean;
  onClose: () => void;
  onRescrape: () => void;
  onUpdated: (listing: Listing) => void;
}) {
  const [brokerUrl, setBrokerUrl] = useState(listing.broker_website_url || "");
  const [savingBrokerUrl, setSavingBrokerUrl] = useState(false);
  const [checkingBroker, setCheckingBroker] = useState(false);
  const [fichaError, setFichaError] = useState("");

  const location = formatLocation(listing);

  async function saveBrokerUrl() {
    setFichaError("");
    setSavingBrokerUrl(true);
    try {
      const res = await fetch(
        `/api/admin/cl/captaciones/${captacionId}/listings/${listing.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ broker_website_url: brokerUrl.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setFichaError(data.error || "Error al guardar la URL");
        return;
      }
      onUpdated(data);
    } catch {
      setFichaError("Error de conexión");
    } finally {
      setSavingBrokerUrl(false);
    }
  }

  async function checkBrokerWebsite() {
    setFichaError("");
    setCheckingBroker(true);
    try {
      const res = await fetch(
        `/api/admin/cl/captaciones/${captacionId}/listings/${listing.id}/broker-check`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setFichaError(data.error || "Error al chequear la web de la corredora");
        return;
      }
      onUpdated(data);
    } catch {
      setFichaError("Error de conexión");
    } finally {
      setCheckingBroker(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 border-b border-ink/10 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-ink">
                {listing.broker_name || listing.source_site || "Corredora"}
              </h3>
              <OperationBadge operation={listing.operation} />
              {listing.external_reference && (
                <span className="flex items-center gap-1 rounded-full bg-ink/6 px-2 py-0.5 text-[10px] font-medium text-ink/60">
                  <Tag size={10} />
                  {listing.external_reference}
                </span>
              )}
            </div>
            {listing.title && (
              <p className="mt-1 text-sm text-ink/60">{listing.title}</p>
            )}
            <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[11px] text-ink/45">
              {listing.portal_publication_number && (
                <span>Publicación #{listing.portal_publication_number}</span>
              )}
              {listing.published_ago && <span>{listing.published_ago}</span>}
              {listing.scraped_at && (
                <span>Actualizado {formatDate(listing.scraped_at)}</span>
              )}
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            {canEdit && (
              <button
                onClick={onRescrape}
                disabled={rescraping}
                title="Re-scrapear el aviso del portal"
                className="rounded p-2 text-ink/50 hover:text-ink hover:bg-ink/5 disabled:opacity-50"
              >
                {rescraping ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded p-2 text-ink/50 hover:text-ink hover:bg-ink/5"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          {fichaError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {fichaError}
            </div>
          )}

          {/* Datos principales */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FichaRow label="Precio (portal)">
              {formatListingPrice(listing.price, listing.currency)}
            </FichaRow>
            {listing.bedrooms != null && (
              <FichaRow label="Dormitorios">{listing.bedrooms}</FichaRow>
            )}
            {listing.bathrooms != null && (
              <FichaRow label="Baños">{listing.bathrooms}</FichaRow>
            )}
            {listing.square_meters != null && (
              <FichaRow label="Superficie total">{listing.square_meters} m²</FichaRow>
            )}
            {listing.useful_square_meters != null && (
              <FichaRow label="Superficie útil">{listing.useful_square_meters} m²</FichaRow>
            )}
            {location && (
              <FichaRow label="Ubicación (portal)">{location}</FichaRow>
            )}
            {listing.address_scraped && (
              <FichaRow label="Dirección (del aviso)">{listing.address_scraped}</FichaRow>
            )}
          </div>

          {/* Web interna de la corredora: se guarda y se chequea aparte para
              detectar cambios de precio o baja del aviso */}
          <div className="rounded-xl border border-ink/10 bg-ink/3 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-ink/50" />
              <h4 className="text-sm font-semibold text-ink">Web de la corredora</h4>
            </div>
            <p className="text-xs text-ink/50">
              Pega la URL de esta misma propiedad en la web propia de la
              corredora para trackear si hubo cambios ahí también.
            </p>
            {canEdit && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={brokerUrl}
                  onChange={(e) => setBrokerUrl(e.target.value)}
                  placeholder="https://www.corredora.cl/propiedad/..."
                  className="flex-1 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                />
                <button
                  onClick={saveBrokerUrl}
                  disabled={savingBrokerUrl || brokerUrl.trim() === (listing.broker_website_url || "")}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
                >
                  {savingBrokerUrl && <Loader2 size={14} className="animate-spin" />}
                  Guardar
                </button>
              </div>
            )}
            {listing.broker_website_url && (
              <div className="flex items-center gap-3 flex-wrap text-xs text-ink/60">
                <a
                  href={listing.broker_website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-gold hover:underline"
                >
                  <ExternalLink size={11} />
                  Abrir web de la corredora
                </a>
                {canEdit && (
                  <button
                    onClick={checkBrokerWebsite}
                    disabled={checkingBroker}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-2.5 py-1 font-medium text-ink transition hover:bg-ink/5 disabled:opacity-50"
                  >
                    {checkingBroker ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    Chequear ahora
                  </button>
                )}
                {listing.broker_scraped_at && (
                  <span className="text-ink/45">
                    Último chequeo: {formatDate(listing.broker_scraped_at)}
                    {listing.broker_price != null &&
                      ` — ${formatListingPrice(listing.broker_price, listing.broker_currency)}`}
                  </span>
                )}
              </div>
            )}
            {listing.broker_scrape_error && (
              <p className="text-xs text-red-600">
                ⚠ {listing.broker_scrape_error}
              </p>
            )}
          </div>

          {/* Historial de precios con origen (portal vs web corredora) */}
          {(listing.prices?.length ?? 0) > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink">Historial de precios</h4>
              <div className="space-y-1">
                {listing.prices.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-ink/3 px-3 py-1.5 text-xs"
                  >
                    <span className="font-semibold text-ink">
                      {formatListingPrice(p.price, p.currency)}
                    </span>
                    <span className="text-ink/50">
                      {(p.source ?? "portal") === "broker_web" ? "Web corredora" : "Portal"}
                      {" · "}
                      {formatDate(p.scraped_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Descripción */}
          {listing.description && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink">Descripción</h4>
              <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink/70">
                {listing.description}
              </p>
            </div>
          )}

          {/* Características */}
          {(listing.features?.length ?? 0) > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink">
                Características ({listing.features!.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {listing.features!.map((feature, i) => (
                  <span key={i} className="rounded-full bg-ink/6 px-3 py-1 text-xs text-ink/70">
                    {feature}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Fotos */}
          {(listing.photo_urls?.length ?? 0) > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink">
                Fotos ({listing.photo_urls!.length})
              </h4>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {listing.photo_urls!.map((photo, i) => (
                  <a
                    key={i}
                    href={photo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-video overflow-hidden rounded-lg border border-ink/10 hover:border-gold/30"
                  >
                    <img
                      src={photo}
                      alt={`Foto ${i + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget.parentElement as HTMLElement).style.display = "none";
                      }}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          <a
            href={listing.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gold hover:underline"
          >
            <ExternalLink size={12} />
            Ver aviso original en el portal
          </a>
        </div>
      </div>
    </div>
  );
}

function FichaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-ink/50 uppercase tracking-wide">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{children}</p>
    </div>
  );
}
