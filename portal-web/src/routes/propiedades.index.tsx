import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { properties } from "@/data/properties";
import { PropertyCard } from "@/components/site/PropertyCard";

export const Route = createFileRoute("/propiedades/")({
  head: () => ({
    meta: [
      { title: "Propiedades — Benjamín Cousiño Propiedades" },
      { name: "description", content: "Catálogo de propiedades premium en España y Chile. Filtre por operación, país, ciudad y tipo." },
      { property: "og:title", content: "Propiedades — Benjamín Cousiño" },
      { property: "og:description", content: "Propiedades premium en España y Chile." },
    ],
  }),
  component: Catalog,
});

type Currency = "EUR" | "USD" | "UF" | "CLP";

// Tasas relativas a la base (priceNum ≈ EUR/USD)
const RATES: Record<Currency, number> = {
  EUR: 1,
  USD: 1,
  UF: 0.026, // 1 EUR ≈ 0,026 UF
  CLP: 1050, // 1 EUR ≈ 1.050 CLP
};

const STEPS: Record<Currency, number> = {
  EUR: 50_000,
  USD: 50_000,
  UF: 1_000,
  CLP: 50_000_000,
};

function formatCurrency(value: number, currency: Currency) {
  const locale = currency === "USD" ? "en-US" : "es-ES";
  const rounded = Math.round(value);
  return new Intl.NumberFormat(locale).format(rounded);
}

const COMUNAS_CHILE = [
  "Lo Barnechea", "Las Condes", "Vitacura", "Providencia", "Ñuñoa",
  "La Reina", "Huechuraba", "Colina / Chicureo",
  "Zapallar", "Cachagua", "Concón", "Viña del Mar", "Reñaca",
];

const ZONAS_ESPANA = [
  "Barrio Salamanca", "Chamberí", "Chamartín", "Centro", "Retiro",
  "Moncloa", "La Moraleja", "Pozuelo de Alarcón", "Aravaca",
  "Marbella Golden Mile", "La Zagaleta", "Sotogrande", "Ibiza", "Mallorca",
];


function Catalog() {
  const [op, setOp] = useState<"Todo" | "Venta" | "Alquiler">("Todo");
  const [country, setCountry] = useState<"Todo" | "España" | "Chile">("Todo");
  const [type, setType] = useState<"Todo" | "Apartamento" | "Penthouse" | "Casa / Villa">("Todo");
  const [currency, setCurrency] = useState<Currency>("EUR");

  // Rango en moneda base (EUR/USD ≈ priceNum)
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(10_000_000);

  const [minBeds, setMinBeds] = useState<number>(0);
  const [minBaths, setMinBaths] = useState<number>(0);
  const [minSqm, setMinSqm] = useState<number>(0);
  const [comunas, setComunas] = useState<string[]>([]);
  const [zonas, setZonas] = useState<string[]>([]);

  const toggleInList = (value: string, list: string[], setList: (v: string[]) => void) => {
    if (list.includes(value)) setList(list.filter((z) => z !== value));
    else if (list.length < 3) setList([...list, value]);
  };

  const filtered = useMemo(() => {
    const zoneFilter = [...comunas, ...zonas];
    const matchZone = (pZone: string) => zoneFilter.some((z) => {
      const a = pZone.toLowerCase(); const b = z.toLowerCase();
      return a.includes(b) || b.includes(a);
    });
    return properties.filter((p) =>
      (op === "Todo" || p.operation === op) &&
      (country === "Todo" || p.country === country) &&
      (type === "Todo" || p.type === type) &&
      p.priceNum >= minPrice &&
      p.priceNum <= maxPrice &&
      p.beds >= minBeds &&
      p.baths >= minBaths &&
      p.sqm >= minSqm &&
      (zoneFilter.length === 0 || matchZone(p.zone))
    );
  }, [op, country, type, minPrice, maxPrice, minBeds, minBaths, minSqm, comunas, zonas]);

  const rate = RATES[currency];
  const step = STEPS[currency];
  const displayMin = Math.round(minPrice * rate);
  const displayMax = Math.round(maxPrice * rate);
  const sliderMaxBase = 15_000_000;
  const sliderMaxDisplay = Math.round(sliderMaxBase * rate);

  const resetFilters = () => {
    setOp("Todo"); setCountry("Todo"); setType("Todo");
    setMinPrice(0); setMaxPrice(10_000_000);
    setMinBeds(0); setMinBaths(0); setMinSqm(0);
    setComunas([]); setZonas([]);
  };

  return (
    <div className="container-luxe py-16">
      <p className="text-[11px] tracking-[0.24em] uppercase text-muted-foreground">
        <Link to="/" className="hover:text-gold">Inicio</Link> / Propiedades
      </p>
      <div className="mt-6 flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-12 border-b border-border">
        <div>
          <h1 className="font-display text-5xl md:text-7xl text-navy">Nuestras Propiedades</h1>
          <p className="mt-3 text-sm tracking-wider text-muted-foreground">{filtered.length} propiedades · <Link to="/off-market" className="text-gold hover:text-navy">+ 1.800 off market →</Link></p>
        </div>
      </div>

      <div className="mt-12 grid lg:grid-cols-[280px_1fr] gap-12">
        {/* SIDEBAR */}
        <aside className="space-y-10 lg:sticky lg:top-28 lg:self-start">
          <Filter label="Operación" value={op} setValue={(v) => setOp(v as typeof op)} options={["Todo", "Venta", "Alquiler"]} />
          <Filter label="País" value={country} setValue={(v) => setCountry(v as typeof country)} options={["Todo", "España", "Chile"]} />
          <Filter label="Tipo de propiedad" value={type} setValue={(v) => setType(v as typeof type)} options={["Todo", "Apartamento", "Penthouse", "Casa / Villa"]} />

          {/* COMUNAS CHILE */}
          {(country === "Todo" || country === "Chile") && (
            <MultiChips
              label="Comunas (Chile)"
              options={COMUNAS_CHILE}
              selected={comunas}
              onToggle={(v) => toggleInList(v, comunas, setComunas)}
              max={3}
            />
          )}

          {/* ZONAS ESPAÑA */}
          {(country === "Todo" || country === "España") && (
            <MultiChips
              label="Zonas (España)"
              options={ZONAS_ESPANA}
              selected={zonas}
              onToggle={(v) => toggleInList(v, zonas, setZonas)}
              max={3}
            />
          )}


          {/* PRECIO */}
          <div>
            <p className="eyebrow">Precio</p>
            <div className="mt-3 grid grid-cols-4 gap-1">
              {(["EUR", "USD", "UF", "CLP"] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`py-2 text-[10px] tracking-[0.18em] uppercase border transition-colors ${currency === c ? "border-gold text-gold bg-gold/5" : "border-border text-navy/60 hover:text-navy"}`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Mín.</label>
                <input
                  type="number"
                  min={0}
                  step={step}
                  value={displayMin || ""}
                  placeholder="0"
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0;
                    setMinPrice(v / rate);
                  }}
                  className="mt-1 w-full border border-border bg-transparent px-3 py-2 text-sm text-navy focus:border-gold outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Máx.</label>
                <input
                  type="number"
                  min={0}
                  step={step}
                  value={displayMax || ""}
                  placeholder="∞"
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0;
                    setMaxPrice(v / rate);
                  }}
                  className="mt-1 w-full border border-border bg-transparent px-3 py-2 text-sm text-navy focus:border-gold outline-none"
                />
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={sliderMaxDisplay}
              step={step}
              value={displayMax}
              onChange={(e) => setMaxPrice(Number(e.target.value) / rate)}
              className="w-full mt-4 accent-[color:var(--gold)]"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Hasta <span className="text-navy">{formatCurrency(displayMax, currency)}</span> {currency}
            </p>
          </div>

          {/* DORMITORIOS */}
          <NumberFilter label="Dormitorios" value={minBeds} setValue={setMinBeds} options={[0, 1, 2, 3, 4, 5]} suffix="+" />
          {/* BAÑOS */}
          <NumberFilter label="Baños" value={minBaths} setValue={setMinBaths} options={[0, 1, 2, 3, 4]} suffix="+" />

          {/* SUPERFICIE */}
          <div>
            <p className="eyebrow">Superficie mínima</p>
            <div className="mt-4 flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={10}
                value={minSqm || ""}
                placeholder="0"
                onChange={(e) => setMinSqm(Number(e.target.value) || 0)}
                className="w-full border border-border bg-transparent px-3 py-2 text-sm text-navy focus:border-gold outline-none"
              />
              <span className="text-xs tracking-wider text-muted-foreground">m²</span>
            </div>
          </div>

          <button
            onClick={resetFilters}
            className="w-full border border-navy/30 py-3 text-[11px] tracking-[0.24em] uppercase text-navy hover:bg-navy hover:text-cream transition-colors"
          >
            Limpiar filtros
          </button>

          <div className="border border-gold/40 p-6 bg-cream-deep">
            <p className="eyebrow">+ 1.800 off market</p>
            <p className="mt-3 text-sm text-navy/80 leading-relaxed">
              Además de estas propiedades, disponemos de <span className="font-medium">1.800+ propiedades off market</span> en Santiago y Madrid, accesibles únicamente mediante solicitud privada.
            </p>
            <Link to="/off-market" className="mt-4 inline-flex items-center gap-2 text-[11px] tracking-[0.24em] uppercase text-gold hover:text-navy">
              Solicitar Acceso <ArrowRight size={14} />
            </Link>
          </div>
        </aside>

        {/* GRID */}
        <div>
          {filtered.length === 0 ? (
            <div className="text-center py-32 border border-dashed border-border">
              <p className="font-display text-3xl text-navy">Sin resultados</p>
              <p className="mt-2 text-muted-foreground">Pruebe otros filtros, o consulte nuestra cartera off market.</p>
              <div className="mt-6 flex justify-center gap-3">
                <button onClick={resetFilters} className="border border-navy px-6 py-3 text-[11px] tracking-[0.24em] uppercase text-navy hover:bg-navy hover:text-cream transition-colors">Ver Todas</button>
                <Link to="/off-market" className="border border-gold text-gold px-6 py-3 text-[11px] tracking-[0.24em] uppercase hover:bg-gold hover:text-navy transition-colors">Off Market →</Link>
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-8">
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
          <button
            key={o}
            onClick={() => setValue(o)}
            className={`text-left py-2 text-sm tracking-wide border-b border-border/50 transition-colors ${value === o ? "text-gold" : "text-navy/80 hover:text-navy"}`}
          >
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
          <button
            key={o}
            onClick={() => setValue(o)}
            className={`min-w-[44px] px-3 py-2 text-sm border transition-colors ${value === o ? "border-gold text-gold bg-gold/5" : "border-border text-navy/70 hover:text-navy"}`}
          >
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
        <span className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">{selected.length}/{max}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = selected.includes(o);
          const disabled = !active && selected.length >= max;
          return (
            <button
              key={o}
              onClick={() => onToggle(o)}
              disabled={disabled}
              className={`px-2.5 py-1.5 text-[11px] tracking-wide border transition-colors ${active ? "border-gold text-gold bg-gold/5" : "border-border text-navy/70 hover:text-navy"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

