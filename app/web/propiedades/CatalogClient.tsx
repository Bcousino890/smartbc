"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Property } from "@/lib/portal-properties";
import { PropertyCard } from "../_components/PropertyCard";

type Currency = "EUR" | "USD" | "UF" | "CLP";

const RATES: Record<Currency, number> = {
  EUR: 1,
  USD: 1,
  UF: 0.026,
  CLP: 1050,
};

const STEPS: Record<Currency, number> = {
  EUR: 50_000,
  USD: 50_000,
  UF: 1_000,
  CLP: 50_000_000,
};

function formatCurrency(value: number, currency: Currency) {
  const locale = currency === "USD" ? "en-US" : "es-ES";
  return new Intl.NumberFormat(locale).format(Math.round(value));
}

const COMUNAS_CHILE = [
  "Lo Barnechea", "Las Condes", "Vitacura", "Providencia",
  "Zapallar", "Cachagua", "Concón", "Viña del Mar",
];

const ZONAS_ESPANA = [
  "Barrio Salamanca", "Chamberí", "Chamartín", "Centro",
  "La Moraleja", "Pozuelo de Alarcón", "Marbella Golden Mile",
];

export default function CatalogClient({ allProperties }: { allProperties: Property[] }) {
  const [op, setOp] = useState<"Todo" | "Venta" | "Alquiler">("Todo");
  const [country, setCountry] = useState<"Todo" | "España" | "Chile">("Todo");
  const [type, setType] = useState<"Todo" | "Apartamento" | "Penthouse" | "Casa / Villa">("Todo");
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(100_000_000);
  const [minBeds, setMinBeds] = useState<number>(0);
  const [minBaths, setMinBaths] = useState<number>(0);
  const [minSqm, setMinSqm] = useState<number>(0);
  const [stayDuration, setStayDuration] = useState<"Todo" | "Corta" | "Larga">("Todo");
  const [comunas, setComunas] = useState<string[]>([]);
  const [zonas, setZonas] = useState<string[]>([]);

  const toggleInList = (value: string, list: string[], setList: (v: string[]) => void) => {
    if (list.includes(value)) setList(list.filter((z) => z !== value));
    else if (list.length < 3) setList([...list, value]);
  };

  const filtered = useMemo(() => {
    const zoneFilter = [...comunas, ...zonas];
    return allProperties.filter((p) => {
      const operationMatch = op === "Todo" || p.operation === op;
      const countryMatch = country === "Todo" || p.country === country;
      const typeMatch = type === "Todo" || p.type === type;
      const priceMatch = p.priceNum >= minPrice && p.priceNum <= maxPrice;
      const bedsMatch = p.beds >= minBeds;
      const bathsMatch = p.baths >= minBaths;
      const sqmMatch = p.sqm >= minSqm;
      const zoneMatch = zoneFilter.length === 0 || zoneFilter.some((z) => {
        const a = p.zone.toLowerCase(); const b = z.toLowerCase();
        return a.includes(b) || b.includes(a);
      });

      let stayDurationMatch = true;
      if (p.operation === "Alquiler" && stayDuration !== "Todo") {
        stayDurationMatch = (p as any).stayDuration === stayDuration;
      }

      return operationMatch && countryMatch && typeMatch && priceMatch && bedsMatch && bathsMatch && sqmMatch && zoneMatch && stayDurationMatch;
    });
  }, [allProperties, op, country, type, minPrice, maxPrice, minBeds, minBaths, minSqm, stayDuration, comunas, zonas]);

  const rate = RATES[currency];
  const step = STEPS[currency];
  const displayMax = Math.round(maxPrice * rate);
  const sliderMaxDisplay = Math.round(100_000_000 * rate);

  const resetFilters = () => {
    setOp("Todo"); setCountry("Todo"); setType("Todo");
    setMinPrice(0); setMaxPrice(100_000_000);
    setMinBeds(0); setMinBaths(0); setMinSqm(0);
    setStayDuration("Todo");
    setComunas([]); setZonas([]);
  };

  return (
    <div className="container-luxe py-16">
      <p className="text-[11px] tracking-[0.24em] uppercase text-gray-400">
        <Link href="/web" className="hover:text-gold">Inicio</Link> / Propiedades
      </p>
      <div className="mt-6 flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-12 border-b border-stone-200">
        <div>
          <h1 className="font-display text-5xl md:text-7xl text-navy">Nuestras Propiedades</h1>
          <p className="mt-3 text-sm tracking-wider text-gray-500">{filtered.length} propiedades · <Link href="/web/off-market" className="text-gold hover:text-navy">+ 1.800 off market →</Link></p>
        </div>
      </div>

      <div className="mt-12 grid lg:grid-cols-[280px_1fr] gap-12">
        {/* SIDEBAR */}
        <aside className="space-y-10 lg:sticky lg:top-28 lg:self-start">
          <Filter label="Operación" value={op} setValue={(v) => setOp(v as typeof op)} options={["Todo", "Venta", "Alquiler"]} />
          <Filter label="País" value={country} setValue={(v) => setCountry(v as typeof country)} options={["Todo", "España", "Chile"]} />
          <Filter label="Tipo de propiedad" value={type} setValue={(v) => setType(v as typeof type)} options={["Todo", "Apartamento", "Penthouse", "Casa / Villa"]} />

          {(op === "Todo" || op === "Alquiler") && (
            <Filter label="Duración de estancia" value={stayDuration} setValue={(v) => setStayDuration(v as typeof stayDuration)} options={["Todo", "Corta", "Larga"]} />
          )}

          {(country === "Todo" || country === "Chile") && (
            <MultiChips label="Comunas (Chile)" options={COMUNAS_CHILE} selected={comunas} onToggle={(v) => toggleInList(v, comunas, setComunas)} max={3} />
          )}
          {(country === "Todo" || country === "España") && (
            <MultiChips label="Zonas (España)" options={ZONAS_ESPANA} selected={zonas} onToggle={(v) => toggleInList(v, zonas, setZonas)} max={3} />
          )}

          {/* PRECIO */}
          <div>
            <p className="eyebrow">Precio</p>
            <div className="mt-3 grid grid-cols-4 gap-1">
              {(["EUR", "USD", "UF", "CLP"] as Currency[]).map((c) => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`py-2 text-[10px] tracking-[0.18em] uppercase border transition-colors ${currency === c ? "border-gold text-gold bg-gold/5" : "border-stone-200 text-navy/60 hover:text-navy"}`}>
                  {c}
                </button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] tracking-[0.2em] uppercase text-gray-400">Máx.</span>
                <input type="number" min={0} step={step} value={displayMax || ""} placeholder="∞"
                  onChange={(e) => setMaxPrice((Number(e.target.value) || 0) / rate)}
                  className="mt-1 w-full border border-stone-200 bg-transparent px-3 py-2 text-sm text-navy focus:border-gold outline-none" />
              </label>
            </div>
            <input type="range" min={0} max={sliderMaxDisplay} step={step} value={displayMax}
              onChange={(e) => setMaxPrice(Number(e.target.value) / rate)}
              className="w-full mt-4 accent-[color:#c9a96e]" />
            <p className="mt-1 text-xs text-gray-400">
              Hasta <span className="text-navy">{formatCurrency(displayMax, currency)}</span> {currency}
            </p>
          </div>

          <NumberFilter label="Dormitorios" value={minBeds} setValue={setMinBeds} options={[0, 1, 2, 3, 4, 5]} suffix="+" />
          <NumberFilter label="Baños" value={minBaths} setValue={setMinBaths} options={[0, 1, 2, 3, 4]} suffix="+" />

          <div>
            <p className="eyebrow">Superficie mínima</p>
            <div className="mt-4 flex items-center gap-2">
              <input type="number" min={0} step={10} value={minSqm || ""} placeholder="0"
                onChange={(e) => setMinSqm(Number(e.target.value) || 0)}
                className="w-full border border-stone-200 bg-transparent px-3 py-2 text-sm text-navy focus:border-gold outline-none" />
              <span className="text-xs tracking-wider text-gray-400">m²</span>
            </div>
          </div>

          <button onClick={resetFilters} className="w-full border border-navy/30 py-3 text-[11px] tracking-[0.24em] uppercase text-navy hover:bg-navy hover:text-cream transition-colors">
            Limpiar filtros
          </button>

          <div className="border border-gold/40 p-6 bg-cream-deep">
            <p className="eyebrow">+ 1.800 off market</p>
            <p className="mt-3 text-sm text-navy/80 leading-relaxed">
              Disponemos de <span className="font-medium">1.800+ propiedades off market</span> accesibles únicamente mediante solicitud privada.
            </p>
            <Link href="/web/off-market" className="mt-4 inline-flex items-center gap-2 text-[11px] tracking-[0.24em] uppercase text-gold hover:text-navy">
              Solicitar Acceso <ArrowRight size={14} />
            </Link>
          </div>
        </aside>

        {/* GRID */}
        <div>
          {filtered.length === 0 ? (
            <div className="text-center py-32 border border-dashed border-stone-200">
              <p className="font-display text-3xl text-navy">Sin resultados</p>
              <p className="mt-2 text-gray-500">Pruebe otros filtros, o consulte nuestra cartera off market.</p>
              <div className="mt-6 flex justify-center gap-3">
                <button onClick={resetFilters} className="border border-navy px-6 py-3 text-[11px] tracking-[0.24em] uppercase text-navy hover:bg-navy hover:text-cream transition-colors">Ver Todas</button>
                <Link href="/web/off-market" className="border border-gold text-gold px-6 py-3 text-[11px] tracking-[0.24em] uppercase hover:bg-gold hover:text-navy transition-colors">Off Market →</Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 auto-rows-max">
              {filtered.map((p) => <PropertyCard key={p.id} p={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Filter({ label, value, setValue, options }: { label: string; value: string; setValue: (v: string) => void; options: string[] }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <div className="mt-4 flex flex-col">
        {options.map((o) => (
          <button key={o} onClick={() => setValue(o)}
            className={`text-left py-2 text-sm tracking-wide border-b border-stone-200/50 transition-colors ${value === o ? "text-gold" : "text-navy/80 hover:text-navy"}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberFilter({ label, value, setValue, options, suffix = "" }: { label: string; value: number; setValue: (v: number) => void; options: number[]; suffix?: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} onClick={() => setValue(o)}
            className={`min-w-[44px] px-3 py-2 text-sm border transition-colors ${value === o ? "border-gold text-gold bg-gold/5" : "border-stone-200 text-navy/70 hover:text-navy"}`}>
            {o === 0 ? "Todo" : `${o}${suffix}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiChips({ label, options, selected, onToggle, max }: { label: string; options: string[]; selected: string[]; onToggle: (v: string) => void; max: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">{label}</p>
        <span className="text-[10px] tracking-[0.18em] uppercase text-gray-400">{selected.length}/{max}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = selected.includes(o);
          const disabled = !active && selected.length >= max;
          return (
            <button key={o} onClick={() => onToggle(o)} disabled={disabled}
              className={`px-2.5 py-1.5 text-[11px] tracking-wide border transition-colors ${active ? "border-gold text-gold bg-gold/5" : "border-stone-200 text-navy/70 hover:text-navy"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
