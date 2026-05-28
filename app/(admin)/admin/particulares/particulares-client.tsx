"use client";

import { ExternalLink, MapPin, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";

export type ParticularRow = {
  id: string;
  portal: string;
  external_id: string;
  source_url: string;
  zone: string | null;
  price: number | null;
  operation: "rent" | "sale" | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  description: string | null;
  // Cada foto es { url, alt } (así las guarda el scraper), NO un string.
  photos: Array<{ url: string; alt?: string }> | null;
  detected_at: string | null;
  is_active: boolean;
};

const DATE_FMT = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function ParticularesClient({ rows }: { rows: ParticularRow[] }) {
  const [query, setQuery] = useState("");
  const [operation, setOperation] = useState<"" | "rent" | "sale">("");
  const [zone, setZone] = useState("");

  const zoneOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.zone).filter(Boolean))).sort() as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay =
          (r.zone?.toLowerCase().includes(q) ?? false) ||
          (r.description?.toLowerCase().includes(q) ?? false) ||
          r.external_id.toLowerCase().includes(q);
        if (!hay) return false;
      }
      if (operation && r.operation !== operation) return false;
      if (zone && r.zone !== zone) return false;
      return true;
    });
  }, [rows, query, operation, zone]);

  return (
    <section className="mt-5 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
          <Search size={15} strokeWidth={1.75} className="text-ink/45" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por zona, descripción o ref…"
            className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
          />
        </label>
        <select
          value={operation}
          onChange={(e) => setOperation(e.target.value as typeof operation)}
          className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-[13px] text-ink focus:border-gold/55 focus:outline-none"
        >
          <option value="">Operación: todas</option>
          <option value="rent">Alquiler</option>
          <option value="sale">Venta</option>
        </select>
        <select
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-[13px] text-ink focus:border-gold/55 focus:outline-none"
        >
          <option value="">Zona: todas</option>
          {zoneOptions.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[11px] text-ink/55">
          {filtered.length} de {rows.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gold/15 bg-white/40 px-4 py-12 text-center text-ink/55">
          No hay anuncios de particulares todavía. El scraper los detecta
          automáticamente cada 30 minutos.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => {
            const cover = r.photos?.[0]?.url;
            return (
              <a
                key={r.id}
                href={r.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-white transition hover:border-gold/50 hover:shadow-[0_12px_30px_-18px_rgba(40,28,10,0.35)]"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink/5">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt=""
                      className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ink/30">
                      sin foto
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded-md bg-ink/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream-50">
                    {r.operation === "rent" ? "Alquiler" : "Venta"}
                  </span>
                  <span className="absolute right-2 top-2 rounded-md bg-gold/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
                    {r.portal}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-3.5">
                  <div className="flex items-center gap-1.5 text-[12px] text-ink/60">
                    <MapPin size={12} strokeWidth={1.75} className="text-gold" />
                    <span>{r.zone ?? "Madrid"}</span>
                  </div>
                  <p className="mt-1 font-serif text-lg font-medium text-ink">
                    {r.price != null
                      ? `${formatPrice(r.price)}${r.operation === "rent" ? "/mes" : ""}`
                      : "Precio n/d"}
                  </p>
                  <p className="mt-1 text-[12px] text-ink/60">
                    {[
                      r.bedrooms != null ? `${r.bedrooms} hab` : null,
                      r.bathrooms != null ? `${r.bathrooms} baños` : null,
                      r.square_meters != null ? `${r.square_meters} m²` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-auto flex items-center justify-between pt-3 text-[11px] text-ink/45">
                    <span>
                      {r.detected_at
                        ? DATE_FMT.format(new Date(r.detected_at))
                        : ""}
                    </span>
                    <span className="inline-flex items-center gap-1 text-gold-dark group-hover:underline">
                      Ver anuncio
                      <ExternalLink size={11} strokeWidth={1.75} />
                    </span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
