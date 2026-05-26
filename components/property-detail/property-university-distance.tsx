"use client";

import { Bus, Car, ExternalLink, MapPin, Train } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CAMPUS_BY_ID,
  UNIVERSITIES,
  type Campus,
} from "@/lib/data/universities";
import { estimateTimes } from "@/lib/distance/estimate";

// Componente público en la ficha de propiedad: selecciona universidad y
// mostramos un mapa con la ruta + 3 tiempos aproximados (coche, metro, bus)
// por cada campus de esa universidad. Sin llamadas a API externas: el mapa
// va con el embed gratis de Google (output=embed) y los tiempos los
// calculamos local con haversine + factores de Madrid.

type Props = {
  propertyTitle: string;
  propertyLat: number;
  propertyLng: number;
};

export function PropertyUniversityDistance({
  propertyTitle,
  propertyLat,
  propertyLng,
}: Props) {
  // Selección inicial: primera universidad del catálogo (suele ser IE).
  const [universityId, setUniversityId] = useState<string>(UNIVERSITIES[0].id);
  // El campus mostrado en el mapa cuando la uni tiene varias sedes.
  const [activeCampusId, setActiveCampusId] = useState<string>(
    UNIVERSITIES[0].campuses[0].id,
  );

  const university = useMemo(
    () => UNIVERSITIES.find((u) => u.id === universityId) ?? UNIVERSITIES[0],
    [universityId],
  );

  // Cuando cambia universidad, asegura que el activeCampus pertenece a ella.
  if (!university.campuses.some((c) => c.id === activeCampusId)) {
    setActiveCampusId(university.campuses[0].id);
  }

  const activeCampus =
    CAMPUS_BY_ID[activeCampusId]?.campus ?? university.campuses[0];

  // URL de embed gratis (sin API key). El formato `maps.google.com/maps?...&output=embed`
  // sigue funcionando sin clave; está deprecado pero no hay reemplazo gratuito
  // equivalente. Si Google lo retira, se sustituye por OpenStreetMap.
  const embedUrl = `https://maps.google.com/maps?saddr=${propertyLat},${propertyLng}&daddr=${encodeURIComponent(activeCampus.address)}&output=embed`;

  // Botón "abrir en Maps" usando el URL scheme público de Google. Cero coste,
  // sin clave, abre la app de Maps en móvil o google.com/maps en desktop.
  const externalRouteUrl = `https://www.google.com/maps/dir/?api=1&origin=${propertyLat},${propertyLng}&destination=${encodeURIComponent(activeCampus.address)}&travelmode=driving`;

  return (
    <div className="rounded-2xl border border-gold/20 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-medium text-ink">
            Distancia al campus
          </h3>
          <p className="mt-0.5 text-[12px] text-ink/60">
            Selecciona tu universidad para ver la ruta y los tiempos aproximados
            desde {propertyTitle}.
          </p>
        </div>
        <a
          href={externalRouteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-gold/30 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
        >
          <ExternalLink size={12} strokeWidth={1.75} />
          <span>Ver ruta en Maps</span>
        </a>
      </header>

      <div className="mt-4">
        <label className="block text-xs font-medium text-ink/65">
          Universidad / Escuela
        </label>
        <select
          value={universityId}
          onChange={(e) => {
            setUniversityId(e.target.value);
            const next = UNIVERSITIES.find((u) => u.id === e.target.value);
            if (next) setActiveCampusId(next.campuses[0].id);
          }}
          className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm focus:border-gold/55 focus:outline-none"
        >
          {UNIVERSITIES.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
        {/* Mapa */}
        <div className="aspect-[4/3] overflow-hidden rounded-xl border border-gold/15">
          <iframe
            key={`${activeCampus.id}-${propertyLat}-${propertyLng}`}
            src={embedUrl}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Ruta a ${activeCampus.label}`}
          />
        </div>

        {/* Tarjetas de campus (una por sede). Cuando hay >1 funcionan también como
            selector del mapa activo. */}
        <div className="flex flex-col gap-3">
          {university.campuses.map((campus) => {
            const times = estimateTimes(
              propertyLat,
              propertyLng,
              campus.lat,
              campus.lng,
            );
            const isActive = campus.id === activeCampusId;
            return (
              <button
                key={campus.id}
                type="button"
                onClick={() => setActiveCampusId(campus.id)}
                className={[
                  "rounded-xl border bg-white text-left transition focus:outline-none",
                  isActive
                    ? "border-gold ring-2 ring-gold/30"
                    : "border-ink/10 hover:border-gold/40",
                ].join(" ")}
              >
                <div className="rounded-t-xl bg-[#1d2c3a] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-cream-50">
                  {campus.label}
                </div>
                <div className="divide-y divide-ink/10 text-sm">
                  <ModeRow
                    icon={<Car size={20} strokeWidth={1.5} />}
                    minutes={times.car}
                    label="en coche al campus"
                  />
                  <ModeRow
                    icon={<Train size={20} strokeWidth={1.5} />}
                    minutes={times.metro}
                    label="en metro al campus"
                  />
                  <ModeRow
                    icon={<Bus size={20} strokeWidth={1.5} />}
                    minutes={times.bus}
                    label="en autobús al campus"
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink/45">
        <MapPin size={11} />
        Tiempos aproximados calculados sobre distancia en línea recta. Para una
        estimación exacta consulta Google Maps.
      </p>
    </div>
  );
}

function ModeRow({
  icon,
  minutes,
  label,
}: {
  icon: React.ReactNode;
  minutes: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-cyan-500">{icon}</span>
      <div className="flex-1">
        <div className="font-semibold text-ink">{minutes} minutos</div>
        <div className="text-[10px] uppercase tracking-wide text-ink/55">
          {label}
        </div>
      </div>
    </div>
  );
}
