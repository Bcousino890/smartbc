"use client";

import { useState } from "react";
import { Car, Train, Bus } from "lucide-react";

interface University {
  id: string;
  name: string;
  shortName: string;
  city: string;
  lat: number;
  lng: number;
}

interface TransportTime {
  type: "car" | "metro" | "bus";
  minutes: number;
  icon: React.ElementType;
}

// Universidades principales en Madrid
const UNIVERSITIES_MADRID: University[] = [
  { id: "uam", name: "Universidad Autónoma de Madrid", shortName: "UAM", city: "Madrid", lat: 40.3489, lng: -3.7327 },
  { id: "ucm", name: "Universidad Complutense de Madrid", shortName: "UCM", city: "Madrid", lat: 40.4532, lng: -3.7321 },
  { id: "upm", name: "Universidad Politécnica de Madrid", shortName: "UPM", city: "Madrid", lat: 40.4533, lng: -3.7296 },
  { id: "uc3m", name: "Universidad Carlos III", shortName: "UC3M", city: "Madrid", lat: 40.3164, lng: -3.6273 },
  { id: "upcomillas", name: "Universidad Pontificia Comillas", shortName: "Comillas", city: "Madrid", lat: 40.4528, lng: -3.6918 },
];

// Universidades principales en Santiago
const UNIVERSITIES_SANTIAGO: University[] = [
  { id: "uc", name: "Pontificia Universidad Católica", shortName: "UC", city: "Santiago", lat: -33.4489, lng: -70.6693 },
  { id: "uchile", name: "Universidad de Chile", shortName: "UChile", city: "Santiago", lat: -33.4575, lng: -70.6671 },
  { id: "usach", name: "Universidad de Santiago de Chile", shortName: "USACH", city: "Santiago", lat: -33.5007, lng: -70.5589 },
  { id: "unab", name: "Universidad Andrés Bello", shortName: "UNAB", city: "Santiago", lat: -33.3997, lng: -70.6091 },
];

// Mock data de tiempos de transporte
const getTransportTimes = (university: University): TransportTime[] => {
  const timeMap: Record<string, TransportTime[]> = {
    uam: [
      { type: "car", minutes: 25, icon: Car },
      { type: "metro", minutes: 38, icon: Train },
      { type: "bus", minutes: 49, icon: Bus },
    ],
    ucm: [
      { type: "car", minutes: 20, icon: Car },
      { type: "metro", minutes: 32, icon: Train },
      { type: "bus", minutes: 41, icon: Bus },
    ],
    upm: [
      { type: "car", minutes: 22, icon: Car },
      { type: "metro", minutes: 35, icon: Train },
      { type: "bus", minutes: 44, icon: Bus },
    ],
    uc3m: [
      { type: "car", minutes: 18, icon: Car },
      { type: "metro", minutes: 28, icon: Train },
      { type: "bus", minutes: 38, icon: Bus },
    ],
    upcomillas: [
      { type: "car", minutes: 21, icon: Car },
      { type: "metro", minutes: 33, icon: Train },
      { type: "bus", minutes: 45, icon: Bus },
    ],
    uc: [
      { type: "car", minutes: 18, icon: Car },
      { type: "metro", minutes: 25, icon: Train },
      { type: "bus", minutes: 32, icon: Bus },
    ],
  };
  return timeMap[university.id] || [
    { type: "car", minutes: 25, icon: Car },
    { type: "metro", minutes: 35, icon: Train },
    { type: "bus", minutes: 45, icon: Bus },
  ];
};

export function CampusDistance({ city, address }: { city: string; address: string }) {
  const universities = city === "Santiago" ? UNIVERSITIES_SANTIAGO : UNIVERSITIES_MADRID;
  const [selected, setSelected] = useState<University>(universities[0]);
  const times = getTransportTimes(selected);

  // Crear URL para Google Maps Directions embebido
  const mapsEmbedUrl = `https://www.google.com/maps/embed/v1/directions?key=AIzaSyANhjqyzVK9_l1xr0bnLRu6kNrQvJxX8tg&origin=${encodeURIComponent(address + "," + city)}&destination=${selected.lat},${selected.lng}&mode=driving`;
  const mapsDirectionsUrl = `https://www.google.com/maps/dir/${encodeURIComponent(address + "," + city)}/${selected.lat},${selected.lng}`;

  return (
    <section className="mt-16">
      <h2 className="font-display text-3xl text-navy mb-8">Distancia al campus</h2>

      <div className="grid lg:grid-cols-2 gap-12">
        {/* Selector de universidad y mapa */}
        <div>
          <label className="text-[11px] tracking-[0.24em] uppercase text-gray-400 block mb-4">
            Selecciona tu universidad
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            {universities.map((uni) => (
              <button
                key={uni.id}
                onClick={() => setSelected(uni)}
                className={`p-4 rounded-lg border-2 transition-all text-center ${
                  selected.id === uni.id
                    ? "border-gold bg-gold/10 text-navy font-semibold"
                    : "border-stone-200 bg-white text-navy/70 hover:border-gold hover:text-navy"
                }`}
              >
                <p className="text-[13px] font-display leading-tight">{uni.shortName}</p>
              </button>
            ))}
          </div>

          {/* Mapa con ruta */}
          <div className="rounded-lg overflow-hidden border border-stone-200 shadow-sm">
            <iframe
              width="100%"
              height="400"
              style={{ border: 0 }}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              src={mapsEmbedUrl}
            />
          </div>

          <div className="mt-4 flex justify-center">
            <a
              href={mapsDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] tracking-[0.24em] uppercase text-gold hover:text-navy transition-colors"
            >
              Ver ruta detallada en Google Maps →
            </a>
          </div>
        </div>

        {/* Tiempos de transporte */}
        <div>
          <p className="text-[11px] tracking-[0.24em] uppercase text-gray-400 mb-4">
            Tiempos aproximados desde {address.split(",")[0]}
          </p>
          <div className="space-y-4">
            {times.map((time) => {
              const Icon = time.icon;
              return (
                <div key={time.type} className="flex items-center gap-6 p-5 rounded-lg border border-stone-200 bg-white hover:border-gold hover:bg-gold/2 transition-colors">
                  <Icon size={24} className="text-gold flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-[10px] tracking-[0.18em] uppercase text-gray-400">
                      {time.type === "car" && "EN COCHE"}
                      {time.type === "metro" && "EN METRO"}
                      {time.type === "bus" && "EN AUTOBÚS"}
                    </p>
                    <p className="font-display text-3xl text-navy mt-1">{time.minutes}</p>
                    <p className="text-xs text-gray-400">minutos</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-8 p-4 rounded-lg border border-stone-200 bg-cream-deep">
        <p className="text-xs text-gray-500">
          <span className="font-semibold text-navy">Nota:</span> Los tiempos son aproximados basados en horario de tráfico normal.
          Para obtener información en tiempo real, consulta Google Maps.
        </p>
      </div>
    </section>
  );
}
