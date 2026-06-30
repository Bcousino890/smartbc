"use client";

import { Globe2, Plus, Loader2, Check, X } from "lucide-react";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";

type ScrapedPreview = {
  title: string | null;
  price: number | null;
  currency: string | null;
  bedrooms: number | null;
  commune: string | null;
  cover_photo_url: string | null;
};

type CreateCaptacionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function CreateCaptacionModal({ isOpen, onClose, onCreated }: CreateCaptacionModalProps) {
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
  const [loading, setLoading] = useState(false);
  const urlDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!isOpen) return null;

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

    setLoading(true);
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

      // Reset form
      setFormData({
        source_url: "",
        currency: "clp",
        title: "",
        price: "",
        bedrooms: "",
        notes: "",
      });
      setScraped(null);
      onCreated();
      onClose();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-2xl border border-gold/15 bg-white/95 p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-ink">Nueva Captación</h2>
          <button
            onClick={onClose}
            className="text-ink/40 hover:text-ink"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
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
              rows={2}
              className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <button
              type="submit"
              disabled={scraping || loading}
              className="flex-1 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
            >
              {loading ? "Creando..." : "Crear Captación"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-ink/20 px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-ink/5"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
