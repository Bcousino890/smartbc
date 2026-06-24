"use client";

import { Globe2, Plus, MapPin, Loader2, Check, X } from "lucide-react";
import Link from "next/link";
import { useState, useRef } from "react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { cn } from "@/lib/utils";
import type { Captacion } from "./actions";

type CaptacionesClientProps = {
  captaciones: Captacion[];
  userRole: string;
};

type ScrapedPreview = {
  title: string | null;
  price: number | null;
  currency: string | null;
  bedrooms: number | null;
  commune: string | null;
  cover_photo_url: string | null;
};

export function CaptacionesClient({ captaciones, userRole }: CaptacionesClientProps) {
  const [creating, setCreating] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scraped, setScraped] = useState<ScrapedPreview | null>(null);
  const [scrapeError, setScrapeError] = useState("");
  const [formData, setFormData] = useState({
    source_url: "",
    currency: "clp" as "uf" | "clp",
    title: "",
    price: "",
    bedrooms: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const urlDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCaptadora = userRole === "captadora";

  async function handleUrlChange(url: string) {
    setFormData((prev) => ({ ...prev, source_url: url }));
    setScrapeError("");
    setScraped(null);

    if (!url || !url.startsWith("http")) return;

    if (urlDebounce.current) clearTimeout(urlDebounce.current);
    urlDebounce.current = setTimeout(async () => {
      setScraping(true);
      try {
        const res = await fetch("/api/admin/cl/captaciones/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok) {
          setScrapeError(data.error || "No se pudo obtener datos");
        } else {
          const s = data.scraped as ScrapedPreview;
          setScraped(s);
          setFormData((prev) => ({
            ...prev,
            title: s.title || prev.title,
            price: s.price ? String(s.price) : prev.price,
            currency: (s.currency as "uf" | "clp") || prev.currency,
            bedrooms: s.bedrooms ? String(s.bedrooms) : prev.bedrooms,
          }));
        }
      } catch {
        setScrapeError("Error de conexión al scrapear");
      } finally {
        setScraping(false);
      }
    }, 800);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!formData.source_url.trim()) {
      setError("URL es requerida");
      return;
    }

    try {
      const res = await fetch("/api/admin/cl/captaciones/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_url: formData.source_url,
          title: formData.title || null,
          price: formData.price ? parseFloat(formData.price) : null,
          currency: formData.currency,
          bedrooms: formData.bedrooms ? parseInt(formData.bedrooms) : null,
          notes: formData.notes || null,
          cover_photo_url: scraped?.cover_photo_url || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al crear captación");
        return;
      }

      const created = await res.json();
      window.location.href = `/cl/admin/captaciones/${created.id}`;
    } catch {
      setError("Error de conexión");
    }
  }

  function formatPrice(c: Captacion) {
    if (!c.price) return null;
    if (c.currency === "uf") return `UF ${c.price.toLocaleString("es-CL")}`;
    return `$${(c.price / 1_000_000).toFixed(0)}M`;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="admin.nav.captaciones"
        subtitleKey="Prospección de propiedades - Agentes crean, captadoras completan info"
      />

      {/* Crear Captación (solo agentes/admins) */}
      {!isCaptadora && (
        <section className="mb-8 rounded-2xl border border-gold/15 bg-white/70 p-6">
          <button
            onClick={() => setCreating(!creating)}
            className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink/90"
          >
            <Plus size={16} />
            Nueva Captación
          </button>

          {creating && (
            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              {/* URL */}
              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">
                  URL de la propiedad *
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={formData.source_url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="https://www.portalinmobiliario.com/..."
                    className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 pr-9 text-sm focus:border-gold/50 focus:outline-none"
                  />
                  {scraping && (
                    <Loader2 size={15} className="absolute right-3 top-2.5 animate-spin text-ink/40" />
                  )}
                  {scraped && !scraping && (
                    <Check size={15} className="absolute right-3 top-2.5 text-emerald-500" />
                  )}
                </div>
                {scrapeError && (
                  <p className="mt-1 text-xs text-amber-600">{scrapeError} — puedes rellenar manualmente</p>
                )}
              </div>

              {/* Scraped preview */}
              {scraped?.cover_photo_url && (
                <div className="flex gap-3 rounded-xl border border-gold/20 bg-gold/5 p-3">
                  <img
                    src={scraped.cover_photo_url}
                    alt="preview"
                    className="h-20 w-28 rounded-lg object-cover flex-shrink-0"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                  <div className="text-sm text-ink/80">
                    <p className="font-medium line-clamp-2">{scraped.title || "Sin título"}</p>
                    {scraped.commune && <p className="text-xs mt-1 text-ink/55">{scraped.commune}</p>}
                    <p className="text-xs mt-0.5 text-emerald-600 font-medium">
                      Datos importados automáticamente
                    </p>
                  </div>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Título / descripción</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Casa en Las Condes"
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                />
              </div>

              {/* Price + currency */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-ink/70 mb-1">Precio</label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder={formData.currency === "uf" ? "4500" : "450000000"}
                    className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">Moneda</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value as "uf" | "clp" })}
                    className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                  >
                    <option value="clp">CLP ($)</option>
                    <option value="uf">UF</option>
                  </select>
                </div>
              </div>

              {/* Bedrooms */}
              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Dormitorios</label>
                <input
                  type="number"
                  value={formData.bedrooms}
                  onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
                  placeholder="3"
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Notas iniciales</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notas sobre la propiedad..."
                  rows={3}
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={scraping}
                  className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
                >
                  {scraping ? "Scrapeando..." : "Crear Captación"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setScraped(null);
                    setScrapeError("");
                  }}
                  className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Listado */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-ink/70">
          {isCaptadora ? "Mis Captaciones Asignadas" : "Captaciones Creadas"}
        </h2>

        {captaciones.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/15 py-12 text-center">
            <Globe2 size={32} className="mx-auto mb-3 text-ink/25" />
            <p className="text-sm text-ink/50">
              {isCaptadora ? "Sin captaciones asignadas" : "Sin captaciones creadas aún"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {captaciones.map((c) => (
              <Link
                key={c.id}
                href={`/cl/admin/captaciones/${c.id}`}
                className="flex gap-4 rounded-xl border border-gold/15 bg-white/70 p-4 transition hover:border-gold/30 hover:bg-white"
              >
                {c.cover_photo_url && (
                  <img
                    src={c.cover_photo_url}
                    alt=""
                    className="h-16 w-20 rounded-lg object-cover flex-shrink-0"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                )}
                <div className="flex flex-1 min-w-0 items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-ink line-clamp-1">
                      {c.title || "Sin título"}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/55">
                      {c.commune && (
                        <span className="flex items-center gap-1">
                          <MapPin size={11} />
                          {c.commune}
                        </span>
                      )}
                      {c.bedrooms && <span>{c.bedrooms}d</span>}
                      {c.price && <span>{formatPrice(c)}</span>}
                      {c.scrape_status === "scraped" && (
                        <span className="text-emerald-600 flex items-center gap-0.5">
                          <Check size={10} />
                          Scrapeado
                        </span>
                      )}
                      {c.scrape_status === "failed" && (
                        <span className="text-red-600 text-[10px]">❌ Error scrape</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] text-ink/40">
                      Hace {new Date(c.created_at).toLocaleDateString("es-CL")}
                    </p>
                  </div>

                  <div className="flex-shrink-0 text-right">
                    <div className={cn(
                      "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium",
                      c.status === "pending" && "bg-amber-100 text-amber-700",
                      c.status === "completed" && "bg-emerald-100 text-emerald-700",
                      c.status === "converted_to_property" && "bg-blue-100 text-blue-700",
                      c.status === "rejected" && "bg-red-100 text-red-700",
                    )}>
                      {c.status === "pending" && "Pendiente"}
                      {c.status === "completed" && "Completada"}
                      {c.status === "converted_to_property" && "Convertida"}
                      {c.status === "rejected" && "Rechazada"}
                    </div>
                    {c.owner_confirmed && (
                      <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-emerald-600">
                        <Check size={10} />
                        Dueño confirmado
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
