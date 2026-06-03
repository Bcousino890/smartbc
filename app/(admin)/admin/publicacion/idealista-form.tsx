"use client";

import { useState } from "react";
import { Minus, Plus, Save } from "lucide-react";
import { cn } from "@/lib/utils";

export type IdealistaListing = {
  propertyId: string;
  // Tipo
  propertyType: string;
  // Localización
  addressStreet: string;
  addressNumber: string;
  addressPostalCode: string;
  addressCity: string;
  addressBlock: string;
  addressDoor: string;
  addressVisibility: "exact" | "street" | "hidden";
  // Características
  squareMeters: number;
  builtSquareMeters: number;
  floor: string;
  bedrooms: number;
  bathrooms: number;
  condition: "good" | "to-reform" | "needs-reform" | "new";
  // Precio
  price: number;
  totalRentalPrice: number;
  rentalType: "residential" | "temporary";
  maxTenants: number;
  petsAllowed: boolean;
  childrenRecommended: boolean;
  // Equipamiento
  equipmentType: "furnished" | "kitchen-only" | "empty" | "unknown";
  windowsLocation: "interior" | "exterior";
  hasElevator: boolean;
  // Orientación
  orientationNorth: boolean;
  orientationSouth: boolean;
  orientationEast: boolean;
  orientationWest: boolean;
  // Extras
  hasTerrace: boolean;
  hasBalcony: boolean;
  hasParking: boolean;
  hasStorage: boolean;
  hasPool: boolean;
  hasGarden: boolean;
  hasWardrobes: boolean;
  hasAC: boolean;
  // Tipos especiales
  isPenthouse: boolean;
  isStudio: boolean;
  isDuplex: boolean;
  // Energía
  energyClass: string;
  energyPerformance: number;
  emissionRating: string;
  emissionValue: number;
  // Contacto
  contactId: string;
  notes: string;
  // Media
  photos: string[];
  videos: string[];
  plans: string[];
};

const DEFAULTS: Omit<IdealistaListing, "propertyId"> = {
  propertyType: "flat",
  addressStreet: "",
  addressNumber: "",
  addressPostalCode: "",
  addressCity: "",
  addressBlock: "",
  addressDoor: "",
  addressVisibility: "exact",
  squareMeters: 0,
  builtSquareMeters: 0,
  floor: "",
  bedrooms: 0,
  bathrooms: 0,
  condition: "good",
  price: 0,
  totalRentalPrice: 0,
  rentalType: "residential",
  maxTenants: 0,
  petsAllowed: false,
  childrenRecommended: false,
  equipmentType: "unknown",
  windowsLocation: "exterior",
  hasElevator: false,
  orientationNorth: false,
  orientationSouth: false,
  orientationEast: false,
  orientationWest: false,
  hasTerrace: false,
  hasBalcony: false,
  hasParking: false,
  hasStorage: false,
  hasPool: false,
  hasGarden: false,
  hasWardrobes: false,
  hasAC: false,
  isPenthouse: false,
  isStudio: false,
  isDuplex: false,
  energyClass: "",
  energyPerformance: 0,
  emissionRating: "",
  emissionValue: 0,
  contactId: "",
  notes: "",
  photos: [],
  videos: [],
  plans: [],
};

// ── Micro-components ──────────────────────────────────────────────────────────

function SectionHeader({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3 pb-3 border-b border-ink/8">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-[11px] font-bold text-gold">
        {step}
      </span>
      <h3 className="font-serif text-base font-semibold text-ink">{title}</h3>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-ink/55 mb-1">{children}</label>
  );
}

const inputCls =
  "w-full rounded-lg border border-ink/12 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-gold/55 focus:outline-none transition";

const selectCls =
  "w-full rounded-lg border border-ink/12 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none transition";

function RadioGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
              value === opt.value
                ? "border-gold bg-gold/12 text-ink"
                : "border-ink/12 bg-white text-ink/55 hover:border-ink/25 hover:text-ink"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
        checked
          ? "border-gold bg-gold/12 text-ink"
          : "border-ink/12 bg-white text-ink/55 hover:border-ink/25 hover:text-ink"
      )}
    >
      {checked && <span className="mr-1 text-gold">✓</span>}
      {label}
    </button>
  );
}

function Stepper({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/12 bg-white text-ink/55 hover:bg-ink/5 hover:text-ink transition"
        >
          <Minus size={13} />
        </button>
        <span className="w-10 text-center text-sm font-semibold text-ink">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/12 bg-white text-ink/55 hover:bg-ink/5 hover:text-ink transition"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function IdealistaForm({
  propertyId,
  propertyTitle,
  initialData,
  onSave,
}: {
  propertyId: string;
  propertyTitle: string;
  initialData?: Partial<IdealistaListing>;
  onSave: (data: IdealistaListing) => Promise<void>;
}) {
  const [form, setForm] = useState<IdealistaListing>({
    ...DEFAULTS,
    ...initialData,
    propertyId,
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof IdealistaListing>(key: K, value: IdealistaListing[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="mb-2">
        <p className="text-xs text-ink/45 font-medium uppercase tracking-wide">
          Preparando ficha para Idealista
        </p>
        <h2 className="mt-0.5 font-serif text-xl font-semibold text-ink">
          {propertyTitle}
        </h2>
      </div>

      {/* ── 1. Tipo de inmueble ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader step={1} title="Tipo de inmueble" />
        <div>
          <Label>Tipo</Label>
          <select
            value={form.propertyType}
            onChange={(e) => set("propertyType", e.target.value)}
            className={selectCls}
          >
            <option value="flat">Piso</option>
            <option value="house">Casa</option>
            <option value="penthouse">Ático</option>
            <option value="studio">Estudio / Loft</option>
            <option value="duplex">Dúplex</option>
            <option value="semi-detached">Adosado / Pareado</option>
            <option value="chalet">Chalet independiente</option>
            <option value="villa">Villa</option>
            <option value="land">Solar / Terreno</option>
            <option value="office">Oficina</option>
            <option value="local">Local comercial</option>
            <option value="storage">Trastero</option>
            <option value="garage">Garaje</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip label="Ático" checked={form.isPenthouse} onChange={(v) => set("isPenthouse", v)} />
          <Chip label="Estudio" checked={form.isStudio} onChange={(v) => set("isStudio", v)} />
          <Chip label="Dúplex" checked={form.isDuplex} onChange={(v) => set("isDuplex", v)} />
        </div>
      </section>

      {/* ── 2. Localización ────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader step={2} title="Localización" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label>Calle</Label>
            <input
              type="text"
              value={form.addressStreet}
              onChange={(e) => set("addressStreet", e.target.value)}
              placeholder="Calle Mayor"
              className={inputCls}
            />
          </div>
          <div>
            <Label>Número</Label>
            <input
              type="text"
              value={form.addressNumber}
              onChange={(e) => set("addressNumber", e.target.value)}
              placeholder="12"
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Código postal</Label>
            <input
              type="text"
              value={form.addressPostalCode}
              onChange={(e) => set("addressPostalCode", e.target.value)}
              placeholder="28001"
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Ciudad / Municipio</Label>
            <input
              type="text"
              value={form.addressCity}
              onChange={(e) => set("addressCity", e.target.value)}
              placeholder="Madrid"
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Planta</Label>
            <input
              type="text"
              value={form.floor}
              onChange={(e) => set("floor", e.target.value)}
              placeholder="2ª"
              className={inputCls}
            />
          </div>
          <div>
            <Label>Bloque / Portal</Label>
            <input
              type="text"
              value={form.addressBlock}
              onChange={(e) => set("addressBlock", e.target.value)}
              placeholder="A"
              className={inputCls}
            />
          </div>
          <div>
            <Label>Puerta</Label>
            <input
              type="text"
              value={form.addressDoor}
              onChange={(e) => set("addressDoor", e.target.value)}
              placeholder="3ª"
              className={inputCls}
            />
          </div>
        </div>

        <RadioGroup
          label="Visibilidad de la dirección"
          value={form.addressVisibility}
          onChange={(v) => set("addressVisibility", v)}
          options={[
            { value: "exact", label: "Dirección exacta" },
            { value: "street", label: "Solo calle" },
            { value: "hidden", label: "Ocultar dirección" },
          ]}
        />
      </section>

      {/* ── 3. Características ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader step={3} title="Características" />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label>Superficie útil (m²)</Label>
            <input
              type="number"
              min={0}
              value={form.squareMeters || ""}
              onChange={(e) => set("squareMeters", Number(e.target.value))}
              placeholder="80"
              className={inputCls}
            />
          </div>
          <div>
            <Label>Superficie construida (m²)</Label>
            <input
              type="number"
              min={0}
              value={form.builtSquareMeters || ""}
              onChange={(e) => set("builtSquareMeters", Number(e.target.value))}
              placeholder="95"
              className={inputCls}
            />
          </div>
          <Stepper label="Habitaciones" value={form.bedrooms} onChange={(v) => set("bedrooms", v)} />
          <Stepper label="Baños" value={form.bathrooms} onChange={(v) => set("bathrooms", v)} min={0} />
        </div>

        <RadioGroup
          label="Estado del inmueble"
          value={form.condition}
          onChange={(v) => set("condition", v)}
          options={[
            { value: "good", label: "Buen estado" },
            { value: "to-reform", label: "Para reformar" },
            { value: "needs-reform", label: "Necesita reforma" },
            { value: "new", label: "Obra nueva" },
          ]}
        />
      </section>

      {/* ── 4. Precio ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader step={4} title="Precio y condiciones" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Precio (€)</Label>
            <input
              type="number"
              min={0}
              value={form.price || ""}
              onChange={(e) => set("price", Number(e.target.value))}
              placeholder="250000"
              className={inputCls}
            />
          </div>
          <div>
            <Label>Precio total alquiler con gastos (€/mes)</Label>
            <input
              type="number"
              min={0}
              value={form.totalRentalPrice || ""}
              onChange={(e) => set("totalRentalPrice", Number(e.target.value))}
              placeholder="1200"
              className={inputCls}
            />
          </div>
        </div>

        <RadioGroup
          label="Tipo de alquiler"
          value={form.rentalType}
          onChange={(v) => set("rentalType", v)}
          options={[
            { value: "residential", label: "Residencial" },
            { value: "temporary", label: "Temporal" },
          ]}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Máximo de inquilinos</Label>
            <input
              type="number"
              min={0}
              value={form.maxTenants || ""}
              onChange={(e) => set("maxTenants", Number(e.target.value))}
              placeholder="2"
              className={inputCls}
            />
          </div>
          <div className="flex flex-col justify-end pb-0.5">
            <Label>Mascotas permitidas</Label>
            <div className="flex gap-1.5 mt-1">
              <Chip label="Sí" checked={form.petsAllowed} onChange={(v) => set("petsAllowed", v)} />
              <Chip label="No" checked={!form.petsAllowed} onChange={(v) => set("petsAllowed", !v)} />
            </div>
          </div>
          <div className="flex flex-col justify-end pb-0.5">
            <Label>Apto para niños</Label>
            <div className="flex gap-1.5 mt-1">
              <Chip label="Sí" checked={form.childrenRecommended} onChange={(v) => set("childrenRecommended", v)} />
              <Chip label="No" checked={!form.childrenRecommended} onChange={(v) => set("childrenRecommended", !v)} />
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Equipamiento y extras ───────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader step={5} title="Equipamiento y extras" />

        <RadioGroup
          label="Equipamiento"
          value={form.equipmentType}
          onChange={(v) => set("equipmentType", v)}
          options={[
            { value: "furnished", label: "Cocina equipada + amueblado" },
            { value: "kitchen-only", label: "Cocina equipada (sin muebles)" },
            { value: "empty", label: "Vacía" },
            { value: "unknown", label: "No lo sé" },
          ]}
        />

        <RadioGroup
          label="Orientación de las ventanas"
          value={form.windowsLocation}
          onChange={(v) => set("windowsLocation", v)}
          options={[
            { value: "exterior", label: "Exterior" },
            { value: "interior", label: "Interior" },
          ]}
        />

        <div>
          <Label>Ascensor</Label>
          <div className="flex gap-1.5">
            <Chip label="Sí" checked={form.hasElevator} onChange={(v) => set("hasElevator", v)} />
            <Chip label="No" checked={!form.hasElevator} onChange={(v) => set("hasElevator", !v)} />
          </div>
        </div>

        <div>
          <Label>Orientación cardinal</Label>
          <div className="flex flex-wrap gap-1.5">
            <Chip label="Norte" checked={form.orientationNorth} onChange={(v) => set("orientationNorth", v)} />
            <Chip label="Sur" checked={form.orientationSouth} onChange={(v) => set("orientationSouth", v)} />
            <Chip label="Este" checked={form.orientationEast} onChange={(v) => set("orientationEast", v)} />
            <Chip label="Oeste" checked={form.orientationWest} onChange={(v) => set("orientationWest", v)} />
          </div>
        </div>

        <div>
          <Label>Otras características</Label>
          <div className="flex flex-wrap gap-1.5">
            <Chip label="Terraza" checked={form.hasTerrace} onChange={(v) => set("hasTerrace", v)} />
            <Chip label="Balcón" checked={form.hasBalcony} onChange={(v) => set("hasBalcony", v)} />
            <Chip label="Garaje" checked={form.hasParking} onChange={(v) => set("hasParking", v)} />
            <Chip label="Trastero" checked={form.hasStorage} onChange={(v) => set("hasStorage", v)} />
            <Chip label="Piscina" checked={form.hasPool} onChange={(v) => set("hasPool", v)} />
            <Chip label="Jardín" checked={form.hasGarden} onChange={(v) => set("hasGarden", v)} />
            <Chip label="Armarios empotrados" checked={form.hasWardrobes} onChange={(v) => set("hasWardrobes", v)} />
            <Chip label="Aire acondicionado" checked={form.hasAC} onChange={(v) => set("hasAC", v)} />
          </div>
        </div>
      </section>

      {/* ── 6. Eficiencia energética ───────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader step={6} title="Eficiencia energética" />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label>Calificación energética</Label>
            <select
              value={form.energyClass}
              onChange={(e) => set("energyClass", e.target.value)}
              className={selectCls}
            >
              <option value="">Sin calificación</option>
              {["A", "B", "C", "D", "E", "F", "G"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="pending">En trámite</option>
            </select>
          </div>
          <div>
            <Label>Consumo (kWh/m² año)</Label>
            <input
              type="number"
              min={0}
              value={form.energyPerformance || ""}
              onChange={(e) => set("energyPerformance", Number(e.target.value))}
              placeholder="120"
              className={inputCls}
            />
          </div>
          <div>
            <Label>Calificación emisiones</Label>
            <select
              value={form.emissionRating}
              onChange={(e) => set("emissionRating", e.target.value)}
              className={selectCls}
            >
              <option value="">Sin calificación</option>
              {["A", "B", "C", "D", "E", "F", "G"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="pending">En trámite</option>
            </select>
          </div>
          <div>
            <Label>Emisiones (kgCO₂/m² año)</Label>
            <input
              type="number"
              min={0}
              value={form.emissionValue || ""}
              onChange={(e) => set("emissionValue", Number(e.target.value))}
              placeholder="35"
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {/* ── 7. Contacto e info interna ─────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader step={7} title="Contacto e info interna" />

        <div>
          <Label>ID de contacto en Idealista</Label>
          <input
            type="text"
            value={form.contactId}
            onChange={(e) => set("contactId", e.target.value)}
            placeholder="Dejar vacío si no se conoce aún"
            className={inputCls}
          />
        </div>

        <div>
          <Label>Notas internas (no se publican)</Label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            placeholder="Observaciones para el equipo..."
            className={cn(inputCls, "resize-none")}
          />
        </div>
      </section>

      {/* ── 8. Media ──────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader step={8} title="Fotos, videos y planos" />

        <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-xs text-amber-700">
          <strong>Subida manual:</strong> La API de Idealista está en fase beta y no está disponible aún.
          Sube las fotos, videos y planos directamente en el panel de Idealista. Una vez publicado el anuncio,
          puedes anotar aquí los IDs asignados por Idealista para referencias futuras.
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>IDs de fotos (Idealista)</Label>
            <textarea
              value={form.photos.join("\n")}
              onChange={(e) =>
                set(
                  "photos",
                  e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                )
              }
              rows={3}
              placeholder="Un ID por línea"
              className={cn(inputCls, "resize-none text-xs font-mono")}
            />
          </div>
          <div>
            <Label>IDs de videos (Idealista)</Label>
            <textarea
              value={form.videos.join("\n")}
              onChange={(e) =>
                set(
                  "videos",
                  e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                )
              }
              rows={3}
              placeholder="Un ID por línea"
              className={cn(inputCls, "resize-none text-xs font-mono")}
            />
          </div>
          <div>
            <Label>IDs de planos (Idealista)</Label>
            <textarea
              value={form.plans.join("\n")}
              onChange={(e) =>
                set(
                  "plans",
                  e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                )
              }
              rows={3}
              placeholder="Un ID por línea"
              className={cn(inputCls, "resize-none text-xs font-mono")}
            />
          </div>
        </div>
      </section>

      {/* ── Guardar ───────────────────────────────────────────────────────── */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-cream-50 transition hover:bg-ink/85 disabled:opacity-50"
        >
          <Save size={15} />
          {saving ? "Guardando..." : "Guardar borrador"}
        </button>
      </div>
    </form>
  );
}
