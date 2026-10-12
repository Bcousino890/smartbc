"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { DrawZoneFilter } from "@/components/admin/particulares/draw-zone-filter";
import type { ParticularesFiltersApi } from "../use-particulares-filters";
import { CONDITION_OPTIONS, ENERGY_LETTERS, EXTRA_OPTIONS, ORIENTATION_LABEL, POSITION_OPTIONS, RENTAL_KIND_LABEL, SINCE_LABEL, TYPE_GROUPS, VIEW_OPTIONS, splitCsv, toggleCsv } from "./filters-model";
import { ChoiceGroup, FOCUS_RING, NumberField, SelectField, SwitchRow } from "./controls";
import { RangeSlider } from "./range-slider";
import { fmtEur, fmtNum } from "./format";

function Section({ title, defaultOpen = true, active = false, children }: { title: string; defaultOpen?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group border-b border-ink/10 py-4">
      <summary className={`flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-ink ${FOCUS_RING}`}>
        <span className="flex items-center gap-2">
          {title}
          {active && (
            <span className="rounded-full bg-gold/30 px-2 py-0.5 text-[11px] font-semibold text-ink" aria-label="Filtro activo">
              activo
            </span>
          )}
        </span>
        <span aria-hidden className="text-ink/50 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

/** Pastillas de selección múltiple (cada una se activa/desactiva). */
function Toggles({ options, value, onToggle }: { options: Array<{ value: string; label: string }>; value: string; onToggle: (v: string) => void }) {
  const on = splitCsv(value);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = on.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(o.value)}
            className={`inline-flex h-10 items-center rounded-full border px-3.5 text-sm transition ${FOCUS_RING} ${active ? "border-gold-dark bg-gold/25 font-semibold text-ink" : "border-ink/15 bg-white font-medium text-ink/75 hover:border-ink/30 hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Casilla «número exacto» (dormitorios / baños). */
function ExactCheck({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink/80">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className={`h-4 w-4 rounded border-ink/30 accent-ink ${FOCUS_RING}`} />
      {label}
    </label>
  );
}

const Pair = ({ children }: { children: React.ReactNode }) => <div className="grid grid-cols-2 gap-2">{children}</div>;

/** Cajón lateral «Más filtros» (pantalla completa en móvil). Los filtros se aplican al instante. */
export function FiltersPanel({
  open,
  onClose,
  f,
  total,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  f: ParticularesFiltersApi;
  total: number;
  currentUserId?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const rent = f.operation === "rent";
  const priceMax = rent ? 5000 : 2_000_000;
  const priceStep = rent ? 50 : 10_000;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Más filtros"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-md"
      >
        <header className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Más filtros</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar filtros" className={`rounded-lg p-2 text-ink/70 hover:bg-ink/5 ${FOCUS_RING}`}>
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5">
          <Section title="Precio">
            <RangeSlider
              min={0}
              max={priceMax}
              step={priceStep}
              valueMin={f.priceMin}
              valueMax={f.priceMax}
              onChange={(v) => {
                f.setPriceMin(v.min);
                f.setPriceMax(v.max);
              }}
              labelMin="Precio mínimo"
              labelMax="Precio máximo"
            />
            <p className="text-xs text-ink/65">
              {f.priceMin ? fmtEur(Number(f.priceMin)) : "Sin mínimo"} – {f.priceMax ? fmtEur(Number(f.priceMax)) : "sin máximo"}
            </p>
            <Pair>
              <NumberField value={f.priceMin} onChange={f.setPriceMin} placeholder="Mínimo" suffix="€" ariaLabel="Precio mínimo" />
              <NumberField value={f.priceMax} onChange={f.setPriceMax} placeholder="Máximo" suffix="€" ariaLabel="Precio máximo" />
            </Pair>
          </Section>

          <Section title="Tipo de propiedad" active={splitCsv(f.types).length > 0}>
            {TYPE_GROUPS.map((g) => (
              <div key={g.label} className="space-y-1.5">
                <p className="text-xs font-medium text-ink/65">{g.label}</p>
                <Toggles options={g.options} value={f.types} onToggle={(v) => f.setTypes(toggleCsv(f.types, v))} />
              </div>
            ))}
          </Section>

          {f.operation === "rent" && (
            <Section title="Tipo de alquiler" active={Boolean(f.rentalKind)}>
              <ChoiceGroup
                ariaLabel="Tipo de alquiler"
                value={f.rentalKind}
                onChange={(v) => f.setRentalKind(v as typeof f.rentalKind)}
                options={[{ value: "", label: "Cualquiera" }, ...Object.entries(RENTAL_KIND_LABEL).map(([value, label]) => ({ value, label }))]}
              />
            </Section>
          )}

          <Section title="Dormitorios" active={Boolean(f.bedrooms)}>
            <ChoiceGroup
              ariaLabel="Dormitorios"
              value={f.bedrooms}
              onChange={f.setBedrooms}
              options={[
                { value: "", label: "Cualquiera" },
                ...(f.bedroomsExact ? [{ value: "0", label: "0 (estudio)" }] : []),
                ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: f.bedroomsExact && n < 6 ? String(n) : `${n}+` })),
              ]}
            />
            <ExactCheck checked={f.bedroomsExact} onChange={(v) => { f.setBedroomsExact(v); if (!v && f.bedrooms === "0") f.setBedrooms(""); }} label="Número exacto" />
          </Section>

          <Section title="Baños" active={Boolean(f.bathrooms)}>
            <ChoiceGroup
              ariaLabel="Baños"
              value={f.bathrooms}
              onChange={f.setBathrooms}
              options={[
                { value: "", label: "Cualquiera" },
                ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: f.bathroomsExact && n < 7 ? String(n) : `${n}+` })),
              ]}
            />
            <ExactCheck checked={f.bathroomsExact} onChange={f.setBathroomsExact} label="Número exacto" />
          </Section>

          <Section title="Superficie construida y parcela" active={Boolean(f.areaMin || f.areaMax || f.plotMin || f.plotMax)}>
            <p className="text-xs text-ink/65">Superficie construida</p>
            <Pair>
              <NumberField value={f.areaMin} onChange={f.setAreaMin} placeholder="Desde" suffix="m²" ariaLabel="Superficie construida mínima" />
              <NumberField value={f.areaMax} onChange={f.setAreaMax} placeholder="Hasta" suffix="m²" ariaLabel="Superficie construida máxima" />
            </Pair>
            <p className="pt-1 text-xs text-ink/65">Parcela</p>
            <Pair>
              <NumberField value={f.plotMin} onChange={f.setPlotMin} placeholder="Desde" suffix="m²" ariaLabel="Parcela mínima" />
              <NumberField value={f.plotMax} onChange={f.setPlotMax} placeholder="Hasta" suffix="m²" ariaLabel="Parcela máxima" />
            </Pair>
          </Section>

          <Section title="Precio por m²" active={Boolean(f.pricePerM2Min || f.pricePerM2Max)}>
            <Pair>
              <NumberField value={f.pricePerM2Min} onChange={f.setPricePerM2Min} placeholder="Desde" suffix="€/m²" ariaLabel="Precio por m² mínimo" />
              <NumberField value={f.pricePerM2Max} onChange={f.setPricePerM2Max} placeholder="Hasta" suffix="€/m²" ariaLabel="Precio por m² máximo" />
            </Pair>
          </Section>

          <Section title="Días en el mercado" active={Boolean(f.daysListed || f.daysMax || f.since)}>
            <p className="text-xs text-ink/65">Días desde que lo detectamos</p>
            <Pair>
              <NumberField value={f.daysListed} onChange={f.setDaysListed} placeholder="Desde" ariaLabel="Días en cartera: mínimo" />
              <NumberField value={f.daysMax} onChange={f.setDaysMax} placeholder="Hasta" ariaLabel="Días en cartera: máximo" />
            </Pair>
            <p className="pt-1 text-xs text-ink/65">Publicado</p>
            <ChoiceGroup
              ariaLabel="Publicado"
              value={f.since}
              onChange={f.setSince}
              options={[{ value: "", label: "Cualquier fecha" }, ...Object.entries(SINCE_LABEL).map(([value, label]) => ({ value, label }))]}
            />
          </Section>

          <Section title="Condición" active={Boolean(f.condition || f.yearMin || f.yearMax)}>
            <Toggles options={CONDITION_OPTIONS} value={f.condition} onToggle={(v) => f.setCondition(toggleCsv(f.condition, v))} />
            <p className="pt-1 text-xs text-ink/65">Año de construcción</p>
            <Pair>
              <NumberField value={f.yearMin} onChange={f.setYearMin} placeholder="Desde" ariaLabel="Año de construcción desde" />
              <NumberField value={f.yearMax} onChange={f.setYearMax} placeholder="Hasta" ariaLabel="Año de construcción hasta" />
            </Pair>
          </Section>

          <Section title="Planta, orientación y amueblado" active={Boolean(f.floorMin || f.floorMax || f.orientation || f.furnished || f.lift || splitCsv(f.extras).some((x) => x === "exterior" || x === "interior"))}>
            <p className="text-xs text-ink/65">Planta (0 = bajo)</p>
            <Pair>
              <SelectField ariaLabel="Planta mínima" value={f.floorMin} onChange={f.setFloorMin}>
                <option value="">Desde: cualquiera</option>
                <option value="0">Bajo</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 10].map((n) => (
                  <option key={n} value={n}>{n}.ª</option>
                ))}
              </SelectField>
              <SelectField ariaLabel="Planta máxima" value={f.floorMax} onChange={f.setFloorMax}>
                <option value="">Hasta: cualquiera</option>
                <option value="0">Bajo</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 10].map((n) => (
                  <option key={n} value={n}>{n}.ª</option>
                ))}
              </SelectField>
            </Pair>
            <Toggles options={POSITION_OPTIONS} value={f.extras} onToggle={(v) => f.setExtras(toggleCsv(f.extras, v))} />
            <p className="pt-1 text-xs text-ink/65">Orientación</p>
            <ChoiceGroup
              ariaLabel="Orientación"
              value={f.orientation}
              onChange={f.setOrientation}
              options={[{ value: "", label: "Cualquiera" }, ...Object.entries(ORIENTATION_LABEL).map(([value, label]) => ({ value, label }))]}
            />
            <p className="pt-1 text-xs text-ink/65">Muebles</p>
            <ChoiceGroup
              ariaLabel="Amueblado"
              value={f.furnished}
              onChange={(v) => f.setFurnished(v as typeof f.furnished)}
              options={[
                { value: "", label: "Da igual" },
                { value: "yes", label: "Amueblado" },
                { value: "no", label: "Sin amueblar" },
              ]}
            />
            <p className="pt-1 text-xs text-ink/65">Ascensor</p>
            <ChoiceGroup
              ariaLabel="Ascensor"
              value={f.lift}
              onChange={(v) => f.setLift(v as typeof f.lift)}
              options={[
                { value: "", label: "Da igual" },
                { value: "yes", label: "Con ascensor" },
                { value: "no", label: "Sin ascensor" },
              ]}
            />
          </Section>

          <Section title="Vistas" active={splitCsv(f.extras).some((x) => x.startsWith("vistas"))} defaultOpen={false}>
            <Toggles options={VIEW_OPTIONS} value={f.extras} onToggle={(v) => f.setExtras(toggleCsv(f.extras, v))} />
          </Section>

          <Section title="Características (deben tenerlas todas)" active={splitCsv(f.extras).some((x) => EXTRA_OPTIONS.some((o) => o.value === x))}>
            <Toggles options={EXTRA_OPTIONS} value={f.extras} onToggle={(v) => f.setExtras(toggleCsv(f.extras, v))} />
          </Section>

          <Section title="Calificación energética" active={Boolean(f.energy)} defaultOpen={false}>
            <Toggles
              options={ENERGY_LETTERS.map((l) => ({ value: l, label: l }))}
              value={f.energy}
              onToggle={(v) => f.setEnergy(toggleCsv(f.energy, v))}
            />
          </Section>

          <Section title="Captación" active={f.priceDrop !== ""} defaultOpen={false}>
            <SelectField ariaLabel="Bajada de precio" value={f.priceDrop} onChange={f.setPriceDrop}>
              <option value="">Bajada de precio: cualquiera</option>
              <option value="0">Ha bajado de precio</option>
              <option value="5">Bajó 5 % o más</option>
              <option value="10">Bajó 10 % o más</option>
              <option value="15">Bajó 15 % o más</option>
            </SelectField>
          </Section>

          <Section title="Contacto y gestión" active={Boolean(f.phoneFilter || f.gestion)} defaultOpen={false}>
            <ChoiceGroup
              ariaLabel="Teléfono"
              value={f.phoneFilter}
              onChange={(v) => f.setPhoneFilter(v as typeof f.phoneFilter)}
              options={[
                { value: "", label: "Teléfono: da igual" },
                { value: "with_phone", label: "Con teléfono" },
                { value: "no_phone", label: "Sin teléfono" },
              ]}
            />
            <SelectField ariaLabel="Gestión" value={f.gestion} onChange={(v) => f.setGestion(v as typeof f.gestion)}>
              <option value="">Gestión: todos</option>
              <option value="unmanaged">Sin gestionar</option>
              <option value="contacted">Ya contactados</option>
              <option value="assigned">Asignados</option>
              {currentUserId && <option value="mine">Asignados a mí</option>}
            </SelectField>
          </Section>

          <Section title="Ubicación en el mapa" active={Boolean(f.drawnZone || f.exactLocation)} defaultOpen={false}>
            <SwitchRow
              label="Solo ubicación exacta"
              description="Oculta los anuncios cuyo pin es aproximado (solo calle o barrio)."
              checked={f.exactLocation}
              onChange={f.setExactLocation}
            />
            <p className="pt-1 text-xs text-ink/65">Zona dibujada</p>
            <DrawZoneFilter value={f.drawnZone} onChange={f.setDrawnZone} />
          </Section>

          <div className="space-y-2 py-4">
            <SwitchRow label="Solo las últimas 24 horas" checked={f.last24h} onChange={f.setLast24h} />
            <SwitchRow
              label="Ver también anuncios enlazados"
              description="Cada inmueble sale una vez; actívalo para ver también las copias."
              checked={f.showLinked}
              onChange={f.setShowLinked}
            />
          </div>
        </div>

        <footer className="flex gap-3 border-t border-ink/10 bg-white px-5 py-3">
          <button type="button" onClick={f.clearAll} className={`h-11 flex-1 rounded-xl border border-ink/20 text-sm font-medium text-ink hover:bg-ink/5 ${FOCUS_RING}`}>
            Limpiar
          </button>
          <button type="button" onClick={onClose} className={`h-11 flex-[2] rounded-xl bg-ink text-sm font-semibold text-cream-50 hover:bg-ink/90 ${FOCUS_RING}`}>
            Ver {fmtNum(total)} anuncios
          </button>
        </footer>
      </aside>
    </div>
  );
}
