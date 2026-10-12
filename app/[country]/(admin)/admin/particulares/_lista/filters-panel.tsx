"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { DrawZoneFilter } from "@/components/admin/particulares/draw-zone-filter";
import type { ParticularesFiltersApi } from "../use-particulares-filters";
import { ChoiceGroup, FOCUS_RING, NumberField, SelectField, SwitchRow } from "./controls";
import { RangeSlider } from "./range-slider";
import { fmtEur } from "./format";

function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group border-b border-ink/10 py-4">
      <summary className={`flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-ink ${FOCUS_RING}`}>
        {title}
        <span aria-hidden className="text-ink/50 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
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

          <Section title="Dormitorios">
            <ChoiceGroup
              ariaLabel="Dormitorios"
              value={f.bedrooms}
              onChange={f.setBedrooms}
              options={[
                { value: "", label: "Cualquiera" },
                { value: "1", label: "1+" },
                { value: "2", label: "2+" },
                { value: "3", label: "3+" },
                { value: "4", label: "4+" },
              ]}
            />
          </Section>

          <Section title="Superficie y precio por m²">
            <NumberField value={f.areaMin} onChange={f.setAreaMin} placeholder="Superficie mínima" suffix="m²" ariaLabel="Superficie mínima" />
            <Pair>
              <NumberField value={f.pricePerM2Min} onChange={f.setPricePerM2Min} placeholder="€/m² mín." ariaLabel="Precio por m² mínimo" />
              <NumberField value={f.pricePerM2Max} onChange={f.setPricePerM2Max} placeholder="€/m² máx." ariaLabel="Precio por m² máximo" />
            </Pair>
          </Section>

          <Section title="Detalles del inmueble">
            <SelectField ariaLabel="Planta" value={f.floorMin} onChange={f.setFloorMin}>
              <option value="">Planta: cualquiera</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}.ª o más</option>
              ))}
            </SelectField>
            <ChoiceGroup
              ariaLabel="Amueblado"
              value={f.furnished}
              onChange={(v) => f.setFurnished(v as typeof f.furnished)}
              options={[
                { value: "", label: "Amueblado: da igual" },
                { value: "yes", label: "Amueblado" },
                { value: "no", label: "Sin amueblar" },
              ]}
            />
            <ChoiceGroup
              ariaLabel="Ascensor"
              value={f.lift}
              onChange={(v) => f.setLift(v as typeof f.lift)}
              options={[
                { value: "", label: "Ascensor: da igual" },
                { value: "yes", label: "Con ascensor" },
                { value: "no", label: "Sin ascensor" },
              ]}
            />
            <ChoiceGroup
              ariaLabel="Estado"
              value={f.condition}
              onChange={(v) => f.setCondition(v as typeof f.condition)}
              options={[
                { value: "", label: "Cualquier estado" },
                { value: "good", label: "Buen estado" },
                { value: "renovated", label: "Reformado / nuevo" },
                { value: "to_reform", label: "A reformar" },
              ]}
            />
          </Section>

          <Section title="Captación" defaultOpen={false}>
            <SelectField ariaLabel="Bajada de precio" value={f.priceDrop} onChange={f.setPriceDrop}>
              <option value="">Bajada de precio: cualquiera</option>
              <option value="0">Ha bajado de precio</option>
              <option value="5">Bajó 5 % o más</option>
              <option value="10">Bajó 10 % o más</option>
              <option value="15">Bajó 15 % o más</option>
            </SelectField>
            <SelectField ariaLabel="Tiempo en cartera" value={f.daysListed} onChange={f.setDaysListed}>
              <option value="">Tiempo en cartera: cualquiera</option>
              {[7, 15, 30, 60, 90].map((n) => (
                <option key={n} value={n}>Detectado hace más de {n} días</option>
              ))}
            </SelectField>
            <Pair>
              <NumberField value={f.yearMin} onChange={f.setYearMin} placeholder="Año desde" ariaLabel="Año de construcción desde" />
              <NumberField value={f.yearMax} onChange={f.setYearMax} placeholder="Año hasta" ariaLabel="Año de construcción hasta" />
            </Pair>
          </Section>

          <Section title="Contacto y gestión" defaultOpen={false}>
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

          <Section title="Zona dibujada en el mapa" defaultOpen={false}>
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
            Ver {total.toLocaleString("es-ES")} anuncios
          </button>
        </footer>
      </aside>
    </div>
  );
}
